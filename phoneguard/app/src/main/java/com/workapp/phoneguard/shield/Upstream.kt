package com.workapp.phoneguard.shield

import java.io.ByteArrayOutputStream
import java.io.Closeable
import java.io.DataInputStream
import java.io.IOException
import java.io.InputStream
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.SocketTimeoutException
import java.net.URL
import java.net.URLConnection
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.SSLSession
import javax.net.ssl.HttpsURLConnection

// Ways of asking real DNS servers. Pure JVM: Android-specific network binding is injected.

/** Reads at most [limit] bytes; throws if the stream has more. */
internal fun readLimited(input: InputStream, limit: Int): ByteArray {
    val out = ByteArrayOutputStream(minOf(limit, 4096))
    val buf = ByteArray(8192)
    while (true) {
        val n = input.read(buf)
        if (n < 0) break
        if (out.size() + n > limit) throw IOException("response larger than $limit bytes")
        out.write(buf, 0, n)
    }
    return out.toByteArray()
}

/**
 * DNS over HTTPS (RFC 8484, POST). Uses HTTP/2 (required by Quad9) over a small pool of
 * kept-alive TLS connections; falls back to HTTP/1.1 through HttpsURLConnection for a server
 * that doesn't offer HTTP/2. Only https:// addresses are accepted, so lookups are never sent
 * in the clear by mistake. Thread-safe.
 */
class DohClient(
    /** Opens a plain TCP connection (Android binds it to the real network). */
    private val connect: (host: String, port: Int, timeoutMs: Int) -> Socket = ::defaultConnect,
    /** Extra certificate-name check on top of the platform's (Android passes its verifier). */
    private val verify: (String, SSLSession) -> Boolean = { _, _ -> true },
    /** Opens an HttpsURLConnection for the HTTP/1.1 fallback. */
    private val openHttp1: (URL) -> URLConnection = { it.openConnection() },
) {
    private data class PoolKey(val host: String, val port: Int)

    private val idle = HashMap<PoolKey, ArrayDeque<H2Connection>>()
    private val http1Only: MutableSet<String> = ConcurrentHashMap.newKeySet()

    /** Sends [query] (whose ID should be 0, as RFC 8484 recommends) and returns the raw answer. */
    fun query(url: String, query: ByteArray): ByteArray {
        val u = URL(url)
        if (!u.protocol.equals("https", ignoreCase = true)) throw IOException("not an HTTPS address")
        val host = u.host
        val port = if (u.port > 0) u.port else 443
        if (host in http1Only) return queryHttp1(url, query)
        val key = PoolKey(host, port)
        val authority = if (port == 443) host else "$host:$port"
        val path = u.file.ifEmpty { "/" }

        take(key)?.let { c ->
            try {
                return c.exchange(authority, path, query, TIMEOUT_MS, MAX_RESPONSE).also { release(key, c) }
            } catch (_: IOException) {
                c.close() // probably closed by the server while idle: try once on a new one
            }
        }
        val c = try {
            H2Connection.open(connect(host, port, TIMEOUT_MS), host, port, TIMEOUT_MS, verify)
        } catch (_: H2Connection.NoHttp2Exception) {
            http1Only += host
            return queryHttp1(url, query)
        }
        try {
            return c.exchange(authority, path, query, TIMEOUT_MS, MAX_RESPONSE).also { release(key, c) }
        } catch (e: IOException) {
            c.close()
            throw e
        }
    }

    private fun take(key: PoolKey): H2Connection? {
        val now = System.nanoTime()
        synchronized(idle) {
            val q = idle[key] ?: return null
            while (true) {
                val c = q.removeLastOrNull() ?: return null
                if (c.usable && now - c.lastUsed < MAX_IDLE_NS) return c
                c.close()
            }
        }
    }

    private fun release(key: PoolKey, c: H2Connection) {
        if (!c.usable) {
            c.close()
            return
        }
        val extra = synchronized(idle) {
            val q = idle.getOrPut(key) { ArrayDeque() }
            q.addLast(c)
            if (q.size > MAX_IDLE) q.removeFirst() else null
        }
        extra?.close()
    }

    /** Drops all kept-alive connections, e.g. when the phone switches networks. */
    fun closeAll() {
        val all = synchronized(idle) {
            val list = idle.values.flatten()
            idle.clear()
            list
        }
        for (c in all) c.close()
        http1Only.clear()
    }

    private fun queryHttp1(url: String, query: ByteArray): ByteArray {
        val conn = openHttp1(URL(url)) as? HttpsURLConnection ?: throw IOException("not an HTTPS address")
        var ok = false
        try {
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.useCaches = false
            conn.instanceFollowRedirects = false
            conn.setRequestProperty("Content-Type", MIME)
            conn.setRequestProperty("Accept", MIME)
            conn.setFixedLengthStreamingMode(query.size)
            conn.outputStream.use { it.write(query) }
            val code = conn.responseCode
            if (code != HttpURLConnection.HTTP_OK) throw IOException("HTTP $code")
            val type = conn.contentType?.substringBefore(';')?.trim()
            if (!MIME.equals(type, ignoreCase = true)) throw IOException("unexpected content type $type")
            if (conn.contentLengthLong > MAX_RESPONSE) throw IOException("response too large")
            val body = conn.inputStream.use { readLimited(it, MAX_RESPONSE) }
            ok = true // not disconnected, so the HTTP stack can keep the connection alive
            return body
        } finally {
            if (!ok) conn.disconnect()
        }
    }

    companion object {
        const val MIME = "application/dns-message"
        const val MAX_RESPONSE = 65535
        const val TIMEOUT_MS = 4000
        private const val MAX_IDLE = 4
        private const val MAX_IDLE_NS = 30_000_000_000L // NAT boxes drop idle connections silently

        /**
         * Known addresses of the built-in providers, used when the network's DNS can't (or
         * won't) resolve the provider's name. TLS still checks the certificate for the name.
         */
        val BOOTSTRAP: Map<String, List<String>> = mapOf(
            "dns.quad9.net" to listOf("9.9.9.9", "149.112.112.112", "2620:fe::fe"),
            "security.cloudflare-dns.com" to listOf("1.1.1.2", "1.0.0.2", "2606:4700:4700::1112"),
            "dns.google" to listOf("8.8.8.8", "8.8.4.4", "2001:4860:4860::8888"),
        )

        fun defaultConnect(host: String, port: Int, timeoutMs: Int): Socket {
            val s = Socket()
            try {
                s.connect(InetSocketAddress(host, port), timeoutMs)
                return s
            } catch (e: IOException) {
                s.close()
                throw e
            }
        }
    }
}

