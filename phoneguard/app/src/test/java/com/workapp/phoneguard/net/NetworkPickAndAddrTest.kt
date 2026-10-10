package com.workapp.phoneguard.net

import com.workapp.phoneguard.NetType
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress

class NetworkPickAndAddrTest {
    private fun wifi(validated: Boolean = true, internet: Boolean = true) =
        NetFacts(wifi = true, cellular = false, vpn = false, internet = internet, validated = validated)

    private fun mobile(validated: Boolean = true) =
        NetFacts(wifi = false, cellular = true, vpn = false, internet = true, validated = validated)

    /** A VPN reports the transports of the network under it as well. */
    private val vpnOverWifi = NetFacts(wifi = true, cellular = false, vpn = true, internet = true, validated = true)

    // ------------------------------------------------------------------ which rules apply

    @Test
    fun defaultNetworkDecides() {
        assertEquals(NetType.WIFI, NetworkPick.pick(wifi(), listOf(wifi(), mobile())))
        assertEquals(NetType.MOBILE, NetworkPick.pick(mobile(), listOf(mobile())))
    }

    @Test
    fun mobileDataInUseWhileWifiStaysConnected() {
        // Wi-Fi without internet, a login page, or Samsung's "switch to mobile data": Wi-Fi is
        // still connected, but traffic goes over mobile data, so the mobile-data rules apply.
        val stuckWifi = wifi(validated = false)
        assertEquals(NetType.MOBILE, NetworkPick.pick(mobile(), listOf(stuckWifi, mobile())))
        assertEquals(NetType.MOBILE, NetworkPick.pick(mobile(), listOf(wifi(), mobile())))
    }

    @Test
    fun unusualDefaultNetworkUsesBothRuleSets() {
        val bluetooth = NetFacts(wifi = false, cellular = false, vpn = false, internet = true, validated = true)
        assertEquals(NetType.NONE, NetworkPick.pick(bluetooth, listOf(bluetooth, mobile())))
    }

    @Test
    fun withoutAUsableDefaultTheRealNetworksDecide() {
        for (default in listOf(null, vpnOverWifi)) {
            assertEquals(NetType.NONE, NetworkPick.pick(default, emptyList()))
            assertEquals(NetType.WIFI, NetworkPick.pick(default, listOf(wifi(validated = false))))
            assertEquals(NetType.MOBILE, NetworkPick.pick(default, listOf(mobile())))
            // Only one of them works: that one carries the traffic.
            assertEquals(NetType.WIFI, NetworkPick.pick(default, listOf(wifi(), mobile(validated = false))))
            assertEquals(NetType.MOBILE, NetworkPick.pick(default, listOf(wifi(validated = false), mobile())))
            // Both up and no telling which is used: the stricter choice (blocked on either).
            assertEquals(NetType.NONE, NetworkPick.pick(default, listOf(wifi(), mobile())))
            // VPNs and networks without internet don't count.
            assertEquals(NetType.MOBILE, NetworkPick.pick(default, listOf(vpnOverWifi, wifi(internet = false), mobile())))
        }
    }

    // ------------------------------------------------------------------ address classes

    private fun ip(s: String): ByteArray = InetAddress.getByName(s).address

    private fun v6(s: String): ByteArray {
        // InetAddress turns ::ffff:a.b.c.d into an IPv4 address; build the 16 bytes by hand.
        if (s.startsWith("::ffff:")) return Addr.mapped(ip(s.removePrefix("::ffff:")))
        return ip(s)
    }

    @Test
    fun unicastAddresses() {
        for (a in listOf("8.8.8.8", "192.168.1.255", "10.0.0.1", "127.0.0.1")) assertTrue(a, Addr.isUnicast(ip(a), 0, false))
        for (a in listOf("224.0.0.251", "239.255.255.250", "255.255.255.255", "0.0.0.0")) {
            assertFalse(a, Addr.isUnicast(ip(a), 0, false))
        }
        for (a in listOf("2001:4860:4860::8888", "fe80::1", "::ffff:8.8.8.8")) assertTrue(a, Addr.isUnicast(v6(a), 0, true))
        for (a in listOf("ff02::fb", "::", "::ffff:224.0.0.251")) assertFalse(a, Addr.isUnicast(v6(a), 0, true))
    }

    @Test
    fun localNetworkAddresses() {
        for (a in listOf("10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.255", "169.254.10.1")) {
            assertTrue(a, Addr.isLan(ip(a), 0, false))
            assertTrue(a, Addr.isLan(InetAddress.getByName(a)))
        }
        for (a in listOf("172.32.0.1", "172.15.0.1", "8.8.8.8", "100.64.0.1", "127.0.0.1", "192.169.0.1")) {
            assertFalse(a, Addr.isLan(ip(a), 0, false))
        }
        for (a in listOf("fe80::1", "fd00:2bd::1", "fc00::1", "::ffff:192.168.0.1")) assertTrue(a, Addr.isLan(v6(a), 0, true))
        for (a in listOf("2001:db8::1", "fec0::1", "ff02::1", "::ffff:8.8.8.8")) assertFalse(a, Addr.isLan(v6(a), 0, true))
    }

    @Test
    fun mappedAddresses() {
        val m = Addr.mapped(ip("1.2.3.4"))
        assertTrue(Addr.isMapped(m, 0))
        assertArrayEquals(ip("1.2.3.4"), m.copyOfRange(12, 16))
        assertFalse(Addr.isMapped(ip("2001:db8::1"), 0))
        assertFalse(Addr.isMapped(ip("::1"), 0))
    }

    // ------------------------------------------------------------------ UDP flow keys

    private fun udpPacket(src: String, srcPort: Int, dst: ByteArray, dstPort: Int, v6: Boolean): PacketView {
        val out = ByteArray(200)
        val n = PacketWriter().udp(out, v6, ip(src), dst, srcPort, dstPort, 0)
        return PacketView().also { assertTrue(it.parse(out, n)) }
    }

    @Test
    fun udpFlowKeyIsTheAppSocketWhateverTheDestination() {
        val a = FlowKey().setEndpoint(udpPacket("10.215.173.1", 40000, ip("8.8.8.8"), 53, false), false).copy()
        val b = FlowKey().setEndpoint(udpPacket("10.215.173.1", 40000, ip("1.1.1.1"), 3478, false), false).copy()
        val c = FlowKey().setEndpoint(udpPacket("10.215.173.1", 40001, ip("8.8.8.8"), 53, false), false).copy()
        assertEquals(a, b)
        assertEquals(a.hashCode(), b.hashCode())
        assertNotEquals(a, c)
        // IPv6 packets to IPv4-mapped addresses need an IPv4 socket: a flow of their own.
        val six = udpPacket("fd00:2bd:5a7::1", 40000, ip("2001:db8::1"), 443, true)
        val mapped = udpPacket("fd00:2bd:5a7::1", 40000, v6("::ffff:8.8.8.8"), 443, true)
        assertNotEquals(FlowKey().setEndpoint(six, false).copy(), FlowKey().setEndpoint(mapped, true).copy())
        assertEquals(FlowKey().setEndpoint(six, false).copy(), FlowKey().setEndpoint(six, false).copy())
    }
}
