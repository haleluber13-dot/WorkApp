package com.workapp.phoneguard.ui

import android.os.Build
import android.text.TextUtils
import android.view.View
import android.view.inputmethod.EditorInfo
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.workapp.phoneguard.C
import com.workapp.phoneguard.FirewallService
import com.workapp.phoneguard.ProtectionMode
import com.workapp.phoneguard.bullet
import com.workapp.phoneguard.card
import com.workapp.phoneguard.column
import com.workapp.phoneguard.core.TrafficStore
import com.workapp.phoneguard.divider
import com.workapp.phoneguard.dp
import com.workapp.phoneguard.label
import com.workapp.phoneguard.pill
import com.workapp.phoneguard.put
import com.workapp.phoneguard.radioRow
import com.workapp.phoneguard.row
import com.workapp.phoneguard.sectionTitle
import com.workapp.phoneguard.shield.DnsProvider
import com.workapp.phoneguard.shield.DnsSettings
import com.workapp.phoneguard.shield.DnsStatus
import com.workapp.phoneguard.shield.Shield
import com.workapp.phoneguard.shield.ShieldCategory
import com.workapp.phoneguard.switchRow
import com.workapp.phoneguard.textBox
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date

/** Protection mode, Web Shield lists, DNS provider, your own site lists, and About. */
class SettingsScreen(host: Host) : Screen(host) {
    private lateinit var scroll: ScrollView
    private lateinit var body: LinearLayout
    private var dnsStatus: TextView? = null

    override fun create(): View {
        body = ctx.column()
        scroll = scrolling(body, Ids.SETTINGS_SCROLL)
        rebuild()
        return scroll
    }

    override fun onShown() {
        if (ShieldTask.lists == null) ShieldTask.loadInfo(ctx)
        refresh()
    }

    // Background changes only rebuild the page when something shown here changed,
    // so a scan running elsewhere doesn't keep redrawing it.
    override fun onDataChanged() {
        if (signature() != builtFor) refresh()
    }

    override fun tick() {
        if (signature() != builtFor) refresh() else dnsStatus?.let { bindDnsStatus(it) }
    }

    private var builtFor: List<Any?>? = null

    private fun signature(): List<Any?> =
        listOf(ShieldTask.lists, ShieldTask.updating, runningMode(host.rules), fallbackProblem(host.rules))

    private fun refresh() {
        val y = scroll.scrollY
        rebuild()
        scroll.post { scroll.scrollTo(0, y) }
    }

    private fun rebuild() {
        builtFor = signature()
        body.removeAllViews()
        body.put(ctx.label("Settings", 24f, bold = true), 12)
        modeCard()
        shieldCard()
        dnsCard()
        siteListCard(allowList = true)
        siteListCard(allowList = false)
        historyCard()
        aboutCard()
    }

    // ---------------------------------------------------------------- Mode