/**
 * Plain DNS over UDP (with TCP retry for truncated answers). Each query uses a fresh random ID
 * and a fresh socket, and only a reply with that ID and the same question is accepted, which
 * makes forged replies on the local network much harder.
 */
class UdpDns(
    private val timeoutMs: Int = 3000,
    /** Binds sockets to the real (non-VPN) network on Android. */
    private val bindUdp: (DatagramSocket) -> Unit = {},
    private val bindTcp: (Socket) -> Unit = {},
    /** Sockets in use, so close() elsewhere can unblock waiting threads. */
    private val open: MutableSet<Closeable>? = null,
) {
    private val random = SecureRandom()

    /** Returns a response matching [q] or throws IOException. The returned ID is random. */
    fun query(q: DnsQuery, server: InetAddress, port: Int = 53): ByteArray {
        val id = random.nextInt(0x10000)
        val msg = q.raw.copyOf()
        Dns.setId(msg, id)
        val socket = DatagramSocket()
        open?.add(socket)
        try {
            bindUdp(socket) // must happen before connect()
            socket.connect(InetSocketAddress(server, port))
            socket.send(DatagramPacket(msg, msg.size))
            val buf = ByteArray(DohClient.MAX_RESPONSE)
            val deadline = System.nanoTime() + timeoutMs * 1_000_000L
            while (true) {
                val left = ((deadline - System.nanoTime()) / 1_000_000L).toInt()
                if (left <= 0) throw SocketTimeoutException("no answer from $server")
                socket.soTimeout = left
                val packet = DatagramPacket(buf, buf.size)
                socket.receive(packet)
                val data = buf.copyOf(packet.length)
                val resp = try { Dns.parseResponse(data) } catch (_: DnsFormatException) { continue }
                if (resp.id != id || !Dns.answers(resp, q.question)) continue // stray or forged packet
                if (resp.truncated) return queryTcp(msg, id, q, server, port)
                return data
            }
        } finally {
            open?.remove(socket)
            socket.close()
        }
    }

    private fun queryTcp(msg: ByteArray, id: Int, q: DnsQuery, server: InetAddress, port: Int): ByteArray {
        val socket = Socket()
        open?.add(socket)
        try {
            bindTcp(socket)
            socket.soTimeout = timeoutMs
            socket.connect(InetSocketAddress(server, port), timeoutMs)
            val out = socket.getOutputStream()
            val framed = ByteArray(msg.size + 2)
            Dns.putU16(framed, 0, msg.size)
            System.arraycopy(msg, 0, framed, 2, msg.size)
            out.write(framed)
            out.flush()
            val input = DataInputStream(socket.getInputStream())
            val len = input.readUnsignedShort()
            val data = ByteArray(len)
            input.readFully(data)
            val resp = try { Dns.parseResponse(data) } catch (e: DnsFormatException) { throw IOException(e.message) }
            if (resp.id != id || !Dns.answers(resp, q.question)) throw IOException("mismatched TCP answer")
            return data
        } finally {
            open?.remove(socket)
            socket.close()
        }
    }
}

/**
 * Picks where each lookup goes: the chosen encrypted provider first, then the network's own DNS
 * servers so the internet keeps working, and reports what happened through [status].
 * After repeated DoH failures it waits a while (15 s, doubling up to 2 min) before trying DoH
 * again, so every lookup doesn't pay a timeout. A new network or provider resets that wait.
 */
