package com.workapp.phoneguard.shield

import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.Kind
import com.workapp.phoneguard.shield.TestDns.Q
import com.workapp.phoneguard.shield.TestDns.a
import com.workapp.phoneguard.shield.TestDns.ptr
import com.workapp.phoneguard.shield.TestDns.rr
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.InetAddress
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

class DnsCoreTest {
    private var now = 5_000_000L
    private val events = Collections.synchronizedList(ArrayList<ConnEvent>())
    private val addresses = Collections.synchronizedList(ArrayList<Pair<String, String>>())
    private val upstreamCalls = AtomicInteger()
    private var upstreamAnswer: (DnsQuery) -> ByteArray? = { q ->
        TestDns.response(0, q.question.name, q.question.type, answers = listOf(rr(Q, Dns.TYPE_A, 300, a(93, 184, 216, 34))))
    }
    private var blocklist = Blocklist(
        mapOf(
            ShieldCategory.PHISHING to HashList.ofDomains(listOf("phish.com")),
            ShieldCategory.TRACKERS to HashList.ofDomains(listOf("tracker.net")),
        ),
        ShieldCategory.values().toSet(),
    )

    private val core = DnsCore(
        check = { blocklist.check(it) },
        upstream = { q ->
            upstreamCalls.incrementAndGet()
            upstreamAnswer(q)?.let { UpstreamChain.Result(Dns.parseResponse(it), "test") }
        },
        cache = DnsCache(clock = { now }),
        onEvent = { events += it },
        onAddress = { ip, name -> addresses += InetAddress.getByAddress(ip).hostAddress!! to name },
        monotonic = { now },
        userAllowed = { blocklist.isUserAllowed(it) },
        filtering = { filtering },
    )
    private var filtering = true

    /** An answer for the asked name that is an alias (CNAME) of [target], which has address 1.2.3.4. */
    private fun cnameAnswer(target: String): (DnsQuery) -> ByteArray = { q ->
        val t = TestDns.name(target)
        val targetAt = 12 + q.question.nameWire.size + 4 + 2 + 10
        TestDns.response(
            0, q.question.name, q.question.type,
            answers = listOf(rr(Q, Dns.TYPE_CNAME, 300, t), rr(ptr(targetAt), Dns.TYPE_A, 300, a(1, 2, 3, 4))),
        )
    }

    private fun ask(name: String, type: Int = Dns.TYPE_A, id: Int = 0x1111, uid: Int = 10123): DnsResponse =
        Dns.parseResponse(core.handle(uid, TestDns.query(id, name, type))!!)

    @Test
    fun blocksListedDomainAndLogsIt() {
        val blockedBefore = DnsStatus.blocked
        val r = ask("login.Phish.com", id = 0x2222)
        assertEquals(0x2222, r.id)
        assertEquals(Dns.NOERROR, r.rcode)
        assertArrayEquals(ByteArray(4), r.raw.copyOfRange(r.answers[0].rdataOffset, r.answers[0].rdataOffset + 4))
        assertEquals(0, upstreamCalls.get())
        val e = events.single()
        assertTrue(e.blocked)
        assertEquals(Kind.DNS, e.kind)
        assertEquals(10123, e.uid)
        assertEquals("login.phish.com", e.domain)
        assertEquals("Phishing & scams", e.reason)
        assertTrue(DnsStatus.blocked > blockedBefore)
    }

    @Test
    fun forwardsAllowedDomainCachesAndMapsAddresses() {
        val r1 = ask("www.example.com", id = 1)
        assertEquals(1, r1.id)
        assertEquals(1, upstreamCalls.get())
        assertEquals(listOf("93.184.216.34" to "www.example.com"), addresses.toList())
        now += 10_000
        val r2 = ask("WWW.example.com", id = 2)
        assertEquals(2, r2.id)
        assertEquals("WWW.example.com", r2.questions[0].name)
        assertEquals(290L, r2.answers[0].ttl)
        assertEquals(1, upstreamCalls.get()) // served from cache
        // Allowed lookups are logged, but repeats within 30 s only once.
        assertEquals(1, events.count { !it.blocked })
    }

    @Test
    fun servfailWhenUpstreamFailsAndNothingCached() {
        upstreamAnswer = { null }
        val r = ask("down.example.com", id = 77)
        assertEquals(77, r.id)
        assertEquals(Dns.SERVFAIL, r.rcode)
    }

    @Test
    fun servesStaleWhenUpstreamFails() {
        ask("www.example.com")
        now += 400_000 // past the 300 s TTL
        upstreamAnswer = { null }
        val r = ask("www.example.com")
        assertEquals(Dns.NOERROR, r.rcode)
        assertEquals(DnsCache.STALE_TTL, r.answers[0].ttl)
    }

    @Test
    fun blocksTrackerHiddenBehindCname() {
        upstreamAnswer = cnameAnswer("collect.tracker.net")
        val r = ask("metrics.shop.com")
        assertEquals(0, Dns.addresses(r).sumOf { it.sum() })
        val e = events.single { it.blocked }
        assertEquals("metrics.shop.com", e.domain)
        // The reason names the alias that matched, so the user can see what to allow.
        assertEquals("Ads & trackers (via collect.tracker.net)", e.reason)
        assertTrue(addresses.isEmpty())
        // Still blocked when the answer comes from the cache.
        events.clear()
        ask("metrics.shop.com")
        assertEquals(1, upstreamCalls.get())
        assertTrue(events.single().blocked)
    }

