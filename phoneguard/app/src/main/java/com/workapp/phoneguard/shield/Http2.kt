package com.workapp.phoneguard.shield

import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.DataInputStream
import java.io.IOException
import java.net.Socket
import java.net.SocketTimeoutException
import javax.net.ssl.SSLPeerUnverifiedException
import javax.net.ssl.SSLSession
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * The smallest HTTP/2 client that can do DNS-over-HTTPS POSTs (RFC 9113 + RFC 7541).
 *
 * Why it exists: Quad9 only accepts DoH over HTTP/2 (it answers HTTP/1.1 with 505), and
 * Android's built-in HttpsURLConnection speaks only HTTP/1.1. No third-party libraries are
 * allowed, so this does just enough: one request at a time per connection, no server push,
 * and response headers are skipped except for the status (the body is validated as a DNS
 * answer to our exact question anyway, which is the real safety check).
 */
internal class H2Connection private constructor(private val socket: Socket) : Closeable {
    private val input = DataInputStream(BufferedInputStream(socket.inputStream, 16 * 1024))
    private val output = BufferedOutputStream(socket.outputStream, 16 * 1024)
    private var nextStream = 1
    private var peerMaxFrame = DEFAULT_MAX_FRAME
    // What the server lets us send (flow control). Queries are tiny, but a long-lived
    // connection must still respect it; when it runs out we simply use a new connection.
    private var peerStreamWindow = 65_535L
    private var sendWindow = 65_535L

    /** False once the connection hit an error or the server said goodbye. */
    @Volatile var usable = true
        private set

    /** System.nanoTime() of the last completed exchange, for idle expiry in the pool. */
    @Volatile var lastUsed = System.nanoTime()
        private set

    /** Thrown when the server does not offer HTTP/2; the caller can use HTTP/1.1 instead. */
    class NoHttp2Exception(host: String) : IOException("$host does not speak HTTP/2")

    companion object {
        private const val DATA = 0
        private const val HEADERS = 1
        private const val RST_STREAM = 3
        private const val SETTINGS = 4
        private const val PUSH_PROMISE = 5
        private const val PING = 6
        private const val GOAWAY = 7
        private const val WINDOW_UPDATE = 8
        private const val CONTINUATION = 9

        private const val END_STREAM = 0x1
        private const val ACK = 0x1
        private const val END_HEADERS = 0x4
        private const val PADDED = 0x8
        private const val PRIORITY = 0x20

        private const val DEFAULT_MAX_FRAME = 16_384
        private const val MAX_STREAM_ID = 1_000_001
        private const val OUR_STREAM_WINDOW = 1 shl 20
        private const val OUR_CONN_WINDOW_BOOST = 1 shl 24

        private val PREFACE = "PRI * HTTP/2.0\r\n\r\nSM\r\n\r\n".toByteArray(Charsets.US_ASCII)

        /** HPACK static table entries 9..14 are ":status" values other than 200. */
        private val NON_200 = mapOf(9 to 204, 10 to 206, 11 to 304, 12 to 400, 13 to 404, 14 to 500)

        /**
         * Starts TLS over [plain] (already connected), negotiates HTTP/2 by ALPN and sends the
         * connection preface. The certificate is checked for [host] by the platform
         * (endpoint identification) and again by [verify].
         */
        fun open(plain: Socket, host: String, port: Int, timeoutMs: Int, verify: (String, SSLSession) -> Boolean): H2Connection {
            val factory = SSLSocketFactory.getDefault() as SSLSocketFactory
            val ssl = factory.createSocket(plain, host, port, true) as SSLSocket
            try {
                ssl.soTimeout = timeoutMs
                val params = ssl.sslParameters
                params.applicationProtocols = arrayOf("h2", "http/1.1")
                params.endpointIdentificationAlgorithm = "HTTPS"
                ssl.sslParameters = params
                ssl.startHandshake()
                if (!verify(host, ssl.session)) throw SSLPeerUnverifiedException("certificate is not for $host")
                if (ssl.applicationProtocol != "h2") throw NoHttp2Exception(host)
                val c = H2Connection(ssl)
                c.start()
                return c
            } catch (e: Throwable) {
                try { ssl.close() } catch (_: IOException) {}
                throw e
            }
        }

        /** Over an already connected socket without TLS. For tests only. */
        internal fun openPlainForTest(socket: Socket): H2Connection = H2Connection(socket).also { it.start() }

        /** HPACK integer with an N-bit prefix (RFC 7541 5.1). */
        internal fun writeInt(out: ByteArrayOutputStream, value: Int, prefixBits: Int, flags: Int) {
            val max = (1 shl prefixBits) - 1
            if (value < max) {
                out.write(flags or value)
                return
            }
            out.write(flags or max)
            var v = value - max
            while (v >= 128) {
                out.write((v and 0x7F) or 0x80)
                v = v ushr 7
            }
            out.write(v)
        }

        /** "Literal without indexing, indexed name" (RFC 7541 6.2.2), plain (non-Huffman) value. */
        private fun literal(out: ByteArrayOutputStream, nameIndex: Int, value: String) {
            val bytes = value.toByteArray(Charsets.US_ASCII)
            writeInt(out, nameIndex, 4, 0x00)
            writeInt(out, bytes.size, 7, 0x00)
            out.write(bytes)
        }

        /** Request header block for a DoH POST. Indexes are from the HPACK static table. */
        internal fun requestHeaders(authority: String, path: String, contentLength: Int): ByteArray {
            val out = ByteArrayOutputStream(128)
            out.write(0x80 or 3) // :method: POST
            out.write(0x80 or 7) // :scheme: https
            literal(out, 1, authority) // :authority
            literal(out, 4, path) // :path
            literal(out, 31, DohClient.MIME) // content-type
            literal(out, 19, DohClient.MIME) // accept
            literal(out, 28, contentLength.toString()) // content-length
            return out.toByteArray()
        }
    }

