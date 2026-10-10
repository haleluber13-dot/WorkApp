package com.workapp.phoneguard.scanner

import com.workapp.phoneguard.SetupLogic
import com.workapp.phoneguard.WifiLogic
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SetupAndWifiTextTest {
    @Test
    fun privacyIsOnlyClaimedWhenFullModeEncryptsNow() {
        val private = WifiLogic.protectionLine(fullRunning = true, encryptedNow = true, providerEncrypts = true)
        assertTrue(private.contains("keeps your lookups private"))
        for ((full, enc, prov) in listOf(
            Triple(true, false, true),   // network blocks encrypted DNS: fell back to plain DNS
            Triple(true, false, false),  // user picked the network's own DNS
            Triple(false, true, true),   // Basic mode (or off): Web Shield isn't running
            Triple(false, false, true),
        )) {
            val line = WifiLogic.protectionLine(full, enc, prov)
            assertFalse(line, line.contains("keeps your lookups private"))
        }
        assertTrue(WifiLogic.protectionLine(false, true, true).contains("Turn on PhoneGuard's Full protection"))
        assertTrue(WifiLogic.protectionLine(true, false, false).contains("Pick an encrypted DNS"))
        assertTrue(WifiLogic.protectionLine(true, false, true).contains("aren't encrypted"))
    }

    @Test
    fun alwaysOnTipAlwaysWarnsAboutBlockingConnections() {
        for (samsung in listOf(true, false)) {
            val tip = SetupLogic.alwaysOnVpnTip(samsung)
            assertTrue(tip.contains("Always-on VPN"))
            assertTrue(tip.contains(SetupLogic.LOCKDOWN_WARNING))
        }
        assertTrue(SetupLogic.alwaysOnVpnTip(true).contains("More connection settings"))
    }

    @Test
    fun setupTipsDontRepeatHomeAdvice() {
        for (samsung in listOf(true, false)) for (old in listOf(true, false)) for (prot in listOf(true, false)) {
            val tips = SetupLogic.setupTips(samsung, old, prot)
            for (t in tips) {
                // Every Always-on mention must carry the warning; the Home checklist already covers it.
                assertFalse(t, t.contains("Always-on") && !t.contains(SetupLogic.LOCKDOWN_WARNING))
                assertFalse(t, t.contains("Play Protect"))
                assertFalse(t, t.contains("system updates"))
                assertFalse(t, t.startsWith("Let PhoneGuard run in the background"))
            }
            assertEquals(tips.size, tips.distinct().size)
        }
        val note20 = SetupLogic.setupTips(samsung = true, oldOneUi = false, samsungDeviceProtection = true)
        assertTrue(note20.any { it.contains("Never sleeping apps") })
        assertTrue(note20.any { it.contains("Device protection") })
        assertTrue(SetupLogic.setupTips(true, true, false).any { it.contains("Apps that won't be put to sleep") })
    }
}