    @Test
    fun allowingTheAskedNameOverridesItsBlockedAlias() {
        upstreamAnswer = cnameAnswer("h.online-tracker.net")
        blocklist = Blocklist(
            mapOf(ShieldCategory.TRACKERS to HashList.ofDomains(listOf("online-tracker.net"))),
            ShieldCategory.values().toSet(),
            allow = HashList.ofDomains(listOf("mybank.com")),
        )
        val r = ask("fp.mybank.com")
        assertEquals(listOf("1.2.3.4"), Dns.addresses(r).map { InetAddress.getByAddress(it).hostAddress })
        assertTrue(events.none { it.blocked })
        // From the cache too.
        ask("fp.mybank.com", type = Dns.TYPE_A, id = 9)
        assertTrue(events.none { it.blocked })
        assertEquals(1, upstreamCalls.get())
    }

    @Test
    fun allowingTheAliasItselfWorks() {
        upstreamAnswer = cnameAnswer("h.online-tracker.net")
        blocklist = Blocklist(
            mapOf(ShieldCategory.TRACKERS to HashList.ofDomains(listOf("online-tracker.net"))),
            ShieldCategory.values().toSet(),
        )
        ask("fp.mybank.com")
        assertEquals("Ads & trackers (via h.online-tracker.net)", events.single { it.blocked }.reason)
        events.clear()
        // The user allows the name shown in the reason; the cached answer is now let through.
        blocklist = blocklist.withUser(HashList.ofDomains(listOf("h.online-tracker.net")), HashList.EMPTY)
        val r = ask("fp.mybank.com")
        assertEquals(1, Dns.addresses(r).size)
        assertTrue(events.none { it.blocked })
    }

    @Test
    fun blockedCountCountsANameOncePerFewSeconds() {
        val before = DnsStatus.blocked
        // An app asks for both address types of the same blocked name at once.
        ask("www.phish.com", type = Dns.TYPE_A)
        ask("www.phish.com", type = Dns.TYPE_AAAA)
        assertEquals(before + 1, DnsStatus.blocked)
        ask("other.phish.com")
        assertEquals(before + 2, DnsStatus.blocked)
        now += DnsStatus.BLOCKED_REPEAT_MS
        ask("www.phish.com")
        assertEquals(before + 3, DnsStatus.blocked)
        // Every lookup is still answered as blocked and logged.
        assertEquals(4, events.count { it.blocked })
    }

    @Test
    fun answersBeforeListsLoadGetShortTtl() {
        filtering = false
        val r = ask("www.example.com")
        assertEquals(DnsCore.UNFILTERED_TTL, r.answers[0].ttl)
        // Once filtering is on, the cached answer gets its real remaining TTL again.
        filtering = true
        val r2 = ask("www.example.com")
        assertEquals(300L, r2.answers[0].ttl)
        assertEquals(1, upstreamCalls.get())
        // And a cached answer handed out while still loading is capped too.
        filtering = false
        assertEquals(DnsCore.UNFILTERED_TTL, ask("www.example.com").answers[0].ttl)
    }

    @Test
    fun malformedQueryGetsFormerrAndResponsesAreDropped() {
        val garbage = byteArrayOf(0x12, 0x34, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0, 5, 'a'.code.toByte())
        val r = core.handle(1, garbage)!!
        assertEquals(Dns.FORMERR, Dns.u16(r, 2) and 0xF)
        assertEquals(0x1234, Dns.id(r))
        val aResponse = TestDns.response(1, "a.com", 1)
        assertNull(core.handle(1, aResponse))
        assertNull(core.handle(1, ByteArray(3)))
    }

    @Test
    fun nonQueryOpcodeIsNotImplemented() {
        val msg = TestDns.query(9, "a.com")
        msg[2] = (msg[2].toInt() or (2 shl 3)).toByte() // opcode STATUS
        val r = core.handle(1, msg)!!
        assertEquals(Dns.NOTIMP, Dns.u16(r, 2) and 0xF)
    }

    @Test
    fun identicalConcurrentLookupsShareOneUpstreamCall() {
        val gate = CountDownLatch(1)
        upstreamAnswer = { q ->
            gate.await(5, TimeUnit.SECONDS)
            TestDns.response(0, q.question.name, q.question.type, answers = listOf(rr(Q, Dns.TYPE_A, 300, a(1, 1, 1, 1))))
        }
        val pool = Executors.newFixedThreadPool(8)
        val futures = (1..8).map { i -> pool.submit<DnsResponse> { ask("same.example.com", id = i) } }
        Thread.sleep(200)
        gate.countDown()
        val results = futures.map { it.get(5, TimeUnit.SECONDS) }
        pool.shutdown()
        assertEquals(1, upstreamCalls.get())
        assertEquals((1..8).toSet(), results.map { it.id }.toSet())
        assertTrue(results.all { it.answers.size == 1 })
    }

    @Test
    fun closedCoreDropsQueries() {
        core.close()
        assertNull(core.handle(1, TestDns.query(1, "a.com")))
        assertFalse(upstreamCalls.get() > 0)
    }
}
