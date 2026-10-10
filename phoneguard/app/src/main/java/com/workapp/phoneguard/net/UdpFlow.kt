package com.workapp.phoneguard.net

import com.workapp.phoneguard.core.Kind
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import java.nio.channels.ClosedChannelException
import java.nio.channels.DatagramChannel
import java.nio.channels.SelectionKey

/**
 * True if a datagram to [to] stays on the local network: broadcast, multicast (our socket sends
 * those one hop only) or a local-network address. DNS (53, and DNS over QUIC on 853) is left
 * out: a resolver on the router passes questions on to the internet.
 */
internal fun udpStaysLocal(to: InetSocketAddress): Boolean {
    if (to.port == 53 || to.port == 853) return false
    val b = to.address?.address ?: return false
    val v6 = b.size == 16
    return !Addr.isUnicast(b, 0, v6) || Addr.isLan(b, 0, v6)
}

/**
 * One app UDP socket (the app's address and port), relayed over one real, unconnected datagram
 * socket that sends to whatever destination the app picks.
 *
 * Mapping is endpoint-independent: every destination sees the same public address and port, so
 * what a STUN server reports is what a call partner can reach. That is what peer-to-peer calls
 * (WhatsApp, Meet, WebRTC) need to connect directly instead of through a relay server.
 *
 * Filtering is address-dependent, like most home routers: datagrams are passed to the app only
 * from addresses it has sent to (any port there). Two exceptions keep local discovery working:
 * after the app sends to a broadcast or multicast address, answers from anyone are passed on; after
 * it sends to a local-network address (a subnet broadcast like 192.168.1.255 included), answers
 * from any local-network address are. Calls cope with this the way they do behind a router: both
 * sides send connectivity checks, and the first one out opens the way in.
 *
 * Each new destination is logged once, and bytes are counted for the app as a whole. The owner is
 * looked up before anything is sent on; if nobody owns the port (see [UidResolver]) and unknown
 * owners are not allowed, nothing goes to the internet and the next datagram asks again. Datagrams
 * to the local network (broadcast, multicast, or a local address) still go out then: one-shot
 * senders like wake-on-LAN or a TV remote close their socket at once, and these can't reach the
 * internet. The owner is checked again when the app talks to a new destination and every
 * [EngineConfig.ownerCheckMs]: if the port changed hands (the app closed its socket, maybe
 * another app took the port), the flow starts over.
 *
 * The relay socket is opened (and protected) off the loop thread by the engine; datagrams wait
 * in [held] until it arrives.
 */
internal class UdpFlow(private val e: Engine, key: FlowKey, now: Long) : Flow(key, now) {
    private enum class State { RESOLVING, OPEN, BLOCKED, UNKNOWN }

    /** A datagram held while the owner is looked up or the socket opens. */
    private class Held(val to: InetSocketAddress, val data: ByteArray)

    private companion object {
        const val MAX_QUEUED = 16
        const val MAX_QUEUED_BYTES = 64 * 1024
        const val MAX_READS = 64
        /** Destinations (and their addresses) remembered per app socket. */
        const val MAX_PEERS = 128
        /** Sends that failed in a row (no route, not allowed) before the socket is given up. */
        const val MAX_SEND_ERRORS = 16
        /** Owner re-checks are at least this far apart, however many new destinations come up. */
        const val OWNER_CHECK_GAP_MS = 1_000L
        /** The app sends again after this long a pause: maybe from a new socket, so check the owner. */
        const val PAUSE_CHECK_MS = 5_000L
    }

    private fun staysLocal(to: InetSocketAddress) = udpStaysLocal(to)

    /** IPv6 packets to IPv4-mapped addresses (::ffff:a.b.c.d): relayed over IPv4. */
    private val mapped = key.v6 && Addr.isMapped(key.dst, 0)
    /** The relay socket is IPv4: for IPv4 apps, and for IPv6 packets to IPv4-mapped addresses. */
    val ipv4Socket: Boolean = !key.v6 || mapped
    private var state = State.RESOLVING
    private var ch: DatagramChannel? = null
    private var sk: SelectionKey? = null
    /** The engine is opening the relay socket. */
    private var opening = false
    private var held: ArrayList<Held>? = null
    private var heldBytes = 0
    /** An owner lookup is running. */
    private var asking = false
    /** When the current owner lookup started (for the resolve timeout). */
    private var askedAt = now
    /** UNKNOWN: no new lookup before this. */
    private var retryAt = 0L

