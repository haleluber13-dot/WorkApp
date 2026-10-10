package com.workapp.phoneguard.shield

import android.content.Context
import android.net.ConnectivityManager
import android.net.LinkProperties
import android.net.Network
import android.net.NetworkCapabilities
import android.os.SystemClock
import android.util.Log
import com.workapp.phoneguard.core.DnsHandler
import com.workapp.phoneguard.core.DomainMap
import com.workapp.phoneguard.core.TrafficStore
import java.io.Closeable
import java.io.IOException
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.net.UnknownHostException
import java.util.concurrent.ConcurrentHashMap
import javax.net.ssl.HttpsURLConnection
import kotlin.concurrent.thread

enum class DnsProvider(val title: String, val description: String, val dohUrl: String?) {
    QUAD9("Quad9 (recommended)", "Encrypted. Also blocks malware sites. Swiss non-profit, no logging of your IP.", "https://dns.quad9.net/dns-query"),
    CLOUDFLARE("Cloudflare Security", "Encrypted. Fast. Also blocks malware sites.", "https://security.cloudflare-dns.com/dns-query"),
    GOOGLE("Google", "Encrypted. No extra blocking.", "https://dns.google/dns-query"),
    NETWORK("Your network's DNS", "Not encrypted: the Wi-Fi or mobile network can see and change your lookups.", null),
}

/** Which DNS provider to use. Stored in SharedPreferences "shield", key "provider". */
object DnsSettings {
    private const val KEY = "provider"

    // Read on every lookup, so keep it in memory after the first read.
    @Volatile private var cached: DnsProvider? = null

    fun provider(context: Context): DnsProvider {
        cached?.let { return it }
        val name = context.applicationContext.getSharedPreferences("shield", Context.MODE_PRIVATE).getString(KEY, null)
        val p = DnsProvider.values().firstOrNull { it.name == name } ?: DnsProvider.QUAD9
        cached = p
        return p
    }

    fun setProvider(context: Context, p: DnsProvider) {
        context.applicationContext.getSharedPreferences("shield", Context.MODE_PRIVATE).edit().putString(KEY, p.name).apply()
        cached = p
    }
}

/** Live status of the DNS path, for the UI. */
object DnsStatus {
    /** True while lookups are going out encrypted to the chosen provider. */
    @Volatile var encrypted: Boolean = false
    /** Plain-words problem, e.g. "Quad9 unreachable, using network DNS". Null when fine. */
    @Volatile var problem: String? = null
    @Volatile var queries: Long = 0
    /**
     * Blocked sites since start. The same name blocked again within [BLOCKED_REPEAT_MS] counts
     * once, so an app asking for a name's IPv4 and IPv6 address (two lookups), or retrying,
     * doesn't count it twice. A name blocked again later counts again.
     */
    @Volatile var blocked: Long = 0

    const val BLOCKED_REPEAT_MS = 5_000L

    /** name -> when it last counted as blocked (monotonic ms). */
    private val recentBlocked = object : LinkedHashMap<String, Long>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > 512
    }

    // The counters are bumped from several threads; ++ on a volatile is not atomic.
    @Synchronized internal fun countQuery() { queries++ }

    /** Counts a block of [name] unless it already counted within the last 5 s. [nowMs] is monotonic. */
    @Synchronized internal fun countBlocked(name: String, nowMs: Long) {
        val last = recentBlocked[name]
        if (last != null && nowMs - last in 0 until BLOCKED_REPEAT_MS) return
        recentBlocked[name] = nowMs
        blocked++
    }
}

/**
 * Answers DNS for all apps: blocks domains on enabled lists (answers 0.0.0.0 / ::),
 * forwards the rest over DNS-over-HTTPS to the chosen provider, falling back to the
 * network's own DNS so the internet keeps working. Records answers in DomainMap and
 * lookups in TrafficStore.
 *
 * PhoneGuard itself is excluded from the VPN, so the sockets and HTTPS connections made here
 * go straight to the real network; they are also bound to it explicitly for safety.
 */
