package com.workapp.phoneguard.ui

import com.workapp.phoneguard.ProtectionMode

// The overall "am I protected?" verdict for the Home screen. Pure logic, unit tested.

enum class Level { PROTECTED, PARTIAL, OFF }

data class StatusInput(
    val running: Boolean,
    /** Mode the firewall is actually running in (null if unknown or off). */
    val mode: ProtectionMode?,
    /** At least one Web Shield list is switched on. */
    val shieldOn: Boolean,
    val dnsEncrypted: Boolean,
    val dnsProblem: String?,
    /** DNS lookups answered so far; 0 right after starting. */
    val dnsQueries: Long,
    /** False when the user picked their network's own (unencrypted) DNS. */
    val providerEncrypts: Boolean,
    val scanned: Boolean,
    val scanHigh: Int,
    val batteryExempt: Boolean,
)

data class Issue(val text: String, val serious: Boolean = false)

data class ProtectionStatus(val level: Level, val title: String, val summary: String, val issues: List<Issue>)

object Status {
    fun evaluate(s: StatusInput): ProtectionStatus {
        val issues = ArrayList<Issue>()
        if (s.running) {
            if (s.mode == ProtectionMode.BASIC) {
                issues += Issue("Basic mode is on, so the Web Shield and data monitor are off. You can switch to Full in Settings.")
            } else {
                if (!s.shieldOn) issues += Issue("Web Shield is switched off, so dangerous sites aren't blocked.")
                when {
                    s.dnsEncrypted -> {}
                    !s.dnsProblem.isNullOrBlank() -> issues += Issue(s.dnsProblem)
                    !s.providerEncrypts -> issues += Issue("Your site lookups aren't encrypted, so the Wi-Fi or mobile network can see them. Pick an encrypted provider in Settings.")
                    // Right after starting nothing has been looked up yet; that isn't a problem.
                    s.dnsQueries > 0 -> issues += Issue("Site lookups aren't encrypted right now.")
                }
            }
            if (!s.batteryExempt) issues += Issue("Battery saving may switch PhoneGuard off. Fix it in Setup below.")
        }
        if (!s.scanned) issues += Issue("You haven't checked for spy apps yet.")
        if (s.scanHigh > 0) {
            issues += Issue(
                "Your last scan found ${Format.count(s.scanHigh, "high-risk item")}. Open Scan to deal with " +
                    (if (s.scanHigh == 1) "it." else "them."),
                serious = true,
            )
        }
        return when {
            !s.running -> ProtectionStatus(
                Level.OFF, "Protection is off",
                "Websites and apps aren't being checked. Turn on protection to block dangerous sites, encrypt your lookups and choose which apps may go online.",
                issues,
            )
            issues.isEmpty() -> ProtectionStatus(
                Level.PROTECTED, "You're protected",
                "Dangerous sites are blocked, your site lookups are encrypted and your last scan was clean.",
                issues,
            )
            else -> ProtectionStatus(Level.PARTIAL, "Partially protected", "Protection is on, but:", issues)
        }
    }
}
