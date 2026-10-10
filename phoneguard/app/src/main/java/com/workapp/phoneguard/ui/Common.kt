package com.workapp.phoneguard.ui

import android.content.Context
import com.workapp.phoneguard.FirewallService
import com.workapp.phoneguard.NetType
import com.workapp.phoneguard.ProtectionMode
import com.workapp.phoneguard.Rules
import com.workapp.phoneguard.core.TrafficStore
import com.workapp.phoneguard.shield.Shield
import com.workapp.phoneguard.shield.ShieldCategory

/** The mode protection is running in right now, or null when it is off. */
fun runningMode(rules: Rules): ProtectionMode? {
    if (!FirewallService.running) return null
    // The service sets activeMode once it is up; until then assume the chosen mode.
    return FirewallService.activeMode ?: rules.mode
}

fun shieldCategoriesOn(context: Context): List<ShieldCategory> =
    ShieldCategory.values().filter { Shield.isEnabled(context, it) }

fun netName(net: NetType): String = when (net) {
    NetType.WIFI -> "Wi-Fi"
    NetType.MOBILE -> "mobile data"
    NetType.NONE -> "no network"
}

/** One line about the firewall, for Home and the Firewall tab. */
fun firewallSummary(rules: Rules): String {
    if (!FirewallService.running) {
        val n = rules.blockedOn(NetType.NONE).size
        return if (n == 0) "Off. Turn on protection, then choose which apps may use Wi-Fi and mobile data."
        else "Off. ${Format.count(n, "app")} will be blocked when you turn protection on."
    }
    val n = FirewallService.blockedCount
    // Web Shield site blocks are counted apart: they aren't the firewall cutting an app off.
    val attempts = TrafficStore.totalFirewallBlocked()
    return "On · using ${netName(FirewallService.currentNet)} · ${Format.count(n, "app")} blocked here" +
        if (attempts > 0) " · ${Format.firewallBlocks(attempts)}" else ""
}

/** True when Full protection is chosen but had a problem, so Basic mode is running instead. */
fun fellBackToBasic(rules: Rules): Boolean =
    FirewallService.running && FirewallService.activeMode == ProtectionMode.BASIC &&
        rules.mode == ProtectionMode.FULL && FirewallService.problem != null

/** The problem to show after a fall back to Basic mode, or null when there was none. */
fun fallbackProblem(rules: Rules): String? = if (fellBackToBasic(rules)) FirewallService.problem else null

/** "Try Full protection again": a fresh start of the service clears the fall back and retries Full mode. */
fun retryFullProtection(host: Host) {
    host.toast("Trying Full protection again…")
    host.setProtection(true)
}

/** Apps sharing an Android system identity (uid below 10000) can't be blocked by the firewall. */
fun isSystemUid(uid: Int): Boolean = uid >= 0 && uid % 100_000 < android.os.Process.FIRST_APPLICATION_UID

/** Ask before turning protection off, so a stray tap can't leave the phone unprotected. */
fun confirmTurnOff(host: Host) {
    host.dialog(
        android.app.AlertDialog.Builder(host.activity, android.R.style.Theme_Material_Dialog_Alert)
            .setTitle("Turn off protection?")
            .setMessage("Websites and apps will no longer be checked, and blocked apps can go online again.")
            .setPositiveButton("Turn off") { _, _ -> host.setProtection(false) }
            .setNegativeButton("Keep on", null)
    )
}
