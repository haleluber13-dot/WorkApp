package com.workapp.phoneguard.net

import java.io.IOException
import java.nio.channels.SelectionKey
import java.nio.channels.SocketChannel

/**
 * One app TCP connection, terminated here and relayed over a real socket.
 *
 * Toward the app this is a small TCP stack: segment size from the app's SYN, no SACK or
 * timestamps, and window scaling (RFC 7323) when the app's SYN offers it, so a busy connection
 * can have far more than 64 KB in flight. Server data waits in [down] until the app acknowledges
 * it, which is also where retransmissions come from. App data collects in [up] and goes to the
 * socket once per engine round, in one write instead of one per packet. Both buffers start at
 * the engine's base size and grow for busy connections, within the engine's memory budget.
 *
 * The SYN-ACK is only sent once the owner is known, the firewall allowed it and the real server
 * accepted, so the app sees refused and unreachable servers exactly as it would without us. The
 * engine opens the server socket off the loop thread: after the firewall said yes, or, while no
 * app at all is blocked, at once, alongside the owner lookup (see [Engine.startTcp]).
 */
internal class TcpFlow(private val e: Engine, key: FlowKey, now: Long) : Flow(key, now) {
    private enum class State { RESOLVING, CONNECTING, SYN_RCVD, ESTABLISHED, CLOSED }

    private companion object {
        const val MAX_FIELD = 65535
        const val SYNACK_RETRIES = 5
        const val PERSIST_MAX_MS = 60_000L
        /** A grown download buffer that stays empty this long goes back to the budget. */
        const val TRIM_MS = 5_000L
    }

    private val cfg = e.config
    /** Largest segment that fits the tun MTU. */
    private val mssCap = cfg.mtu - if (key.v6) 60 else 40
    private var state = State.RESOLVING

    // The socket to the server.
    private var ch: SocketChannel? = null
    private var sk: SelectionKey? = null
    private var ops = 0
    private var connected = false
    /** The server couldn't be reached; the app is told once its owner is known. */
    private var connectFailed = false
    /** The engine is opening the socket on a pool thread. */
    private var socketComing = false
    private var connectStarted = 0L

    // Window scaling, only when the app's SYN offered it.
    private var scaled = false
    /** Applied to the windows the app advertises. */
    private var sndShift = 0
    /** Applied to the windows we advertise. */
    private var rcvShift = 0

    // App -> server.
    private var appIsn = 0
    private var appMss = 0
    private var rcvNxt = 0
    private var appFin = false
    private var outShut = false
    /** The window we advertised last, in bytes. */
    private var lastAdv = 0
    /** The right edge of the window we advertised; it is never moved back. */
    private var advEdge = 0
    /** Size of the upload buffer; grows for busy uploads (and the window with it). */
    private var upCap = e.ringSize
    /** Waiting in the engine's list to be written to the socket at the end of the round. */
    private var flushQueued = false

    // Server -> app.
    private var sendMss = 536
    private var isn = 0
    private var sndUna = 0
    private var sndNxt = 0
    private var sndMax = 0
    private var wndRight = 0
    private var lastWnd = 0
    private var dupAcks = 0
    private var serverEof = false
    private var finSent = false
    private var finSeq = 0
    /** True once the FIN's sequence number is fixed (it was sent at least once). */
    private var finSeqValid = false
    private var finAcked = false
    /** Recovering from a loss: one segment is resent per acknowledgement until [recover] is reached. */
    private var inRecovery = false
    private var recover = 0

    private var down: ByteRing? = null
    private var up: ByteRing? = null

    // Retransmission timeout from the measured round trip (RFC 6298; Karn: no samples from resends).
    private var rto = cfg.rtoMs
    private var srtt = -1L
    private var rttVar = 0L
    private var rttTiming = false
    private var rttSeq = 0
    private var rttStart = 0L
    private var retries = 0
    private var rtoAt = 0L
    private var persistAt = 0L
    private var persistGap = cfg.rtoMs
    private var deadline = now + cfg.resolveTimeoutMs

    /** An ACK is due; the engine sends it after the current batch of packets. */
    var ackPending = false
        private set

