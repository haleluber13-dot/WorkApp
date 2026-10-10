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
import java.io.DataInputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread

class UpstreamTest {
    private var now = 0L
    private var provider = DnsProvider.QUAD9
    private var dohCalls = 0
    private var udpCalls = 0
    private var dohWorks = true
    private var udpWorks = true
    private var network: Any = "wifi-1"
    private var encrypted: Boolean? = null
    private var problem: String? = "unset"

    private fun okAnswer(q: DnsQuery, id: Int) =
        TestDns.response(id, q.question.name, q.question.type, answers = listOf(rr(Q, Dns.TYPE_A, 60, a(1, 2, 3, 4))))

    private val servers = listOf(InetAddress.getByAddress(byteArrayOf(192.toByte(), 168.toByte(), 1, 1)))

    private val chain = UpstreamChain(
        provider = { provider },
        doh = { _, body ->
            dohCalls++
            assertEquals(0, Dns.id(body)) // RFC 8484: ID 0
            if (!dohWorks) throw IOException("unreachable")
            okAnswer(Dns.parseQuery(body), 0)
        },
        servers = { servers },
        udp = { q, _ ->
            udpCalls++
            if (!udpWorks) throw IOException("timeout")
            okAnswer(q, q.id)
        },
        networkId = { network },
        status = { e, p -> encrypted = e; problem = p },
        clock = { now },
    )

    private val q = Dns.parseQuery(TestDns.query(0x7777, "example.com"))

    @Test
    fun usesDohWhenItWorks() {
        val r = chain.resolve(q)!!
        assertEquals(1, dohCalls)
        assertEquals(0, udpCalls)
        assertEquals(true, encrypted)
        assertNull(problem)
        // The app's ID is restored by prepareReply, not by the chain.
        assertEquals(0x7777, Dns.id(Dns.prepareReply(r.response.raw, q)))
    }

    @Test
    fun fallsBackToNetworkDnsAndBacksOff() {
        dohWorks = false
        assertNotNull(chain.resolve(q))
        assertEquals(1, udpCalls)
        assertEquals(false, encrypted)
        assertTrue(problem!!.contains("Quad9"))
        // A single failure doesn't stop DoH attempts...
        chain.resolve(q)
        assertEquals(2, dohCalls)
        // ...but two in a row do, for a while.
        chain.resolve(q)
        assertEquals(2, dohCalls)
        now += 16_000
        chain.resolve(q)
        assertEquals(3, dohCalls)
        // Working again: back to encrypted.
        dohWorks = true
        now += 60_000
        chain.resolve(q)
        assertEquals(true, encrypted)
        assertNull(problem)
    }

    @Test
    fun networkChangeRetriesDohAtOnce() {
        dohWorks = false
        chain.resolve(q)
        chain.resolve(q)
        val before = dohCalls
        chain.resolve(q)
        assertEquals(before, dohCalls)
        network = "mobile"
        chain.resolve(q)
        assertEquals(before + 1, dohCalls)
    }

    @Test
    fun networkProviderUsesUdpOnlyWithoutProblem() {
        provider = DnsProvider.NETWORK
        assertNotNull(chain.resolve(q))
        assertEquals(0, dohCalls)
        assertEquals(false, encrypted)
        assertNull(problem)
    }

    @Test
    fun everythingDownReturnsNull() {
        dohWorks = false
        udpWorks = false
        assertNull(chain.resolve(q))
        assertEquals(UpstreamChain.NO_DNS, problem)
    }

    @Test
    fun udpClientIgnoresForgedRepliesAndAcceptsTheRealOne() {
        val server = DatagramSocket(0, InetAddress.getLoopbackAddress())
        val t = thread {
            val buf = ByteArray(512)
            val p = DatagramPacket(buf, buf.size)
            server.receive(p)
            val query = Dns.parseQuery(buf.copyOf(p.length))
            fun send(b: ByteArray) = server.send(DatagramPacket(b, b.size, p.socketAddress))
            send(okAnswer(query, (query.id + 1) and 0xFFFF)) // wrong ID
            send(TestDns.response(query.id, "other.com", 1)) // wrong question
            send(okAnswer(query, query.id))
        }
        val resp = UdpDns(timeoutMs = 2000).query(q, InetAddress.getLoopbackAddress(), server.localPort)
        t.join()
        server.close()
        val r = Dns.parseResponse(resp)
        assertEquals(1, r.answers.size)
        assertTrue(Dns.answers(r, q.question))
    }

