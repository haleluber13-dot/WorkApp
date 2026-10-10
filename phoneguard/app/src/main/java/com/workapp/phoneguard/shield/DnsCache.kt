package com.workapp.phoneguard.shield

/**
 * Thread-safe LRU cache of DNS responses keyed by (name, type, class). Entries are fresh for
 * their TTL (see [Dns.cacheTtl]) and then kept as "stale" for up to [staleMs], so that if every
 * DNS server is unreachable we can still answer with the last known address (RFC 8767)
 * instead of breaking the app.
 */
class DnsCache(
    private val maxEntries: Int = 4096,
    private val staleMs: Long = 6 * 60 * 60 * 1000L,
    /** Milliseconds from a monotonic clock, so changing the phone's time can't confuse expiry. */
    private val clock: () -> Long = { System.nanoTime() / 1_000_000 },
) {
    data class Key(val name: String, val type: Int, val qclass: Int) {
        constructor(q: Question) : this(q.key, q.type, q.qclass)
    }

    class Entry(
        val response: ByteArray,
        /** Offsets of TTL fields to count down (the EDNS OPT record is skipped: its "TTL" is flags). */
        val ttlOffsets: IntArray,
        val ttls: LongArray,
        val storedAt: Long,
        val expiresAt: Long,
        val addresses: List<ByteArray>,
        val cnames: List<String>,
    )

    private val map = object : LinkedHashMap<Key, Entry>(256, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Key, Entry>?) = size > maxEntries
    }

    /** Stores [resp] if it is cacheable. Returns true if stored. */
    fun put(key: Key, resp: DnsResponse): Boolean {
        val ttl = Dns.cacheTtl(resp) ?: return false
        val records = resp.answers + resp.authority + resp.additional
        val timed = records.filter { it.type != Dns.TYPE_OPT }
        val now = clock()
        val e = Entry(
            resp.raw.copyOf(),
            IntArray(timed.size) { timed[it].ttlOffset },
            LongArray(timed.size) { timed[it].ttl },
            now,
            now + ttl * 1000,
            Dns.addresses(resp),
            Dns.cnameTargets(resp),
        )
        synchronized(map) { map[key] = e }
        return true
    }

    /** A fresh entry, or null. */
    fun get(key: Key): Entry? {
        val now = clock()
        synchronized(map) {
            val e = map[key] ?: return null
            return if (now < e.expiresAt && now >= e.storedAt) e else null
        }
    }

    /** An entry even if expired (but not older than the stale limit), for when upstream is down. */
    fun getStale(key: Key): Entry? {
        val now = clock()
        synchronized(map) {
            val e = map[key] ?: return null
            if (now - e.expiresAt > staleMs) {
                map.remove(key)
                return null
            }
            return e
        }
    }

    /**
     * The cached response rewritten for [q]: its ID and spelling, and every TTL reduced by the
     * time spent in the cache (at least 1 s). Stale answers get a 30 s TTL so apps ask again soon.
     */
    fun reply(e: Entry, q: DnsQuery, stale: Boolean = false): ByteArray {
        val out = Dns.prepareReply(e.response, q)
        val elapsed = ((clock() - e.storedAt) / 1000).coerceAtLeast(0)
        for (i in e.ttlOffsets.indices) {
            val ttl = if (stale) STALE_TTL else (e.ttls[i] - elapsed).coerceAtLeast(1)
            Dns.putU32(out, e.ttlOffsets[i], ttl)
        }
        return out
    }

    fun clear() = synchronized(map) { map.clear() }

    val size: Int get() = synchronized(map) { map.size }

    companion object {
        const val STALE_TTL = 30L
    }
}