    private fun modeCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Protection mode"), 8)
        val chosen = host.rules.mode
        c.put(ctx.radioRow(
            "Full — recommended",
            "All apps' traffic passes through PhoneGuard on your phone, so the Web Shield, firewall and data monitor all work.",
            chosen == ProtectionMode.FULL,
        ) { setMode(ProtectionMode.FULL) }, 4)
        c.put(ctx.radioRow(
            "Basic — lightest",
            "Only blocked apps are stopped. No Web Shield and no data monitor. Use this if an app misbehaves in Full mode.",
            chosen == ProtectionMode.BASIC,
        ) { setMode(ProtectionMode.BASIC) }, 0)
        val active = runningMode(host.rules)
        val problem = fallbackProblem(host.rules)
        if (problem != null) {
            // Full is already picked, so tapping it does nothing: offer a real retry instead.
            c.put(View(ctx), 8)
            c.put(ctx.label("Right now PhoneGuard is running in Basic mode. $FALLBACK_TEXT", 13f, C.AMBER), 4)
            c.put(ctx.label("What happened: $problem.", 12f, C.SUB), 8)
            c.put(ctx.pill("Try Full protection again", C.GREEN) { retryFullProtection(host) }, 0, wrap = true)
        } else if (active != null && active != chosen) {
            c.put(View(ctx), 8)
            c.put(ctx.label("Switching modes…", 13f, C.AMBER), 0)
        }
        body.put(c)
    }

    private fun setMode(m: ProtectionMode) {
        if (host.rules.mode == m) return
        host.rules.mode = m
        if (FirewallService.running) {
            try {
                FirewallService.send(ctx, FirewallService.ACTION_RELOAD)
            } catch (_: Exception) {
                host.toast("Couldn't reach the PhoneGuard service. Turn protection off and on again.")
            }
            host.toast(if (m == ProtectionMode.FULL) "Switching to Full protection…" else "Switching to Basic protection…")
        }
        refresh()
    }

    // ---------------------------------------------------------------- Web Shield

    private fun shieldCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Web Shield"), 4)
        c.put(ctx.label("Blocks dangerous and spying websites for every app on your phone. Choose what to block:", 13f, C.SUB), 8)
        if (host.rules.mode == ProtectionMode.BASIC) {
            c.put(ctx.label("The Web Shield only works in Full mode.", 13f, C.AMBER), 8)
        }
        val lists = ShieldTask.lists
        val numbers = NumberFormat.getIntegerInstance()
        for (cat in ShieldCategory.values()) {
            val info = lists?.firstOrNull { it.category == cat }
            val detail = StringBuilder(cat.description)
            when {
                info != null -> {
                    detail.append("\n").append(numbers.format(info.domains)).append(" sites")
                    if (info.updatedAt > 0) detail.append(" · updated ").append(date(info.updatedAt))
                }
                lists == null -> detail.append("\nLoading list details…")
            }
            val on = try { Shield.isEnabled(ctx, cat) } catch (_: Exception) { cat.defaultOn }
            c.put(ctx.switchRow(cat.title, detail, on) { checked ->
                try {
                    Shield.setEnabled(ctx, cat, checked)
                } catch (_: Exception) {
                    host.toast("Couldn't save that. Please try again.")
                }
            }, 8)
        }
        c.put(View(ctx), 4)
        if (ShieldTask.updating) {
            c.put(ctx.label("Updating lists… this can take a minute.", 14f, C.GREEN, true), 4)
        } else {
            c.put(ctx.pill("Update lists now", C.GREEN, filled = false) { ShieldTask.updateNow(ctx) }, 4, wrap = true)
        }
        c.put(ctx.label("Lists also update by themselves about once a week, on Wi-Fi.", 12f, C.SUB), 0)
        body.put(c)
    }

    // ---------------------------------------------------------------- DNS

    private fun dnsCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Site lookups (DNS)"), 4)
        c.put(ctx.label(
            "Before an app opens a site, your phone looks up the site's address. PhoneGuard sends these lookups encrypted to the provider you pick, so the Wi-Fi or mobile network can't see or change them.",
            13f, C.SUB), 8)
        val current = try { DnsSettings.provider(ctx) } catch (_: Exception) { DnsProvider.QUAD9 }
        for (p in DnsProvider.values()) {
            c.put(ctx.radioRow(p.title, p.description, p == current) {
                if (p != current) {
                    try {
                        DnsSettings.setProvider(ctx, p)
                        host.toast("Now using ${p.title.substringBefore(" (")}. No restart needed.")
                    } catch (_: Exception) {
                        host.toast("Couldn't save that. Please try again.")
                    }
                    refresh()
                }
            }, 2)
        }
        dnsStatus = ctx.label("", 13f, C.SUB).also {
            bindDnsStatus(it)
            c.put(it, 10)
        }
        c.put(ctx.label(
            "Tip: if \"Private DNS\" in your phone's settings is set to a provider name, Android may send lookups there directly and the Web Shield can't check them. Set Private DNS to Automatic or Off.",
            12f, C.SUB), 0)
        body.put(c)
    }

    private fun bindDnsStatus(v: TextView) {
        val mode = runningMode(host.rules)
        val (text, color) = when {
            mode == null -> "Protection is off, so lookups aren't going through PhoneGuard." to C.SUB
            mode == ProtectionMode.BASIC -> "Basic mode: lookups don't go through PhoneGuard." to C.SUB
            DnsStatus.encrypted -> "🔒 Working: lookups are encrypted." to C.GREEN
            !DnsStatus.problem.isNullOrBlank() -> "⚠ ${DnsStatus.problem}" to C.AMBER
            DnsStatus.queries == 0L -> "Waiting for the first lookup…" to C.SUB
            else -> "⚠ Lookups aren't encrypted right now." to C.AMBER
        }
        v.text = text
        v.setTextColor(color)
    }

    // ---------------------------------------------------------------- Your own lists

    private fun siteListCard(allowList: Boolean) {
        val c = ctx.card()
        c.put(ctx.sectionTitle(if (allowList) "Always allowed sites" else "Sites you blocked"), 4)
        c.put(ctx.label(
            if (allowList) "Never blocked by the Web Shield, even if a list includes them. Use this if a site you trust stops working."
            else "Always blocked for every app, including all their subdomains.",
            13f, C.SUB), 8)
        val sites = try {
            (if (allowList) Shield.allowed(ctx) else Shield.denied(ctx)).sorted()
        } catch (_: Exception) { emptyList() }
        if (sites.isEmpty()) {
            c.put(ctx.label("None yet.", 14f, C.SUB), 8)
        }
        for (d in sites) {
            val r = ctx.row().apply { minimumHeight = ctx.dp(48) }
            r.put(ctx.label(d, 15f).apply { isSingleLine = true; ellipsize = TextUtils.TruncateAt.MIDDLE }, 8, weight = 1f)
            r.put(ctx.pill("Remove", C.SUB, filled = false) {
                try {
                    if (allowList) Shield.unallow(ctx, d) else Shield.undeny(ctx, d)
                } catch (_: Exception) {
                    host.toast("Couldn't save that. Please try again.")
                }
                refresh()
            }, 0, wrap = true)
            c.put(r, 4)
        }
        c.put(View(ctx), 4)
        c.put(ctx.pill(if (allowList) "Add a site to allow" else "Add a site to block", if (allowList) C.GREEN else C.RED, filled = false) {
            addSiteDialog(allowList)
        }, 0, wrap = true)
        body.put(c)
    }

    private fun addSiteDialog(allowList: Boolean) {
        val box = ctx.textBox("e.g. example.com").apply {
            inputType = EditorInfo.TYPE_CLASS_TEXT or EditorInfo.TYPE_TEXT_VARIATION_URI
        }
        val wrap = ctx.column().apply { setPadding(ctx.dp(20), ctx.dp(16), ctx.dp(20), ctx.dp(4)) }
        wrap.put(ctx.label(if (allowList) "Always allow a site" else "Block a site", 18f, bold = true), 6)
        wrap.put(ctx.label("Type the site's address. Its subdomains are included.", 13f, C.SUB), 10)
        wrap.put(box, 0)
        host.dialog(
            dialogBuilder()
                .setView(wrap)
                .setPositiveButton(if (allowList) "Allow" else "Block") { _, _ ->
                    val d = Format.normalizeDomain(box.text?.toString() ?: "")
                    if (d == null) {
                        host.toast("That doesn't look like a website address. Try something like example.com.")
                        return@setPositiveButton
                    }
                    try {
                        if (allowList) {
                            if (d in Shield.denied(ctx)) Shield.undeny(ctx, d)
                            Shield.allow(ctx, d)
                        } else {
                            if (d in Shield.allowed(ctx)) Shield.unallow(ctx, d)
                            Shield.deny(ctx, d)
                        }
                        host.toast(if (allowList) "$d will always be allowed." else "$d is now blocked.")
                    } catch (_: Exception) {
                        host.toast("Couldn't save that. Please try again.")
                    }
                    refresh()
                }
                .setNegativeButton("Cancel", null)
        )
    }

    // ---------------------------------------------------------------- History

    private fun historyCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Activity history"), 4)
        c.put(ctx.label(
            "Data counts and the list of connections are kept only in this phone's memory since ${date(TrafficStore.since(), withTime = true)}. They reset when the phone restarts.",
            13f, C.SUB), 10)
        c.put(ctx.pill("Clear activity history", C.RED, filled = false) {
            host.dialog(
                dialogBuilder()
                    .setTitle("Clear activity history?")
                    .setMessage("This removes the connection list and data counts. Your firewall rules and site lists are kept.")
                    .setPositiveButton("Clear") { _, _ ->
                        TrafficStore.clear()
                        host.toast("Activity history cleared.")
                        refresh()
                    }
                    .setNegativeButton("Cancel", null)
            )
        }, 0, wrap = true)
        body.put(c)
    }

    // ---------------------------------------------------------------- About

    private fun aboutCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("About PhoneGuard"), 6)
        val version = try {
            val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            "${pi.versionName} (build ${if (Build.VERSION.SDK_INT >= 28) pi.longVersionCode else 0})"
        } catch (_: Exception) { "?" }
        c.put(ctx.label("Version $version", 14f), 2)
        c.put(ctx.label("Android ${Build.VERSION.RELEASE} · security update ${Build.VERSION.SECURITY_PATCH}", 13f, C.SUB), 2)
        ShieldTask.lists?.filter { it.updatedAt > 0 }?.maxOfOrNull { it.updatedAt }?.let {
            c.put(ctx.label("Blocklists last updated ${date(it)}", 13f, C.SUB), 2)
        }
        c.put(View(ctx), 8)
        c.put(ctx.divider(), 12)

        c.put(ctx.label("What PhoneGuard can't do", 15f, bold = true), 6)
        listOf(
            "No app can catch every spy tool. Spyware made for governments, or anything on a rooted phone, can hide from every app.",
            "The Web Shield blocks known bad sites by name. Brand-new bad sites may not be on the lists yet.",
            "Apps that use their own encrypted lookups or fixed addresses can skip the Web Shield. The firewall still decides whether they may go online.",
            "PhoneGuard can't see inside encrypted traffic, only which app talks to which site and how much.",
            "Only one VPN app can run at a time, so you can't use another VPN while PhoneGuard is on.",
            "If Private DNS in your phone's settings is set to a provider name, the Web Shield can't check your lookups.",
            "\"Ping\" tests don't work in Full mode. Normal apps and websites are not affected.",
        ).forEach { c.put(ctx.bullet(it), 6) }
        c.put(View(ctx), 6)
        c.put(ctx.divider(), 12)

        c.put(ctx.label("Lists and data used", 15f, bold = true), 6)
        listOf(
            "Spy app database and stalkerware servers: Echap stalkerware-indicators (CC BY 4.0).",
            "Ads & trackers: StevenBlack hosts (MIT licence).",
            "Malware sites: URLhaus by abuse.ch (CC0).",
            "Phishing sites: malware-filter phishing-filter by curbengh (CC BY-SA 4.0).",
        ).forEach { c.put(ctx.bullet(it), 6) }
        c.put(ctx.label("Thank you to the people who maintain these lists.", 12f, C.SUB), 0)
        body.put(c)
    }

    private fun date(t: Long, withTime: Boolean = false): String =
        if (withTime) DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(t))
        else DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(t))
}
