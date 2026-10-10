package com.workapp.phoneguard

import android.content.Context
import android.content.SharedPreferences

enum class NetType { WIFI, MOBILE, NONE }

/** Per-app firewall rules and app settings, stored only on this phone. */
class Rules(context: Context) {
    private val rules: SharedPreferences =
        context.getSharedPreferences("rules", Context.MODE_PRIVATE)
    private val settings: SharedPreferences =
        context.getSharedPreferences("settings", Context.MODE_PRIVATE)

    fun isBlocked(pkg: String, net: NetType): Boolean = when (net) {
        NetType.WIFI -> rules.getBoolean("w:$pkg", false)
        NetType.MOBILE -> rules.getBoolean("d:$pkg", false)
        NetType.NONE -> isBlocked(pkg, NetType.WIFI) || isBlocked(pkg, NetType.MOBILE)
    }

    fun setBlocked(pkg: String, net: NetType, blocked: Boolean) {
        val e = rules.edit()
        if (net != NetType.MOBILE) e.putBoolean("w:$pkg", blocked)
        if (net != NetType.WIFI) e.putBoolean("d:$pkg", blocked)
        e.apply()
    }

    /** Packages that must have no internet on the given network. */
    fun blockedOn(net: NetType): Set<String> {
        val prefixes = when (net) {
            NetType.WIFI -> listOf("w:")
            NetType.MOBILE -> listOf("d:")
            NetType.NONE -> listOf("w:", "d:")
        }
        return rules.all.filter { (k, v) -> v == true && prefixes.any { k.startsWith(it) } }
            .keys.map { it.substring(2) }.toSet()
    }

    fun forget(pkg: String) {
        rules.edit().remove("w:$pkg").remove("d:$pkg").apply()
    }

    var enabled: Boolean
        get() = settings.getBoolean("enabled", false)
        set(v) = settings.edit().putBoolean("enabled", v).apply()

    /** Block internet for newly installed apps until the user allows them. */
    var lockNewApps: Boolean
        get() = settings.getBoolean("lockNewApps", true)
        set(v) = settings.edit().putBoolean("lockNewApps", v).apply()

    var lastScanTime: Long
        get() = settings.getLong("lastScanTime", 0)
        set(v) = settings.edit().putLong("lastScanTime", v).apply()

    var lastScanIssues: Int
        get() = settings.getInt("lastScanIssues", -1)
        set(v) = settings.edit().putInt("lastScanIssues", v).apply()

    var lastScanHigh: Int
        get() = settings.getInt("lastScanHigh", 0)
        set(v) = settings.edit().putInt("lastScanHigh", v).apply()

    val trusted: Set<String>
        get() = settings.getStringSet("trusted", emptySet())!!.toSet()

    fun trust(id: String) {
        settings.edit().putStringSet("trusted", trusted + id).apply()
    }

    fun clearTrusted() {
        settings.edit().remove("trusted").apply()
    }
}