    @Test
    fun udpClientTimesOut() {
        val silent = DatagramSocket(0, InetAddress.getLoopbackAddress())
        try {
            UdpDns(timeoutMs = 300).query(q, InetAddress.getLoopbackAddress(), silent.localPort)
            throw AssertionError("expected a timeout")
        } catch (_: IOException) {
        } finally {
            silent.close()
        }
    }

    @Test
    fun localNamesGoToNetworkDns() {
        for (name in listOf("router", "nas.lan", "fritz.box", "printer.home.arpa", "4.1.168.192.in-addr.arpa")) {
            udpCalls = 0
            assertNotNull(chain.resolve(Dns.parseQuery(TestDns.query(1, name))))
            assertEquals(name, 1, udpCalls)
        }
        assertEquals(0, dohCalls)
        assertEquals("unset", problem) // local lookups don't change the status
    }

    /**
     * A Wi-Fi network picks its own search domain (DHCP). If names under it went to the
     * network's DNS, a hostile network announcing "com" would get every .com lookup in the
     * clear while the app says "encrypted". Only single-label names count as local now.
     */
    @Test
    fun namesUnderTheNetworksSearchDomainStillUseDoh() {
        for (name in listOf("wiki.corp.example.com", "mybank.com", "mail.example.net")) {
            assertNotNull(chain.resolve(Dns.parseQuery(TestDns.query(1, name))))
        }
        assertEquals(3, dohCalls)
        assertEquals(0, udpCalls)
        assertEquals(true, encrypted)
    }

    @Test
    fun localNameRules() {
        assertTrue(LocalNames.isLocal("router"))
        assertTrue(LocalNames.isLocal("a.b.local"))
        assertTrue(LocalNames.isLocal("1.0.20.172.in-addr.arpa"))
        assertFalse(LocalNames.isLocal("1.0.32.172.in-addr.arpa"))
        assertFalse(LocalNames.isLocal("8.8.8.8.in-addr.arpa"))
        assertFalse(LocalNames.isLocal("example.com"))
        assertFalse(LocalNames.isLocal("mylan.com"))
        assertFalse(LocalNames.isLocal("x.corp.example.com"))
        assertFalse(LocalNames.isLocal(""))
    }

    // ---- single-flight DoH probing ----

    private class Outage(val dohDelayMs: Long, @Volatile var dohWorks: Boolean = false, val probeWaitMs: Long = 200) {
        val dohCalls = AtomicInteger()
        val udpCalls = AtomicInteger()
        val inDoh = AtomicInteger()
        val maxInDoh = AtomicInteger()
        @Volatile var now = 0L
        @Volatile var network: Any = "wifi-1"
        @Volatile var encrypted: Boolean? = null
        @Volatile var problem: String? = null
        val servers = listOf(InetAddress.getByAddress(byteArrayOf(192.toByte(), 168.toByte(), 1, 1)))

        fun answer(q: DnsQuery, id: Int) =
            TestDns.response(id, q.question.name, q.question.type, answers = listOf(rr(Q, Dns.TYPE_A, 60, a(1, 2, 3, 4))))

        val chain = UpstreamChain(
            provider = { DnsProvider.QUAD9 },
            doh = { _, body ->
                dohCalls.incrementAndGet()
                val n = inDoh.incrementAndGet()
                maxInDoh.accumulateAndGet(n) { x, y -> maxOf(x, y) }
                try {
                    Thread.sleep(dohDelayMs) // like a connect timeout on a network that drops DoH
                    if (!dohWorks) throw IOException("connect timed out")
                    answer(Dns.parseQuery(body), 0)
                } finally {
                    inDoh.decrementAndGet()
                }
            },
            servers = { servers },
            udp = { q, _ -> udpCalls.incrementAndGet(); answer(q, q.id) },
            networkId = { network },
            status = { e, p -> encrypted = e; problem = p },
            clock = { now },
            probeWaitMs = probeWaitMs,
        )

