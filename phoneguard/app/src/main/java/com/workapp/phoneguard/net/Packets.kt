package com.workapp.phoneguard.net

import java.nio.Buffer

// IPv4/IPv6 + TCP/UDP parsing and building. Plain Kotlin on caller-owned byte arrays, so it
// allocates nothing per packet and runs in JVM unit tests.

const val PROTO_TCP = 6
const val PROTO_UDP = 17

internal const val TCP_FIN = 0x01
internal const val TCP_SYN = 0x02
internal const val TCP_RST = 0x04
internal const val TCP_PSH = 0x08
internal const val TCP_ACK = 0x10

internal fun u8(b: ByteArray, i: Int): Int = b[i].toInt() and 0xFF
internal fun u16(b: ByteArray, i: Int): Int = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)
internal fun s32(b: ByteArray, i: Int): Int = (u16(b, i) shl 16) or u16(b, i + 2)

internal fun put16(b: ByteArray, i: Int, v: Int) {
    b[i] = (v ushr 8).toByte()
    b[i + 1] = v.toByte()
}

internal fun put32(b: ByteArray, i: Int, v: Int) {
    put16(b, i, v ushr 16)
    put16(b, i + 2, v)
}

// TCP sequence numbers wrap at 2^32; Int subtraction gives the right order within half the space.
internal fun seqLt(a: Int, b: Int) = a - b < 0
internal fun seqGt(a: Int, b: Int) = a - b > 0

/**
 * Sets position and limit. Goes through the Buffer type on purpose: the ByteBuffer-returning
 * overloads are missing on older Android versions and would crash at runtime.
 */
internal fun Buffer.window(position: Int, limit: Int) {
    limit(limit)
    position(position)
}

/** The Internet checksum (RFC 1071). */
object Checksum {
    /**
     * Adds the big-endian 16-bit words of buf[off, off+len) to [sum]; an odd last byte is padded
     * with zero. High and low bytes are summed apart, eight bytes per step: every relayed byte
     * goes through here, and this is quicker than assembling each word.
     */
    fun add(sum: Long, buf: ByteArray, off: Int, len: Int): Long {
        var hi = 0L
        var lo = 0L
        var i = off
        val end = off + len
        val end8 = end - 7
        while (i < end8) {
            hi += (buf[i].toInt() and 0xFF) + (buf[i + 2].toInt() and 0xFF) +
                (buf[i + 4].toInt() and 0xFF) + (buf[i + 6].toInt() and 0xFF)
            lo += (buf[i + 1].toInt() and 0xFF) + (buf[i + 3].toInt() and 0xFF) +
                (buf[i + 5].toInt() and 0xFF) + (buf[i + 7].toInt() and 0xFF)
            i += 8
        }
        while (i < end - 1) {
            hi += buf[i].toInt() and 0xFF
            lo += buf[i + 1].toInt() and 0xFF
            i += 2
        }
        if (i < end) hi += buf[i].toInt() and 0xFF
        return sum + (hi shl 8) + lo
    }

    /** Folds the carries back in and returns the one's complement, ready to store. */
    fun finish(sum: Long): Int {
        var s = sum
        while (s ushr 16 != 0L) s = (s and 0xFFFF) + (s ushr 16)
        return s.toInt().inv() and 0xFFFF
    }

    fun of(buf: ByteArray, off: Int, len: Int): Int = finish(add(0, buf, off, len))
}

/**
 * Parsed view of one IPv4/IPv6 packet carrying TCP or UDP. One instance is reused for every
 * packet; all offsets point into [buf].
 */
class PacketView {
    var buf: ByteArray = ByteArray(0)
        private set
    /** Packet length from the IP header (may be shorter than what was read). */
    var len = 0
        private set
    var v6 = false
        private set
    var proto = 0
        private set
    var srcOff = 0
        private set
    var dstOff = 0
        private set
    val addrLen: Int get() = if (v6) 16 else 4
    var srcPort = 0
        private set
    var dstPort = 0
        private set
    var payloadOff = 0
        private set
    var payloadLen = 0
        private set

