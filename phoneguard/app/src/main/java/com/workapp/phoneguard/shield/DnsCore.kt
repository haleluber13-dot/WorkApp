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
    /** True if the user's own allowlist covers the name; then its aliases (CNAMEs) aren't checked. */
    private val userAllowed: (String) -> Boolean = { false },
    /**
     * False while the blocklists are still loading. Answers given then aren't filtered yet, so
     * they get a short TTL and apps ask again soon, once filtering is on.
     */
    private val filtering: () -> Boolean = { true },
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
        cnameVerdict(name, Dns.cnameTargets(resp))?.let { return blocked(uid, q, it) }
        for (a in Dns.addresses(resp)) onAddress(a, name)
        recordAllowed(uid, name)
        val out = Dns.prepareReply(resp.raw, q)
        if (!filtering()) {
            val records = resp.answers + resp.authority + resp.additional
            capTtls(out, records.filter { it.type != Dns.TYPE_OPT }.map { it.ttlOffset }.toIntArray())
        }
        return out
    }

    fun close() {
        closed = true
    }

    private fun fromCache(uid: Int, q: DnsQuery, e: DnsCache.Entry, stale: Boolean): ByteArray {
        cnameVerdict(q.question.key, e.cnames)?.let { return blocked(uid, q, it) }
        // Refresh the IP -> name map: another name may have claimed the same IP since.
        for (a in e.addresses) onAddress(a, q.question.key)
        recordAllowed(uid, q.question.key)
        val out = cache.reply(e, q, stale)
        if (!filtering()) capTtls(out, e.ttlOffsets)
        return out
    }

    /** Lowers every TTL in [msg] (at [offsets]) to at most [UNFILTERED_TTL]. */
    private fun capTtls(msg: ByteArray, offsets: IntArray) {
        for (off in offsets) {
            if (off < 0 || off + 4 > msg.size) continue
            if (Dns.u32(msg, off) > UNFILTERED_TTL) Dns.putU32(msg, off, UNFILTERED_TTL)
        }
    }

    /**
     * Trackers often hide behind a site's own subdomain that is an alias (CNAME) for the
     * tracker's server. Checking the alias targets catches those. If the user allowed the name
     * they asked for (or a parent), its aliases are not checked, so "always allow" works.
     * The verdict names the alias, so the activity log shows what else could be allowed.
     */
    private fun cnameVerdict(name: String, cnames: List<String>): Verdict? {
        if (cnames.isEmpty() || userAllowed(name)) return null
        for (c in cnames) check(c)?.let { return it.copy(via = c) }
        return null
    }

    private fun blocked(uid: Int, q: DnsQuery, v: Verdict): ByteArray {
        DnsStatus.countBlocked(q.question.key, monotonic())
        onEvent(ConnEvent(System.currentTimeMillis(), uid, Kind.DNS, VIRTUAL_DNS, 53, q.question.key, true, v.reason, byShield = true))
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
            val gen = cache.generation
            val r = try { upstream(q) } catch (_: Exception) { null }
            // Cache before letting followers go, so a lookup arriving just after finds it. Not
            // if the network changed meanwhile (the cache was cleared): the answer may be the
            // old network's.
            if (r != null) cache.put(key, r.response, gen)
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
        /** TTL (seconds) of answers given before the blocklists have finished loading. */
        const val UNFILTERED_TTL = 10L
    }
}