        /** Runs [n] different lookups at once; returns how long each took (ms). */
        fun burst(n: Int): List<Long> {
            val pool = Executors.newFixedThreadPool(n)
            val start = CountDownLatch(1)
            val futures = (0 until n).map { i ->
                pool.submit<Long> {
                    start.await()
                    val t0 = System.nanoTime()
                    assertNotNull(chain.resolve(Dns.parseQuery(TestDns.query(i, "host$i.example.com"))))
                    (System.nanoTime() - t0) / 1_000_000
                }
            }
            start.countDown()
            val times = futures.map { it.get(10, TimeUnit.SECONDS) }
            pool.shutdown()
            return times
        }

        fun fail(times: Int) = repeat(times) { chain.resolve(Dns.parseQuery(TestDns.query(1, "warmup.example.com"))) }
    }

    @Test
    fun duringAnOutageOnlyOneLookupProbesDoh() {
        val o = Outage(dohDelayMs = 1000)
        o.fail(2) // two failures in a row: backing off
        assertEquals(2, o.dohCalls.get())
        o.now += 16_000 // the backoff is over: time for one probe
        val times = o.burst(20)
        assertEquals("only one lookup may try DoH", 3, o.dohCalls.get())
        assertEquals(1, o.maxInDoh.get())
        // The other 19 went straight to the network's DNS, without paying the DoH timeout.
        assertEquals(19, times.count { it < 500 })
        assertEquals(20 + 2, o.udpCalls.get())
        assertEquals(false, o.encrypted)
        assertTrue(o.problem!!.contains("Quad9"))
    }

    @Test
    fun backoffGrowsToFiveMinutes() {
        val o = Outage(dohDelayMs = 0)
        o.fail(2)
        var expected = 15_000L
        repeat(7) {
            val calls = o.dohCalls.get()
            o.now += expected - 1
            o.fail(1)
            assertEquals("still waiting before probe ${it + 1}", calls, o.dohCalls.get())
            o.now += 1
            o.fail(1)
            assertEquals("probe ${it + 1} due", calls + 1, o.dohCalls.get())
            expected = minOf(expected * 2, UpstreamChain.MAX_BACKOFF_MS)
        }
        assertEquals(UpstreamChain.MAX_BACKOFF_MS, expected)
    }

    @Test
    fun onANewNetworkOthersWaitBrieflyForTheFirstCheck() {
        // DoH works but is slowish: lookups arriving during the first check wait for it and
        // then use DoH too, instead of going out unencrypted.
        val o = Outage(dohDelayMs = 100, dohWorks = true, probeWaitMs = 2000)
        o.burst(10)
        assertEquals(0, o.udpCalls.get())
        assertEquals(10, o.dohCalls.get())
        assertEquals(true, o.encrypted)

        // A new network where DoH is blocked: one probe; the rest wait at most probeWaitMs.
        val blocked = Outage(dohDelayMs = 1500)
        val times = blocked.burst(16)
        assertEquals(1, blocked.dohCalls.get())
        assertEquals(15, times.count { it < 1000 })
    }

    @Test
    fun networkChangeProbesAgainAtOnce() {
        val o = Outage(dohDelayMs = 0)
        o.fail(3)
        val calls = o.dohCalls.get()
        o.fail(1)
        assertEquals(calls, o.dohCalls.get()) // backing off
        o.dohWorks = true
        o.chain.networkChanged()
        o.fail(1)
        assertEquals(calls + 1, o.dohCalls.get())
        assertEquals(true, o.encrypted)
        assertNull(o.problem)
    }

