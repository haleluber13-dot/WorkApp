package com.workapp.phoneguard.core

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class TrafficStoreTest {
    @Before
    fun setUp() = TrafficStore.clear()

    @After
    fun tearDown() = TrafficStore.clear()

    private fun ev(
        uid: Int, kind: Kind, blocked: Boolean, reason: String? = null, byShield: Boolean = false,
        host: String = "10.215.173.53", port: Int = 53, domain: String? = "example.com",
    ) = ConnEvent(System.currentTimeMillis(), uid, kind, host, port, domain, blocked, reason, byShield)

    @Test
    fun theWebShieldFlagDecidesSiteBlocksNotTheKind() {
        // The Web Shield's own blocks.
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "Malware", byShield = true))
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "Ads & trackers (via t.example.net)", byShield = true))
        // DNS-kind events the firewall emits: a blocked app's lookups, DNS to other servers, TCP 53.
        TrafficStore.onEvent(ev(10300, Kind.DNS, true, "Firewall: blocked on Wi-Fi"))
        TrafficStore.onEvent(ev(10300, Kind.DNS, true, "Firewall: blocked on mobile data", host = "8.8.8.8"))
        TrafficStore.onEvent(ev(10300, Kind.DNS, true, "Blocked by firewall", host = "1.1.1.1"))
        TrafficStore.onEvent(ev(10300, Kind.TCP, true, "Firewall: blocked on Wi-Fi", host = "1.2.3.4", port = 443))

        assertEquals(2, TrafficStore.totalSiteBlocked())
        assertEquals(4, TrafficStore.totalFirewallBlocked())
        assertEquals(6, TrafficStore.totalBlocked())
        val shielded = TrafficStore.app(10200)!!
        assertEquals(2, shielded.siteBlocked)
        assertEquals(0, shielded.firewallBlocked)
        val blockedApp = TrafficStore.app(10300)!!
        assertEquals("a blocked app's lookups are firewall blocks", 4, blockedApp.firewallBlocked)
        assertEquals(0, blockedApp.siteBlocked)
        assertEquals(blockedApp.firewallBlocked + blockedApp.siteBlocked, blockedApp.blocked)
    }

    @Test
    fun dnsBlocksWithoutTheFlagAreToldApartByTheirReason() {
        // Code that doesn't set byShield yet: a site block names its category, the firewall itself.
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "Phishing site"))
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "Blocked by firewall"))
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, null))
        val a = TrafficStore.app(10200)!!
        assertEquals(1, a.siteBlocked)
        assertEquals(2, a.firewallBlocked)
    }

    @Test
    fun unidentifiedOwnersAreShownApartFromApps() {
        TrafficStore.onEvent(ev(-1, Kind.UDP, true, "Firewall: blocked on Wi-Fi", host = "8.8.8.8", port = 443))
        TrafficStore.onEvent(ev(-1, Kind.TCP, true, "Firewall: blocked on Wi-Fi", host = "8.8.4.4", port = 443))
        TrafficStore.onEvent(ev(-1, Kind.DNS, true, "Firewall: blocked on Wi-Fi"))
        TrafficStore.onEvent(ev(-1, Kind.UDP, false, host = "255.255.255.255", port = 9, domain = null))
        TrafficStore.onEvent(ev(10300, Kind.TCP, true, "Firewall: blocked on Wi-Fi", host = "1.2.3.4", port = 443))

        // Not counted as any app's blocks...
        assertEquals(1, TrafficStore.totalFirewallBlocked())
        assertEquals(0, TrafficStore.totalSiteBlocked())
        assertEquals(3, TrafficStore.totalUnidentifiedBlocked())
        // ...but still in the logs, and the blocked log's count matches its length.
        assertEquals(5, TrafficStore.recent().size)
        assertEquals(4, TrafficStore.recentBlocked().size)
        assertEquals(TrafficStore.recentBlocked().size, TrafficStore.totalBlocked())
        assertTrue(TrafficStore.recentBlocked().count { it.uid == -1 } == 3)
        // One entry of their own, as "unknown".
        val unknown = TrafficStore.app(-1)!!
        assertEquals(3, unknown.blocked)
        assertEquals(1, unknown.connections)
        assertEquals(1, TrafficStore.app(10300)!!.blocked)
    }

    @Test
    fun clearResetsTheUnidentifiedCountToo() {
        TrafficStore.onEvent(ev(-1, Kind.UDP, true, "Blocked by firewall", host = "8.8.8.8", port = 443))
        TrafficStore.clear()
        assertEquals(0, TrafficStore.totalUnidentifiedBlocked())
        assertEquals(0, TrafficStore.totalBlocked())
    }
}
