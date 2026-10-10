package com.workapp.phoneguard.scanner

import com.workapp.phoneguard.WifiLogic
import com.workapp.phoneguard.WifiSafety
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class WifiLogicTest {
    @Test
    fun securityTypes() {
        assertEquals(WifiSafety.OPEN, WifiLogic.fromSecurityType(0))   // OPEN
        assertEquals(WifiSafety.WEAK, WifiLogic.fromSecurityType(1))   // WEP
        assertEquals(WifiSafety.SAFE, WifiLogic.fromSecurityType(2))   // PSK
        assertEquals(WifiSafety.SAFE, WifiLogic.fromSecurityType(3))   // EAP
        assertEquals(WifiSafety.SAFE, WifiLogic.fromSecurityType(4))   // SAE
        assertEquals(WifiSafety.SAFE, WifiLogic.fromSecurityType(6))   // OWE (Enhanced Open) is encrypted
        assertEquals(WifiSafety.SAFE, WifiLogic.fromSecurityType(13))  // DPP
        assertEquals(WifiSafety.UNKNOWN, WifiLogic.fromSecurityType(-1))
        assertEquals(WifiSafety.UNKNOWN, WifiLogic.fromSecurityType(99))
    }

    @Test
    fun scanCapabilities() {
        assertEquals(WifiSafety.SAFE, WifiLogic.fromScanCapabilities("[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"))
        assertEquals(WifiSafety.SAFE, WifiLogic.fromScanCapabilities("[RSN-SAE-CCMP][ESS][MFPR]"))
        assertEquals(WifiSafety.SAFE, WifiLogic.fromScanCapabilities("[WPA2-EAP-CCMP][ESS]"))
        assertEquals(WifiSafety.SAFE, WifiLogic.fromScanCapabilities("[RSN-OWE-CCMP][ESS][MFPR]"))
        assertEquals(WifiSafety.WEAK, WifiLogic.fromScanCapabilities("[WEP][ESS]"))
        assertEquals(WifiSafety.OPEN, WifiLogic.fromScanCapabilities("[ESS]"))
        assertEquals(WifiSafety.OPEN, WifiLogic.fromScanCapabilities("[ESS][OWE_TRANSITION]"))
        assertEquals(WifiSafety.UNKNOWN, WifiLogic.fromScanCapabilities(""))
        assertEquals(WifiSafety.UNKNOWN, WifiLogic.fromScanCapabilities(null))
    }

    @Test
    fun ssidAndBssidCleaning() {
        assertEquals("Cafe", WifiLogic.cleanSsid("\"Cafe\""))
        assertEquals("0a1b", WifiLogic.cleanSsid("0a1b"))
        assertNull(WifiLogic.cleanSsid("<unknown ssid>"))
        assertNull(WifiLogic.cleanSsid("\"\""))
        assertNull(WifiLogic.cleanSsid(null))
        assertNull(WifiLogic.cleanBssid("02:00:00:00:00:00"))
        assertEquals("aa:bb:cc:dd:ee:ff", WifiLogic.cleanBssid("AA:BB:CC:DD:EE:FF"))
    }

    @Test
    fun alertKeyPrefersStableIdentity() {
        assertEquals("s:Cafe" to true, WifiLogic.alertKey("Cafe", "aa:bb", 5))
        assertEquals("b:aa:bb" to true, WifiLogic.alertKey(null, "aa:bb", 5))
        assertEquals("n:5" to false, WifiLogic.alertKey(null, null, 5))
        assertEquals("unknown" to false, WifiLogic.alertKey(null, null, null))
    }

    @Test
    fun alertsOncePerNetworkWithCooldown() {
        val now = 100L * WifiLogic.COOLDOWN_MS
        assertTrue(WifiLogic.shouldAlert(now, null, null, true))
        assertFalse(WifiLogic.shouldAlert(now, now - 1000, null, true))
        assertTrue(WifiLogic.shouldAlert(now, now - WifiLogic.COOLDOWN_MS, null, true))
        // Clock moved back: don't stay muted forever.
        assertTrue(WifiLogic.shouldAlert(now, now + 60_000, null, true))
    }

    @Test
    fun unidentifiedNetworksAreRateLimited() {
        val now = 100L * WifiLogic.COOLDOWN_MS
        assertFalse(WifiLogic.shouldAlert(now, null, now - 60_000, false))
        assertTrue(WifiLogic.shouldAlert(now, null, now - WifiLogic.UNIDENTIFIED_GAP_MS, false))
        // A named network isn't held back by alerts about unnamed ones.
        assertTrue(WifiLogic.shouldAlert(now, null, now - 60_000, true))
    }
}