internal class UpstreamChain(
    private val provider: () -> DnsProvider,
    private val doh: (url: String, body: ByteArray) -> ByteArray,
    private val servers: () -> List<InetAddress>,
    private val udp: (q: DnsQuery, server: InetAddress) -> ByteArray,
    private val networkId: () -> Any?,
    /** Search domains of the current network: names under them are answered by its own DNS. */
    private val localDomains: () -> List<String> = { emptyList() },
    private val status: (encrypted: Boolean, problem: String?) -> Unit,
    private val clock: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    class Result(val response: DnsResponse, val server: String)

    private var failures = 0
    private var retryAt = 0L
    private var failedProvider: DnsProvider? = null
    private var failedNetwork: Any? = null

    fun resolve(q: DnsQuery): Result? {
        val p = provider()
        val url = p.dohUrl
        // Home and office names (router, printer, NAS) only exist on the local network's DNS.
        val local = LocalNames.isLocal(q.question.key, localDomains())
        if (url != null && !local && dohAllowed(p)) {
            try {
                val body = q.raw.copyOf()
                Dns.setId(body, 0)
                val resp = Dns.parseResponse(doh(url, body))
                if (resp.id != 0 || !Dns.answers(resp, q.question)) throw IOException("answer doesn't match the question")
                if (resp.rcode == Dns.REFUSED || resp.rcode == Dns.NOTIMP || resp.rcode == Dns.FORMERR) {
                    throw IOException("server refused (rcode ${resp.rcode})")
                }
                // SERVFAIL from the provider is passed on as is: it is often a security
                // (DNSSEC) failure, and retrying over plain DNS would defeat it.
                dohWorked()
                status(true, null)
                return Result(resp, url)
            } catch (_: Exception) {
                dohFailed(p)
            }
        }
        var poor: Result? = null
        for (server in servers()) {
            try {
                val resp = Dns.parseResponse(udp(q, server))
                val r = Result(resp, server.hostAddress ?: server.toString())
                if (resp.rcode == Dns.SERVFAIL || resp.rcode == Dns.REFUSED || resp.rcode == Dns.NOTIMP) {
                    if (poor == null) poor = r
                    continue // another server may do better
                }
                if (!local) reportFallback(p)
                return r
            } catch (_: Exception) {
                // try the next server
            }
        }
        if (poor != null) {
            if (!local) reportFallback(p)
            return poor
        }
        if (!local) status(false, NO_DNS)
        return null
    }

    private fun reportFallback(p: DnsProvider) {
        if (p.dohUrl == null) status(false, null) // the user chose plain DNS: nothing is wrong
        else status(false, "Encrypted DNS (${p.shortName}) can't be reached — using your network's DNS for now")
    }

    @Synchronized
    private fun dohAllowed(p: DnsProvider): Boolean {
        if (failures == 0) return true
        if (p != failedProvider || networkId() != failedNetwork) {
            failures = 0
            return true
        }
        return clock() >= retryAt
    }

    @Synchronized
    private fun dohWorked() {
        failures = 0
    }

    @Synchronized
    private fun dohFailed(p: DnsProvider) {
        failedProvider = p
        failedNetwork = networkId()
        failures++
        // One failure can be a blip on mobile data; wait only after two in a row.
        if (failures >= 2) retryAt = clock() + minOf(15_000L shl minOf(failures - 2, 3), 120_000L)
    }

    companion object {
        const val NO_DNS = "No DNS server is answering — check your internet connection"
    }
}

/** Provider name without the "(recommended)" note, for messages. */
val DnsProvider.shortName: String get() = title.substringBefore(" (")

/** Names that only the local network's own DNS can answer, so they never go to the provider. */
object LocalNames {
    private val SUFFIXES = listOf(
        "local", "lan", "home", "home.arpa", "internal", "intranet", "localdomain", "corp",
        "private", "fritz.box",
        // Reverse lookups of private, link-local and unique-local addresses.
        "10.in-addr.arpa", "168.192.in-addr.arpa", "254.169.in-addr.arpa",
        "d.f.ip6.arpa", "8.e.f.ip6.arpa", "9.e.f.ip6.arpa", "a.e.f.ip6.arpa", "b.e.f.ip6.arpa",
    ) + (16..31).map { "$it.172.in-addr.arpa" }

    /** [name] is lowercase without a trailing dot. */
    fun isLocal(name: String, searchDomains: List<String> = emptyList()): Boolean {
        if (name.isEmpty()) return false
        if (name.indexOf('.') < 0) return true // single label, e.g. "router" or "nas"
        for (s in SUFFIXES) if (under(name, s)) return true
        for (s in searchDomains) if (s.isNotEmpty() && under(name, s)) return true
        return false
    }

    private fun under(name: String, suffix: String) =
        name == suffix || (name.length > suffix.length && name.endsWith(suffix) && name[name.length - suffix.length - 1] == '.')
}
