package com.workapp.phoneguard.shield

import com.workapp.phoneguard.shield.TestDns.Q
import com.workapp.phoneguard.shield.TestDns.a
import com.workapp.phoneguard.shield.TestDns.cat
import com.workapp.phoneguard.shield.TestDns.name
import com.workapp.phoneguard.shield.TestDns.ptr
import com.workapp.phoneguard.shield.TestDns.rr
import com.workapp.phoneguard.shield.TestDns.u16
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class DnsMessageTest {
    private fun hex(s: String): ByteArray = s.replace(" ", "").chunked(2).map { it.toInt(16).toByte() }.toByteArray()

    @Test
    fun parsesQuery() {
        val q = Dns.parseQuery(TestDns.query(0x1234, "Www.Example.COM", Dns.TYPE_AAAA, edns = true))
        assertEquals(0x1234, q.id)
        assertEquals("Www.Example.COM", q.question.name)
        assertEquals("www.example.com", q.question.key)
        assertEquals(Dns.TYPE_AAAA, q.question.type)
        assertEquals(1, q.question.qclass)
        assertTrue(q.recursionDesired)
        assertFalse(q.isResponse)
        assertEquals(0, q.opcode)
        assertArrayEquals(name("Www.Example.COM"), q.question.nameWire)
    }

    @Test
    fun rejectsMalformedQueries() {
        val bad = listOf(
            ByteArray(5),
            TestDns.query(1, "a.com").copyOf(20), // cut in the middle of the name
            cat(u16(1), u16(0x100), u16(2), u16(0), u16(0), u16(0), name("a.com"), u16(1), u16(1)), // two questions
            cat(u16(1), u16(0x100), u16(1), u16(0), u16(0), u16(0), ptr(12), u16(1), u16(1)), // pointer to itself
            cat(u16(1), u16(0x100), u16(1), u16(0), u16(0), u16(0), byteArrayOf(0x40, 0), u16(1), u16(1)), // label type 01
            cat(u16(1), u16(0x100), u16(1), u16(0), u16(0), u16(0), name("a.com"), u16(1)), // no class
        )
        for (b in bad) {
            try {
                Dns.parseQuery(b)
                fail("accepted ${b.toList()}")
            } catch (_: DnsFormatException) {
            }
        }
    }

    @Test
    fun rejectsOverlongName() {
        val label = "a".repeat(63)
        val longName = List(5) { label }.joinToString(".") // 5*64+1 = 321 bytes > 255
        try {
            Dns.parseQuery(TestDns.query(1, longName))
            fail()
        } catch (_: DnsFormatException) {
        }
    }

    @Test
    fun parsesCompressedAnswersWithCnameChain() {
        // www.example.com CNAME cdn.example.net ; cdn.example.net A 1.2.3.4 ; AAAA 2001:db8::1
        val qname = "www.example.com"
        val cnameTarget = name("cdn.example.net")
        val cnameStart = 12 + name(qname).size + 4 + 2 + 10 // where the CNAME's rdata begins
        val aaaa = ByteArray(16).also { it[0] = 0x20; it[1] = 0x01; it[2] = 0x0d; it[3] = 0xb8.toByte(); it[15] = 1 }
        val msg = TestDns.response(
            7, qname, Dns.TYPE_A,
            answers = listOf(
                rr(Q, Dns.TYPE_CNAME, 300, cnameTarget),
                rr(ptr(cnameStart), Dns.TYPE_A, 120, a(1, 2, 3, 4)),
                rr(ptr(cnameStart), Dns.TYPE_AAAA, 90, aaaa),
            ),
        )
        val r = Dns.parseResponse(msg)
        assertTrue(r.isResponse)
        assertEquals(3, r.answers.size)
        assertEquals("www.example.com", r.answers[0].name)
        assertEquals("cdn.example.net", r.answers[1].name)
        assertEquals(120L, r.answers[1].ttl)
        assertEquals(listOf("cdn.example.net"), Dns.cnameTargets(r))
        val addrs = Dns.addresses(r)
        assertEquals(2, addrs.size)
        assertArrayEquals(a(1, 2, 3, 4), addrs[0])
        assertArrayEquals(aaaa, addrs[1])
        assertTrue(Dns.answers(r, Dns.parseQuery(TestDns.query(9, "WWW.example.com")).question))
        assertFalse(Dns.answers(r, Dns.parseQuery(TestDns.query(9, "www.example.com", Dns.TYPE_AAAA)).question))
    }

    @Test
    fun compressedCnameTargetInsideRdata() {
        // CNAME target "x." + pointer to "example.com" inside the question name.
        val target = cat(byteArrayOf(1, 'x'.code.toByte()), ptr(12 + 4)) // offset of "example" label in "www.example.com"
        val msg = TestDns.response(1, "www.example.com", Dns.TYPE_A, answers = listOf(rr(Q, Dns.TYPE_CNAME, 60, target)))
        assertEquals(listOf("x.example.com"), Dns.cnameTargets(Dns.parseResponse(msg)))
    }

    @Test
    fun rejectsTruncatedResponse() {
        val msg = TestDns.response(1, "a.com", Dns.TYPE_A, answers = listOf(rr(Q, Dns.TYPE_A, 60, a(1, 1, 1, 1))))
        try {
            Dns.parseResponse(msg.copyOf(msg.size - 2))
            fail()
        } catch (_: DnsFormatException) {
        }
    }

    @Test
    fun ttlWithHighBitCountsAsZero() {
        val msg = TestDns.response(1, "a.com", Dns.TYPE_A, answers = listOf(rr(Q, Dns.TYPE_A, 0x80000000L, a(1, 1, 1, 1))))
        assertEquals(0L, Dns.parseResponse(msg).answers[0].ttl)
    }

    @Test
    fun blockedAResponseBytes() {
        val q = Dns.parseQuery(TestDns.query(0xBEEF, "ads.Tracker.com", Dns.TYPE_A, edns = true))
        val expected = hex(
            "BEEF 8180 0001 0001 0000 0000" +
                "03616473 07547261636b6572 03636f6d 00 0001 0001" +
                "C00C 0001 0001 0000003C 0004 00000000",
        )
        assertArrayEquals(expected, Dns.blockedResponse(q))
    }

    @Test
    fun blockedAaaaResponseBytes() {
        val q = Dns.parseQuery(TestDns.query(0x0001, "x.io", Dns.TYPE_AAAA, rd = false))
        val expected = hex(
            "0001 8080 0001 0001 0000 0000" +
                "0178 02696f 00 001C 0001" +
                "C00C 001C 0001 0000003C 0010 00000000000000000000000000000000",
        )
        assertArrayEquals(expected, Dns.blockedResponse(q))
        val parsed = Dns.parseResponse(Dns.blockedResponse(q))
        assertEquals(Dns.NOERROR, parsed.rcode)
        assertEquals(60L, parsed.answers[0].ttl)
    }

    @Test
    fun blockedOtherTypeHasNoAnswer() {
        val q = Dns.parseQuery(TestDns.query(5, "x.io", 65)) // HTTPS record
        val r = Dns.parseResponse(Dns.blockedResponse(q))
        assertEquals(Dns.NOERROR, r.rcode)
        assertEquals(0, r.answers.size)
        assertEquals(1, r.questions.size)
        assertEquals(65, r.questions[0].type)
        assertEquals(5, r.id)
    }

    @Test
    fun servfailEchoesQuestion() {
        val q = Dns.parseQuery(TestDns.query(77, "a.com"))
        val r = Dns.parseResponse(Dns.errorResponse(q, Dns.SERVFAIL))
        assertEquals(77, r.id)
        assertEquals(Dns.SERVFAIL, r.rcode)
        assertTrue(r.isResponse)
        assertEquals(0x0100, r.flags and 0x0100) // RD copied
        assertEquals(0x0080, r.flags and 0x0080) // RA set
        assertTrue(Dns.answers(r, q.question))
    }

    @Test
    fun headerErrorForGarbage() {
        val garbage = cat(u16(0x4242), u16(0x0100), u16(1), u16(0), u16(0), u16(0), byteArrayOf(9, 9))
        val r = Dns.headerError(garbage, Dns.FORMERR)!!
        assertArrayEquals(hex("4242 8181 0000 0000 0000 0000"), r)
        assertNull(Dns.headerError(ByteArray(4), Dns.FORMERR))
        // Never answer something that is itself a response.
        assertNull(Dns.headerError(cat(u16(1), u16(0x8180), u16(0), u16(0), u16(0), u16(0)), Dns.FORMERR))
    }

    @Test
    fun prepareReplyRestoresIdRdAndCase() {
        val upstream = TestDns.response(0, "www.example.com", Dns.TYPE_A, answers = listOf(rr(Q, Dns.TYPE_A, 60, a(5, 6, 7, 8))))
        val q = Dns.parseQuery(TestDns.query(0x9999, "WwW.ExAmPlE.cOm", rd = false))
        val out = Dns.prepareReply(upstream, q)
        val r = Dns.parseResponse(out)
        assertEquals(0x9999, r.id)
        assertEquals(0, r.flags and 0x0100)
        assertEquals("WwW.ExAmPlE.cOm", r.questions[0].name)
        assertEquals(0, Dns.id(upstream)) // the original is untouched
    }

    @Test
    fun cacheTtlRules() {
        fun ttlOf(msg: ByteArray) = Dns.cacheTtl(Dns.parseResponse(msg))
        val pos = TestDns.response(1, "a.com", 1, answers = listOf(rr(Q, 1, 500, a(1, 1, 1, 1)), rr(Q, 1, 200, a(1, 1, 1, 2))))
        assertEquals(200L, ttlOf(pos))
        val tiny = TestDns.response(1, "a.com", 1, answers = listOf(rr(Q, 1, 5, a(1, 1, 1, 1))))
        assertEquals(30L, ttlOf(tiny))
        val huge = TestDns.response(1, "a.com", 1, answers = listOf(rr(Q, 1, 86400, a(1, 1, 1, 1))))
        assertEquals(3600L, ttlOf(huge))
        val nx = TestDns.response(1, "a.com", 1, authority = listOf(TestDns.soa(ptr(12 + 2), 900, 120)), rcode = Dns.NXDOMAIN)
        assertEquals(120L, ttlOf(nx))
        val nodataNoSoa = TestDns.response(1, "a.com", 28)
        assertEquals(30L, ttlOf(nodataNoSoa))
        assertNull(ttlOf(TestDns.response(1, "a.com", 1, rcode = Dns.SERVFAIL)))
        assertNull(ttlOf(TestDns.response(1, "a.com", 1, flags = 0x8380))) // truncated
    }
}
