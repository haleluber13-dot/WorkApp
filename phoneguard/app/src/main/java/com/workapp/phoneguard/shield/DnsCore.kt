package com.workapp.phoneguard.shield

import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.Kind
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * The DNS answering logic behind [DnsService], with every outside dependency passed in so it
 * runs (and is tested) on a plain JVM. Thread-safe: handle() is called from several threads.
 */
internal class DnsCore(
    private val check: (String) -> Verdict?,
    private val upstream: (DnsQuery) -> UpstreamChain.Result?,
    private val cache: DnsCache,
    private val onEvent: (ConnEvent) -> Unit,
    /** Raw IPv4/IPv6 address -> the name the app asked for. */
    private val onAddress: (ByteArray, String) -> Unit,
    private val monotonic: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    @Volatile
    private var closed = false

    /** Lookups being resolved right now; identical ones wait for the first instead of piling up. */
    private val inFlight = ConcurrentHashMap<DnsCache.Key, InFlight>()

    private class InFlight {
        val done = CountDownLatch(1)
        @Volatile var result: UpstreamChain.Result? = null
    }

    /** uid+name -> when we last logged an allowed lookup, to keep the activity log readable. */
    private val recentAllowed = object : LinkedHashMap<String, Long>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > 1024
    }

    fun handle(uid: Int, raw: ByteArray): ByteArray? {
        if (closed) return null
        val q = try {
            Dns.parseQuery(raw)
        } catch (_: DnsFormatException) {
            return Dns.headerError(raw, Dns.FORMERR)
        }
        if (q.isResponse) return null
        DnsStatus.countQuery()
        if (q.opcode != 0) return Dns.errorResponse(q, Dns.NOTIMP)

        val name = q.question.key
        check(name)?.let { return blocked(uid, q, it) }

        val key = DnsCache.Key(q.question)
        cache.get(key)?.let { return fromCache(uid, q, it, stale = false) }

        val result = resolveShared(key, q)
        if (result == null) {
            // Every server failed: an old answer is better than breaking the app.
            cache.getStale(key)?.let { return fromCache(uid, q, it, stale = true) }
            return Dns.errorResponse(q, Dns.SERVFAIL)
        }
        val resp = result.response
        cnameVerdict(Dns.cnameTargets(resp))?.let { return blocked(uid, q, it) }
        for (a in Dns.addresses(resp)) onAddress(a, name)
        recordAllowed(uid, name)
        return Dns.prepareReply(resp.raw, q)
    }

    fun close() {
        closed = true
    }

    private fun fromCache(uid: Int, q: DnsQuery, e: DnsCache.Entry, stale: Boolean): ByteArray {
        cnameVerdict(e.cnames)?.let { return blocked(uid, q, it) }
        // Refresh the IP -> name map: another name may have claimed the same IP since.
        for (a in e.addresses) onAddress(a, q.question.key)
        recordAllowed(uid, q.question.key)
        return cache.reply(e, q, stale)
    }

    /**
     * Trackers often hide behind a site's own subdomain that is an alias (CNAME) for the
     * tracker's server. Checking the alias targets catches those.
     */
    private fun cnameVerdict(cnames: List<String>): Verdict? {
        for (c in cnames) check(c)?.let { return it }
        return null
    }

    private fun blocked(uid: Int, q: DnsQuery, v: Verdict): ByteArray {
        DnsStatus.countBlocked()
        onEvent(ConnEvent(System.currentTimeMillis(), uid, Kind.DNS, VIRTUAL_DNS, 53, q.question.key, true, v.reason))
        return Dns.blockedResponse(q)
    }

    private fun recordAllowed(uid: Int, name: String) {
        val now = monotonic()
        val k = "$uid $name"
        synchronized(recentAllowed) {
            val last = recentAllowed[k]
            if (last != null && now - last < ALLOWED_LOG_GAP_MS) return
            recentAllowed[k] = now
        }
        onEvent(ConnEvent(System.currentTimeMillis(), uid, Kind.DNS, VIRTUAL_DNS, 53, name, false))
    }

    private fun resolveShared(key: DnsCache.Key, q: DnsQuery): UpstreamChain.Result? {
        val mine = InFlight()
        val leader = inFlight.putIfAbsent(key, mine)
        if (leader != null) {
            try {
                leader.done.await(FOLLOWER_WAIT_MS, TimeUnit.MILLISECONDS)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
                return null
            }
            return leader.result
        }
        try {
            val r = try { upstream(q) } catch (_: Exception) { null }
            // Cache before letting followers go, so a lookup arriving just after finds it.
            if (r != null) cache.put(key, r.response)
            mine.result = r
        } finally {
            inFlight.remove(key, mine)
            mine.done.countDown()
        }
        return mine.result
    }

    companion object {
        /** The DNS server address apps see inside the VPN. */
        const val VIRTUAL_DNS = "10.215.173.53"
        const val ALLOWED_LOG_GAP_MS = 30_000L
        const val FOLLOWER_WAIT_MS = 15_000L
    }
}
