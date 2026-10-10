package com.workapp.phoneguard.core

/**
 * In-memory traffic statistics for the life of the process. Nothing leaves the phone.
 * Producers: the engine (connections, bytes) and the DNS shield (lookups).
 * Consumer: the UI.
 */
object TrafficStore {
    /** Set by the firewall service from screen on/off broadcasts. */
    @Volatile
    var screenOn: Boolean = true

    private const val MAX_EVENTS = 1000
    private const val MAX_BLOCKED_EVENTS = 1000
    private const val MAX_DOMAINS = 2000
    private val events = ArrayDeque<ConnEvent>()
    /** Blocked events only, kept apart so busy allowed traffic can't push them out of the log. */
    private val blockedEvents = ArrayDeque<ConnEvent>()
    private val apps = HashMap<Int, MutableApp>()
    private var started = System.currentTimeMillis()

    private class MutableApp(val uid: Int) {
        var sent = 0L
        var received = 0L
        var sentScreenOff = 0L
        var receivedScreenOff = 0L
        var connections = 0
        var blocked = 0
        /** Connections the firewall stopped (TCP/UDP events). */
        var firewallBlocked = 0
        /** Site lookups the Web Shield blocked (DNS events). */
        var siteBlocked = 0
        var lastSeen = 0L
        val domains = HashMap<String, Int>()
        val blockedDomains = HashMap<String, Int>()
    }

    @Synchronized
    fun onEvent(e: ConnEvent) {
        events.addFirst(e)
        while (events.size > MAX_EVENTS) events.removeLast()
        if (e.blocked) {
            blockedEvents.addFirst(e)
            while (blockedEvents.size > MAX_BLOCKED_EVENTS) blockedEvents.removeLast()
        }
        val a = apps.getOrPut(e.uid) { MutableApp(e.uid) }
        a.lastSeen = e.time
        if (e.blocked) {
            a.blocked++
            if (e.kind == Kind.DNS) a.siteBlocked++ else a.firewallBlocked++
        } else if (e.kind != Kind.DNS) {
            a.connections++
        }
        val d = e.domain
        if (d != null) {
            val target = if (e.blocked) a.blockedDomains else a.domains
            if (target.size < MAX_DOMAINS || d in target) target[d] = (target[d] ?: 0) + 1
        }
    }

    @Synchronized
    fun onBytes(uid: Int, sent: Long, received: Long) {
        val a = apps.getOrPut(uid) { MutableApp(uid) }
        a.sent += sent
        a.received += received
        if (!screenOn) {
            a.sentScreenOff += sent
            a.receivedScreenOff += received
        }
        a.lastSeen = System.currentTimeMillis()
    }

    @Synchronized
    fun recent(limit: Int = 500): List<ConnEvent> = events.take(limit)

    /** Latest blocked events (firewall and Web Shield), newest first. Kept longer than [recent]. */
    @Synchronized
    fun recentBlocked(limit: Int = 500): List<ConnEvent> = blockedEvents.take(limit)

    /** Snapshot of all apps seen, most data sent first. */
    @Synchronized
    fun apps(): List<AppTraffic> = apps.values.map { it.snapshot() }.sortedByDescending { it.sent }

    @Synchronized
    fun app(uid: Int): AppTraffic? = apps[uid]?.snapshot()

    @Synchronized
    fun totalBlocked(): Int = apps.values.sumOf { it.blocked }

    @Synchronized
    fun blockedFor(uid: Int): Int = apps[uid]?.blocked ?: 0

    /** Connections stopped by the firewall (all apps). Excludes Web Shield site blocks. */
    @Synchronized
    fun totalFirewallBlocked(): Int = apps.values.sumOf { it.firewallBlocked }

    /** Site lookups blocked by the Web Shield (all apps). */
    @Synchronized
    fun totalSiteBlocked(): Int = apps.values.sumOf { it.siteBlocked }

    /** When counting started (process start or last clear). */
    @Synchronized
    fun since(): Long = started

    @Synchronized
    fun clear() {
        events.clear()
        blockedEvents.clear()
        apps.clear()
        started = System.currentTimeMillis()
    }

    private fun MutableApp.snapshot() = AppTraffic(
        uid, sent, received, sentScreenOff, receivedScreenOff, connections, blocked, lastSeen,
        domains.toMap(), blockedDomains.toMap(), firewallBlocked, siteBlocked,
    )
}

data class AppTraffic(
    val uid: Int,
    val sent: Long,
    val received: Long,
    val sentScreenOff: Long,
    val receivedScreenOff: Long,
    val connections: Int,
    /** Everything blocked for this app: [firewallBlocked] + [siteBlocked]. */
    val blocked: Int,
    val lastSeen: Long,
    /** Domain -> times contacted. */
    val domains: Map<String, Int>,
    /** Domain -> times blocked. */
    val blockedDomains: Map<String, Int>,
    /** Connections the firewall stopped (the app is blocked on this network). */
    val firewallBlocked: Int = 0,
    /** Dangerous or tracking site lookups the Web Shield blocked. Not a firewall block. */
    val siteBlocked: Int = 0,
)