    private fun start() {
        output.write(PREFACE)
        // SETTINGS: ENABLE_PUSH = 0, INITIAL_WINDOW_SIZE = 1 MiB.
        val settings = ByteArray(12)
        Dns.putU16(settings, 0, 0x2)
        Dns.putU32(settings, 2, 0)
        Dns.putU16(settings, 6, 0x4)
        Dns.putU32(settings, 8, OUR_STREAM_WINDOW.toLong())
        writeFrame(SETTINGS, 0, 0, settings)
        writeWindowUpdate(0, OUR_CONN_WINDOW_BOOST)
        output.flush()
    }

    private fun writeFrame(type: Int, flags: Int, stream: Int, payload: ByteArray, off: Int = 0, len: Int = payload.size) {
        val h = ByteArray(9)
        h[0] = (len ushr 16).toByte()
        h[1] = (len ushr 8).toByte()
        h[2] = len.toByte()
        h[3] = type.toByte()
        h[4] = flags.toByte()
        Dns.putU32(h, 5, stream.toLong() and 0x7FFFFFFF)
        output.write(h)
        output.write(payload, off, len)
    }

    private fun writeWindowUpdate(stream: Int, increment: Int) {
        val p = ByteArray(4)
        Dns.putU32(p, 0, increment.toLong())
        writeFrame(WINDOW_UPDATE, 0, stream, p)
    }

    /**
     * POSTs [body] to [path] and returns the response body (at most [maxBody] bytes).
     * Not thread-safe: the pool hands a connection to one caller at a time.
     */
    fun exchange(authority: String, path: String, body: ByteArray, timeoutMs: Int, maxBody: Int): ByteArray {
        if (!usable) throw IOException("connection closed")
        try {
            return doExchange(authority, path, body, timeoutMs, maxBody)
        } catch (e: IOException) {
            usable = false
            throw e
        }
    }

