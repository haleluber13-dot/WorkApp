package com.workapp.phoneguard.shield

import com.workapp.phoneguard.shield.TestDns.Q
import com.workapp.phoneguard.shield.TestDns.a
import com.workapp.phoneguard.shield.TestDns.rr
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DnsCacheTest {
    private var now = 1_000_000L
    private val cache = DnsCache(maxEntries = 3, staleMs = 60_000, clock = { now })

    private fun answer(qname: String, ttl: Long, edns: Boolean = false): DnsResponse {
        val additional = if (edns) listOf(TestDns.OPT) else emptyList()
        return Dns.parseResponse(
            TestDns.response(0, qname, Dns.TYPE_A, answers = listOf(rr(Q, Dns.TYPE_A, ttl, a(9, 9, 9, 9))), additional = additional),
        )
    }

    private fun key(name: String) = DnsCache.Key(name, Dns.TYPE_A, 1)

    @Test
    fun servesFreshWithCountdownAndNewId() {
        assertTrue(cache.put(key("a.com"), answer("a.com", 300, edns = true)))
        now += 100_000 // 100 s later
        val e = cache.get(key("a.com"))!!
        val q = Dns.parseQuery(TestDns.query(0x4321, "A.com"))
        val r = Dns.parseResponse(cache.reply(e, q))
        assertEquals(0x4321, r.id)
        assertEquals("A.com", r.questions[0].name)
        assertEquals(200L, r.answers[0].ttl)
        // The OPT record's TTL field holds EDNS flags and must be left alone.
        val opt = r.additional.single { it.type == Dns.TYPE_OPT }
        assertEquals(0x8000L, opt.ttl)
    }

    @Test
    fun expiresAtTtlThenServesStaleUntilLimit() {
        cache.put(key("a.com"), answer("a.com", 60))
        now += 59_000
        assertNotNull(cache.get(key("a.com")))
        now += 2_000
        assertNull(cache.get(key("a.com")))
        val stale = cache.getStale(key("a.com"))!!
        val r = Dns.parseResponse(cache.reply(stale, Dns.parseQuery(TestDns.query(1, "a.com")), stale = true))
        assertEquals(DnsCache.STALE_TTL, r.answers[0].ttl)
        now += 60_000
        assertNull(cache.getStale(key("a.com")))
    }

    @Test
    fun ttlFloorAndNeverZero() {
        cache.put(key("short.com"), answer("short.com", 5))
        now += 20_000 // past the record's own TTL but inside the 30 s floor
        val e = cache.get(key("short.com"))!!
        val r = Dns.parseResponse(cache.reply(e, Dns.parseQuery(TestDns.query(1, "short.com"))))
        assertEquals(1L, r.answers[0].ttl)
        now += 11_000
        assertNull(cache.get(key("short.com")))
    }

    @Test
    fun ttlCapOneHour() {
        cache.put(key("long.com"), answer("long.com", 86_400))
        now += 3_599_000
        assertNotNull(cache.get(key("long.com")))
        now += 2_000
        assertNull(cache.get(key("long.com")))
    }

    @Test
    fun doesNotCacheErrors() {
        val fail = Dns.parseResponse(TestDns.response(0, "x.com", 1, rcode = Dns.SERVFAIL))
        assertFalse(cache.put(key("x.com"), fail))
        assertNull(cache.get(key("x.com")))
    }

    @Test
    fun evictsLeastRecentlyUsed() {
        cache.put(key("1.com"), answer("1.com", 300))
        cache.put(key("2.com"), answer("2.com", 300))
        cache.put(key("3.com"), answer("3.com", 300))
        cache.get(key("1.com")) // touch
        cache.put(key("4.com"), answer("4.com", 300))
        assertEquals(3, cache.size)
        assertNotNull(cache.get(key("1.com")))
        assertNull(cache.get(key("2.com")))
    }

    @Test
    fun keyIgnoresCaseAndTrailingDot() {
        val q1 = Dns.parseQuery(TestDns.query(1, "Example.COM"))
        val q2 = Dns.parseQuery(TestDns.query(1, "example.com"))
        assertEquals(DnsCache.Key(q1.question), DnsCache.Key(q2.question))
        assertFalse(DnsCache.Key(q1.question) == DnsCache.Key(Dns.parseQuery(TestDns.query(1, "example.com", Dns.TYPE_AAAA)).question))
    }

    @Test
    fun clockGoingBackwardsDoesNotServeForever() {
        cache.put(key("a.com"), answer("a.com", 300))
        now -= 10_000
        assertNull(cache.get(key("a.com")))
    }

    @Test
    fun putAfterClearWithOldGenerationIsSkipped() {
        val gen = cache.generation
        cache.clear() // network changed while the lookup was out
        assertFalse(cache.put(key("a.com"), answer("a.com", 300), gen))
        assertNull(cache.get(key("a.com")))
        assertTrue(cache.put(key("a.com"), answer("a.com", 300), cache.generation))
        assertNotNull(cache.get(key("a.com")))
        assertTrue(cache.put(key("b.com"), answer("b.com", 300))) // no generation: always stored
    }
}
