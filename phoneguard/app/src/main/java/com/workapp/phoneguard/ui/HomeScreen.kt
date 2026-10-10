package com.workapp.phoneguard.ui

import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.text.format.DateUtils
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.workapp.phoneguard.C
import com.workapp.phoneguard.DeviceHealth
import com.workapp.phoneguard.Fix
import com.workapp.phoneguard.MainActivity
import com.workapp.phoneguard.ProtectionMode
import com.workapp.phoneguard.R
import com.workapp.phoneguard.bullet
import com.workapp.phoneguard.card
import com.workapp.phoneguard.checkItem
import com.workapp.phoneguard.column
import com.workapp.phoneguard.dp
import com.workapp.phoneguard.label
import com.workapp.phoneguard.pill
import com.workapp.phoneguard.put
import com.workapp.phoneguard.row
import com.workapp.phoneguard.sectionTitle
import com.workapp.phoneguard.shield.DnsProvider
import com.workapp.phoneguard.shield.DnsSettings
import com.workapp.phoneguard.shield.DnsStatus
import com.workapp.phoneguard.switchRow

/** Overall status, the one big on/off button, and setup steps. */
class HomeScreen(host: Host) : Screen(host) {
    private lateinit var scroll: ScrollView
    private lateinit var body: LinearLayout

    /** What the layout was built from; rebuild only when it changes so scrolling isn't disturbed. */
    private data class State(
        val status: StatusInput,
        val categories: List<String>,
        val provider: DnsProvider,
        val notifyOk: Boolean,
        val scanning: Boolean,
        val scanTime: Long,
        val scanIssues: Int,
        val tips: List<String>,
    )

    private var built: State? = null
    private var tips: List<String> = emptyList()

    // Counters that change often are updated in place.
    private var shieldCount: TextView? = null
    private var firewallLine: TextView? = null
    private var scanLine: TextView? = null

    override fun create(): View {
        body = ctx.column()
        scroll = scrolling(body, Ids.HOME_SCROLL)
        tips = loadTips()
        rebuild(state())
        return scroll
    }

    override fun onShown() {
        tips = loadTips()
        refresh()
    }

    override fun tick() = refresh()

    override fun onDataChanged() = refresh()

    private fun refresh() {
        val s = state()
        if (s != built) {
            val y = scroll.scrollY
            rebuild(s)
            scroll.post { scroll.scrollTo(0, y) }
        } else {
            updateCounters()
        }
    }

    private fun loadTips(): List<String> = try { DeviceHealth.setupTips(ctx) } catch (_: Exception) { emptyList() }

    private fun state(): State {
        val rules = host.rules
        val provider = try { DnsSettings.provider(ctx) } catch (_: Exception) { DnsProvider.QUAD9 }
        val cats = try { shieldCategoriesOn(ctx) } catch (_: Exception) { emptyList() }
        val battery = try { DeviceHealth.isBatteryExempt(ctx) } catch (_: Exception) { true }
        val input = StatusInput(
            running = com.workapp.phoneguard.FirewallService.running,
            mode = runningMode(rules),
            shieldOn = cats.isNotEmpty(),
            dnsEncrypted = DnsStatus.encrypted,
            dnsProblem = DnsStatus.problem,
            // Only whether anything was looked up matters for the layout, not the exact number.
            dnsQueries = if (DnsStatus.queries > 0) 1 else 0,
            providerEncrypts = provider.dohUrl != null,
            scanned = rules.lastScanTime > 0,
            scanHigh = rules.lastScanHigh,
            batteryExempt = battery,
        )
        val notifyOk = Build.VERSION.SDK_INT < 33 ||
            ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return State(
            input, cats.map { it.title }, provider, notifyOk, ScanTask.running,
            rules.lastScanTime, rules.lastScanIssues, tips,
        )
    }

    private fun rebuild(s: State) {
        built = s
        body.removeAllViews()
        val status = Status.evaluate(s.status)
        statusCard(status)
        webShieldCard(s)
        firewallCard()
        scanCard(s)
        body.put(ctx.card().apply {
            put(ctx.switchRow(
                "Lock new apps",
                "New apps get no internet until you allow them, and you get an alert with what they can access. Works while protection is on.",
                host.rules.lockNewApps,
            ) { on -> host.rules.lockNewApps = on }, 0)
        })
        setupCard(s)
        privacyCard()
        tipsCard()
        updateCounters()
    }

