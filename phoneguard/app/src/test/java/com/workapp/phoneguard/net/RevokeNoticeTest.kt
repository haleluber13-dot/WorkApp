package com.workapp.phoneguard.net

import com.workapp.phoneguard.revokeNotice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** What the firewall service says after Android took the VPN away from outside PhoneGuard. */
class RevokeNoticeTest {
    @Test
    fun anotherVpnAppIsNamedAsTheCause() {
        val n = revokeNotice(otherVpn = true)
        assertTrue(n.text.contains("Another VPN app"))
        assertTrue(n.text.contains("Tap to turn PhoneGuard back on"))
        assertFalse("worth a sound: protection is gone because of another app", n.quiet)
    }

    @Test
    fun otherwiseTheWordingIsNeutralAndQuiet() {
        // e.g. the user tapped Disconnect in Android's VPN dialog: don't blame another app.
        val n = revokeNotice(otherVpn = false)
        assertEquals("PhoneGuard protection was turned off outside the app. Tap to turn it back on.", n.text)
        assertFalse(n.text.contains("VPN app"))
        assertTrue("low-importance channel", n.quiet)
    }
}
