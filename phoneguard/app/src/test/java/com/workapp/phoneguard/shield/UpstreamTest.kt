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
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
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
    fun dohRejectsPlainHttp() {
        try {
            DohClient().query("http://example.com/dns-query", TestDns.query(0, "a.com"))
            throw AssertionError("plain HTTP must be refused")
        } catch (_: IOException) {
        }
    }
}
