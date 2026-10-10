package com.workapp.phoneguard.core

import java.net.InetAddress

/**
 * Shared contracts between the packet engine (net/), the DNS shield (shield/),
 * the device checks and the UI. Keep these signatures stable.
 */

enum class Kind { TCP, UDP, DNS }

/** One connection attempt or DNS lookup seen by the firewall. */
data class ConnEvent(
    val time: Long,
    val uid: Int,
    val kind: Kind,
    /** Destination IP as text (for DNS events: the DNS server). */
    val host: String,
    val port: Int,
    /** Domain name, if known (DNS question, or reverse-mapped from earlier DNS answers). */
    val domain: String?,
    val blocked: Boolean,
    /** Why it was blocked, in plain words, e.g. "Firewall: no Wi-Fi", "Phishing site". */
    val reason: String? = null,
    /** True when the Web Shield (a blocklist) blocked it; false for firewall blocks. */
    val byShield: Boolean = false,
)

/** Answers DNS queries captured by the engine. Called on a background thread; may block. */
interface DnsHandler {
    /**
     * @param uid app that asked (or -1 if unknown)
     * @param query the raw DNS message (UDP payload)
     * @return a complete DNS response message to send back, or null to drop the query.
     */
    fun handle(uid: Int, query: ByteArray): ByteArray?
}

/** Decides whether an app may use the network right now (firewall rules for the current network). */
interface FirewallPolicy {
    /**
     * @param uid the app's uid, or -1 when the owner couldn't be identified (in practice the
     * socket is already gone). For -1 the answer means "may an unidentified app connect":
     * the service allows it only while no app is blocked on the current network.
     */
    fun isAllowed(uid: Int): Boolean
}

/** IP address -> domain name, learned from DNS answers, so connections can be shown by name. */
object DomainMap {
    private const val MAX = 20_000
    private val map = object : LinkedHashMap<String, String>(1024, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, String>?) = size > MAX
    }

    @Synchronized
    fun put(ip: InetAddress, domain: String) {
        map[ip.hostAddress ?: return] = domain
    }

    @Synchronized
    fun get(ip: String): String? = map[ip]

    @Synchronized
    fun clear() = map.clear()
}
