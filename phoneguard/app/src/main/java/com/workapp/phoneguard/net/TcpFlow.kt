package com.workapp.phoneguard.net

import java.io.IOException
import java.net.InetSocketAddress
import java.nio.channels.SelectionKey
import java.nio.channels.SocketChannel

/**
 * One app TCP connection, terminated here and relayed over a real socket.
 *
 * Toward the app this is a small TCP stack: no window scaling, SACK or timestamps (so both
 * windows are plain 16-bit values), segment size from the app's SYN, and our receive window is
 * the free space in the upload buffer. Server data waits in [down] until the app acknowledges
 * it, which is also where retransmissions come from; app data the socket can't take yet waits
 * in [up]. The SYN-ACK is only sent once the real server accepted, so the app sees refused and
 * unreachable servers exactly as it would without us.
 */
internal class TcpFlow(private val e: Engine, key: FlowKey, now: Long) : Flow(key, now) {
    private enum class State { RESOLVING, CONNECTING, SYN_RCVD, ESTABLISHED, CLOSED }

    private companion object {
        const val MAX_WINDOW = 65535
        const val SYNACK_RETRIES = 5
        const val PERSIST_MAX_MS = 60_000L
    }

    private val cfg = e.config
    /** Largest segment that fits the tun MTU. */
    private val mssCap = cfg.mtu - if (key.v6) 60 else 40
    private var state = State.RESOLVING

    // App -> server.
    private var appIsn = 0
    private var appMss = 0
    private var rcvNxt = 0
    private var appFin = false
    private var outShut = false
    private var lastAdv = 0

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

    private var ch: SocketChannel? = null
    private var sk: SelectionKey? = null
    private var ops = 0
    private var down: ByteRing? = null
    private var up: ByteRing? = null

