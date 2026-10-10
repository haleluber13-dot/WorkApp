package com.workapp.phoneguard.shield

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.IOException
import java.io.OutputStream
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

class Http2Test {
    private class Frame(val type: Int, val flags: Int, val stream: Int, val payload: ByteArray)

    private fun readFrame(input: DataInputStream): Frame {
        val len = input.readUnsignedByte() shl 16 or (input.readUnsignedByte() shl 8) or input.readUnsignedByte()
        val type = input.readUnsignedByte()
        val flags = input.readUnsignedByte()
        val stream = input.readInt() and 0x7FFFFFFF
        val p = ByteArray(len)
        input.readFully(p)
        return Frame(type, flags, stream, p)
    }

    private fun writeFrame(out: OutputStream, type: Int, flags: Int, stream: Int, payload: ByteArray) {
        val h = byteArrayOf((payload.size ushr 16).toByte(), (payload.size ushr 8).toByte(), payload.size.toByte(), type.toByte(), flags.toByte())
        out.write(h)
        out.write(TestDns.u32(stream.toLong()))
        out.write(payload)
        out.flush()
    }

    @Test
    fun hpackIntegers() {
        fun enc(v: Int, bits: Int): List<Int> = ByteArrayOutputStream().also { H2Connection.writeInt(it, v, bits, 0) }
            .toByteArray().map { it.toInt() and 0xFF }
        assertEquals(listOf(10), enc(10, 5))
        assertEquals(listOf(31, 154, 10), enc(1337, 5)) // RFC 7541 C.1.2
        assertEquals(listOf(15, 16), enc(31, 4))
        assertEquals(listOf(127, 0), enc(127, 7))
    }

    @Test
    fun requestHeaderBlock() {
        val block = H2Connection.requestHeaders("dns.example", "/dns-query", 33)
        val expected = TestDns.cat(
            byteArrayOf(0x83.toByte(), 0x87.toByte()),
            byteArrayOf(0x01, 11), "dns.example".toByteArray(),
            byteArrayOf(0x04, 10), "/dns-query".toByteArray(),
            byteArrayOf(0x0F, 16, 23), "application/dns-message".toByteArray(),
            byteArrayOf(0x0F, 4, 23), "application/dns-message".toByteArray(),
            byteArrayOf(0x0F, 13, 2), "33".toByteArray(),
        )
        assertArrayEquals(expected, block)
    }

