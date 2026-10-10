package com.workapp.phoneguard.scanner

import com.workapp.phoneguard.Finding
import com.workapp.phoneguard.ScanLogic
import com.workapp.phoneguard.Severity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TrustAndInstallTest {
    private val play = "com.android.vending"
    private val galaxy = "com.sec.android.app.samsungapps"

    @Test
    fun storeInstallsAreNotSideloaded() {
        assertFalse(ScanLogic.isSideloaded(play, play, null))
        assertFalse(ScanLogic.isSideloaded(galaxy, galaxy, null))
        // Apps installed before Android 11 have no initiator on record: not held against them.
        assertFalse(ScanLogic.isSideloaded(play, null, null))
        // Apps moved over by Samsung Smart Switch keep Play as their installer.
        assertFalse(ScanLogic.isSideloaded(play, "com.sec.android.easyMover", null))
    }

    @Test
    fun unknownOrNonStoreInstallerIsSideloaded() {
        assertTrue(ScanLogic.isSideloaded(null, null, null))
        assertTrue(ScanLogic.isSideloaded("com.google.android.packageinstaller", "com.google.android.packageinstaller", null))
        assertTrue(ScanLogic.isSideloaded("com.android.shell", "com.android.shell", null))
    }

    @Test
    fun fakedStoreInstallerIsSideloaded() {
        // adb install -i com.android.vending app.apk
        assertTrue(ScanLogic.isSideloaded(play, "com.android.shell", null))
        // A file manager installing the app while claiming Galaxy Store.
        assertTrue(ScanLogic.isSideloaded(galaxy, "com.sec.android.app.myfiles", null))
        // Originating app (when Android shows it) that isn't a store.
        assertTrue(ScanLogic.isSideloaded(play, play, "com.android.chrome"))
    }

    @Test
    fun appIdIsStableForTheSameState() {
        val a = ScanLogic.appFindingId("x.app", listOf("sideloaded", "perm:read_sms"), false, "ABCDEF0123456789FFFF")
        val b = ScanLogic.appFindingId("x.app", listOf("perm:read_sms", "sideloaded", " sideloaded "), false, "abcdef0123456789ffff")
        assertEquals(a, b)
        assertTrue(a.startsWith("app:x.app|"))
    }

    @Test
    fun appIdChangesWhenTheAppGainsPowersOrChangesSigner() {
        val base = ScanLogic.appFindingId("x.app", listOf("sideloaded"), false, "aaaa")
        assertNotEquals(base, ScanLogic.appFindingId("x.app", listOf("sideloaded", "a11y"), false, "aaaa"))
        assertNotEquals(base, ScanLogic.appFindingId("x.app", listOf("sideloaded", "admin"), false, "aaaa"))
        assertNotEquals(base, ScanLogic.appFindingId("x.app", listOf("sideloaded", "listener"), false, "aaaa"))
        assertNotEquals(base, ScanLogic.appFindingId("x.app", listOf("sideloaded", "perm:record_audio"), false, "aaaa"))
        assertNotEquals(base, ScanLogic.appFindingId("x.app", listOf("sideloaded"), true, "aaaa"))
        assertNotEquals(base, ScanLogic.appFindingId("x.app", listOf("sideloaded"), false, "bbbb"))
        assertNotEquals(base, ScanLogic.appFindingId("y.app", listOf("sideloaded"), false, "aaaa"))
        // Never the same as the old "app:<pkg>" id, so old trusts can't match new findings.
        assertNotEquals(ScanLogic.legacyAppFindingId("x.app"), ScanLogic.appFindingId("x.app", emptyList(), false, null))
    }

    private fun finding(id: String, pkg: String?, trustable: Boolean = true) =
        Finding(id, Severity.LOW, "t", emptyList(), pkg, trustable = trustable)

    @Test
    fun trustHidesOnlyTheSameStateAndNeverStalkerware() {
        val low = ScanLogic.appFindingId("x.app", listOf("sideloaded"), false, "aaaa")
        val trusted = setOf(low)
        val now = ScanLogic.appFindingId("x.app", listOf("sideloaded", "a11y"), false, "aaaa")
        // Same state: hidden.
        assertEquals(1, ScanLogic.hiddenByTrust(listOf(finding(low, "x.app")), trusted).size)
        // Gained Accessibility: shown again.
        assertTrue(ScanLogic.hiddenByTrust(listOf(finding(now, "x.app")), trusted).isEmpty())
        // Known stalkerware is never hidden, even if its id were somehow trusted.
        val spy = ScanLogic.appFindingId("x.app", emptyList(), true, "aaaa")
        assertTrue(ScanLogic.hiddenByTrust(listOf(finding(spy, "x.app", trustable = false)), setOf(spy)).isEmpty())
    }

    @Test
    fun trustedAppStaysHiddenWhenItLosesAPower() {
        // Saved by an earlier version: same form, so it keeps working.
        val saved = "app:x.app|perm:camera,perm:read_sms,sideloaded|-|aaaa"
        assertEquals(saved, ScanLogic.appFindingId("x.app", listOf("sideloaded", "perm:read_sms", "perm:camera"), false, "aaaa"))
        val trusted = setOf(saved, "dev:adb")
        fun hidden(powers: List<String>, spy: Boolean = false, cert: String = "aaaa", pkg: String = "x.app") =
            ScanLogic.hiddenByTrust(listOf(finding(ScanLogic.appFindingId(pkg, powers, spy, cert), pkg)), trusted).size == 1
        assertTrue(hidden(listOf("sideloaded", "perm:read_sms", "perm:camera")))
        // A one-time camera permission ran out, or Android took back an unused permission.
        assertTrue(hidden(listOf("sideloaded", "perm:read_sms")))
        assertTrue(hidden(listOf("sideloaded")))
        // A new power, another signer, another app, or a stalkerware match: shown again.
        assertFalse(hidden(listOf("sideloaded", "perm:read_sms", "a11y")))
        assertFalse(hidden(listOf("sideloaded"), cert = "bbbb"))
        assertFalse(hidden(listOf("sideloaded"), pkg = "y.app"))
        assertFalse(hidden(listOf("sideloaded"), spy = true))
        assertEquals(ScanLogic.AppState("x.app", setOf("perm:camera", "perm:read_sms", "sideloaded"), false, "aaaa"), ScanLogic.parseAppFindingId(saved))
        assertNull(ScanLogic.parseAppFindingId("app:x.app")) // the old per-app form is migrated separately
        assertNull(ScanLogic.parseAppFindingId("dev:adb"))
    }

    @Test
    fun trustedInstallerListStaysHiddenWhenAnAppDropsOff() {
        val trusted = setOf(ScanLogic.installersFindingId(listOf("a.app", "b.app")))
        fun hidden(vararg pkgs: String) =
            ScanLogic.hiddenByTrust(listOf(finding(ScanLogic.installersFindingId(pkgs.toList()), null)), trusted).size == 1
        assertTrue(hidden("b.app", "a.app"))
        assertTrue(hidden("a.app"))
        assertFalse(hidden("a.app", "c.app"))
    }

    @Test
    fun legacyTrustCarriesOverOnceForTheCurrentState() {
        val current = ScanLogic.appFindingId("x.app", listOf("sideloaded"), false, "aaaa")
        val spy = ScanLogic.appFindingId("s.app", emptyList(), true, "bbbb")
        val trusted = setOf("app:x.app", "app:s.app", "dev:adb")
        val migrated = ScanLogic.migrateLegacyTrust(
            listOf(finding(current, "x.app"), finding(spy, "s.app", trustable = false), finding("dev:lock", null)),
            trusted,
        )
        assertEquals(listOf(current), migrated)
        // Nothing to do once the new id is saved.
        assertTrue(ScanLogic.migrateLegacyTrust(listOf(finding(current, "x.app")), trusted + current).isEmpty())
    }
}