    /**
     * DoH is healthy, so every lookup uses it at once; then a short outage makes all ten
     * in-flight lookups fail together. That must count as one failure, not ten (which used to
     * mean 5 minutes of unencrypted DNS): the next lookup checks DoH again right away.
     */
    @Test
    fun aBurstOfFailuresCountsOnceAndDohIsCheckedAgainSoon() {
        val o = Outage(dohDelayMs = 400, dohWorks = true)
        o.fail(1)
        assertEquals(true, o.encrypted)
        o.dohWorks = false
        o.burst(10)
        assertEquals(11, o.dohCalls.get())
        assertEquals(10, o.udpCalls.get()) // everyone still got an answer
        // The outage is over. Well within 15 s (here: at once) the next lookup uses DoH again.
        o.dohWorks = true
        o.fail(1)
        assertEquals(12, o.dohCalls.get())
        assertEquals(true, o.encrypted)
        assertNull(o.problem)
    }

    @Test
    fun aBurstThenAFailedCheckWaitsOnly15Seconds() {
        val o = Outage(dohDelayMs = 400, dohWorks = true)
        o.fail(1)
        o.dohWorks = false
        o.burst(10)
        o.fail(1) // the check right after the burst fails too
        assertEquals(12, o.dohCalls.get())
        o.now += 14_999
        o.fail(1)
        assertEquals(12, o.dohCalls.get())
        o.now += 1
        o.dohWorks = true
        o.fail(1)
        assertEquals(13, o.dohCalls.get())
        assertEquals(true, o.encrypted)
    }

    @Test
    fun networkPassingItsInternetCheckEndsTheBackoff() {
        val o = Outage(dohDelayMs = 0)
        o.fail(2)
        repeat(6) { o.now += UpstreamChain.MAX_BACKOFF_MS; o.fail(1) } // backoff now at 5 min
        val calls = o.dohCalls.get()
        o.now += 1_000
        o.fail(1)
        assertEquals(calls, o.dohCalls.get()) // still backing off
        o.chain.retryNow()
        o.fail(1)
        assertEquals("checked at once", calls + 1, o.dohCalls.get())
        // Still failing: the backoff starts again from 15 s, not 5 min.
        o.now += 15_000
        o.fail(1)
        assertEquals(calls + 2, o.dohCalls.get())
        // And retryNow() changes nothing while DoH works.
        o.dohWorks = true
        o.now += 60_000
        o.fail(1)
        o.chain.retryNow()
        o.fail(1)
        assertEquals(calls + 4, o.dohCalls.get())
        assertEquals(true, o.encrypted)
    }

    // ---- intranet names under the network's search domain ----

    private class Split(val domains: List<String>) {
        var dohRcode = Dns.NXDOMAIN
        var dohAnswers = false
        var udpRcode = Dns.NOERROR
        var udpAnswers = true
        var dohCalls = 0
        var udpCalls = 0
        var encrypted: Boolean? = null
        var problem: String? = "unset"

        private fun resp(q: DnsQuery, id: Int, rcode: Int, withAnswer: Boolean, ip: ByteArray) =
            TestDns.response(id, q.question.name, q.question.type, answers = if (withAnswer) listOf(rr(Q, Dns.TYPE_A, 60, ip)) else emptyList(), rcode = rcode)

        val chain = UpstreamChain(
            provider = { DnsProvider.QUAD9 },
            doh = { _, body -> dohCalls++; resp(Dns.parseQuery(body), 0, dohRcode, dohAnswers, a(8, 8, 8, 8)) },
            servers = { listOf(InetAddress.getByAddress(byteArrayOf(10, 0, 0, 1))) },
            udp = { q, _ -> udpCalls++; resp(q, q.id, udpRcode, udpAnswers, a(10, 0, 0, 5)) },
            networkId = { "office" },
            status = { e, p -> encrypted = e; problem = p },
            clock = { 0L },
            searchDomains = { domains },
        )

        fun ask(name: String) = chain.resolve(Dns.parseQuery(TestDns.query(1, name)))!!
    }

    private fun UpstreamChain.Result.ip() = Dns.addresses(response).map { InetAddress.getByAddress(it).hostAddress }