    fun onSyn(v: PacketView) {
        appIsn = v.seq
        rcvNxt = v.seq + 1
        appMss = v.mss
        val mss = if (appMss > 0) appMss else if (key.v6) 1220 else 536
        sendMss = minOf(mss, mssCap).coerceAtLeast(64)
        lastWnd = v.window // a SYN's window is never scaled
        if (v.wscale >= 0 && cfg.windowScaling) {
            scaled = true
            sndShift = minOf(v.wscale, 14) // RFC 7323: larger shifts count as 14
            rcvShift = e.rcvShift
        }
    }

    /**
     * A new SYN with [seq] on this port means a new socket started over (a repeat of the app's
     * own SYN has the same sequence number) and this connection is finished.
     */
    fun replacedBy(seq: Int) = state == State.CLOSED || seq != appIsn

    /** Ends this connection because a new socket uses the port; see [replacedBy]. */
    fun replace() {
        // Before the handshake the old socket is gone and nothing needs an answer; a reset would
        // only reach the new socket, which ignores it.
        abort(rstApp = state == State.ESTABLISHED)
    }

    override fun onResolved(uid: Int, allowed: Boolean) {
        if (closed || state != State.RESOLVING) return
        this.uid = uid
        resolved = true
        e.report(this, !allowed, null)
        if (!allowed) {
            // A socket opened early (nothing was blocked then) is reset before anything was sent.
            closeChannel(abort = true)
            // Nobody owns the connection (uid -1): the app gave up at once, which is also how a
            // blocked app could try to pass for unknown. Never connect it, and stay silent: an app
            // still waiting sends its SYN again, and that gets a fresh owner lookup.
            if (uid >= 0) refuse()
            finish()
            return
        }
        when {
            connectFailed -> {
                refuse()
                finish()
            }
            connected -> onConnected()
            else -> {
                state = State.CONNECTING
                // No socket yet nor on its way (the first answer was no, a recheck said yes): open one.
                if (ch == null && !socketComing) e.connectTcp(this)
                if (closed) return
                deadline = connectStarted + cfg.connectTimeoutMs
            }
        }
    }

    /** The engine started opening this connection's socket ([onChannel] follows). */
    fun socketOnTheWay() {
        socketComing = true
        connectStarted = e.now
    }

    override fun onLookupFailed() {
        refuse()
        finish()
    }

    /**
     * The socket to the server, opened by the engine off the loop thread and already connecting
     * ([connectedNow] if it connected at once), or null if it couldn't even start (no route,
     * refused at once). Takes ownership of [c].
     */
    fun onChannel(c: SocketChannel?, connectedNow: Boolean) {
        socketComing = false
        if (closed || ch != null || connectFailed || (state != State.RESOLVING && state != State.CONNECTING)) {
            c?.let { abortChannel(it) }
            return
        }
        if (c == null) {
            connectFailed()
            return
        }
        ch = c
        if (connectStarted == 0L) connectStarted = e.now
        try {
            sk = c.register(e.selector, 0, this)
        } catch (ex: Exception) {
            closeChannel(abort = true)
            connectFailed()
            return
        }
        if (connectedNow) markConnected() else setOps(SelectionKey.OP_CONNECT)
    }

    /** The server can't be reached. Before the owner is known nothing is said yet; see [onResolved]. */
    private fun connectFailed() {
        connectFailed = true
        closeChannel(abort = false)
        if (state == State.CONNECTING) {
            refuse()
            finish()
        }
    }

    private fun markConnected() {
        connected = true
        setOps(0)
        if (state == State.CONNECTING) onConnected()
    }

    fun onReady(ready: Int) {
        if (ready and SelectionKey.OP_CONNECT != 0) {
            finishConnect()
            if (closed) return
        }
        if (ready and SelectionKey.OP_WRITE != 0) {
            onWritable()
            if (closed) return
        }
        if (ready and SelectionKey.OP_READ != 0) onReadable()
    }

    private fun finishConnect() {
        if (connected || connectFailed) return
        val c = ch ?: return
        val ok = try {
            c.finishConnect()
        } catch (ex: Exception) {
            connectFailed()
            return
        }
        if (ok) markConnected()
    }