    private fun statusCard(status: ProtectionStatus) {
        val serious = status.issues.any { it.serious }
        val color = when {
            serious -> C.RED
            status.level == Level.PROTECTED -> C.GREEN
            status.level == Level.PARTIAL -> C.AMBER
            else -> C.RED
        }
        val c = ctx.card(C.CARD2).apply { gravity = Gravity.CENTER_HORIZONTAL }
        c.put(ImageView(ctx).apply {
            setImageResource(R.drawable.ic_shield)
            setColorFilter(color)
        }.also { it.layoutParams = LinearLayout.LayoutParams(ctx.dp(72), ctx.dp(72)) }, 8, wrap = true)
        c.put(ctx.label(status.title, 24f, color, true).apply { gravity = Gravity.CENTER }, 4)
        c.put(ctx.label(status.summary, 14f, C.SUB).apply { gravity = Gravity.CENTER }, if (status.issues.isEmpty()) 16 else 8)
        if (status.level != Level.OFF && status.issues.isNotEmpty()) {
            val list = ctx.column()
            for (i in status.issues) list.put(ctx.bullet(i.text, if (i.serious) C.RED else C.TEXT), 4)
            c.put(list, 12)
        }
        if (status.level == Level.OFF) {
            c.put(ctx.pill("Turn on protection", C.GREEN) { host.setProtection(true) }.apply {
                textSize = 17f
                minHeight = ctx.dp(56)
            }, 8)
            if (status.issues.any { it.serious }) {
                c.put(ctx.label(status.issues.filter { it.serious }.joinToString("\n") { it.text }, 14f, C.RED)
                    .apply { gravity = Gravity.CENTER }, 0)
            }
        } else {
            c.put(ctx.pill("Turn off protection", C.RED, filled = false) { confirmTurnOff(host) }, 0, wrap = true)
        }
        body.put(c)
    }

    private fun webShieldCard(s: State) {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Web Shield"), 4)
        val running = s.status.running
        val basic = s.status.mode == ProtectionMode.BASIC
        val line = when {
            !running -> "Blocks dangerous and spying websites for every app. Off while protection is off."
            basic -> "Off in Basic mode. Choose Full protection in Settings to use it."
            s.categories.isEmpty() -> "All block lists are switched off."
            else -> "On · blocking " + s.categories.joinToString(", ")
        }
        c.put(ctx.label(line, 14f, if (running && !basic && s.categories.isNotEmpty()) C.TEXT else C.SUB), 4)
        if (running && !basic) {
            shieldCount = ctx.label("", 14f, C.SUB).also { c.put(it, 4) }
            val (dnsText, dnsColor) = dnsLine(s)
            c.put(ctx.label(dnsText, 14f, dnsColor), 12)
        } else {
            shieldCount = null
            c.put(View(ctx), 8)
        }
        c.put(ctx.pill("Web Shield settings", C.GREEN, filled = false) { host.show(MainActivity.TAB_SETTINGS) }, 0, wrap = true)
        body.put(c)
    }

    private fun dnsLine(s: State): Pair<String, Int> {
        val name = s.provider.title.substringBefore(" (")
        return when {
            s.status.dnsEncrypted -> "🔒 Site lookups are encrypted ($name)." to C.GREEN
            !s.status.dnsProblem.isNullOrBlank() -> "⚠ ${s.status.dnsProblem}" to C.AMBER
            s.provider.dohUrl == null -> "⚠ Site lookups aren't encrypted: you chose your network's own DNS." to C.AMBER
            else -> "Encrypted lookups with $name: waiting for the first lookup." to C.SUB
        }
    }