    private var rto = cfg.rtoMs
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
        lastWnd = v.window
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
            // Nobody owns the connection (uid -1): the app gave up at once, which is also how a
            // blocked app could try to pass for unknown. Never connect it, and stay silent: an app
            // still waiting sends its SYN again, and that gets a fresh owner lookup.
            if (uid >= 0) refuse()
            finish()
            return
        }
        connect()
    }

    override fun onLookupFailed() {
        refuse()
        finish()
    }

    private fun connect() {
        val c = try {
            SocketChannel.open()
        } catch (ex: IOException) {
            refuse()
            finish()
            return
        }
        ch = c
        state = State.CONNECTING
        deadline = e.now + cfg.connectTimeoutMs
        try {
            c.configureBlocking(false)
            e.protector.protect(c.socket())
            try {
                c.socket().tcpNoDelay = true // the app already decided how to pack its data
            } catch (_: Exception) {
            }
            val done = c.connect(InetSocketAddress(key.dstInet, key.dstPort))
            sk = c.register(e.selector, 0, this)
            if (done) onConnected() else setOps(SelectionKey.OP_CONNECT)
        } catch (ex: Exception) {
            // No route, no network, refused straight away: tell the app now.
            refuse()
            finish()
        }
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
        if (state != State.CONNECTING) return
        val c = ch ?: return
        val ok = try {
            c.finishConnect()
        } catch (ex: Exception) {
            refuse()
            finish()
            return
        }
        if (ok) onConnected()
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
        val w = window()
        // MSS that fits the tun; no window scale, SACK or timestamp options.
        e.sendTcp(key, isn, rcvNxt, TCP_SYN or TCP_ACK, w, if (appMss > 0) minOf(appMss, mssCap) else mssCap)
        lastAdv = w
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
                wndRight = v.ack + v.window
                lastWnd = v.window
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
        if (!ackDone && !onAck(v.ack, v.window, v.payloadLen == 0 && f and TCP_FIN == 0)) return
        if (v.payloadLen > 0 || f and TCP_FIN != 0) {
            onData(v, p)
            if (closed) return
        } else if (v.seq != rcvNxt) {
            sendAck() // keep-alive or window probe: the app wants to hear from us
        }
        trySend()
        maybeDone()
    }

    /** Handles the app's acknowledgement and window. False if the segment must be dropped. */
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
            dupAcks = 0
            retries = 0
            rto = cfg.rtoMs
            rtoAt = if (sndNxt != sndUna) e.now + rto else 0L
            persistAt = 0L
            persistGap = cfg.rtoMs
            if (d != null && d.size == 0) {
                e.giveRing(d)
                down = null
            }
            updateOps() // room again: read more from the server
        } else if (pure && sndNxt != sndUna && wnd == lastWnd) {
            // The same ACK again while data is outstanding: a segment got lost, resend it now.
            if (++dupAcks == 3) resendFirst()
        }
        wndRight = ack + wnd
        lastWnd = wnd
        return true
    }

    private fun resendFirst() {
        val d = down
        val data = if (d == null) 0 else minOf(sndNxt - sndUna, d.size)
        if (data > 0) sendData(sndUna, 0, minOf(data, sendMss))
        else if (finSent && !finAcked) sendFin()
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

    /** Passes app data toward the server. Returns how many bytes were taken. */
    private fun accept(p: Packet, off: Int, len: Int): Int {
        val c = ch ?: return 0
        if (outShut) return 0
        var took = 0
        try {
            var u = up
            if (u == null || u.size == 0) {
                // Nothing queued ahead of it: hand it straight to the socket.
                p.bb.window(off, off + len)
                took = c.write(p.bb)
            }
            if (took < len) {
                if (u == null) {
                    u = e.takeRing()
                    up = u
                }
                val n = minOf(len - took, u.free)
                u.write(p.buf, off + took, n)
                took += n
            }
        } catch (ex: IOException) {
            abort(rstApp = true)
            return 0
        }
        if (took > 0) {
            pendingSent += took
            e.bytesPending()
        }
        val u = up
        if (u != null && u.size == 0) {
            e.giveRing(u)
            up = null
        }
        updateOps()
        return took
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
        if (state != State.ESTABLISHED) return
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
        val w = window()
        val psh = if (ringOff + n >= d.size) TCP_PSH else 0
        e.sendTcp(key, seq, rcvNxt, TCP_ACK or psh, w, 0, n)
        lastAdv = w
        ackPending = false
    }

    private fun sendFin() {
        val w = window()
        e.sendTcp(key, finSeq, rcvNxt, TCP_FIN or TCP_ACK, w)
        lastAdv = w
        ackPending = false
    }

    fun sendAck() {
        val w = window()
        e.sendTcp(key, sndNxt, rcvNxt, TCP_ACK, w)
        lastAdv = w
        ackPending = false
    }

    private fun queueAck() {
        if (!ackPending) {
            ackPending = true
            e.queueAck(this)
        }
    }

    /** Our receive window: what still fits in the upload buffer. */
    private fun window(): Int {
        val u = up
        return if (u == null) MAX_WINDOW else minOf(MAX_WINDOW, u.free)
    }

    private fun onReadable() {
        if (state != State.ESTABLISHED || serverEof) {
            updateOps()
            return
        }
        val c = ch ?: return
        var d = down
        if (d == null) {
            d = e.takeRing()
            down = d
        }
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
        if (d.size == 0) {
            e.giveRing(d)
            down = null
        }
        trySend()
        updateOps()
        maybeDone()
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
            if (u.size == 0) {
                e.giveRing(u)
                up = null
            }
        }
        shutdownIfDrained()
        if (closed) return
        // Space freed up after we told the app to slow down: say so rather than wait for its probe.
        val w = window()
        if (!appFin && w > lastAdv && (lastAdv < sendMss || w - lastAdv >= 2 * sendMss)) sendAck()
        updateOps()
        maybeDone()
    }

    private fun updateOps() {
        var want = 0
        when (state) {
            State.CONNECTING -> want = SelectionKey.OP_CONNECT
            State.ESTABLISHED -> {
                val d = down
                // Stop reading while the app hasn't made room: that pushes back on the server.
                if (!serverEof && (d == null || d.free > 0)) want = want or SelectionKey.OP_READ
                val u = up
                if (u != null && u.size > 0) want = want or SelectionKey.OP_WRITE
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
                    e.sendTcp(key, sndUna - 1, rcvNxt, TCP_ACK, window())
                    persistGap = minOf(persistGap * 2, PERSIST_MAX_MS)
                    persistAt = now + persistGap
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
        // Go back and resend everything not yet acknowledged, as far as the window allows.
        sndNxt = sndUna
        if (finSent && !finAcked) finSent = false
        dupAcks = 0
        trySend()
        if (rtoAt == 0L && sndNxt != sndUna) rtoAt = e.now + rto
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
        if (abort) {
            try {
                c.socket().setSoLinger(true, 0) // close with a reset instead of a FIN
            } catch (_: Exception) {
            }
        }
        try {
            c.close()
        } catch (_: Exception) {
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