    private fun onConnected() {
        state = State.SYN_RCVD
        deadline = 0L
        setOps(0) // nothing to relay until the app completes the handshake
        isn = e.random.nextInt()
        sndUna = isn
        sndNxt = isn + 1
        sndMax = sndNxt
        rto = cfg.rtoMs
        retries = 0
        sendSynAck()
        rtoAt = e.now + rto
    }

    private fun sendSynAck() {
        // MSS that fits the tun, window scale if the app offered it; no SACK or timestamps. The
        // window of a SYN is never scaled.
        val w = minOf(freeSpace(), MAX_FIELD)
        val mss = if (appMss > 0) minOf(appMss, mssCap) else mssCap
        e.sendTcp(key, isn, rcvNxt, TCP_SYN or TCP_ACK, w, mss, 0, if (scaled) rcvShift else -1)
        lastAdv = w
        advEdge = rcvNxt + w
    }

    fun onPacket(v: PacketView, p: Packet) {
        lastActive = e.now
        val f = v.flags
        if (f and TCP_RST != 0) {
            // The app gave up on the connection: reset the server side too.
            closeChannel(abort = true)
            finish()
            return
        }
        when (state) {
            // Nothing to answer before the server side is up. (A SYN with a new sequence number
            // never gets here: the engine starts a new connection for it, see replacedBy.)
            State.RESOLVING, State.CONNECTING -> {}
            State.SYN_RCVD -> {
                if (f and TCP_SYN != 0) {
                    if (f and TCP_ACK == 0) sendSynAck() // the app sent its SYN again: ours was lost
                    return
                }
                if (f and TCP_ACK == 0) return
                if (v.ack != sndNxt) {
                    e.sendTcp(key, v.ack, 0, TCP_RST, 0)
                    return
                }
                state = State.ESTABLISHED
                sndUna = v.ack
                rtoAt = 0L
                retries = 0
                rto = cfg.rtoMs
                val wnd = v.window shl sndShift
                wndRight = v.ack + wnd
                lastWnd = wnd
                updateOps()
                segment(v, p, ackDone = true)
            }
            State.ESTABLISHED -> segment(v, p, ackDone = false)
            State.CLOSED -> if (v.payloadLen > 0 || f and TCP_FIN != 0) sendAck()
        }
    }

    private fun segment(v: PacketView, p: Packet, ackDone: Boolean) {
        val f = v.flags
        if (f and TCP_SYN != 0) {
            sendAck() // a late copy of the app's SYN
            return
        }
        if (f and TCP_ACK == 0) return
        if (!ackDone && !onAck(v.ack, v.window shl sndShift, v.payloadLen == 0 && f and TCP_FIN == 0)) return
        if (v.payloadLen > 0 || f and TCP_FIN != 0) {
            onData(v, p)
            if (closed) return
        } else if (v.seq != rcvNxt) {
            sendAck() // keep-alive or window probe: the app wants to hear from us
        }
        trySend()
        maybeDone()
    }

    /** Handles the app's acknowledgement and window ([wnd] already scaled). False if the segment must be dropped. */
    private fun onAck(ack: Int, wnd: Int, pure: Boolean): Boolean {
        if (seqGt(ack, sndMax)) {
            sendAck() // acknowledges something we never sent
            return false
        }
        if (seqLt(ack, sndUna)) return true // an old ACK; any data it carries still counts
        if (seqGt(ack, sndUna)) {
            var n = ack - sndUna
            // The FIN takes one sequence number but no buffer space. It may be acknowledged from an
            // earlier transmission even after a timeout made us plan to resend it.
            if (finSeqValid && !finAcked && seqGt(ack, finSeq)) {
                finAcked = true
                finSent = true
                n--
            }
            val d = down
            if (d != null && n > 0) d.consume(minOf(n, d.size))
            sndUna = ack
            if (seqLt(sndNxt, sndUna)) sndNxt = sndUna
            if (rttTiming && !seqLt(ack, rttSeq)) {
                rttTiming = false
                sampleRtt(e.now - rttStart)
            }
            dupAcks = 0
            retries = 0
            rto = baseRto()
            persistAt = 0L
            persistGap = cfg.rtoMs
            releaseDownIfEmpty()
            wndRight = ack + wnd
            lastWnd = wnd
            if (inRecovery) {
                // Everything sent before the loss is through: back to normal. Otherwise this
                // acknowledges up to the next hole, so resend that at once (NewReno).
                if (seqLt(ack, recover)) resendFirst() else inRecovery = false
            }
            rtoAt = if (sndNxt != sndUna) e.now + rto else 0L
            updateOps() // room again: read more from the server
            return true
        }
        if (pure && sndNxt != sndUna && wnd == lastWnd) {
            // The same ACK again while data is outstanding: a segment got lost, resend it now.
            if (++dupAcks == 3 && !inRecovery) startRecovery()
        }
        wndRight = ack + wnd
        lastWnd = wnd
        return true
    }