    private fun doExchange(authority: String, path: String, body: ByteArray, timeoutMs: Int, maxBody: Int): ByteArray {
        val sid = nextStream
        nextStream += 2
        if (nextStream > MAX_STREAM_ID) usable = false // retire it; plenty of ids left for this one
        socket.soTimeout = timeoutMs
        val deadline = System.nanoTime() + timeoutMs * 1_000_000L

        if (body.size > sendWindow || body.size > peerStreamWindow) {
            usable = false
            throw IOException("no send window left on this connection")
        }
        sendWindow -= body.size
        val headers = requestHeaders(authority, path, body.size)
        if (headers.size > peerMaxFrame) throw IOException("request headers too large")
        writeFrame(HEADERS, END_HEADERS or (if (body.isEmpty()) END_STREAM else 0), sid, headers)
        var off = 0
        while (off < body.size) {
            val n = minOf(peerMaxFrame, body.size - off)
            val last = off + n == body.size
            writeFrame(DATA, if (last) END_STREAM else 0, sid, body, off, n)
            off += n
        }
        output.flush()

        val response = ByteArrayOutputStream(512)
        var received = 0
        var sawHeaders = false
        while (true) {
            if (System.nanoTime() > deadline) throw SocketTimeoutException("DoH answer took too long")
            val len = input.readUnsignedByte() shl 16 or (input.readUnsignedByte() shl 8) or input.readUnsignedByte()
            val type = input.readUnsignedByte()
            val flags = input.readUnsignedByte()
            val stream = input.readInt() and 0x7FFFFFFF
            if (len > DEFAULT_MAX_FRAME) throw IOException("frame larger than allowed")
            val payload = ByteArray(len)
            input.readFully(payload)
            when (type) {
                SETTINGS -> {
                    if (stream != 0) throw IOException("bad SETTINGS frame")
                    if (flags and ACK == 0) {
                        if (len % 6 != 0) throw IOException("bad SETTINGS length")
                        var p = 0
                        while (p < len) {
                            val id = Dns.u16(payload, p)
                            val value = Dns.u32(payload, p + 2)
                            if (id == 0x5 && value in DEFAULT_MAX_FRAME..0xFFFFFF) peerMaxFrame = value.toInt()
                            if (id == 0x4) peerStreamWindow = value
                            p += 6
                        }
                        writeFrame(SETTINGS, ACK, 0, ByteArray(0))
                        output.flush()
                    }
                }
                PING -> if (flags and ACK == 0) {
                    writeFrame(PING, ACK, 0, payload)
                    output.flush()
                }
                GOAWAY -> {
                    usable = false
                    val lastStream = if (len >= 4) (Dns.u32(payload, 0) and 0x7FFFFFFF).toInt() else 0
                    if (sid > lastStream) throw IOException("server closed the connection")
                }
                RST_STREAM -> if (stream == sid || stream == 0) throw IOException("request was reset")
                PUSH_PROMISE -> throw IOException("unexpected server push")
                HEADERS, CONTINUATION -> if (stream == sid) {
                    if (type == HEADERS && !sawHeaders) {
                        sawHeaders = true
                        checkStatus(payload, flags)
                    }
                    if (flags and END_STREAM != 0) {
                        if (flags and END_HEADERS == 0) skipContinuations(sid)
                        break
                    }
                }
                DATA -> if (stream == sid) {
                    var start = 0
                    var end = len
                    if (flags and PADDED != 0) {
                        if (len < 1) throw IOException("bad padding")
                        start = 1
                        end = len - (payload[0].toInt() and 0xFF)
                        if (end < start) throw IOException("bad padding")
                    }
                    received += len
                    if (response.size() + (end - start) > maxBody) throw IOException("DoH answer larger than $maxBody bytes")
                    response.write(payload, start, end - start)
                    if (flags and END_STREAM != 0) break
                } else {
                    received += len
                }
                WINDOW_UPDATE -> if (stream == 0 && len == 4) {
                    sendWindow = minOf(sendWindow + (Dns.u32(payload, 0) and 0x7FFFFFFF), Int.MAX_VALUE.toLong())
                }
                // PRIORITY and unknown frame types are ignored, as the spec allows.
            }
        }
        // Give the flow-control credit back so a long-lived connection never stalls.
        if (received > 0) {
            writeWindowUpdate(0, received)
            output.flush()
        }
        lastUsed = System.nanoTime()
        if (!sawHeaders) throw IOException("no response headers")
        return response.toByteArray()
    }

    /** Fails fast on a non-200 status when it is sent as an indexed static-table entry. */
    private fun checkStatus(payload: ByteArray, flags: Int) {
        var off = 0
        if (flags and PADDED != 0) off += 1
        if (flags and PRIORITY != 0) off += 5
        if (off >= payload.size) return
        val b = payload[off].toInt() and 0xFF
        if (b and 0x80 != 0) {
            NON_200[b and 0x7F]?.let { throw IOException("HTTP $it") }
        }
    }

    private fun skipContinuations(sid: Int) {
        while (true) {
            val len = input.readUnsignedByte() shl 16 or (input.readUnsignedByte() shl 8) or input.readUnsignedByte()
            val type = input.readUnsignedByte()
            val flags = input.readUnsignedByte()
            val stream = input.readInt() and 0x7FFFFFFF
            if (len > DEFAULT_MAX_FRAME || type != CONTINUATION || stream != sid) throw IOException("bad CONTINUATION")
            input.readFully(ByteArray(len))
            if (flags and END_HEADERS != 0) return
        }
    }

    override fun close() {
        usable = false
        try { socket.close() } catch (_: IOException) {}
    }
}
