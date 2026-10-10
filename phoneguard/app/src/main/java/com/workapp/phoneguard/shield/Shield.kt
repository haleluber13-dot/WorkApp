package com.workapp.phoneguard.shield

import android.content.Context

// STUB — owned by the Web Shield agent. Keep public signatures; replace bodies.

enum class ShieldCategory(val title: String, val description: String, val defaultOn: Boolean) {
    MALWARE("Malware", "Sites that spread viruses and malicious apps", true),
    PHISHING("Phishing & scams", "Fake login pages and scam sites that steal passwords and money", true),
    STALKERWARE("Stalkerware servers", "Servers that spy apps send your data to", true),
    TRACKERS("Ads & trackers", "Companies that follow you across apps and websites", true),
}

data class ListInfo(val category: ShieldCategory, val domains: Int, val updatedAt: Long, val source: String)

/** Domain blocklists. All methods are thread-safe. */
object Shield {
    /** Load lists (bundled or last downloaded). Blocking; call off the main thread. Safe to call repeatedly. */
    fun init(context: Context) {}

    /** The category that blocks [domain] (checks parent domains too), or null if allowed. Fast; called per DNS query. */
    fun check(domain: String): ShieldCategory? = null

    fun isEnabled(context: Context, c: ShieldCategory): Boolean = c.defaultOn
    fun setEnabled(context: Context, c: ShieldCategory, on: Boolean) {}

    /** User allowlist: never block these (and their subdomains). */
    fun allowed(context: Context): Set<String> = emptySet()
    fun allow(context: Context, domain: String) {}
    fun unallow(context: Context, domain: String) {}

    /** User denylist: always block these (and their subdomains). */
    fun denied(context: Context): Set<String> = emptySet()
    fun deny(context: Context, domain: String) {}
    fun undeny(context: Context, domain: String) {}

    fun listInfo(context: Context): List<ListInfo> = emptyList()

    /** Download fresh lists now. Blocking network call; returns true if at least one list updated. */
    fun updateNow(context: Context): Boolean = false

    /** Schedule periodic (weekly, on unmetered network) list updates. */
    fun scheduleUpdates(context: Context) {}
}