    private fun firewallCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Firewall"), 4)
        firewallLine = ctx.label("", 14f, C.SUB).also { c.put(it, 12) }
        c.put(ctx.pill("Choose apps", C.GREEN, filled = false) { host.show(MainActivity.TAB_FIREWALL) }, 0, wrap = true)
        body.put(c)
    }

    private fun scanCard(s: State) {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Spyware scan"), 4)
        scanLine = null
        if (s.scanning) {
            scanLine = ctx.label("", 14f, C.GREEN).also { c.put(it, 0) }
        } else {
            val text = if (s.scanTime <= 0) {
                "Never scanned. Checks for known spy apps, hidden apps, apps that can read your screen or messages, and risky settings."
            } else {
                "Last scan ${DateUtils.getRelativeTimeSpanString(s.scanTime)}: " +
                    if (s.scanIssues <= 0) "nothing found." else "${Format.count(s.scanIssues, "item")} to review."
            }
            c.put(ctx.label(text, 14f, if (s.status.scanHigh > 0) C.RED else C.SUB), 12)
            val buttons = ctx.row()
            buttons.put(ctx.pill("Scan now") {
                ScanTask.start(ctx)
                host.show(MainActivity.TAB_SCAN)
            }, 10, wrap = true)
            if (s.scanTime > 0 && s.scanIssues > 0) {
                buttons.put(ctx.pill("See results", C.GREEN, filled = false) { host.show(MainActivity.TAB_SCAN) }, 0, wrap = true)
            }
            c.put(buttons, 0)
        }
        body.put(c)
    }

    private fun setupCard(s: State) {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Setup"), 10)
        if (Build.VERSION.SDK_INT >= 33) {
            c.put(ctx.checkItem(
                s.notifyOk, "Allow alerts",
                "So PhoneGuard can warn you about new apps, unsafe Wi-Fi and problems with protection.",
                "Allow alerts",
            ) { host.requestNotifications() }, 14)
        }
        c.put(ctx.checkItem(
            s.status.batteryExempt, "Let PhoneGuard run in the background",
            if (s.status.batteryExempt) "Battery saving won't switch protection off."
            else "Otherwise battery saving can quietly switch protection off.",
            "Allow",
        ) { openBatterySettings() }, 14)
        c.put(ctx.checkItem(
            null, "Keep protection on after a restart",
            "Open VPN settings → tap ⚙ next to PhoneGuard → turn ON \"Always-on VPN\". " +
                "Leave \"Block connections without VPN\" OFF, or every app loses internet if PhoneGuard ever stops.",
            "Open VPN settings",
        ) { host.runFix(Fix.VPN, null) }, if (s.tips.isEmpty()) 0 else 14)
        if (s.tips.isNotEmpty()) {
            c.put(ctx.label(if (DeviceHealth.isSamsung()) "On your Samsung phone" else "On your phone", 15f, C.TEXT, true), 6)
            s.tips.forEachIndexed { i, t -> c.put(ctx.bullet(t), if (i == s.tips.size - 1) 0 else 6) }
        }
        body.put(c)
    }

    private fun openBatterySettings() {
        val direct = try { DeviceHealth.batteryExemptionIntent(ctx) } catch (_: Exception) { null }
        if (!host.open(direct, Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            host.toast("Open Settings → Apps → PhoneGuard → Battery and choose \"Unrestricted\".")
        }
    }

    private fun privacyCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("Your privacy"), 6)
        c.put(ctx.bullet("PhoneGuard uses the internet only to pass your apps' own traffic through, to send encrypted site lookups to the DNS provider you choose, and to download blocklist updates."), 4)
        c.put(ctx.bullet("It never uploads information about you."), 4)
        c.put(ctx.bullet("Everything it records (rules, scan results, activity) stays on this phone."), 0)
        body.put(c)
    }

    private fun tipsCard() {
        val c = ctx.card()
        c.put(ctx.sectionTitle("More ways to stay safe"), 6)
        listOf(
            "Use a screen lock PIN nobody else knows, and don't hand your unlocked phone to others.",
            "Turn on Google Play Protect: Play Store → profile → Play Protect.",
            "Check Google account → Security → Your devices, and sign out anything you don't recognise.",
            "Change your Google/Samsung account password if you think someone knows it, and turn on 2-step verification.",
            "Install system updates as soon as they arrive.",
            "Never install a certificate or profile that a website or Wi-Fi page asks for.",
            "If you think someone is spying on you and you feel unsafe, contact a local domestic-violence helpline before removing anything.",
        ).forEach { c.put(ctx.bullet(it), 6) }
        body.put(c)
    }

    private fun updateCounters() {
        shieldCount?.text = DnsStatus.blocked.let { n ->
            if (n <= 0) "Nothing blocked yet." else "${Format.count(n, "dangerous or tracking site")} blocked since PhoneGuard started."
        }
        firewallLine?.text = firewallSummary(host.rules)
        if (scanLine != null) scanLine?.text = "Scanning… ${ScanTask.progress}"
    }
}