    /** Resends the first unacknowledged segment and holds back new data until the hole is filled. */
    private fun startRecovery() {
        rttTiming = false
        inRecovery = true
        recover = sndMax
        resendFirst()
    }

    private fun resendFirst() {
        val d = down
        val data = if (d == null) 0 else minOf(sndNxt - sndUna, d.size)
        if (data > 0) sendData(sndUna, 0, minOf(data, sendMss))
        else if (finSeqValid && !finAcked) sendFin()
    }

    private fun sampleRtt(r: Long) {
        if (srtt < 0) {
            srtt = r
            rttVar = r / 2
        } else {
            rttVar = (3 * rttVar + Math.abs(srtt - r)) / 4
            srtt = (7 * srtt + r) / 8
        }
    }

    /** The timeout without backoff: the configured one until a round trip was measured. */
    private fun baseRto(): Long {
        if (srtt < 0) return cfg.rtoMs
        return (srtt + maxOf(4 * rttVar, 1L)).coerceIn(minOf(cfg.rtoMinMs, cfg.rtoMs), cfg.rtoMaxMs)
    }

    private fun onData(v: PacketView, p: Packet) {
        val fin = v.flags and TCP_FIN != 0
        if (appFin) {
            sendAck() // the app already finished sending; this is a repeat
            return
        }
        val len = v.payloadLen
        val old = rcvNxt - v.seq
        if (old < 0) {
            sendAck() // a gap: something before this is missing; the duplicate ACK asks for it
            return
        }
        if (old >= len + (if (fin) 1 else 0)) {
            sendAck() // all of it arrived before (the app resent it); don't pass it on twice
            return
        }
        val fresh = len - old
        if (fresh > 0) {
            val took = accept(p, v.payloadOff + old, fresh)
            if (closed) return
            rcvNxt += took
            if (took < fresh) {
                sendAck() // more than our window; the app sends the rest later
                return
            }
        }
        if (fin) {
            rcvNxt += 1
            appFin = true
            shutdownIfDrained()
            if (closed) return
            sendAck()
        } else {
            queueAck()
        }
    }

    /**
     * Takes app data toward the server: into the upload buffer, which goes to the socket at the
     * end of the engine's round ([flushUp]). Returns how many bytes were taken.
     */
    private fun accept(p: Packet, off: Int, len: Int): Int {
        if (ch == null || outShut) return 0
        val u = up ?: e.takeRing().also { up = it }
        val n = minOf(len, u.free)
        if (n <= 0) return 0
        u.write(p.buf, off, n)
        pendingSent += n
        e.bytesPending()
        if (!flushQueued) {
            flushQueued = true
            e.queueFlush(this)
        }
        return n
    }

    /** End of the engine's round: writes what the app sent to the socket in one go. */
    fun flushUp() {
        flushQueued = false
        if (closed || state != State.ESTABLISHED) return
        val u = up ?: return
        val c = ch ?: return
        if (u.size > 0) {
            try {
                u.writeTo(c)
            } catch (ex: IOException) {
                abort(rstApp = true)
                return
            }
            lastActive = e.now
            // The app used up most of the window we offered, yet the socket took everything: our
            // window is what holds it back, so offer a bigger one.
            if (u.size == 0 && advEdge - rcvNxt < upCap / 4) growUp(u)
        }
        releaseUpIfEmpty()
        shutdownIfDrained()
        if (closed) return
        updateOps()
        maybeDone()
    }

