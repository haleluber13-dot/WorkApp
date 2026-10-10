package com.workapp.phoneguard.shield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File
import java.io.StringReader

class BlocklistTest {
    @get:Rule
    val tmp = TemporaryFolder()

    private val all = ShieldCategory.values().toSet()

    private fun lists(vararg pairs: Pair<ShieldCategory, List<String>>) =
        pairs.associate { (c, d) -> c to HashList.ofDomains(d) }

    @Test
    fun hashIsCaseInsensitiveAndDistinct() {
        assertEquals(DomainHash.of("Example.COM"), DomainHash.of("example.com"))
        assertNotEquals(DomainHash.of("example.com"), DomainHash.of("example.co"))
        assertEquals(DomainHash.of("example.com"), DomainHash.of("www.example.com", 4))
        // No collisions in a realistic batch of names.
        val names = (0 until 200_000).map { "host$it.example$it.com" }
        assertEquals(names.size, names.map { DomainHash.of(it) }.toSet().size)
    }

    @Test
    fun hashListMembership() {
        val l = HashList.ofDomains(listOf("a.com", "b.com", "a.com", "c.org"))
        assertEquals(3, l.size)
        assertTrue(l.contains("a.com"))
        assertTrue(l.contains("C.ORG"))
        assertFalse(l.contains("d.com"))
        assertFalse(HashList.EMPTY.contains("a.com"))
    }

    @Test
    fun matchesDomainAndParentsButNotTld() {
        val b = Blocklist(lists(ShieldCategory.TRACKERS to listOf("tracker.com", "com", "co.uk.example")), all)
        assertEquals(ShieldCategory.TRACKERS, b.check("tracker.com")?.category)
        assertEquals(ShieldCategory.TRACKERS, b.check("a.b.Tracker.COM.")?.category)
        assertEquals("tracker.com", b.check("x.tracker.com")?.matched)
        assertNull(b.check("nottracker.com")) // a suffix match must be on a label boundary
        assertNull(b.check("tracker.com.evil.org")) // the listed name in the middle doesn't count
        assertNull(b.check("example.com")) // "com" alone is never checked
        assertNull(b.check("com"))
        assertNull(b.check(""))
        assertNull(b.check("..."))
    }

    @Test
    fun allowlistWinsDenylistNext() {
        val b = Blocklist(
            lists(ShieldCategory.MALWARE to listOf("bad.com"), ShieldCategory.TRACKERS to listOf("ads.site.com")),
            all,
            allow = HashList.ofDomains(listOf("site.com", "ok.bad.com")),
            deny = HashList.ofDomains(listOf("nosy.com", "x.site.com")),
        )
        assertNull(b.check("ads.site.com")) // a parent on the allowlist allows the whole site
        assertNull(b.check("x.site.com")) // allow wins even over the user's own deny
        assertNull(b.check("ok.bad.com"))
        assertEquals(ShieldCategory.MALWARE, b.check("other.bad.com")?.category)
        val v = b.check("api.nosy.com")!!
        assertNull(v.category)
        assertEquals("nosy.com", v.matched)
        assertEquals("Blocked by you", v.reason)
    }

    @Test
    fun denylistBeatsLists() {
        val b = Blocklist(lists(ShieldCategory.TRACKERS to listOf("t.com")), all, deny = HashList.ofDomains(listOf("t.com")))
        assertNull(b.check("t.com")!!.category)
    }

    @Test
    fun disabledCategoriesDontBlockAndMostSeriousWins() {
        val l = lists(ShieldCategory.MALWARE to listOf("evil.com"), ShieldCategory.TRACKERS to listOf("cdn.evil.com"))
        val b = Blocklist(l, all)
        assertEquals(ShieldCategory.MALWARE, b.check("cdn.evil.com")?.category)
        val noMalware = b.withEnabled(all - ShieldCategory.MALWARE)
        assertEquals(ShieldCategory.TRACKERS, noMalware.check("cdn.evil.com")?.category)
        assertNull(noMalware.check("www.evil.com"))
        assertNull(b.withEnabled(emptySet()).check("cdn.evil.com"))
        // User lists still work with every category off.
        val user = b.withEnabled(emptySet()).withUser(HashList.EMPTY, HashList.ofDomains(listOf("me.com")))
        assertTrue(user.check("me.com") != null)
    }

    @Test
    fun withListsReplacesOnlyGivenCategory() {
        val b = Blocklist(lists(ShieldCategory.MALWARE to listOf("m.com"), ShieldCategory.PHISHING to listOf("p.com")), all)
        val b2 = b.withLists(mapOf(ShieldCategory.PHISHING to HashList.ofDomains(listOf("p2.com"))))
        assertEquals(ShieldCategory.MALWARE, b2.check("m.com")?.category)
        assertNull(b2.check("p.com"))
        assertEquals(ShieldCategory.PHISHING, b2.check("p2.com")?.category)
        assertEquals(ShieldCategory.PHISHING, b.check("p.com")?.category) // old snapshot unchanged
    }

