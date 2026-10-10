package com.workapp.phoneguard.net

import org.junit.Assert.assertEquals
import org.junit.Assert.fail

/** Helpers shared by the engine tests. The checksum check is written independently of [Checksum]. */
object TestPackets {
    fun bytes(vararg v: Int) = ByteArray(v.size) { v[it].toByte() }

    fun hex(s: String): ByteArray {
        val clean = s.filter { !it.isWhitespace() }
        return ByteArray(clean.length / 2) { clean.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
    }

    /** Plain one's complement sum of 16-bit words, folded, not complemented. */
    private fun ones(data: List<Int>): Int {
        var sum = 0L
        var i = 0
        while (i < data.size) {
            val hi = data[i]
            val lo = if (i + 1 < data.size) data[i + 1] else 0
            sum += (hi shl 8) or lo
            i += 2
        }
        while (sum > 0xFFFF) sum = (sum and 0xFFFF) + (sum shr 16)
        return sum.toInt()
    }

    private fun range(b: ByteArray, from: Int, to: Int) = (from until to).map { b[it].toInt() and 0xFF }

    /** Fails unless the IPv4 header checksum and the TCP/UDP checksum of [p] are correct. */
    fun assertChecksumsValid(p: ByteArray) {
        val v6 = (p[0].toInt() ushr 4) == 6
        val ipLen: Int
        val total: Int
        val proto: Int
        val addrs: List<Int>
        if (v6) {
            ipLen = 40
            total = 40 + (((p[4].toInt() and 0xFF) shl 8) or (p[5].toInt() and 0xFF))
            proto = p[6].toInt() and 0xFF
            addrs = range(p, 8, 40)
        } else {
            ipLen = (p[0].toInt() and 0xF) * 4
            total = ((p[2].toInt() and 0xFF) shl 8) or (p[3].toInt() and 0xFF)
            proto = p[9].toInt() and 0xFF
            addrs = range(p, 12, 20)
            assertEquals("IPv4 header checksum", 0xFFFF, ones(range(p, 0, ipLen)))
        }
        assertEquals("packet length", p.size, total)
        val l4Len = total - ipLen
        val pseudo = if (v6) {
            addrs + listOf(l4Len ushr 24, (l4Len ushr 16) and 0xFF, (l4Len ushr 8) and 0xFF, l4Len and 0xFF, 0, 0, 0, proto)
        } else {
            addrs + listOf(0, proto, l4Len ushr 8, l4Len and 0xFF)
        }
        val sum = ones(pseudo + range(p, ipLen, total))
        if (sum != 0xFFFF) fail("transport checksum wrong (proto $proto): sum=${Integer.toHexString(sum)}")
    }

    /**
     * The TCP options of a packet the engine built (its IP header has no options), as
     * kind -> option bytes after the kind and length.
     */
    fun tcpOptions(raw: ByteArray, v: PacketView): Map<Int, ByteArray> {
        val l4 = PacketWriter.ipHeaderLen(v.v6)
        val end = v.payloadOff
        val r = HashMap<Int, ByteArray>()
        var i = l4 + 20
        while (i < end) {
            val kind = raw[i].toInt() and 0xFF
            if (kind == 0) break
            if (kind == 1) {
                i++
                continue
            }
            val len = raw[i + 1].toInt() and 0xFF
            require(len >= 2 && i + len <= end) { "bad TCP option $kind length $len" }
            r[kind] = raw.copyOfRange(i + 2, i + len)
            i += len
        }
        return r
    }

    /** The window scale shift in a SYN or SYN-ACK the engine built, or -1 if it has none. */
    fun windowScale(raw: ByteArray, v: PacketView): Int {
        val o = tcpOptions(raw, v)[3] ?: return -1
        require(o.size == 1) { "window scale option must be 3 bytes long" }
        return o[0].toInt() and 0xFF
    }

    fun hasOption(raw: ByteArray, v: PacketView, kind: Int): Boolean = tcpOptions(raw, v).containsKey(kind)

    /** A parsed copy of a packet, convenient for assertions. */
    class Seg(val raw: ByteArray) {
        private val v = PacketView().also { require(it.parse(raw, raw.size)) { "engine wrote an unparseable packet" } }
        val v6 = v.v6
        val proto = v.proto
        val src: ByteArray = raw.copyOfRange(v.srcOff, v.srcOff + v.addrLen)
        val dst: ByteArray = raw.copyOfRange(v.dstOff, v.dstOff + v.addrLen)
        val srcPort = v.srcPort
        val dstPort = v.dstPort
        val seq = v.seq
        val ack = v.ack
        val flags = v.flags
        val window = v.window
        val mss = v.mss
        val payload: ByteArray = raw.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen)
        val tcpHeaderLen = if (proto == PROTO_TCP) v.payloadOff - PacketWriter.ipHeaderLen(v6) else 0
        /** Window scale option (SYN-ACK only), or -1. */
        val wscale = if (proto == PROTO_TCP && has(TCP_SYN)) windowScale(raw, v) else -1

        fun has(flag: Int) = flags and flag != 0

        override fun toString(): String {
            val f = buildList {
                if (has(TCP_SYN)) add("SYN")
                if (has(TCP_ACK)) add("ACK")
                if (has(TCP_FIN)) add("FIN")
                if (has(TCP_RST)) add("RST")
                if (has(TCP_PSH)) add("PSH")
            }.joinToString("|")
            return if (proto == PROTO_TCP) "TCP $srcPort->$dstPort [$f] seq=$seq ack=$ack win=$window len=${payload.size}"
            else "UDP $srcPort->$dstPort len=${payload.size}"
        }
    }
}

/** Fails the test; typed so it can end an elvis expression. */
fun die(message: String): Nothing = throw AssertionError(message)