    private fun growUp(u: ByteRing) {
        if (!scaled) return
        val target = minOf(upCap * 2, e.maxRecvBuffer)
        if (target > upCap && e.growRing(u, target)) upCap = target
    }

    /** An empty upload buffer of the base size goes back to the pool; a grown one stays with the connection. */
    private fun releaseUpIfEmpty() {
        val u = up ?: return
        if (u.size == 0 && u.capacity <= e.ringSize) {
            e.giveRing(u)
            up = null
        }
    }

    /** After the app's FIN and once its data is all written: half-close toward the server. */
    private fun shutdownIfDrained() {
        if (!appFin || outShut) return
        val u = up
        if (u != null && u.size > 0) return
        val c = ch ?: return
        try {
            c.shutdownOutput()
        } catch (ex: IOException) {
            abort(rstApp = true)
            return
        }
        outShut = true
    }

    /** Sends whatever server data and FIN the app's window allows. */
    private fun trySend() {
        if (state != State.ESTABLISHED || inRecovery) return
        val d = down
        if (d != null) {
            while (true) {
                val sent = sndNxt - sndUna
                val unsent = d.size - sent
                if (unsent <= 0) break
                val room = wndRight - sndNxt
                if (room <= 0) break
                val n = minOf(unsent, room, sendMss)
                // Don't send a runt just because the window is nearly full; the next ACK opens it.
                if (n < sendMss && n < unsent && sent > 0) break
                sendData(sndNxt, sent, n)
                if (!rttTiming && !seqLt(sndNxt, sndMax)) {
                    // Time one new segment at a time.
                    rttTiming = true
                    rttSeq = sndNxt + n
                    rttStart = e.now
                }
                sndNxt += n
                if (seqGt(sndNxt, sndMax)) sndMax = sndNxt
                if (rtoAt == 0L) rtoAt = e.now + rto
            }
        }
        val allSent = d == null || d.size <= sndNxt - sndUna
        val finDue = serverEof && !finSent && !finAcked
        if (finDue && allSent && seqLt(sndNxt, wndRight)) {
            finSeq = sndNxt
            finSeqValid = true
            finSent = true
            sendFin()
            sndNxt += 1
            if (seqGt(sndNxt, sndMax)) sndMax = sndNxt
            if (rtoAt == 0L) rtoAt = e.now + rto
        }
        // The app's window is shut with something still to send and nothing in flight: probe until it opens.
        val waiting = !allSent || (serverEof && !finSent && !finAcked)
        if (waiting && sndNxt == sndUna) {
            if (persistAt == 0L) persistAt = e.now + persistGap
        } else {
            persistAt = 0L
        }
    }

    private fun sendData(seq: Int, ringOff: Int, n: Int) {
        val d = down ?: return
        d.copyOut(ringOff, e.out, PacketWriter.tcpPayloadOffset(key.v6), n)
        val psh = if (ringOff + n >= d.size) TCP_PSH else 0
        e.sendTcp(key, seq, rcvNxt, TCP_ACK or psh, windowField(), 0, n)
        ackPending = false
    }

    private fun sendFin() {
        e.sendTcp(key, finSeq, rcvNxt, TCP_FIN or TCP_ACK, windowField())
        ackPending = false
    }

    fun sendAck() {
        e.sendTcp(key, sndNxt, rcvNxt, TCP_ACK, windowField())
        ackPending = false
    }

    private fun queueAck() {
        if (!ackPending) {
            ackPending = true
            e.queueAck(this)
        }
    }

    /** Room for app data: the upload buffer's size less what waits in it. */
    private fun freeSpace(): Int = upCap - (up?.size ?: 0)

    /**
     * The window field for a segment going out now. With scaling the window is rounded down to
     * what the field can express, but the right edge offered before is kept when the buffer has
     * room for it (RFC 7323: don't shrink the window). Never offers more than the buffer holds.
     */
    private fun windowField(): Int {
        val free = minOf(freeSpace(), MAX_FIELD shl rcvShift)
        var w = (free ushr rcvShift) shl rcvShift
        if (seqLt(rcvNxt + w, advEdge)) {
            val unit = (1 shl rcvShift) - 1
            val keep = (advEdge - rcvNxt + unit) and unit.inv()
            if (keep <= free) w = keep
        }
        lastAdv = w
        if (seqGt(rcvNxt + w, advEdge)) advEdge = rcvNxt + w
        return w ushr rcvShift
    }

