package com.workapp.phoneguard.ui

import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.Kind
import java.net.IDN
import java.util.Locale

// Pure text helpers (no android.*), so they can be unit tested.
object Format {
    /** Uploading this much with the screen off is worth pointing out. */
    const val SCREEN_OFF_NOTABLE = 100L * 1024

    /** "0 B", "850 B", "1.2 KB", "34 KB", "5.6 MB", "1.25 GB". */
    fun bytes(b: Long): String {
        if (b < 1024) return "${b.coerceAtLeast(0)} B"
        val units = arrayOf("KB", "MB", "GB", "TB")
        var v = b / 1024.0
        var i = 0
        while (v >= 1024 && i < units.size - 1) {
            v /= 1024
            i++
        }
        // Rounding could show "1024 KB"; move up a unit instead.
        if (v >= 999.95 && i < units.size - 1) {
            v /= 1024
            i++
        }
        val text = when {
            v >= 100 -> String.format(Locale.US, "%.0f", v)
            v >= 10 -> String.format(Locale.US, "%.1f", v)
            else -> String.format(Locale.US, if (i >= 2) "%.2f" else "%.1f", v)
        }
        return "${trimZeros(text)} ${units[i]}"
    }

    private fun trimZeros(s: String): String =
        if (s.contains('.')) s.trimEnd('0').trimEnd('.') else s

    /** "1 app", "3 apps". */
    fun count(n: Number, one: String, many: String = one + "s"): String =
        "$n ${if (n.toLong() == 1L) one else many}"

    /** Where a connection went: the site name if known, otherwise IP and port. */
    fun endpoint(e: ConnEvent): String {
        val d = e.domain
        if (!d.isNullOrEmpty()) return if (e.kind == Kind.DNS || e.port == 443 || e.port == 80 || e.port <= 0) d else "$d, port ${e.port}"
        val host = if (e.host.contains(':')) "[${e.host}]" else e.host
        return if (e.port > 0) "$host:${e.port}" else host
    }

    /** Plain name for the kind of traffic. */
    fun kind(k: Kind): String = when (k) {
        Kind.DNS -> "Site lookup"
        Kind.TCP -> "Connection"
        Kind.UDP -> "Connection (UDP)"
    }

    /**
     * Turns what a person typed ("https://www.Example.com/login") into a domain
     * ("example.com"), or null if it isn't a usable site name.
     */
    fun normalizeDomain(input: String): String? {
        var s = input.trim().lowercase(Locale.ROOT)
        if (s.isEmpty()) return null
        s = s.substringAfter("://")
        s = s.substringBefore('/').substringBefore('?').substringBefore('#')
        s = s.substringAfterLast('@')
        if (s.startsWith('[')) return null // IPv6 literal
        s = s.substringBefore(':')
        s = s.trimEnd('.')
        if (s.startsWith("*.")) s = s.substring(2)
        if (s.startsWith("www.") && s.count { it == '.' } >= 2) s = s.substring(4)
        s = try { IDN.toASCII(s, IDN.ALLOW_UNASSIGNED).lowercase(Locale.ROOT) } catch (_: Exception) { return null }
        if (s.length > 253 || !s.contains('.')) return null
        val labels = s.split('.')
        for (l in labels) {
            if (l.isEmpty() || l.length > 63) return null
            if (l.startsWith('-') || l.endsWith('-')) return null
            if (!l.all { it in 'a'..'z' || it in '0'..'9' || it == '-' }) return null
        }
        // An all-number last part means an IP address, not a site name.
        if (labels.last().all { it.isDigit() }) return null
        return s
    }

    /** "3 connections stopped by the firewall". */
    fun firewallBlocks(n: Int): String = count(n, "connection") + " stopped by the firewall"

    /** "12 dangerous or tracking sites blocked" (Web Shield blocks, not the firewall). */
    fun siteBlocks(n: Number): String = count(n, "dangerous or tracking site") + " blocked"

    /** Firewall and Web Shield counts for one app, leaving out the ones that are zero. */
    fun blockParts(firewall: Int, sites: Int): List<String> = buildList {
        if (firewall > 0) add(firewallBlocks(firewall))
        if (sites > 0) add(siteBlocks(sites))
    }

    private val VIA = Regex("\\(via\\s+([^()\\s]+)\\s*\\)", RegexOption.IGNORE_CASE)

    /**
     * The alias target named in a Web Shield block reason such as
     * "Ads & trackers (via tracker.example.net)", or null if there is none or it isn't a usable site name.
     */
    fun viaTarget(reason: String?): String? {
        if (reason.isNullOrBlank()) return null
        val raw = VIA.find(reason)?.groupValues?.getOrNull(1) ?: return null
        return normalizeDomain(raw)
    }

    /** Text for an empty "Blocked" list. [totalBlocked] counts everything blocked since counting started. */
    fun emptyBlockedText(running: Boolean, totalBlocked: Int): String = when {
        totalBlocked > 0 -> "Older blocked attempts are no longer in this list. Only the latest ones are kept."
        !running -> "Nothing to show. Turn on protection to see what gets blocked."
        else -> "Nothing blocked yet. When a site or app is blocked, it shows up here."
    }

    /** Top [limit] entries of a domain -> count map, most first, ties by name. */
    fun top(map: Map<String, Int>, limit: Int): List<Pair<String, Int>> =
        map.entries.sortedWith(compareByDescending<Map.Entry<String, Int>> { it.value }.thenBy { it.key })
            .take(limit).map { it.key to it.value }
}
