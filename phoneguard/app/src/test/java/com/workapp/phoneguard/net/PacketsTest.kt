package com.workapp.phoneguard.net

import com.workapp.phoneguard.net.TestPackets.assertChecksumsValid
import com.workapp.phoneguard.net.TestPackets.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress

class PacketsTest {
    private val v4a = InetAddress.getByName("10.215.173.1").address
    private val v4b = InetAddress.getByName("93.184.216.34").address
    private val v6a = InetAddress.getByName("fd00:2bd:5a7::1").address
    private val v6b = InetAddress.getByName("2606:2800:220:1:248:1893:25c8:1946").address

    // ------------------------------------------------------------ checksum vectors

    @Test
    fun rfc1071Example() {
        // RFC 1071 section 3: words 0001 f203 f4f5 f6f7 sum to ddf2 (complement 220d).
        val b = hex("0001f203f4f5f6f7")
        assertEquals(0x220d, Checksum.of(b, 0, b.size))
    }

    @Test
    fun oddLengthIsPaddedWithZero() {
        // A trailing zero byte changes nothing, and a lone byte 0xAB counts as the word 0xAB00.
        assertEquals(Checksum.of(hex("0001f203f4f5f6f7"), 0, 8), Checksum.of(hex("0001f203f4f5f6f700"), 0, 9))
        assertEquals(0xFFFF - 0xAB00, Checksum.of(hex("ab"), 0, 1))
        assertEquals(Checksum.of(hex("0001f203f4f5f6f7aa00"), 0, 10), Checksum.of(hex("0001f203f4f5f6f7aa"), 0, 9))
    }

    @Test
    fun knownIpv4Header() {
        // A widely published sample header whose checksum is b861.
        val h = hex("450000730000400040110000c0a80001c0a800c7")
        assertEquals(0xb861, Checksum.of(h, 0, 20))
    }

    @Test
    fun carriesFoldMoreThanOnce() {
        val b = ByteArray(4096) { 0xFF.toByte() }
        // All-ones data sums to 0xFFFF; its complement is 0.
        assertEquals(0, Checksum.of(b, 0, b.size))
    }

    // Expected values below were computed with a separate Python implementation.

    @Test
    fun tcpIpv4SynVector() {
        val out = ByteArray(100)
        val n = PacketWriter().tcp(out, false, v4a, v4b, 40000, 443, 0x12345678, 0, TCP_SYN, 65535, 1460, 0)
        assertEquals(0x4d19, u16(out, 10)) // IPv4 header checksum (first packet, IP id 0)
        assertEquals(0xa3cb, u16(out, 20 + 16)) // TCP checksum
        assertChecksumsValid(out.copyOf(n))
    }

    @Test
    fun tcpIpv6Vector() {
        val out = ByteArray(200)
        val payload = "hello over IPv6".toByteArray()
        System.arraycopy(payload, 0, out, PacketWriter.tcpPayloadOffset(true), payload.size)
        PacketWriter().tcp(out, true, v6b, v6a, 443, 51000, 1, 2, TCP_ACK, 4000, 0, payload.size)
        assertEquals(0x681e, u16(out, 40 + 16))
    }

    @Test
    fun udpIpv6Vector() {
        val out = ByteArray(200)
        System.arraycopy("abc".toByteArray(), 0, out, PacketWriter.udpPayloadOffset(true), 3)
        PacketWriter().udp(out, true, v6a, v6b, 5353, 443, 3)
        assertEquals(0x755b, u16(out, 40 + 6))
    }

    @Test
    fun udpIpv4Vector() {
        val out = ByteArray(200)
        System.arraycopy(ByteArray(12) { it.toByte() }, 0, out, PacketWriter.udpPayloadOffset(false), 12)
        val dns = InetAddress.getByName("10.215.173.53").address
        PacketWriter().udp(out, false, dns, v4a, 53, 33000, 12)
        assertEquals(0xf09f, u16(out, 20 + 6))
    }

    // ------------------------------------------------------------ build / parse round trips

