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
import java.util.concurrent.TimeUnit
import java.util.concurrent.locks.ReentrantLock
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
 * The DoH server was reached (the connection worked) but didn't answer this lookup in time.
 * Usually the provider is just slow on one name, so it isn't proof that DoH is unreachable.
 */
class DohSlowException(message: String) : IOException(message)

/**
 * DNS over HTTPS (RFC 8484, POST). Uses HTTP/2 (required by Quad9) over a small pool of
 * kept-alive TLS connections; falls back to HTTP/1.1 through HttpsURLConnection for a server
 * that doesn't offer HTTP/2. Only https:// addresses are accepted, so lookups are never sent
 * in the clear by mistake. Thread-safe.
 */
class DohClient internal constructor(
    /** Opens a plain TCP connection (Android binds it to the real network). */
    private val connect: (host: String, port: Int, timeoutMs: Int) -> Socket = ::defaultConnect,
    /** Extra certificate-name check on top of the platform's (Android passes its verifier). */
    private val verify: (String, SSLSession) -> Boolean = { _, _ -> true },
    /** Opens an HttpsURLConnection for the HTTP/1.1 fallback. */
    private val openHttp1: (URL) -> URLConnection = { it.openConnection() },
    private val timeoutMs: Int = TIMEOUT_MS,
    /** Starts TLS + HTTP/2 over a connected socket. Tests swap in a plain-text version. */
    private val openH2: (Socket, String, Int) -> H2Connection = { s, host, port -> H2Connection.open(s, host, port, timeoutMs, verify) },
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
                return c.exchange(authority, path, query, timeoutMs, MAX_RESPONSE).also { release(key, c) }
            } catch (_: SocketTimeoutException) {
                // The request went out and the server is just slow on this name. Asking again
                // on a new connection would only double the wait.
                c.close()
                throw DohSlowException("no answer within $timeoutMs ms")
            } catch (_: IOException) {
                c.close() // probably closed by the server while idle: try once on a new one
            }
        }
        val c = try {
            openH2(connect(host, port, timeoutMs), host, port)
        } catch (_: H2Connection.NoHttp2Exception) {
            http1Only += host
            return queryHttp1(url, query)
        }
        try {
            return c.exchange(authority, path, query, timeoutMs, MAX_RESPONSE).also { release(key, c) }
        } catch (_: SocketTimeoutException) {
            c.close()
            throw DohSlowException("no answer within $timeoutMs ms")
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
            conn.connectTimeout = timeoutMs
            conn.readTimeout = timeoutMs
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
 *
 * Checking whether DoH works is "single-flight": while DoH is unproven (first use on a network
 * or with a provider) or failing, only one lookup at a time tries it (the probe). The others
 * either wait briefly for that probe ([probeWaitMs], while DoH is unproven or failed only once)
 * or go straight to the network's DNS (after repeated failures), so a network that blocks DoH
 * can't tie up every DNS thread with connect timeouts. After two failures in a row the next
 * probe waits 15 s, doubling up to 5 min. A new network or provider, or [networkChanged],
 * starts over with an immediate probe; [retryNow] (the network just passed Android's internet
 * check) cuts a running backoff short.
 *
 * While DoH is healthy every lookup uses it at once, so a short outage makes all the lookups in
 * flight fail together. That burst counts as one failure (the next lookup becomes the probe);
 * only failed probes make the backoff grow, so a blip can't jump straight to 5 minutes.
 *
 * Names under the network's own search domain (from DHCP, e.g. an office "corp.example.com")
 * go to DoH like any other name, but if DoH says they don't exist the network's DNS is asked
 * too (see [SearchDomains]): that is where intranet names live.
 */
internal class UpstreamChain(
    private val provider: () -> DnsProvider,
    private val doh: (url: String, body: ByteArray) -> ByteArray,
    private val servers: () -> List<InetAddress>,
    private val udp: (q: DnsQuery, server: InetAddress) -> ByteArray,
    private val networkId: () -> Any?,
    private val status: (encrypted: Boolean, problem: String?) -> Unit,
    private val clock: () -> Long = { System.nanoTime() / 1_000_000 },
    private val probeWaitMs: Long = PROBE_WAIT_MS,
    /** The network's search domains (from DHCP), lowercase. See [SearchDomains]. */
    private val searchDomains: () -> List<String> = { emptyList() },
) {
    /**
     * [intranet]: DoH said the name doesn't exist, so this answer came from the network's own
     * DNS because the name is under the network's search domain. Expected for office names, so
     * it doesn't count as "not encrypted".
     */
    class Result(val response: DnsResponse, val server: String, val intranet: Boolean = false)

    private enum class Route { DOH, PROBE, FALLBACK }
    private enum class Outcome { OK, SLOW, FAILED }
    private class Ticket(val route: Route, val epoch: Long)

    private val lock = ReentrantLock()
    private val probeFinished = lock.newCondition()

    // All guarded by lock.
    private var known = false // false: the next lookup starts over (new network or provider)
    private var epoch = 0L // bumped on every start-over, so late results from before are ignored
    private var stateProvider: DnsProvider? = null
    private var stateNetwork: Any? = null
    private var verified = false // DoH answered on this network with this provider
    private var failures = 0
    private var retryAt = 0L
    private var lastOkAt = 0L
    private var probing = false
    private var probesDone = 0L

    /** The phone moved to another network: forget what we learned and probe DoH again at once. */
    fun networkChanged() {
        lock.lock()
        try {
            known = false
            probeFinished.signalAll()
        } finally {
            lock.unlock()
        }
    }

    /**
     * The network just passed Android's internet check (for example after signing in to a
     * hotel Wi-Fi page): if DoH has been failing, check it again with the next lookup instead of
     * waiting out the backoff, and let a new failure start the backoff from 15 s again.
     */
    fun retryNow() {
        lock.lock()
        try {
            if (known && failures > 0) {
                retryAt = minOf(retryAt, clock())
                if (failures > 1) failures = 1
            }
            probeFinished.signalAll()
        } finally {
            lock.unlock()
        }
    }

    fun resolve(q: DnsQuery): Result? {
        val p = provider()
        val url = p.dohUrl
        // Home and office names (router, printer, NAS) only exist on the local network's DNS.
        val local = LocalNames.isLocal(q.question.key)
        if (url != null && !local) {
            val t = route(p)
            if (t.route != Route.FALLBACK) {
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
                    finish(t, Outcome.OK)
                    status(true, null)
                    if (isMissing(resp) && SearchDomains.covers(q.question.key, searchDomains())) {
                        intranetAnswer(q)?.let { return it }
                    }
                    return Result(resp, url)
                } catch (_: DohSlowException) {
                    finish(t, Outcome.SLOW)
                } catch (_: Exception) {
                    finish(t, Outcome.FAILED)
                }
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

    /** NXDOMAIN, or NOERROR without any answer. */
    private fun isMissing(resp: DnsResponse) =
        resp.rcode == Dns.NXDOMAIN || (resp.rcode == Dns.NOERROR && resp.answers.isEmpty())

    /**
     * Asks the network's DNS for a name DoH didn't know. Only a real answer (NOERROR with
     * records) is used; otherwise the provider's "doesn't exist" stands.
     */
    private fun intranetAnswer(q: DnsQuery): Result? {
        for (server in servers()) {
            try {
                val resp = Dns.parseResponse(udp(q, server))
                if (resp.rcode == Dns.NOERROR && resp.answers.isNotEmpty()) {
                    return Result(resp, server.hostAddress ?: server.toString(), intranet = true)
                }
            } catch (_: Exception) {
                // try the next server
            }
        }
        return null
    }

    private fun reportFallback(p: DnsProvider) {
        when {
            p.dohUrl == null -> status(false, null) // the user chose plain DNS: nothing is wrong
            // This lookup went out unencrypted, but DoH hasn't failed (it is still being
            // checked, or was only slow on one name): no warning, but not "encrypted" either.
            !dohFailing() -> status(false, null)
            else -> status(false, "Encrypted DNS (${p.shortName}) can't be reached — using your network's DNS for now")
        }
    }

    private fun dohFailing(): Boolean {
        lock.lock()
        try {
            return failures > 0
        } finally {
            lock.unlock()
        }
    }

    /** Decides whether this lookup uses DoH, is the probe, or goes to the network's DNS. */
    private fun route(p: DnsProvider): Ticket {
        val net = networkId()
        lock.lock()
        try {
            if (!known || p != stateProvider || net != stateNetwork) startOver(p, net)
            if (verified && failures == 0) return Ticket(Route.DOH, epoch)
            if (!probing) {
                if (clock() >= retryAt) {
                    probing = true
                    return Ticket(Route.PROBE, epoch)
                }
                return Ticket(Route.FALLBACK, epoch)
            }
            // A probe is running. After repeated failures, don't wait for it.
            if (failures >= 2) return Ticket(Route.FALLBACK, epoch)
            val myEpoch = epoch
            val seen = probesDone
            var left = TimeUnit.MILLISECONDS.toNanos(probeWaitMs)
            while (probing && probesDone == seen && epoch == myEpoch && known && left > 0) {
                left = try {
                    probeFinished.awaitNanos(left)
                } catch (_: InterruptedException) {
                    Thread.currentThread().interrupt()
                    break
                }
            }
            val ok = known && epoch == myEpoch && verified && failures == 0
            return Ticket(if (ok) Route.DOH else Route.FALLBACK, epoch)
        } finally {
            lock.unlock()
        }
    }

    private fun startOver(p: DnsProvider, net: Any?) {
        known = true
        epoch++
        stateProvider = p
        stateNetwork = net
        verified = false
        failures = 0
        retryAt = 0L
        lastOkAt = 0L
        probing = false
        probeFinished.signalAll()
    }

    private fun finish(t: Ticket, outcome: Outcome) {
        lock.lock()
        try {
            if (t.epoch != epoch) return // started on an older network or provider
            val now = clock()
            if (t.route == Route.PROBE) {
                probing = false
                probesDone++
            }
            when (outcome) {
                Outcome.OK -> {
                    verified = true
                    failures = 0
                    lastOkAt = now
                }
                // Reached but slow on this one name: not a failure if DoH answered recently.
                Outcome.SLOW -> if (!verified || now - lastOkAt >= RECENT_OK_MS) failed(t, now)
                Outcome.FAILED -> failed(t, now)
            }
            probeFinished.signalAll()
        } finally {
            lock.unlock()
        }
    }

    private fun failed(t: Ticket, now: Long) {
        // Lookups that went straight to DoH fail together in an outage. The first one counts
        // (and makes the next lookup the probe); the rest of the burst just use the network's
        // DNS this time. Only probes push the backoff further.
        if (t.route == Route.DOH && failures > 0) return
        failures++
        // One failure can be a blip on mobile data: probe again at once (one lookup only).
        // From the second failure in a row, wait 15 s, doubling up to 5 min.
        retryAt = if (failures < 2) now else now + minOf(15_000L shl minOf(failures - 2, 5), MAX_BACKOFF_MS)
    }

    companion object {
        const val NO_DNS = "No DNS server is answering — check your internet connection"
        /** How long a lookup waits for another lookup's DoH check before using the network's DNS. */
        const val PROBE_WAIT_MS = 1500L
        const val MAX_BACKOFF_MS = 300_000L
        /** A DoH answer this recent means the provider is reachable, so one slow answer isn't a failure. */
        const val RECENT_OK_MS = 30_000L
    }
}

/** Provider name without the "(recommended)" note, for messages. */
val DnsProvider.shortName: String get() = title.substringBefore(" (")

/**
 * Names that only the local network's own DNS can answer, so they never go to the provider.
 * Only names that can't exist on the public internet count: a single label ("router"),
 * special-use and never-delegated suffixes (.local, .lan, .home.arpa, ...) and reverse lookups
 * of private addresses. The network's search domains (from DHCP) are deliberately not trusted
 * here: a hostile Wi-Fi could announce "com" and then read or change every .com lookup. Names
 * under a search domain only get a second chance on the network's DNS when the provider says
 * they don't exist (see [SearchDomains]).
 */
object LocalNames {
    private val SUFFIXES = listOf(
        "local", "lan", "home", "home.arpa", "internal", "intranet", "localdomain", "corp",
        "private", "fritz.box",
        // Reverse lookups of private, link-local and unique-local addresses.
        "10.in-addr.arpa", "168.192.in-addr.arpa", "254.169.in-addr.arpa",
        "d.f.ip6.arpa", "8.e.f.ip6.arpa", "9.e.f.ip6.arpa", "a.e.f.ip6.arpa", "b.e.f.ip6.arpa",
    ) + (16..31).map { "$it.172.in-addr.arpa" }

    /** [name] is lowercase without a trailing dot. */
    fun isLocal(name: String): Boolean {
        if (name.isEmpty()) return false
        if (name.indexOf('.') < 0) return true // single label, e.g. "router" or "nas"
        for (s in SUFFIXES) if (under(name, s)) return true
        return false
    }

    private fun under(name: String, suffix: String) =
        name == suffix || (name.length > suffix.length && name.endsWith(suffix) && name[name.length - suffix.length - 1] == '.')
}

/**
 * The network's search domains (sent by DHCP, e.g. "corp.example.com" in an office or
 * "attlocal.net" on some home routers) hold intranet names the public internet doesn't know.
 * Such names still go to the encrypted provider first; only if it says the name doesn't exist
 * is the network's DNS asked. That keeps intranet sites working, while a hostile network
 * can't change any name that exists publicly. A search domain is only used if it has at least
 * two labels and isn't a public suffix ("com", "co.uk", ...), which would cover everyone's sites.
 */
object SearchDomains {
    /** Second-level labels used for public registrations under country codes (co.uk, com.au, ne.jp...). */
    private val CC_SECOND_LEVEL = setOf(
        "co", "com", "net", "org", "gov", "edu", "ac", "or", "ne", "go", "gob", "mil", "nic",
        "ltd", "plc", "me", "sch", "nom", "biz", "info", "int", "web", "gen", "firm", "id", "in",
    )

    /** Other well-known suffixes where anyone can get a name (hosting and dynamic-DNS services). */
    private val PUBLIC = setOf(
        "eu.org", "us.com", "uk.com", "eu.com", "de.com", "uk.net",
        "github.io", "gitlab.io", "pages.dev", "workers.dev", "netlify.app", "vercel.app",
        "herokuapp.com", "appspot.com", "blogspot.com", "web.app", "firebaseapp.com",
        "cloudfront.net", "amazonaws.com", "azurewebsites.net", "cloudapp.net", "azureedge.net",
        "duckdns.org", "dyndns.org", "no-ip.org", "no-ip.com", "ddns.net", "hopto.org",
        "ngrok.io", "ngrok-free.app", "myqnapcloud.com", "synology.me", "fly.dev", "onrender.com",
    )

    /** [domain] is specific enough to trust for intranet names. */
    fun usable(domain: String): Boolean {
        val d = normalize(domain)
        if (d.isEmpty() || d.startsWith('.') || ".." in d) return false
        if (!d.all { it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '.' || it == '_' }) return false
        val labels = d.split('.')
        if (labels.size < 2) return false // "com", "net", "lan"
        if (d in PUBLIC || d.endsWith(".arpa")) return false
        if (labels.size == 2 && labels[1].length == 2 && labels[0] in CC_SECOND_LEVEL) return false
        if (labels.all { l -> l.all { it in '0'..'9' } }) return false // an address, not a domain
        return true
    }

    /** True if [name] (lowercase, no trailing dot) lies strictly under one of the usable [domains]. */
    fun covers(name: String, domains: List<String>): Boolean {
        for (raw in domains) {
            val d = normalize(raw)
            if (d.isEmpty()) continue
            if (name.length > d.length + 1 && name.endsWith(d) && name[name.length - d.length - 1] == '.' && usable(d)) return true
        }
        return false
    }

    /** Splits LinkProperties.getDomains() ("a.example b.example", sometimes comma-separated). */
    fun parse(domains: String?): List<String> =
        domains.orEmpty().split(' ', ',', ';', '\t').map { normalize(it) }.filter { it.isNotEmpty() }.distinct()

    private fun normalize(d: String) = d.trim().trimEnd('.').lowercase()
}