    /** A scripted server: checks what the client sends and answers with tricky-but-legal frames. */
    @Test
    fun exchangeAgainstScriptedServer() {
        val answer = TestDns.response(0, "example.com", 1, answers = listOf(TestDns.rr(TestDns.Q, 1, 60, TestDns.a(1, 2, 3, 4))))
        val server = ServerSocket(0, 1, InetAddress.getLoopbackAddress())
        val seen = ArrayList<String>()
        var serverError: Throwable? = null
        val t = thread {
            try {
                server.accept().use { s ->
                    val input = DataInputStream(s.getInputStream())
                    val out = s.getOutputStream()
                    val preface = ByteArray(24)
                    input.readFully(preface)
                    assertEquals("PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n", String(preface))
                    val settings = readFrame(input)
                    assertEquals(4, settings.type)
                    assertEquals(12, settings.payload.size)
                    assertEquals(8, readFrame(input).type) // connection WINDOW_UPDATE
                    repeat(2) { round ->
                        val headers = readFrame(input)
                        assertEquals(1, headers.type)
                        assertEquals(0x4, headers.flags) // END_HEADERS, body follows
                        val sid = headers.stream
                        seen += "stream $sid"
                        val data = readFrame(input)
                        assertEquals(0, data.type)
                        assertEquals(1, data.flags) // END_STREAM
                        assertEquals(sid, data.stream)
                        if (round == 0) {
                            writeFrame(out, 4, 0, 0, TestDns.cat(TestDns.u16(5), TestDns.u32(32768))) // SETTINGS
                            writeFrame(out, 6, 0, 0, ByteArray(8) { 7 }) // PING
                        }
                        writeFrame(out, 1, 0x4, sid, byteArrayOf(0x88.toByte())) // :status 200
                        // Body split over two DATA frames, the first one padded.
                        val half = answer.size / 2
                        writeFrame(out, 0, 0x8, sid, TestDns.cat(byteArrayOf(3), answer.copyOfRange(0, half), ByteArray(3)))
                        writeFrame(out, 0, 0x1, sid, answer.copyOfRange(half, answer.size))
                        if (round == 0) {
                            val ack = readFrame(input)
                            assertEquals(4, ack.type); assertEquals(1, ack.flags)
                            val pong = readFrame(input)
                            assertEquals(6, pong.type); assertEquals(1, pong.flags)
                            assertArrayEquals(ByteArray(8) { 7 }, pong.payload)
                        }
                        val wu = readFrame(input)
                        assertEquals(8, wu.type)
                        assertEquals(0, wu.stream)
                    }
                    // Third request: refuse it.
                    val h3 = readFrame(input)
                    readFrame(input)
                    writeFrame(out, 1, 0x5, h3.stream, byteArrayOf(0x8D.toByte())) // :status 404, END_STREAM
                }
            } catch (e: Throwable) {
                serverError = e
            }
        }
        val client = Socket()
        client.connect(InetSocketAddress(InetAddress.getLoopbackAddress(), server.localPort), 2000)
        val c = H2Connection.openPlainForTest(client)
        val q = TestDns.query(0, "example.com")
        assertArrayEquals(answer, c.exchange("dns.example", "/dns-query", q, 3000, 65535))
        assertArrayEquals(answer, c.exchange("dns.example", "/dns-query", q, 3000, 65535))
        try {
            c.exchange("dns.example", "/dns-query", q, 3000, 65535)
            throw AssertionError("404 must fail")
        } catch (e: IOException) {
            assertTrue(e.message!!.contains("404"))
        }
        assertFalse(c.usable)
        c.close()
        t.join(3000)
        server.close()
        serverError?.let { throw it }
        assertEquals(listOf("stream 1", "stream 3"), seen)
    }

    /** Opens a tunnel through the HTTPS proxy this test machine uses, if any. */
    private fun connectMaybeViaProxy(host: String, port: Int, timeoutMs: Int): Socket {
        val proxyHost = System.getProperty("https.proxyHost") ?: return DohClient.defaultConnect(host, port, timeoutMs)
        val proxyPort = System.getProperty("https.proxyPort")?.toIntOrNull() ?: 443
        val s = Socket()
        s.connect(InetSocketAddress(proxyHost, proxyPort), timeoutMs)
        s.soTimeout = timeoutMs
        s.getOutputStream().write("CONNECT $host:$port HTTP/1.1\r\nHost: $host:$port\r\n\r\n".toByteArray())
        val input = s.getInputStream()
        val head = StringBuilder()
        while (!head.endsWith("\r\n\r\n")) {
            val b = input.read()
            if (b < 0) throw IOException("proxy closed")
            head.append(b.toChar())
        }
        if (!head.startsWith("HTTP/1.1 200") && !head.startsWith("HTTP/1.0 200")) throw IOException("proxy said: ${head.lines().first()}")
        return s
    }

    /** Real lookups against Quad9 (HTTP/2 only) and Google; skipped when there is no internet. */
    @Test
    fun liveDohOverHttp2() {
        val client = DohClient(connect = ::connectMaybeViaProxy)
        for (provider in listOf(DnsProvider.QUAD9, DnsProvider.GOOGLE)) {
            val body = TestDns.query(0, "example.com", edns = true)
            val raw = try {
                client.query(provider.dohUrl!!, body)
            } catch (e: IOException) {
                assumeTrue("no internet: $e", false)
                return
            }
            val r = Dns.parseResponse(raw)
            assertEquals(0, r.id)
            assertTrue(Dns.answers(r, Dns.parseQuery(body).question))
            assertEquals(Dns.NOERROR, r.rcode)
            assertFalse(Dns.addresses(r).isEmpty())
            // Second lookup reuses the pooled connection.
            val body2 = TestDns.query(0, "example.org", Dns.TYPE_AAAA)
            val r2 = Dns.parseResponse(client.query(provider.dohUrl!!, body2))
            assertTrue(Dns.answers(r2, Dns.parseQuery(body2).question))
        }
        client.closeAll()
    }
}