    // TCP only.
    var seq = 0
        private set
    var ack = 0
        private set
    var flags = 0
        private set
    var window = 0
        private set
    /** MSS option of a SYN, or 0 if absent. */
    var mss = 0
        private set
    /** Window scale option (RFC 7323) of a SYN: the shift, or -1 if absent. */
    var wscale = -1
        private set

    /** Returns false for anything we don't relay: other protocols, fragments, truncated or malformed packets. */
    fun parse(b: ByteArray, n: Int): Boolean {
        if (n < 20 || n > b.size) return false
        var l4: Int
        val end: Int
        when ((b[0].toInt() ushr 4) and 0xF) {
            4 -> {
                val ihl = (b[0].toInt() and 0xF) * 4
                val total = u16(b, 2)
                if (ihl < 20 || total < ihl || total > n) return false
                // Fragments (more-fragments flag or an offset) can't be relayed on their own.
                if (u16(b, 6) and 0x3FFF != 0) return false
                v6 = false
                proto = u8(b, 9)
                srcOff = 12
                dstOff = 16
                l4 = ihl
                end = total
            }
            6 -> {
                if (n < 40) return false
                end = 40 + u16(b, 4)
                if (end > n) return false
                var next = u8(b, 6)
                l4 = 40
                // Skip hop-by-hop, routing and destination options; fragments (44) are not relayed.
                while (next == 0 || next == 43 || next == 60) {
                    if (l4 + 8 > end) return false
                    next = u8(b, l4)
                    l4 += (u8(b, l4 + 1) + 1) * 8
                }
                if (l4 > end) return false
                v6 = true
                proto = next
                srcOff = 8
                dstOff = 24
            }
            else -> return false
        }
        when (proto) {
            PROTO_TCP -> {
                if (l4 + 20 > end) return false
                val dataOff = (u8(b, l4 + 12) ushr 4) * 4
                if (dataOff < 20 || l4 + dataOff > end) return false
                seq = s32(b, l4 + 4)
                ack = s32(b, l4 + 8)
                flags = u8(b, l4 + 13)
                window = u16(b, l4 + 14)
                mss = 0
                wscale = -1
                if (flags and TCP_SYN != 0) synOptions(b, l4 + 20, l4 + dataOff)
                payloadOff = l4 + dataOff
                payloadLen = end - payloadOff
            }
            PROTO_UDP -> {
                if (l4 + 8 > end) return false
                val udpLen = u16(b, l4 + 4)
                if (udpLen < 8 || l4 + udpLen > end) return false
                payloadOff = l4 + 8
                payloadLen = udpLen - 8
            }
            else -> return false
        }
        srcPort = u16(b, l4)
        dstPort = u16(b, l4 + 2)
        buf = b
        len = end
        return true
    }

    /** Reads the MSS and window scale options of a SYN; a malformed option ends the list. */
    private fun synOptions(b: ByteArray, start: Int, end: Int) {
        var i = start
        while (i < end) {
            val kind = u8(b, i)
            if (kind == 0) break
            if (kind == 1) {
                i++
                continue
            }
            if (i + 1 >= end) break
            val optLen = u8(b, i + 1)
            if (optLen < 2 || i + optLen > end) break
            if (kind == 2 && optLen == 4) mss = u16(b, i + 2)
            if (kind == 3 && optLen == 3) wscale = u8(b, i + 2)
            i += optLen
        }
    }
}

/**
 * Builds IPv4/IPv6 packets carrying TCP or UDP. The payload must already sit at
 * [tcpPayloadOffset] / [udpPayloadOffset] in the output buffer; headers and checksums are
 * written in front of it, so payloads are never copied twice. One instance per engine thread.
 */
class PacketWriter {
    private var ipId = 0

    companion object {
        fun ipHeaderLen(v6: Boolean) = if (v6) 40 else 20
        /** Where TCP payload goes (headers without options; SYN-ACKs carry no payload). */
        fun tcpPayloadOffset(v6: Boolean) = ipHeaderLen(v6) + 20
        fun udpPayloadOffset(v6: Boolean) = ipHeaderLen(v6) + 8
        /** Biggest UDP payload one IP packet can hold. */
        fun maxUdpPayload(v6: Boolean) = if (v6) 65535 - 8 else 65535 - 28
    }