    @Test
    fun ipv4TcpSynWithMss() {
        val w = PacketWriter()
        val out = ByteArray(2000)
        val n = w.tcp(out, false, v4a, v4b, 40000, 443, 0x12345678, 0, TCP_SYN, 65535, 1460, 0)
        val p = out.copyOf(n)
        assertEquals(44, n)
        assertChecksumsValid(p)
        val v = PacketView()
        assertTrue(v.parse(p, n))
        assertFalse(v.v6)
        assertEquals(PROTO_TCP, v.proto)
        assertArrayEquals(v4a, p.copyOfRange(v.srcOff, v.srcOff + 4))
        assertArrayEquals(v4b, p.copyOfRange(v.dstOff, v.dstOff + 4))
        assertEquals(40000, v.srcPort)
        assertEquals(443, v.dstPort)
        assertEquals(0x12345678, v.seq)
        assertEquals(TCP_SYN, v.flags)
        assertEquals(65535, v.window)
        assertEquals(1460, v.mss)
        assertEquals(0, v.payloadLen)
        // Don't-fragment set, TTL 64.
        assertEquals(0x40, p[6].toInt() and 0xFF)
        assertEquals(64, p[8].toInt())
    }

    @Test
    fun ipv4TcpDataWithHighSequenceNumbers() {
        val w = PacketWriter()
        val out = ByteArray(2000)
        val payload = ByteArray(1460) { (it * 7).toByte() }
        System.arraycopy(payload, 0, out, PacketWriter.tcpPayloadOffset(false), payload.size)
        val seq = 0xFFFFFF00.toInt()
        val ack = 0x80000001.toInt()
        val n = w.tcp(out, false, v4b, v4a, 443, 40000, seq, ack, TCP_ACK or TCP_PSH, 1234, 0, payload.size)
        val p = out.copyOf(n)
        assertEquals(1500, n)
        assertChecksumsValid(p)
        val v = PacketView()
        assertTrue(v.parse(p, n))
        assertEquals(seq, v.seq)
        assertEquals(ack, v.ack)
        assertEquals(TCP_ACK or TCP_PSH, v.flags)
        assertEquals(1234, v.window)
        assertEquals(0, v.mss)
        assertArrayEquals(payload, p.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen))
    }

    @Test
    fun ipv6TcpRoundTrip() {
        val w = PacketWriter()
        val out = ByteArray(2000)
        val payload = "hello over IPv6".toByteArray()
        System.arraycopy(payload, 0, out, PacketWriter.tcpPayloadOffset(true), payload.size)
        val n = w.tcp(out, true, v6b, v6a, 443, 51000, 1, 2, TCP_ACK, 4000, 0, payload.size)
        val p = out.copyOf(n)
        assertEquals(40 + 20 + payload.size, n)
        assertChecksumsValid(p)
        val v = PacketView()
        assertTrue(v.parse(p, n))
        assertTrue(v.v6)
        assertArrayEquals(v6b, p.copyOfRange(v.srcOff, v.srcOff + 16))
        assertArrayEquals(v6a, p.copyOfRange(v.dstOff, v.dstOff + 16))
        assertEquals(443, v.srcPort)
        assertEquals(51000, v.dstPort)
        assertArrayEquals(payload, p.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen))
    }

    @Test
    fun ipv6SynAckWithMss() {
        val w = PacketWriter()
        val out = ByteArray(200)
        val n = w.tcp(out, true, v6b, v6a, 443, 51000, 7, 8, TCP_SYN or TCP_ACK, 65535, 1440, 0)
        assertChecksumsValid(out.copyOf(n))
        val v = PacketView()
        assertTrue(v.parse(out, n))
        assertEquals(1440, v.mss)
    }

    @Test
    fun ipv4UdpRoundTrip() {
        val w = PacketWriter()
        val out = ByteArray(70000)
        for (size in intArrayOf(0, 1, 2, 512, 1472, 4000, PacketWriter.maxUdpPayload(false))) {
            val payload = ByteArray(size) { (it xor 0x5A).toByte() }
            System.arraycopy(payload, 0, out, PacketWriter.udpPayloadOffset(false), size)
            val n = w.udp(out, false, v4b, v4a, 53, 33000, size)
            val p = out.copyOf(n)
            assertChecksumsValid(p)
            val v = PacketView()
            assertTrue(v.parse(p, n))
            assertEquals(PROTO_UDP, v.proto)
            assertEquals(53, v.srcPort)
            assertEquals(33000, v.dstPort)
            assertArrayEquals(payload, p.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen))
        }
    }

    @Test
    fun ipv6UdpRoundTrip() {
        val w = PacketWriter()
        val out = ByteArray(70000)
        for (size in intArrayOf(0, 3, 1452, 9000, PacketWriter.maxUdpPayload(true))) {
            val payload = ByteArray(size) { (it * 13).toByte() }
            System.arraycopy(payload, 0, out, PacketWriter.udpPayloadOffset(true), size)
            val n = w.udp(out, true, v6a, v6b, 5353, 443, size)
            val p = out.copyOf(n)
            assertChecksumsValid(p)
            val v = PacketView()
            assertTrue(v.parse(p, n))
            assertTrue(v.v6)
            assertEquals(PROTO_UDP, v.proto)
            assertArrayEquals(payload, p.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen))
        }
    }

    @Test
    fun udpChecksumNeverZero() {
        // Find a payload whose checksum would come out as 0 and check it is sent as FFFF instead.
        val w = PacketWriter()
        val out = ByteArray(100)
        var found = false
        for (x in 0..0xFFFF) {
            out[PacketWriter.udpPayloadOffset(false)] = (x ushr 8).toByte()
            out[PacketWriter.udpPayloadOffset(false) + 1] = x.toByte()
            val n = w.udp(out, false, v4a, v4b, 1000, 2000, 2)
            val sum = ((out[26].toInt() and 0xFF) shl 8) or (out[27].toInt() and 0xFF)
            assertTrue("UDP checksum must never be 0", sum != 0)
            if (sum == 0xFFFF) {
                assertChecksumsValid(out.copyOf(n))
                found = true
            }
        }
        assertTrue(found)
    }

    // ------------------------------------------------------------ what the parser refuses

    @Test
    fun rejectsFragmentsIcmpAndTruncatedPackets() {
        val w = PacketWriter()
        val out = ByteArray(2000)
        val n = w.udp(out, false, v4a, v4b, 1, 2, 100)
        val v = PacketView()
        assertTrue(v.parse(out, n))
        assertFalse("truncated", v.parse(out, n - 1))
        val frag = out.copyOf(n).also { it[6] = 0x20 } // more fragments
        assertFalse("first fragment", v.parse(frag, n))
        val later = out.copyOf(n).also { it[6] = 0; it[7] = 10 } // offset != 0
        assertFalse("later fragment", v.parse(later, n))
        val icmp = out.copyOf(n).also { it[9] = 1 }
        assertFalse("ICMP", v.parse(icmp, n))
        assertFalse("garbage", v.parse(ByteArray(40), 40))
        assertFalse("too short", v.parse(out, 10))
    }

    @Test
    fun skipsIpv4OptionsAndIpv6ExtensionHeaders() {
        // IPv4 with 4 bytes of options (IHL 6).
        val w = PacketWriter()
        val out = ByteArray(200)
        val n = w.udp(out, false, v4a, v4b, 1111, 2222, 4)
        val withOpts = ByteArray(n + 4)
        System.arraycopy(out, 0, withOpts, 0, 20)
        withOpts[20] = 1; withOpts[21] = 1; withOpts[22] = 1; withOpts[23] = 0 // NOPs + end
        System.arraycopy(out, 20, withOpts, 24, n - 20)
        withOpts[0] = 0x46
        put16(withOpts, 2, n + 4)
        val v = PacketView()
        assertTrue(v.parse(withOpts, withOpts.size))
        assertEquals(1111, v.srcPort)
        assertEquals(4, v.payloadLen)

        // IPv6 with an 8-byte hop-by-hop header in front of UDP.
        val n6 = w.udp(out, true, v6a, v6b, 3333, 4444, 4)
        val ext = ByteArray(n6 + 8)
        System.arraycopy(out, 0, ext, 0, 40)
        ext[6] = 0 // next header: hop-by-hop
        ext[40] = PROTO_UDP.toByte()
        ext[41] = 0
        System.arraycopy(out, 40, ext, 48, n6 - 40)
        put16(ext, 4, n6 - 40 + 8)
        assertTrue(v.parse(ext, ext.size))
        assertEquals(PROTO_UDP, v.proto)
        assertEquals(3333, v.srcPort)
        assertEquals(4, v.payloadLen)

        // An IPv6 fragment header is refused.
        ext[40] = PROTO_UDP.toByte()
        ext[6] = 44
        assertFalse(v.parse(ext, ext.size))
    }

    @Test
    fun malformedTcpOptionsDontBreakParsing() {
        val w = PacketWriter()
        val out = ByteArray(200)
        val n = w.tcp(out, false, v4a, v4b, 1, 2, 3, 0, TCP_SYN, 100, 1460, 0)
        // Corrupt the option length to run past the header: MSS is ignored, packet still parses.
        out[41] = 40
        val v = PacketView()
        assertTrue(v.parse(out, n))
        assertEquals(0, v.mss)
    }

    @Test
    fun sequenceComparisonsWrap() {
        assertTrue(seqLt(0xFFFFFFF0.toInt(), 5))
        assertTrue(seqGt(5, 0xFFFFFFF0.toInt()))
        assertFalse(seqLt(5, 5))
    }
}