    @Test
    fun intranetNameUnknownToDohIsAskedOnTheNetwork() {
        val s = Split(listOf("corp.example.com", "attlocal.net"))
        val r = s.ask("intranet.corp.example.com")
        assertEquals(listOf("10.0.0.5"), r.ip())
        assertTrue(r.intranet)
        assertEquals(1, s.dohCalls) // DoH was asked first
        assertEquals(true, s.encrypted) // an intranet answer is expected: no false warning
        assertNull(s.problem)
        assertEquals(listOf("10.0.0.5"), s.ask("printer.attlocal.net").ip())
        // NOERROR without records from DoH also gets the second chance.
        s.dohRcode = Dns.NOERROR
        assertTrue(s.ask("wiki.corp.example.com").intranet)
    }

    @Test
    fun publicAnswerFromDohWins() {
        val s = Split(listOf("corp.example.com"))
        s.dohRcode = Dns.NOERROR
        s.dohAnswers = true
        val r = s.ask("www.corp.example.com")
        assertEquals(listOf("8.8.8.8"), r.ip())
        assertFalse(r.intranet)
        assertEquals(0, s.udpCalls)
    }

    @Test
    fun networkMustReallyKnowTheName() {
        val s = Split(listOf("corp.example.com"))
        s.udpRcode = Dns.NXDOMAIN
        s.udpAnswers = false
        var r = s.ask("gone.corp.example.com")
        assertEquals(Dns.NXDOMAIN, r.response.rcode)
        assertFalse(r.intranet)
        s.udpRcode = Dns.NOERROR // NOERROR but empty: the provider's answer stands
        r = s.ask("gone.corp.example.com")
        assertEquals(Dns.NXDOMAIN, r.response.rcode)
        assertEquals(2, s.udpCalls)
        // SERVFAIL from DoH (often a failed security check) is never retried in the clear.
        s.dohRcode = Dns.SERVFAIL
        s.udpAnswers = true
        assertEquals(Dns.SERVFAIL, s.ask("x.corp.example.com").response.rcode)
        assertEquals(2, s.udpCalls)
    }

    @Test
    fun broadOrMissingSearchDomainsAreNotTrusted() {
        for (domains in listOf(listOf("com"), listOf("co.uk"), listOf("com.au"), listOf("github.io"), emptyList())) {
            val s = Split(domains)
            for (name in listOf("nosuchbank.com", "shop.co.uk", "x.com.au", "me.github.io")) {
                assertEquals(Dns.NXDOMAIN, s.ask(name).response.rcode)
            }
            assertEquals("$domains", 0, s.udpCalls)
        }
        val s = Split(listOf("corp.example.com"))
        s.ask("corp.example.com") // the search domain itself
        s.ask("evil-corp.example.com") // only similar, not under it
        s.ask("other.example.net")
        assertEquals(0, s.udpCalls)
    }

    @Test
    fun searchDomainRules() {
        for (d in listOf("corp.example.com", "attlocal.net", "example.co.uk", "home.example", "Corp.Example.COM.")) {
            assertTrue(d, SearchDomains.usable(d))
        }
        for (d in listOf("", "com", "lan", "co.uk", "com.au", "ne.jp", "org.nz", "github.io", "duckdns.org", "in-addr.arpa", "1.168.192.in-addr.arpa", "10.0.0.1", "a..b", "bäd.example")) {
            assertFalse(d, SearchDomains.usable(d))
        }
        assertEquals(listOf("corp.example.com", "attlocal.net"), SearchDomains.parse("Corp.Example.com. attlocal.net"))
        assertEquals(listOf("a.example", "b.example"), SearchDomains.parse("a.example,b.example a.example"))
        assertEquals(emptyList<String>(), SearchDomains.parse(null))
        assertTrue(SearchDomains.covers("x.corp.example.com", listOf("com", "corp.example.com.")))
        assertFalse(SearchDomains.covers("x.example.com", listOf("com")))
    }

    // ---- slow answers ----

