package com.workapp.phoneguard.scanner

import com.workapp.phoneguard.ScanLogic
import com.workapp.phoneguard.Severity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class ScanLogicTest {
    private val today = LocalDate.of(2026, 10, 10)

    @Test
    fun patchAgeIsDaysSincePatch() {
        assertEquals(9L, ScanLogic.patchAgeDays("2026-10-01", today))
        assertEquals(365L, ScanLogic.patchAgeDays("2025-10-10", today))
    }

    @Test
    fun futurePatchDateCountsAsNew() {
        assertEquals(0L, ScanLogic.patchAgeDays("2027-01-01", today))
    }

    @Test
    fun unreadablePatchIsNull() {
        assertNull(ScanLogic.patchAgeDays(null, today))
        assertNull(ScanLogic.patchAgeDays("", today))
        assertNull(ScanLogic.patchAgeDays("2024-13-01", today))
        assertNull(ScanLogic.patchAgeDays("October 2024", today))
        assertEquals(9L, ScanLogic.patchAgeDays(" 2026-10-01 ", today))
    }

    @Test
    fun patchSeverityFollowsAge() {
        assertNull(ScanLogic.patchSeverity(0))
        assertNull(ScanLogic.patchSeverity(90))
        assertEquals(Severity.LOW, ScanLogic.patchSeverity(91))
        assertEquals(Severity.LOW, ScanLogic.patchSeverity(180))
        assertEquals(Severity.MEDIUM, ScanLogic.patchSeverity(181))
        assertEquals(Severity.MEDIUM, ScanLogic.patchSeverity(1000))
    }

    @Test
    fun ageTextIsPlain() {
        assertEquals("3 months", ScanLogic.ageText(91))
        assertEquals("1 month", ScanLogic.ageText(30))
        assertEquals("11 months", ScanLogic.ageText(359))
        assertEquals("over a year", ScanLogic.ageText(400))
        assertEquals("over 2 years", ScanLogic.ageText(800))
    }

    @Test
    fun recognisesNote20Models() {
        for (m in listOf("SM-N986B", "SM-N986U1", "SM-N985F", "SM-N981B", "SM-N980F", "sm-n986n", "SC-53A", "SCG06")) {
            assertTrue(m, ScanLogic.isNote20(m))
        }
        for (m in listOf(null, "", "SM-N975F", "SM-S918B", "SM-N970F", "Pixel 7")) {
            assertFalse("$m", ScanLogic.isNote20(m))
        }
    }

    @Test
    fun appSeverityThresholds() {
        assertEquals(Severity.LOW, ScanLogic.appSeverity(0))
        assertEquals(Severity.LOW, ScanLogic.appSeverity(4))
        assertEquals(Severity.MEDIUM, ScanLogic.appSeverity(5))
        assertEquals(Severity.MEDIUM, ScanLogic.appSeverity(8))
        assertEquals(Severity.HIGH, ScanLogic.appSeverity(9))
    }

    @Test
    fun installersIdIsOrderIndependentAndChangesWithApps() {
        val a = ScanLogic.installersFindingId(listOf("b.app", "a.app"))
        assertEquals(a, ScanLogic.installersFindingId(listOf("a.app", "b.app")))
        assertTrue(a != ScanLogic.installersFindingId(listOf("a.app", "b.app", "c.app")))
    }
}