    // ---- hosts parser ----

    private fun parse(text: String): List<String> {
        val out = ArrayList<String>()
        HostsParser.parse(StringReader(text)) { out += it }
        return out
    }

    @Test
    fun parsesHostsAndDomainLists() {
        val text = """
            |# comment
            |127.0.0.1 localhost
            |127.0.0.1 localhost.localdomain
            |255.255.255.255 broadcasthost
            |::1 ip6-localhost
            |fe80::1%lo0 localhost
            |0.0.0.0 0.0.0.0
            |0.0.0.0 Ads.Example.COM.   # trailing dot and comment
            |0.0.0.0	tab.example.com second.example.com
            |plain.example.org
            |  spaced.example.net
            |0.0.0.0 1.2.3.4
            |0.0.0.0 bad_char!.com
            |0.0.0.0 -ok-ish.example.com
            |0.0.0.0 under_score.example.com
            |0.0.0.0 tld
            |0.0.0.0 a..b.com
            |0.0.0.0 ünïcode.com
            |0.0.0.0 *.wild.com
            |||adblock.com^
            |https://url.example.com/path
            |0.0.0.0 ${"a".repeat(64)}.com
            |windows.example.com
        """.trimMargin().replace("\n", "\r\n")
        assertEquals(
            listOf(
                "ads.example.com", "tab.example.com", "second.example.com", "plain.example.org",
                "spaced.example.net", "-ok-ish.example.com", "under_score.example.com", "windows.example.com",
            ),
            parse(text),
        )
    }

    @Test
    fun skipsBomAndOverlongLines() {
        val text = "﻿first.com\n" + "x".repeat(HostsParser.MAX_LINE + 10) + ".com\nlast.com"
        assertEquals(listOf("first.com", "last.com"), parse(text))
    }

    @Test
    fun normalizeRules() {
        assertEquals("a.com", HostsParser.normalize("A.COM..."))
        assertNull(HostsParser.normalize("localhost"))
        assertNull(HostsParser.normalize("localhost.localdomain"))
        assertNull(HostsParser.normalize("10.0.0.1"))
        assertNull(HostsParser.normalize("a." + "b".repeat(250) + ".com")) // > 253 chars
        assertEquals("1.2.3.com", HostsParser.normalize("1.2.3.com"))
    }

    @Test
    fun cleansUserInput() {
        assertEquals("www.example.com", HostsParser.cleanUserInput("  https://WWW.Example.com:8443/path?q=1#x "))
        assertEquals("example.com", HostsParser.cleanUserInput("*.example.com"))
        assertEquals("example.com", HostsParser.cleanUserInput("user@example.com"))
        assertEquals("example.com", HostsParser.cleanUserInput(".example.com."))
        assertNull(HostsParser.cleanUserInput("not a domain"))
        assertNull(HostsParser.cleanUserInput("com"))
        assertNull(HostsParser.cleanUserInput(""))
    }

    // ---- binary hash file ----

    @Test
    fun hashFileRoundTripAndCorruption() {
        val f = File(tmp.root, "sub/x.bin")
        val list = HashList.ofDomains(listOf("a.com", "b.com", "c.com"))
        HashFile.write(f, list, 1234L)
        val h = HashFile.readHeader(f)!!
        assertEquals(1234L, h.updatedAt)
        assertEquals(3, h.count)
        val (h2, l2) = HashFile.read(f)!!
        assertEquals(1234L, h2.updatedAt)
        assertTrue(l2.contains("b.com"))
        assertFalse(l2.contains("d.com"))
        assertFalse(File(tmp.root, "sub/x.bin.tmp").exists())

        // Truncated file is rejected, not half-loaded.
        f.writeBytes(f.readBytes().copyOf(f.length().toInt() - 3))
        assertNull(HashFile.readHeader(f))
        assertNull(HashFile.read(f))
        // Foreign file.
        f.writeText("hello this is not a hash file at all")
        assertNull(HashFile.read(f))
        assertNull(HashFile.readHeader(File(tmp.root, "missing.bin")))
    }

    @Test
    fun loadsLargeListQuickly() {
        val b = LongArrayBuilder()
        for (i in 0 until 200_000) b.add(DomainHash.of("d$i.example.com"))
        val f = File(tmp.root, "big.bin")
        HashFile.write(f, b.build(), 1L)
        val start = System.nanoTime()
        val (_, l) = HashFile.read(f)!!
        val ms = (System.nanoTime() - start) / 1_000_000
        assertEquals(200_000, l.size)
        assertTrue(l.contains("d199999.example.com"))
        assertTrue("took $ms ms", ms < 1000)
    }
}