    @Test
    fun oneSlowAnswerAfterRecentSuccessIsNotAFailure() {
        var slow = false
        var calls = 0
        var enc: Boolean? = null
        var prob: String? = "unset"
        var t = 0L
        val c = UpstreamChain(
            provider = { DnsProvider.QUAD9 },
            doh = { _, body ->
                calls++
                if (slow) throw DohSlowException("slow")
                okAnswer(Dns.parseQuery(body), 0)
            },
            servers = { servers },
            udp = { qq, _ -> okAnswer(qq, qq.id) },
            networkId = { "n" },
            status = { e, p -> enc = e; prob = p },
            clock = { t },
        )
        c.resolve(q)
        assertEquals(true, enc)
        slow = true
        repeat(3) { assertNotNull(c.resolve(q)) } // answered by the network's DNS this time...
        assertEquals(4, calls) // ...but DoH keeps being used: no backoff
        assertNull(prob) // and no false "can't be reached" warning
        assertEquals(false, enc) // these lookups did go out unencrypted, though
        // With no DoH answer for a while, slow answers do count as failures.
        t += UpstreamChain.RECENT_OK_MS
        repeat(3) { c.resolve(q) }
        assertTrue(prob!!.contains("Quad9"))
        assertEquals(6, calls) // two failures, then backing off
    }

    /** A plain-text HTTP/2 server that answers the first request and ignores the rest. */
    @Test
    fun dohClientDoesNotRetryASlowAnswerOnANewConnection() {
        val server = ServerSocket(0, 5, InetAddress.getLoopbackAddress())
        val accepted = AtomicInteger()
        val answer = TestDns.response(0, "example.com", 1, answers = listOf(rr(Q, 1, 60, a(1, 2, 3, 4))))
        val t = thread(isDaemon = true) {
            try {
                while (true) {
                    val s = server.accept()
                    accepted.incrementAndGet()
                    thread(isDaemon = true) {
                        try {
                            s.use { serveFirstRequestOnly(it, answer) }
                        } catch (_: IOException) {
                        }
                    }
                }
            } catch (_: IOException) {
            }
        }
        val client = DohClient(
            connect = { _, _, _ -> Socket(InetAddress.getLoopbackAddress(), server.localPort) },
            timeoutMs = 400,
            openH2 = { s, _, _ -> H2Connection.openPlainForTest(s) },
        )
        val body = TestDns.query(0, "example.com")
        val r = Dns.parseResponse(client.query("https://dns.example/dns-query", body))
        assertEquals(1, r.answers.size)
        val t0 = System.nanoTime()
        try {
            client.query("https://dns.example/dns-query", body)
            throw AssertionError("expected a timeout")
        } catch (_: DohSlowException) {
        }
        val ms = (System.nanoTime() - t0) / 1_000_000
        assertEquals("no second connection for a slow answer", 1, accepted.get())
        assertTrue("took $ms ms", ms < 800)
        server.close()
        t.join(1000)
    }

    private fun serveFirstRequestOnly(s: Socket, answer: ByteArray) {
        val input = DataInputStream(s.getInputStream())
        val out = s.getOutputStream()
        input.readFully(ByteArray(24)) // preface
        var answered = false
        while (true) {
            val len = input.readUnsignedByte() shl 16 or (input.readUnsignedByte() shl 8) or input.readUnsignedByte()
            val type = input.readUnsignedByte()
            val flags = input.readUnsignedByte()
            val stream = input.readInt() and 0x7FFFFFFF
            input.readFully(ByteArray(len))
            if (type == 0 && flags and 1 != 0 && !answered) { // DATA with END_STREAM: the request is complete
                answered = true
                fun frame(t: Int, f: Int, payload: ByteArray) {
                    out.write(byteArrayOf((payload.size ushr 16).toByte(), (payload.size ushr 8).toByte(), payload.size.toByte(), t.toByte(), f.toByte()))
                    out.write(TestDns.u32(stream.toLong()))
                    out.write(payload)
                }
                frame(1, 0x4, byteArrayOf(0x88.toByte())) // HEADERS :status 200
                frame(0, 0x1, answer) // DATA, END_STREAM
                out.flush()
            }
        }
    }

    @Test
    fun dohRejectsPlainHttp() {
        try {
            DohClient().query("http://example.com/dns-query", TestDns.query(0, "a.com"))
            throw AssertionError("plain HTTP must be refused")
        } catch (_: IOException) {
        }
    }
}
