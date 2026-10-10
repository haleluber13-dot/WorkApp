package com.workapp.phoneguard.ui

import com.workapp.phoneguard.ProtectionMode
import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.Kind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FormatTest {
    @Test
    fun bytes() {
        assertEquals("0 B", Format.bytes(0))
        assertEquals("0 B", Format.bytes(-5))
        assertEquals("1023 B", Format.bytes(1023))
        assertEquals("1 KB", Format.bytes(1024))
        assertEquals("1.5 KB", Format.bytes(1536))
        assertEquals("34 KB", Format.bytes(34 * 1024 + 10))
        assertEquals("500 KB", Format.bytes(500 * 1024))
        assertEquals("1 MB", Format.bytes(1024 * 1024 - 1))
        assertEquals("5.5 MB", Format.bytes((5.5 * 1024 * 1024).toLong()))
        assertEquals("1.25 GB", Format.bytes((1.25 * 1024 * 1024 * 1024).toLong()))
        assertEquals("12.3 GB", Format.bytes((12.3 * 1024 * 1024 * 1024).toLong()))
    }

    @Test
    fun count() {
        assertEquals("1 app", Format.count(1, "app"))
        assertEquals("0 apps", Format.count(0, "app"))
        assertEquals("3 apps", Format.count(3L, "app"))
        assertEquals("2 entries", Format.count(2, "entry", "entries"))
    }

    @Test
    fun normalizeDomain() {
        assertEquals("example.com", Format.normalizeDomain("example.com"))
        assertEquals("example.com", Format.normalizeDomain("  https://www.Example.com/login?x=1 "))
        assertEquals("sub.example.co.uk", Format.normalizeDomain("http://user@sub.example.co.uk:8080/"))
        assertEquals("example.com", Format.normalizeDomain("example.com."))
        assertEquals("example.com", Format.normalizeDomain("*.example.com"))
        assertEquals("www.com", Format.normalizeDomain("www.com"))
        assertEquals("xn--bcher-kva.de", Format.normalizeDomain("bücher.de"))
        assertNull(Format.normalizeDomain(""))
        assertNull(Format.normalizeDomain("localhost"))
        assertNull(Format.normalizeDomain("192.168.1.1"))
        assertNull(Format.normalizeDomain("[::1]"))
        assertNull(Format.normalizeDomain("bad_domain.com"))
        assertNull(Format.normalizeDomain("-bad.com"))
        assertNull(Format.normalizeDomain("a..com"))
        assertNull(Format.normalizeDomain("hello world.com"))
    }

    @Test
    fun endpoint() {
        fun ev(host: String, port: Int, domain: String?, kind: Kind = Kind.TCP) =
            ConnEvent(0, 1, kind, host, port, domain, false)
        assertEquals("example.com", Format.endpoint(ev("1.2.3.4", 443, "example.com")))
        assertEquals("example.com, port 5222", Format.endpoint(ev("1.2.3.4", 5222, "example.com")))
        assertEquals("1.2.3.4:5222", Format.endpoint(ev("1.2.3.4", 5222, null)))
        assertEquals("[2001:db8::1]:443", Format.endpoint(ev("2001:db8::1", 443, null)))
        assertEquals("example.com", Format.endpoint(ev("10.215.173.53", 53, "example.com", Kind.DNS)))
    }

    @Test
    fun top() {
        val t = Format.top(mapOf("b.com" to 3, "a.com" to 3, "c.com" to 10, "d.com" to 1), 3)
        assertEquals(listOf("c.com" to 10, "a.com" to 3, "b.com" to 3), t)
    }
}

class StatusTest {
    private val good = StatusInput(
        running = true, mode = ProtectionMode.FULL, shieldOn = true, dnsEncrypted = true, dnsProblem = null,
        dnsQueries = 5, providerEncrypts = true, scanned = true, scanHigh = 0, batteryExempt = true,
    )

    @Test
    fun allGoodIsProtected() {
        val s = Status.evaluate(good)
        assertEquals(Level.PROTECTED, s.level)
        assertTrue(s.issues.isEmpty())
    }

    @Test
    fun offWhenNotRunning() {
        assertEquals(Level.OFF, Status.evaluate(good.copy(running = false, mode = null)).level)
    }

    @Test
    fun basicModeIsPartial() {
        val s = Status.evaluate(good.copy(mode = ProtectionMode.BASIC, dnsEncrypted = false))
        assertEquals(Level.PARTIAL, s.level)
        // Basic mode explains itself once, without also complaining about DNS.
        assertEquals(1, s.issues.size)
    }

    @Test
    fun missingPiecesArePartial() {
        assertEquals(Level.PARTIAL, Status.evaluate(good.copy(shieldOn = false)).level)
        assertEquals(Level.PARTIAL, Status.evaluate(good.copy(batteryExempt = false)).level)
        assertEquals(Level.PARTIAL, Status.evaluate(good.copy(scanned = false)).level)
        assertEquals(Level.PARTIAL, Status.evaluate(good.copy(dnsEncrypted = false, providerEncrypts = false)).level)
        val problem = Status.evaluate(good.copy(dnsEncrypted = false, dnsProblem = "Quad9 unreachable"))
        assertEquals("Quad9 unreachable", problem.issues.single().text)
    }

    @Test
    fun justStartedDnsIsNotAProblem() {
        assertEquals(Level.PROTECTED, Status.evaluate(good.copy(dnsEncrypted = false, dnsQueries = 0)).level)
    }

    @Test
    fun highRiskScanIsSerious() {
        val s = Status.evaluate(good.copy(scanHigh = 2))
        assertEquals(Level.PARTIAL, s.level)
        assertTrue(s.issues.single().serious)
        assertTrue(s.issues.single().text.contains("2 high-risk items"))
    }
}
