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
    private val events = ArrayDeque<ConnEvent>()
    private val apps = HashMap<Int, MutableApp>()
    private var started = System.currentTimeMillis()

    private class MutableApp(val uid: Int) {
        var sent = 0L
        var received = 0L
        var sentScreenOff = 0L
        var receivedScreenOff = 0L
        var connections = 0
        var blocked = 0
        var lastSeen = 0L
        val domains = HashMap<String, Int>()
        val blockedDomains = HashMap<String, Int>()
    }

    @Synchronized
    fun onEvent(e: ConnEvent) {
        events.addFirst(e)
        while (events.size > MAX_EVENTS) events.removeLast()
        val a = apps.getOrPut(e.uid) { MutableApp(e.uid) }
        a.lastSeen = e.time
        if (e.blocked) a.blocked++ else if (e.kind != Kind.DNS) a.connections++
        val d = e.domain
        if (d != null && a.domains.size < 2000) {
            val target = if (e.blocked) a.blockedDomains else a.domains
            target[d] = (target[d] ?: 0) + 1
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

    /** Snapshot of all apps seen, most data sent first. */
    @Synchronized
    fun apps(): List<AppTraffic> = apps.values.map { it.snapshot() }.sortedByDescending { it.sent }

    @Synchronized
    fun app(uid: Int): AppTraffic? = apps[uid]?.snapshot()

    @Synchronized
    fun totalBlocked(): Int = apps.values.sumOf { it.blocked }

    @Synchronized
    fun blockedFor(uid: Int): Int = apps[uid]?.blocked ?: 0

    /** When counting started (process start or last clear). */
    @Synchronized
    fun since(): Long = started

    @Synchronized
    fun clear() {
        events.clear()
        apps.clear()
        started = System.currentTimeMillis()
    }

    private fun MutableApp.snapshot() = AppTraffic(
        uid, sent, received, sentScreenOff, receivedScreenOff, connections, blocked, lastSeen,
        domains.toMap(), blockedDomains.toMap(),
    )
}

data class AppTraffic(
    val uid: Int,
    val sent: Long,
    val received: Long,
    val sentScreenOff: Long,
    val receivedScreenOff: Long,
    val connections: Int,
    val blocked: Int,
    val lastSeen: Long,
    /** Domain -> times contacted. */
    val domains: Map<String, Int>,
    /** Domain -> times blocked. */
    val blockedDomains: Map<String, Int>,
)