class DnsService(context: Context) : DnsHandler {
    private val app = context.applicationContext
    private val cm = app.getSystemService(ConnectivityManager::class.java)
    private val openSockets: MutableSet<Closeable> = ConcurrentHashMap.newKeySet()

    /** The real network and its DNS servers, refreshed on network changes or after 5 s. */
    private class NetInfo(
        val network: Network?,
        val servers: List<InetAddress>,
        val at: Long,
    )
    @Volatile private var net: NetInfo? = null

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = onNetworkChanged()
        override fun onLost(network: Network) = onNetworkChanged()
        override fun onLinkPropertiesChanged(network: Network, lp: LinkProperties) { net = null }
    }
    private var callbackRegistered = false

    /** Lookups wait for the blocklists to load only until then (elapsedRealtime ms), see handle(). */
    private val listWaitUntil = SystemClock.elapsedRealtime() + LIST_WAIT_MS

    private val cache = DnsCache(clock = { SystemClock.elapsedRealtime() })

    private val udp = UdpDns(
        timeoutMs = 3000,
        bindUdp = { s -> currentNet().network?.bindSocket(s) },
        bindTcp = { s -> currentNet().network?.bindSocket(s) },
        open = openSockets,
    )

    private val doh = DohClient(
        connect = { host, port, timeout -> connectOnRealNetwork(host, port, timeout) },
        verify = { host, session -> HttpsURLConnection.getDefaultHostnameVerifier().verify(host, session) },
        openHttp1 = { u -> currentNet().network?.openConnection(u) ?: throw IOException("no network") },
    )

    private val chain = UpstreamChain(
        provider = { DnsSettings.provider(app) },
        doh = { url, body -> doh.query(url, body) },
        servers = { currentNet().servers },
        udp = { q, server -> udp.query(q, server) },
        networkId = { currentNet().network },
        status = { encrypted, problem ->
            DnsStatus.encrypted = encrypted
            DnsStatus.problem = problem
        },
    )

    private val core = DnsCore(
        check = { Shield.checkDetailed(it) },
        upstream = { chain.resolve(it) },
        cache = cache,
        onEvent = { TrafficStore.onEvent(it) },
        onAddress = { addr, name ->
            try {
                DomainMap.put(InetAddress.getByAddress(addr), name)
            } catch (_: Exception) {
            }
        },
        monotonic = { SystemClock.elapsedRealtime() },
        userAllowed = { Shield.isUserAllowed(it) },
        filtering = { Shield.isLoaded() },
    )

    init {
        try {
            cm?.registerDefaultNetworkCallback(callback)
            callbackRegistered = true
        } catch (e: Exception) {
            Log.w("PhoneGuard", "DnsService: no network callback, using a 5 s refresh only", e)
        }
        // Load the lists in the background; the first lookups wait a little for it in handle().
        thread(name = "pg-shield-init", isDaemon = true) { Shield.init(app) }
    }

    override fun handle(uid: Int, query: ByteArray): ByteArray? = try {
        // Right after start, wait for the lists to load, but only up to LIST_WAIT_MS after the
        // service started (in total, not per lookup): a slow first load (parsing the bundled
        // lists after an install) must not stall the internet. Until the lists are in, answers
        // aren't filtered and get a short TTL, so apps ask again once filtering is on.
        if (!Shield.isLoaded()) {
            val left = listWaitUntil - SystemClock.elapsedRealtime()
            if (left > 0) Shield.awaitLoaded(left)
        }
        core.handle(uid, query)
    } catch (e: Exception) {
        Log.w("PhoneGuard", "DnsService: lookup failed", e)
        Dns.headerError(query, Dns.SERVFAIL) // fail fast rather than make the app wait
    }

    /**
     * The phone moved to a different network (Wi-Fi <-> mobile, or another Wi-Fi). Called by
     * the firewall service and by our own network callback. Drops cached answers (some may
     * have come from the old network's own DNS, which could have forged them), drops DoH
     * connections from the old network (they would only time out) and checks DoH again at once.
     */
    fun onNetworkChanged() {
        net = null
        cache.clear()
        doh.closeAll()
        chain.networkChanged()
    }

    /** Release sockets/threads. */
    fun close() {
        core.close()
        doh.closeAll()
        for (s in openSockets) try { s.close() } catch (_: Exception) {}
        openSockets.clear()
        if (callbackRegistered) {
            try { cm?.unregisterNetworkCallback(callback) } catch (_: Exception) {}
            callbackRegistered = false
        }
    }

    private fun currentNet(): NetInfo {
        val now = SystemClock.elapsedRealtime()
        net?.let { if (now - it.at in 0 until 5000) return it }
        val fresh = try { readNet(now) } catch (e: Exception) { NetInfo(null, emptyList(), now) }
        net = fresh
        return fresh
    }

    /**
     * TCP connection for DoH, bound to the real network. For the built-in providers the
     * well-known addresses are tried first: that needs no plain DNS lookup (which the network
     * could see, block or slow down). TLS still checks the certificate for the provider's name.
     */
    private fun connectOnRealNetwork(host: String, port: Int, timeoutMs: Int): Socket {
        val n = currentNet().network ?: throw IOException("no network")
        val known = DohClient.BOOTSTRAP[host].orEmpty().map { InetAddress.getByName(it) } // IP literals: no lookup
        var last: IOException? = null
        fun attempt(a: InetAddress): Socket? {
            val s = n.socketFactory.createSocket()
            return try {
                s.connect(InetSocketAddress(a, port), timeoutMs)
                s
            } catch (e: IOException) {
                s.close()
                last = e
                null
            }
        }
        for (a in known.take(2)) attempt(a)?.let { return it }
        val resolved = try {
            n.getAllByName(host).filter { it !in known }
        } catch (e: UnknownHostException) {
            if (known.isEmpty()) throw e
            emptyList()
        }
        for (a in resolved.take(2)) attempt(a)?.let { return it }
        throw last ?: IOException("can't connect to $host")
    }

    private fun isVpn(n: Network): Boolean =
        cm?.getNetworkCapabilities(n)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true

    @Suppress("DEPRECATION") // allNetworks: still the simplest way to find a non-VPN network
    private fun readNet(now: Long): NetInfo {
        val cm = cm ?: return NetInfo(null, emptyList(), now)
        var n: Network? = cm.activeNetwork
        // Our own app is outside the VPN, so this should already be the real network; never
        // send DNS into a VPN (that would loop back into ourselves).
        if (n != null && isVpn(n)) n = null
        if (n == null) {
            n = cm.allNetworks.firstOrNull {
                val c = cm.getNetworkCapabilities(it)
                c != null && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN) &&
                    c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            }
        }
        if (n == null) return NetInfo(null, emptyList(), now)
        val lp = cm.getLinkProperties(n)
        var servers = lp?.dnsServers.orEmpty()
            .filter { it.hostAddress != DnsCore.VIRTUAL_DNS && !it.isAnyLocalAddress && !it.isLoopbackAddress }
        if (servers.isEmpty()) servers = FALLBACK_SERVERS
        return NetInfo(n, servers, now)
    }

    private companion object {
        /** Longest time lookups wait for the blocklists after the service starts. */
        const val LIST_WAIT_MS = 2000L

        /** Used only if the network announces no DNS servers at all. Plain DNS, Quad9 and Cloudflare. */
        val FALLBACK_SERVERS: List<InetAddress> = listOf(
            InetAddress.getByAddress(byteArrayOf(9, 9, 9, 9)),
            InetAddress.getByAddress(byteArrayOf(1, 1, 1, 1)),
        )
    }
}