    // The last destination, kept so a steady stream to one place allocates nothing per datagram.
    private val lastDst = ByteArray(16)
    private var lastPort = -1
    private var lastTo: InetSocketAddress? = null
    /** The last destination known to be in [noted]. */
    private var lastNoted: InetSocketAddress? = null

    /** Destinations already logged (oldest forgotten first). */
    private val noted = object : LinkedHashMap<InetSocketAddress, Boolean>(8, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<InetSocketAddress, Boolean>?) = size > MAX_PEERS
    }
    /** Addresses the app sent to, most recent last: datagrams from them reach the app. */
    private val peers = object : LinkedHashMap<InetAddress, Boolean>(8, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<InetAddress, Boolean>?) = size > MAX_PEERS
    }
    /** The app sent to a broadcast or multicast address: answers may come from anyone. */
    private var anySource = false
    /** The app sent to a local-network address: answers may come from any local address. */
    private var lanPeers = false
    /** Only DNS (port 53) so far: one question, one answer, so it closes sooner. */
    private var dnsOnly = true
    private var sendErrors = 0

    // The last sender let through, so a steady stream needs no checks or copies per datagram.
    private var lastFrom: InetSocketAddress? = null
    private var lastFromBytes: ByteArray? = null

    // Owner re-checks.
    /** When the app last sent a datagram on this flow. */
    private var lastSent = now
    private var checking = false
    private var checkDue = false
    private var checkedAt = now
    private var checkStarted = Long.MIN_VALUE / 2
    private var unknownChecks = 0

    /** The firewall blocks this app; its datagrams are dropped until the flow expires. */
    val blocked: Boolean get() = state == State.BLOCKED

    /** Nobody owned the port when asked, and unknown owners are blocked right now. */
    val unknownOwner: Boolean get() = state == State.UNKNOWN

    private val idleMs: Long get() = if (dnsOnly) e.config.dnsUdpTimeoutMs else e.config.udpTimeoutMs

    fun onDatagram(v: PacketView, p: Packet) {
        val now = e.now
        // Sending again after a pause may be a new socket on the same port, to the same place.
        if (now - lastSent >= minOf(PAUSE_CHECK_MS, e.config.ownerCheckMs)) checkDue = true
        lastSent = now
        lastActive = now
        val to = destination(v)
        if (to.port != 53) dnsOnly = false
        when (state) {
            State.RESOLVING -> hold(v.buf, v.payloadOff, v.payloadLen, to, lookUp = true)
            State.OPEN -> forward(p, v, to)
            State.BLOCKED -> {
                if (note(to)) report(to, true, dnsName(to, v.buf, v.payloadOff, v.payloadLen))
                maybeCheckOwner()
            }
            State.UNKNOWN -> when {
                staysLocal(to) -> forward(p, v, to)
                e.now >= retryAt -> {
                    state = State.RESOLVING
                    hold(v.buf, v.payloadOff, v.payloadLen, to, lookUp = true)
                }
            }
        }
    }

    /** Sends a datagram straight from the tun packet, or holds it while the socket opens. */
    private fun forward(p: Packet, v: PacketView, to: InetSocketAddress) {
        if (ch == null) {
            hold(v.buf, v.payloadOff, v.payloadLen, to, lookUp = false)
            needChannel()
            return
        }
        p.bb.window(v.payloadOff, v.payloadOff + v.payloadLen)
        relay(p.bb, to, v.buf, v.payloadOff, v.payloadLen)
    }

    /** The datagram's destination; the same object as last time if it didn't change. */
    private fun destination(v: PacketView): InetSocketAddress {
        val n = v.addrLen
        val last = lastTo
        if (last != null && lastPort == v.dstPort && sameBytes(v.buf, v.dstOff, lastDst, n)) return last
        System.arraycopy(v.buf, v.dstOff, lastDst, 0, n)
        lastPort = v.dstPort
        // An IPv4-mapped address comes out as an IPv4 address, which is what the IPv4 socket needs.
        val to = InetSocketAddress(InetAddress.getByAddress(v.buf.copyOfRange(v.dstOff, v.dstOff + n)), v.dstPort)
        lastTo = to
        return to
    }

    private fun sameBytes(a: ByteArray, off: Int, b: ByteArray, n: Int): Boolean {
        for (i in 0 until n) if (a[off + i] != b[i]) return false
        return true
    }

    /** Keeps the first few datagrams until we know whether (and through which socket) they may go. */
    private fun hold(b: ByteArray, off: Int, len: Int, to: InetSocketAddress, lookUp: Boolean) {
        val q = held ?: ArrayList<Held>(4).also { held = it }
        if (q.size < MAX_QUEUED && heldBytes + len <= MAX_QUEUED_BYTES) {
            q.add(Held(to, b.copyOfRange(off, off + len)))
            heldBytes += len
        }
        if (lookUp && !asking) {
            asking = true
            askedAt = e.now
            e.resolve(this, to)
        }
    }

    private fun takeHeld(): ArrayList<Held>? {
        val q = held
        held = null
        heldBytes = 0
        return q
    }

    override fun onResolved(uid: Int, allowed: Boolean) {
        if (closed || state != State.RESOLVING) return
        asking = false
        val q = takeHeld()
        if (uid < 0 && !allowed) {
            // Nobody owns the port: the app closed its socket straight away, which is also how a
            // blocked app could try to pass for unknown. Nothing of that goes to the internet. A
            // live socket's next datagram asks again (soon, but not for every datagram: lookups
            // cost the system). What stays on the local network still goes.
            this.uid = -1
            resolved = false
            state = State.UNKNOWN
            retryAt = e.now + e.config.unknownRetryMs
            if (q != null) {
                val seen = HashSet<InetSocketAddress>()
                for (h in q) {
                    if (staysLocal(h.to)) sendHeld(h)
                    else if (seen.add(h.to)) report(h.to, true, dnsName(h.to, h.data, 0, h.data.size))
                }
            }
            return
        }
        this.uid = uid
        resolved = true
        // Just looked up: the destinations held meanwhile don't call for another check.
        checkedAt = e.now
        checkStarted = e.now
        if (!allowed) {
            state = State.BLOCKED
            closeChannel() // opened while the answer was still yes (the rules changed since)
            if (q != null) for (h in q) if (note(h.to)) report(h.to, true, dnsName(h.to, h.data, 0, h.data.size))
            checkDue = false
            return
        }
        state = State.OPEN
        if (q != null) for (h in q) {
            if (closed) break
            sendHeld(h)
        }
        checkDue = false
    }

    /** Sends one held datagram, or holds it again until the socket is open. */
    private fun sendHeld(h: Held) {
        if (ch == null) {
            hold(h.data, 0, h.data.size, h.to, lookUp = false)
            needChannel()
            return
        }
        relay(ByteBuffer.wrap(h.data), h.to, h.data, 0, h.data.size)
    }

    override fun onLookupFailed() = close()

    /** Asks the engine for a relay socket, once. */
    private fun needChannel() {
        if (ch != null || opening || closed) return
        opening = true
        e.openUdpFor(this)
    }

    /** The relay socket, opened by the engine off the loop thread; null if it couldn't be. Takes ownership. */
    fun onChannel(c: DatagramChannel?) {
        opening = false
        if (c == null) {
            if (!closed && state != State.RESOLVING && state != State.BLOCKED) close() // can't send at all
            return
        }
        if (closed || ch != null || state == State.BLOCKED) {
            try {
                c.close()
            } catch (_: Exception) {
            }
            return
        }
        try {
            // Not connected: one socket, and so one public port, for every destination.
            sk = c.register(e.selector, SelectionKey.OP_READ, this)
            ch = c
        } catch (ex: Exception) {
            try {
                c.close()
            } catch (_: Exception) {
            }
            close()
            return
        }
        // Datagrams that waited for the socket (in RESOLVING they wait for the owner instead).
        if (state == State.OPEN || state == State.UNKNOWN) {
            val q = takeHeld() ?: return
            for (h in q) {
                if (closed) break
                if (state == State.OPEN || staysLocal(h.to)) sendHeld(h)
            }
        }
    }

    /** Sends one datagram of the app's to [to]; the first one to a destination is logged. */
    private fun relay(bb: ByteBuffer, to: InetSocketAddress, data: ByteArray, off: Int, len: Int) {
        if (note(to)) report(to, false, dnsName(to, data, off, len))
        send(bb, to)
        maybeCheckOwner()
    }

    /**
     * Remembers a destination the app sent to (it may answer now). True the first time, which is
     * also when the owner is due to be checked again: a new destination is the likeliest sign that
     * a different socket is using the port.
     */
    private fun note(to: InetSocketAddress): Boolean {
        if (to === lastNoted) return false
        val a = to.address
        peers[a] = true
        val fresh = noted.put(to, true) == null
        lastNoted = to
        if (!fresh) return false
        val b = a.address
        val v6 = b.size == 16
        if (!Addr.isUnicast(b, 0, v6)) anySource = true
        else if (Addr.isLan(b, 0, v6)) lanPeers = true
        checkDue = true
        return true
    }

    private fun send(bb: ByteBuffer, to: InetSocketAddress) {
        val c = ch ?: return
        try {
            // A full send buffer drops the datagram (returns 0), which is fine for UDP.
            val n = c.send(bb, to)
            sendErrors = 0
            if (n > 0) {
                pendingSent += n
                e.bytesPending()
            }
        } catch (ex: ClosedChannelException) {
            close()
        } catch (ex: IOException) {
            // This destination can't be reached right now (no route, not allowed). Drop the
            // datagram, as the app's own socket would, and keep the socket for other destinations.
            if (++sendErrors >= MAX_SEND_ERRORS) close()
        }
    }

    fun onReadable() {
        val c = ch ?: return
        val off = PacketWriter.udpPayloadOffset(key.v6)
        val max = minOf(e.out.size - off, PacketWriter.maxUdpPayload(key.v6))
        val bb = e.outBuffer
        for (i in 0 until MAX_READS) {
            // Read straight into the engine's output buffer, behind room for the headers.
            bb.window(off, off + max)
            val from = try {
                c.receive(bb) as? InetSocketAddress ?: break
            } catch (ex: IOException) {
                close()
                return
            }
            val src = replySource(from) ?: continue // not from anyone the app talked to: dropped
            val n = bb.position() - off
            lastActive = e.now
            pendingRecv += n
            e.bytesPending()
            e.sendUdpReply(this, src, from.port, n)
        }
        maybeCheckOwner()
    }

    /** The source address to show the app for a datagram from [from], or null to drop it. */
    private fun replySource(from: InetSocketAddress): ByteArray? {
        if (from === lastFrom) return lastFromBytes // the channel reuses the object for the same sender
        val a = from.address ?: return null
        val allowed = anySource || peers.containsKey(a) || (lanPeers && Addr.isLan(a))
        if (!allowed) return null
        val b = a.address
        val src = when {
            b.size == key.addrLen -> b
            mapped && b.size == 4 -> Addr.mapped(b)
            else -> return null // an IPv4 sender on an IPv6 socket: the app's socket couldn't take it
        }
        lastFrom = from
        lastFromBytes = src
        return src
    }

    /** Starts an owner re-check when one is due (new destination, or [EngineConfig.ownerCheckMs] passed). */
    private fun maybeCheckOwner() {
        if (closed || (state != State.OPEN && state != State.BLOCKED)) return
        val now = e.now
        val every = e.config.ownerCheckMs
        if (now - checkedAt >= every) checkDue = true
        if (!checkDue || checking || now - checkStarted < minOf(OWNER_CHECK_GAP_MS, every)) return
        val to = lastTo ?: return
        checkDue = false
        checking = true
        checkStarted = now
        e.checkOwner(this, to)
    }

    /** Who owns the app's port now; null if the question couldn't be asked. */
    fun onOwnerChecked(found: Int?) {
        checking = false
        if (closed || found == null) return
        if (found == uid) {
            checkedAt = e.now
            unknownChecks = 0
            return
        }
        // Not found once may be a hiccup of the lookup: ask once more before giving up.
        if (found < 0 && uid >= 0 && ++unknownChecks < 2) {
            checkDue = true
            return
        }
        // The port changed hands (the socket was closed, or another app has the port now). Start
        // over: the next datagram gets a new flow, with its own owner lookup and firewall check.
        close()
    }

    private fun report(to: InetSocketAddress, blocked: Boolean, domain: String?) {
        e.report(uid, if (to.port == 53) Kind.DNS else Kind.UDP, to.address, to.port, domain, blocked)
    }

    /** For plain DNS to some other server, the name being looked up. */
    private fun dnsName(to: InetSocketAddress, b: ByteArray, off: Int, len: Int): String? =
        if (to.port == 53) DnsBits.questionName(b, off, len) else null

    override fun onTimer() {
        if (e.now >= nextDeadline()) close()
    }

    override fun nextDeadline(): Long =
        if (state == State.RESOLVING) minOf(askedAt + e.config.resolveTimeoutMs, lastActive + idleMs)
        else lastActive + idleMs

    override fun kill() = close()

    private fun closeChannel() {
        sk?.cancel()
        sk = null
        ch?.let {
            try {
                it.close()
            } catch (_: Exception) {
            }
        }
        ch = null
    }

    fun close() {
        if (closed) return
        closed = true
        closeChannel()
        held = null
        e.removeUdp(this)
    }
}