    private fun onReadable() {
        if (state != State.ESTABLISHED || serverEof) {
            updateOps()
            return
        }
        val c = ch ?: return
        val d = down ?: e.takeRing().also { down = it }
        val n = try {
            d.readFrom(c)
        } catch (ex: IOException) {
            abort(rstApp = true)
            return
        }
        if (n < 0) {
            serverEof = true
        } else if (n > 0) {
            lastActive = e.now
            pendingRecv += n
            e.bytesPending()
        }
        releaseDownIfEmpty()
        trySend()
        updateOps()
        maybeDone()
    }

    /**
     * An empty download buffer of the base size goes back to the pool. A grown one stays while the
     * connection is busy (a fast download empties it all the time), see [onTimer].
     */
    private fun releaseDownIfEmpty() {
        val d = down ?: return
        if (d.size == 0 && d.capacity <= e.ringSize) {
            e.giveRing(d)
            down = null
        }
    }

    /** A grown download buffer, empty: released once the connection has been quiet for [TRIM_MS]. */
    private fun idleGrownDown(): Boolean {
        val d = down ?: return false
        return d.size == 0 && d.capacity > e.ringSize
    }

    private fun onWritable() {
        if (state != State.ESTABLISHED) {
            updateOps()
            return
        }
        val c = ch ?: return
        val u = up
        if (u != null && u.size > 0) {
            try {
                u.writeTo(c)
            } catch (ex: IOException) {
                abort(rstApp = true)
                return
            }
            lastActive = e.now
            releaseUpIfEmpty()
        }
        shutdownIfDrained()
        if (closed) return
        // Space freed up after we told the app to slow down: say so rather than wait for its probe.
        val w = freeSpace()
        if (!appFin && w > lastAdv && (lastAdv < sendMss || w - lastAdv >= 2 * sendMss)) sendAck()
        updateOps()
        maybeDone()
    }

    /** The download buffer is full, yet the app's window would take more than it holds: grow it. */
    private fun growDown(d: ByteRing): Boolean {
        if (!scaled || d.capacity >= e.maxSendBuffer) return false
        if (wndRight - sndUna <= d.capacity) return false
        return e.growRing(d, minOf(d.capacity * 2, e.maxSendBuffer))
    }

    private fun updateOps() {
        var want = 0
        when (state) {
            State.RESOLVING, State.CONNECTING ->
                if (ch != null && !connected && !connectFailed) want = SelectionKey.OP_CONNECT
            State.ESTABLISHED -> {
                val d = down
                // Stop reading while the app hasn't made room: that pushes back on the server.
                if (!serverEof && (d == null || d.free > 0 || growDown(d))) want = want or SelectionKey.OP_READ
                val u = up
                // Data that the end-of-round write couldn't place: write when the socket has room.
                if (u != null && u.size > 0 && !flushQueued) want = want or SelectionKey.OP_WRITE
            }
            else -> {}
        }
        setOps(want)
    }

    private fun setOps(want: Int) {
        val k = sk ?: return
        if (want != ops && k.isValid) {
            k.interestOps(want)
            ops = want
        }
    }

    private fun maybeDone() {
        if (state != State.ESTABLISHED || !appFin || !outShut || !serverEof || !finAcked) return
        // Both sides finished cleanly. Keep the entry a moment to re-acknowledge a repeated FIN.
        closeChannel(abort = false)
        releaseRings()
        state = State.CLOSED
        rtoAt = 0L
        persistAt = 0L
        deadline = e.now + cfg.lingerMs
    }

