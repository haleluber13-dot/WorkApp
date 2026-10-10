package com.workapp.phoneguard.net

import java.io.IOException
import java.net.Inet6Address
import java.net.InetSocketAddress
import java.net.PortUnreachableException
import java.net.StandardProtocolFamily
import java.nio.ByteBuffer
import java.nio.channels.DatagramChannel
import java.nio.channels.SelectionKey

/**
 * One app UDP flow (app port -> destination address and port), relayed over a real datagram
 * socket. Unicast destinations use a connected socket so the kernel filters replies for us;
 * multicast and broadcast (e.g. finding a TV or printer) use an unconnected one so answers from
 * any device get back to the app.
 */
internal class UdpFlow(private val e: Engine, key: FlowKey, now: Long, private val unicast: Boolean) : Flow(key, now) {
    private enum class State { RESOLVING, OPEN, BLOCKED }

    private companion object {
        const val MAX_QUEUED = 16
        const val MAX_QUEUED_BYTES = 64 * 1024
        const val MAX_READS = 64
    }

    private var state = State.RESOLVING
    private var ch: DatagramChannel? = null
    private var sk: SelectionKey? = null
    private var target: InetSocketAddress? = null
    private var queue: ArrayList<ByteArray>? = null
    private var queuedBytes = 0
    private val created = now
    private val idleMs = if (key.dstPort == 53) e.config.dnsUdpTimeoutMs else e.config.udpTimeoutMs

    /** The firewall blocks this flow; its packets are dropped until it expires. */
    val blocked: Boolean get() = state == State.BLOCKED

    fun onDatagram(v: PacketView, p: Packet) {
        lastActive = e.now
        when (state) {
            State.RESOLVING -> {
                // Keep the first few until we know whether the app may send them.
                val q = queue ?: ArrayList<ByteArray>(4).also { queue = it }
                if (q.size < MAX_QUEUED && queuedBytes + v.payloadLen <= MAX_QUEUED_BYTES) {
                    q.add(v.buf.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen))
                    queuedBytes += v.payloadLen
                }
            }
            State.OPEN -> {
                p.bb.window(v.payloadOff, v.payloadOff + v.payloadLen)
                send(p.bb)
            }
            State.BLOCKED -> {}
        }
    }

    override fun onResolved(uid: Int, allowed: Boolean) {
        if (closed || state != State.RESOLVING) return
        this.uid = uid
        resolved = true
        val q = queue
        queue = null
        // For plain DNS to some other server, show the name being looked up.
        val first = q?.firstOrNull()
        val domain = if (key.dstPort == 53 && first != null) DnsBits.questionName(first, 0, first.size) else null
        e.report(this, !allowed, domain)
        if (!allowed) {
            state = State.BLOCKED
            return
        }
        open()
        if (q != null) for (d in q) if (!closed) send(ByteBuffer.wrap(d))
    }

    override fun onLookupFailed() = close()

    private fun open() {
        // The socket family follows the real destination (an IPv4-mapped IPv6 address needs IPv4).
        val v6Socket = key.dstInet is Inet6Address
        val c = try {
            DatagramChannel.open(if (v6Socket) StandardProtocolFamily.INET6 else StandardProtocolFamily.INET)
        } catch (ex: Exception) {
            close()
            return
        }
        try {
            c.configureBlocking(false)
            e.protector.protect(c.socket())
            if (!v6Socket) {
                try {
                    c.socket().broadcast = true // lets apps reach broadcast addresses (e.g. wake-on-LAN)
                } catch (_: Exception) {
                }
            }
            val to = InetSocketAddress(key.dstInet, key.dstPort)
            if (unicast) c.connect(to) else target = to
            sk = c.register(e.selector, SelectionKey.OP_READ, this)
            ch = c
            state = State.OPEN
        } catch (ex: Exception) {
            try {
                c.close()
            } catch (_: Exception) {
            }
            close()
        }
    }

    private fun send(bb: ByteBuffer) {
        val c = ch ?: return
        try {
            // A full send buffer drops the datagram (returns 0), which is fine for UDP.
            val n = if (unicast) c.write(bb) else c.send(bb, target)
            if (n > 0) {
                pendingSent += n
                e.bytesPending()
            }
        } catch (ex: PortUnreachableException) {
            // Nobody listens there right now. Keep the flow, like the app's own socket would.
        } catch (ex: IOException) {
            close()
        }
    }

    fun onReadable() {
        val c = ch ?: return
        val off = PacketWriter.udpPayloadOffset(key.v6)
        val max = minOf(e.out.size - off, PacketWriter.maxUdpPayload(key.v6))
        val bb = e.outBuffer
        repeat(MAX_READS) {
            // Read straight into the engine's output buffer, behind room for the headers.
            bb.window(off, off + max)
            var from: InetSocketAddress? = null
            try {
                if (unicast) {
                    if (c.read(bb) <= 0) return
                } else {
                    from = (c.receive(bb) ?: return) as? InetSocketAddress ?: return
                }
            } catch (ex: PortUnreachableException) {
                return
            } catch (ex: IOException) {
                close()
                return
            }
            val n = bb.position() - off
            lastActive = e.now
            pendingRecv += n
            e.bytesPending()
            e.sendUdpReply(this, from, n)
        }
    }

    override fun onTimer() {
        if (e.now >= nextDeadline()) close()
    }

    override fun nextDeadline(): Long =
        if (state == State.RESOLVING) minOf(created + e.config.resolveTimeoutMs, lastActive + idleMs)
        else lastActive + idleMs

    override fun kill() = close()

    fun close() {
        if (closed) return
        closed = true
        sk?.cancel()
        sk = null
        ch?.let {
            try {
                it.close()
            } catch (_: Exception) {
            }
        }
        ch = null
        queue = null
        e.removeUdp(this)
    }
}