    /**
     * Writes a TCP segment with [payloadLen] bytes of payload. [mss] > 0 adds an MSS option and
     * [wscale] >= 0 a window scale option (both only on SYN-ACKs, which have no payload).
     * Addresses are read from the first 4 or 16 bytes of [src]/[dst]. Returns the packet length.
     */
    fun tcp(
        out: ByteArray, v6: Boolean, src: ByteArray, dst: ByteArray, srcPort: Int, dstPort: Int,
        seq: Int, ack: Int, flags: Int, window: Int, mss: Int, payloadLen: Int, wscale: Int = -1,
    ): Int {
        val ip = ipHeaderLen(v6)
        val headerLen = 20 + (if (mss > 0) 4 else 0) + (if (wscale >= 0) 4 else 0)
        val l4Len = headerLen + payloadLen
        ip(out, v6, src, dst, PROTO_TCP, l4Len)
        put16(out, ip, srcPort)
        put16(out, ip + 2, dstPort)
        put32(out, ip + 4, seq)
        put32(out, ip + 8, ack)
        out[ip + 12] = ((headerLen / 4) shl 4).toByte()
        out[ip + 13] = flags.toByte()
        put16(out, ip + 14, window)
        put16(out, ip + 16, 0)
        put16(out, ip + 18, 0)
        var o = ip + 20
        if (mss > 0) {
            out[o] = 2
            out[o + 1] = 4
            put16(out, o + 2, mss)
            o += 4
        }
        if (wscale >= 0) {
            out[o] = 1 // NOP, so the option ends on a 4-byte boundary
            out[o + 1] = 3
            out[o + 2] = 3
            out[o + 3] = wscale.toByte()
        }
        put16(out, ip + 16, Checksum.finish(Checksum.add(pseudo(out, v6, PROTO_TCP, l4Len), out, ip, l4Len)))
        return ip + l4Len
    }

    /** Writes a UDP datagram with [payloadLen] bytes of payload. Returns the packet length. */
    fun udp(
        out: ByteArray, v6: Boolean, src: ByteArray, dst: ByteArray, srcPort: Int, dstPort: Int, payloadLen: Int,
    ): Int {
        val ip = ipHeaderLen(v6)
        val l4Len = 8 + payloadLen
        ip(out, v6, src, dst, PROTO_UDP, l4Len)
        put16(out, ip, srcPort)
        put16(out, ip + 2, dstPort)
        put16(out, ip + 4, l4Len)
        put16(out, ip + 6, 0)
        var sum = Checksum.finish(Checksum.add(pseudo(out, v6, PROTO_UDP, l4Len), out, ip, l4Len))
        if (sum == 0) sum = 0xFFFF // zero would mean "no checksum"
        put16(out, ip + 6, sum)
        return ip + l4Len
    }

    private fun ip(out: ByteArray, v6: Boolean, src: ByteArray, dst: ByteArray, proto: Int, l4Len: Int) {
        if (v6) {
            out[0] = 0x60
            out[1] = 0
            out[2] = 0
            out[3] = 0
            put16(out, 4, l4Len)
            out[6] = proto.toByte()
            out[7] = 64
            System.arraycopy(src, 0, out, 8, 16)
            System.arraycopy(dst, 0, out, 24, 16)
        } else {
            out[0] = 0x45
            out[1] = 0
            put16(out, 2, 20 + l4Len)
            put16(out, 4, ipId)
            ipId = (ipId + 1) and 0xFFFF
            put16(out, 6, 0x4000) // don't fragment
            out[8] = 64
            out[9] = proto.toByte()
            put16(out, 10, 0)
            System.arraycopy(src, 0, out, 12, 4)
            System.arraycopy(dst, 0, out, 16, 4)
            put16(out, 10, Checksum.of(out, 0, 20))
        }
    }

    /** Pseudo-header sum; the addresses are already in place and contiguous in [out]. */
    private fun pseudo(out: ByteArray, v6: Boolean, proto: Int, l4Len: Int): Long {
        val s = if (v6) Checksum.add(0, out, 8, 32) else Checksum.add(0, out, 12, 8)
        return s + proto + (l4Len ushr 16) + (l4Len and 0xFFFF)
    }
}