    override fun onTimer() {
        val now = e.now
        when (state) {
            State.RESOLVING, State.CONNECTING -> if (now >= deadline) {
                refuse()
                closeChannel(abort = true)
                finish()
            }
            State.SYN_RCVD -> if (now >= rtoAt) {
                if (++retries > SYNACK_RETRIES) {
                    abort(rstApp = true)
                    return
                }
                rto = minOf(rto * 2, cfg.rtoMaxMs)
                sendSynAck()
                rtoAt = now + rto
            }
            State.ESTABLISHED -> {
                if (rtoAt != 0L && now >= rtoAt) {
                    retransmit()
                    if (closed) return
                }
                if (persistAt != 0L && now >= persistAt) {
                    // An already-acknowledged sequence number makes the app answer with its current window.
                    e.sendTcp(key, sndUna - 1, rcvNxt, TCP_ACK, windowField())
                    persistGap = minOf(persistGap * 2, PERSIST_MAX_MS)
                    persistAt = now + persistGap
                }
                if (idleGrownDown() && now - lastActive >= TRIM_MS) {
                    down?.let { e.giveRing(it) }
                    down = null
                }
                if (now - lastActive >= idleLimit()) abort(rstApp = true)
            }
            State.CLOSED -> if (now >= deadline) finish()
        }
    }

    private fun retransmit() {
        rtoAt = 0L
        if (sndNxt == sndUna) return
        if (++retries > cfg.maxRetries) {
            abort(rstApp = true) // the app stopped answering
            return
        }
        rto = minOf(rto * 2, cfg.rtoMaxMs)
        dupAcks = 0
        // Resend the first unacknowledged segment only. The app keeps what arrived after a gap, so
        // its next ACK shows what is really missing (see onAck), instead of everything being sent twice.
        startRecovery()
        rtoAt = e.now + rto
    }

    private fun idleLimit() = when {
        // Both sides are done; only the last acknowledgements are missing.
        appFin && serverEof -> cfg.closingTimeoutMs
        // One side is done, but the other may still be working on its answer (e.g. a request
        // ended with shutdownOutput): allow a long silence, yet still clean up dead connections.
        appFin || serverEof -> cfg.halfClosedTimeoutMs
        else -> cfg.idleTimeoutMs
    }

    override fun nextDeadline(): Long = when (state) {
        State.RESOLVING, State.CONNECTING, State.CLOSED -> deadline
        State.SYN_RCVD -> rtoAt
        State.ESTABLISHED -> {
            var t = lastActive + idleLimit()
            if (rtoAt != 0L && rtoAt < t) t = rtoAt
            if (persistAt != 0L && persistAt < t) t = persistAt
            if (idleGrownDown()) t = minOf(t, lastActive + TRIM_MS)
            t
        }
    }

    /** Closes at once, resetting the app's side if [rstApp] and always the server's. */
    fun abort(rstApp: Boolean) {
        if (closed) return
        if (rstApp) {
            when (state) {
                State.RESOLVING, State.CONNECTING -> refuse()
                // The highest sequence sent: the app's stack only takes a reset at exactly the byte it expects next.
                State.SYN_RCVD, State.ESTABLISHED -> e.sendTcp(key, sndMax, rcvNxt, TCP_RST or TCP_ACK, 0)
                State.CLOSED -> {}
            }
        }
        closeChannel(abort = true)
        finish()
    }

    override fun kill() = abort(rstApp = true)

    /** Answers the app's SYN with a reset: connection refused. */
    private fun refuse() = e.sendTcp(key, 0, appIsn + 1, TCP_RST or TCP_ACK, 0)

    private fun closeChannel(abort: Boolean) {
        val c = ch ?: return
        ch = null
        sk?.cancel()
        sk = null
        ops = 0
        if (abort) abortChannel(c) else {
            try {
                c.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun finish() {
        if (closed) return
        closed = true
        closeChannel(abort = false)
        releaseRings()
        e.removeTcp(this)
    }

    private fun releaseRings() {
        down?.let { e.giveRing(it) }
        down = null
        up?.let { e.giveRing(it) }
        up = null
    }
}

/** Closes a socket with a reset instead of a FIN (the server learns the connection is void). */
internal fun abortChannel(c: SocketChannel) {
    try {
        c.socket().setSoLinger(true, 0)
    } catch (_: Exception) {
    }
    try {
        c.close()
    } catch (_: Exception) {
    }
}
