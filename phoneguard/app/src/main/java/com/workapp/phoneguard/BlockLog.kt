package com.workapp.phoneguard

/** In-memory record of connections the firewall stopped. Never leaves the phone. */
object BlockLog {
    data class Entry(
        val time: Long,
        val uid: Int,
        val host: String,
        val port: Int,
        val proto: String,
    )

    private const val MAX = 400
    private val entries = ArrayDeque<Entry>()
    private val perUid = HashMap<Int, Int>()

    @Synchronized
    fun add(e: Entry) {
        entries.addFirst(e)
        while (entries.size > MAX) entries.removeLast()
        perUid[e.uid] = (perUid[e.uid] ?: 0) + 1
    }

    @Synchronized
    fun recent(): List<Entry> = entries.toList()

    @Synchronized
    fun countFor(uid: Int): Int = perUid[uid] ?: 0

    @Synchronized
    fun total(): Int = perUid.values.sum()

    @Synchronized
    fun clear() {
        entries.clear()
        perUid.clear()
    }
}
