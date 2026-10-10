package com.workapp.phoneguard.ui

import com.workapp.phoneguard.ProtectionMode
import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.Kind
import com.workapp.phoneguard.core.TrafficStore
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class BlockCountsTest {
    @Before
    fun setUp() = TrafficStore.clear()

    @After
    fun tearDown() = TrafficStore.clear()

    private fun ev(uid: Int, kind: Kind, blocked: Boolean, domain: String? = null, reason: String? = null) =
        ConnEvent(System.currentTimeMillis(), uid, kind, "1.2.3.4", 443, domain, blocked, reason)

    @Test
    fun firewallAndWebShieldBlocksAreCountedApart() {
        TrafficStore.onEvent(ev(10100, Kind.TCP, true, reason = "Firewall: blocked on Wi-Fi"))
        TrafficStore.onEvent(ev(10100, Kind.UDP, true, reason = "Firewall: blocked on Wi-Fi"))
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "ads.example.com", "Ads & trackers"))
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "ads.example.com", "Ads & trackers"))
        TrafficStore.onEvent(ev(10200, Kind.DNS, true, "evil.example", "Malware"))
        TrafficStore.onEvent(ev(10200, Kind.TCP, false, "example.com"))

        assertEquals(2, TrafficStore.totalFirewallBlocked())
        assertEquals(3, TrafficStore.totalSiteBlocked())
        assertEquals(5, TrafficStore.totalBlocked())
        val chrome = TrafficStore.app(10200)!!
        assertEquals(0, chrome.firewallBlocked)
        assertEquals(3, chrome.siteBlocked)
        assertEquals(3, chrome.blocked)
        assertEquals(1, chrome.connections)
        val blockedApp = TrafficStore.app(10100)!!
        assertEquals(2, blockedApp.firewallBlocked)
        assertEquals(0, blockedApp.siteBlocked)
    }

    @Test
    fun blockedLogSurvivesBusyAllowedTraffic() {
        TrafficStore.onEvent(ev(10100, Kind.TCP, true, reason = "Firewall: blocked on Wi-Fi"))
        repeat(3000) { TrafficStore.onEvent(ev(10200, Kind.TCP, false, "site$it.example")) }
        // The general list has moved on...
        assertTrue(TrafficStore.recent(1000).none { it.blocked })
        // ...but the blocked log still has it, matching the count.
        assertEquals(1, TrafficStore.recentBlocked().size)
        assertEquals(TrafficStore.totalBlocked(), TrafficStore.recentBlocked().size)
    }

    @Test
    fun clearEmptiesTheBlockedLogToo() {
        TrafficStore.onEvent(ev(10100, Kind.TCP, true))
        TrafficStore.clear()
        assertTrue(TrafficStore.recentBlocked().isEmpty())
        assertEquals(0, TrafficStore.totalBlocked())
    }

    @Test
    fun blockWordingKeepsTheTwoKindsApart() {
        assertEquals("3 connections stopped by the firewall", Format.firewallBlocks(3))
        assertEquals("1 dangerous or tracking site blocked", Format.siteBlocks(1))
        assertEquals("12 dangerous or tracking sites blocked", Format.siteBlocks(12L))
        assertEquals(listOf("12 dangerous or tracking sites blocked"), Format.blockParts(0, 12))
        assertEquals(2, Format.blockParts(3, 12).size)
        assertTrue(Format.blockParts(0, 0).isEmpty())
    }

    @Test
    fun emptyBlockedTextNeverContradictsTheCount() {
        assertFalse(Format.emptyBlockedText(true, 57).startsWith("Nothing blocked"))
        assertFalse(Format.emptyBlockedText(false, 57).startsWith("Nothing"))
        assertTrue(Format.emptyBlockedText(true, 0).startsWith("Nothing blocked yet"))
        assertTrue(Format.emptyBlockedText(false, 0).contains("Turn on protection"))
    }

    @Test
    fun viaTargetIsParsedDefensively() {
        assertEquals("tracker.example.net", Format.viaTarget("Ads & trackers (via tracker.example.net)"))
        assertEquals("tracker.example.net", Format.viaTarget("Ads & trackers (VIA Tracker.Example.NET.)"))
        assertEquals("cdn.evil.example", Format.viaTarget("Malware (via  cdn.evil.example )"))
        assertNull(Format.viaTarget(null))
        assertNull(Format.viaTarget(""))
        assertNull(Format.viaTarget("Ads & trackers"))
        assertNull(Format.viaTarget("Firewall: blocked on Wi-Fi"))
        assertNull(Format.viaTarget("Ads (via )"))
        assertNull(Format.viaTarget("Ads (via not_a_domain)"))
        assertNull(Format.viaTarget("Ads (via 10.0.0.1)"))
        assertNull(Format.viaTarget("Ads (via tracker.example.net"))
    }
}

class FallbackStatusTest {
    private val fellBack = StatusInput(
        running = true, mode = ProtectionMode.BASIC, shieldOn = true, dnsEncrypted = false, dnsProblem = null,
        dnsQueries = 0, providerEncrypts = true, scanned = true, scanHigh = 0, batteryExempt = true,
        chosenMode = ProtectionMode.FULL, fallbackProblem = "Full protection stopped unexpectedly; running in basic mode",
    )

    @Test
    fun fallbackOffersRetryInsteadOfPickingFull() {
        val s = Status.evaluate(fellBack)
        assertEquals(Level.PARTIAL, s.level)
        assertTrue(s.offerRetryFull)
        val issue = s.issues.single()
        assertTrue(issue.serious)
        assertEquals(FALLBACK_TEXT, issue.text)
        assertFalse(issue.text.contains("switch to Full in Settings"))
    }

    @Test
    fun basicByChoiceStillSuggestsFull() {
        val s = Status.evaluate(fellBack.copy(chosenMode = ProtectionMode.BASIC, fallbackProblem = null))
        assertFalse(s.offerRetryFull)
        assertTrue(s.issues.single().text.contains("switch to Full in Settings"))
    }

    @Test
    fun switchingToFullIsNotAProblemMessage() {
        val s = Status.evaluate(fellBack.copy(fallbackProblem = null))
        assertFalse(s.offerRetryFull)
        assertFalse(s.issues.single().serious)
        assertFalse(s.issues.single().text.contains("switch to Full in Settings"))
    }

    @Test
    fun noRetryWhenOff() {
        val s = Status.evaluate(fellBack.copy(running = false, mode = null))
        assertEquals(Level.OFF, s.level)
        assertFalse(s.offerRetryFull)
    }
}
