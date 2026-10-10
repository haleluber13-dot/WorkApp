package com.workapp.phoneguard

import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import com.workapp.phoneguard.core.Kind
import com.workapp.phoneguard.core.TrafficStore
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.text.Editable
import android.text.TextWatcher
import android.text.format.DateUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import java.text.DateFormat
import java.util.Date

class MainActivity : Activity() {

    companion object {
        const val EXTRA_TAB = "tab"
        const val TAB_HOME = 0
        const val TAB_FIREWALL = 1
        const val TAB_SCAN = 2
        private const val REQ_VPN = 10
        private const val REQ_NOTIFY = 11

        /** Kept for the life of the process so switching tabs doesn't lose results. */
        private var lastResult: Scanner.Result? = null
        private var scanning = false
    }

    private lateinit var rules: Rules
    private lateinit var content: FrameLayout
    private val tabViews = ArrayList<TextView>()
    private var tab = TAB_HOME
    private val handler = Handler(Looper.getMainLooper())
    private var firewallStatus: TextView? = null
    private var firewallToggle: TextView? = null
    private var logButton: TextView? = null
    private var scanProgress: TextView? = null
    private var appAdapter: AppAdapter? = null

    private val reload = Runnable {
        if (FirewallService.running) FirewallService.send(this, FirewallService.ACTION_RELOAD)
    }
    private val ticker = object : Runnable {
        override fun run() {
            updateFirewallStatus()
            appAdapter?.notifyDataSetChanged()
            handler.postDelayed(this, 3000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        rules = Rules(this)

        val root = column().apply { setBackgroundColor(C.BG) }
        val header = row().apply { setPadding(dp(20), dp(14), dp(20), dp(6)) }
        header.put(ImageView(this).apply {
            setImageResource(R.drawable.ic_shield)
            setColorFilter(C.GREEN)
        }, 10, wrap = true)
        header.put(label(getString(R.string.app_name), 22f, bold = true), 0, wrap = true)
        root.addView(header)

        content = FrameLayout(this)
        root.addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val nav = row().apply {
            setBackgroundColor(C.CARD)
            setPadding(dp(8), dp(6), dp(8), dp(6))
        }
        listOf("🛡  Home", "🔥  Firewall", "🔍  Scan").forEachIndexed { i, name ->
            val t = label(name, 14f, C.SUB, bold = true).apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(12), 0, dp(12))
                setOnClickListener { show(i) }
            }
            tabViews += t
            nav.addView(t, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
        root.addView(nav)

        root.setOnApplyWindowInsetsListener { v, insets ->
            if (Build.VERSION.SDK_INT >= 30) {
                val i = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                v.setPadding(i.left, i.top, i.right, i.bottom)
            } else {
                @Suppress("DEPRECATION")
                v.setPadding(
                    insets.systemWindowInsetLeft, insets.systemWindowInsetTop,
                    insets.systemWindowInsetRight, insets.systemWindowInsetBottom
                )
            }
            insets
        }
        setContentView(root)
        show(intent?.getIntExtra(EXTRA_TAB, TAB_HOME) ?: TAB_HOME)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        if (intent.hasExtra(EXTRA_TAB)) show(intent.getIntExtra(EXTRA_TAB, TAB_HOME))
    }

    override fun onResume() {
        super.onResume()
        // Settings may have changed while we were away (e.g. an app was uninstalled).
        if (tab == TAB_FIREWALL) appAdapter?.reloadApps() else show(tab)
        handler.post(ticker)
    }

    override fun onPause() {
        super.onPause()
        handler.removeCallbacks(ticker)
    }

    private fun show(which: Int) {
        tab = which
        tabViews.forEachIndexed { i, t ->
            t.setTextColor(if (i == which) C.GREEN else C.SUB)
            t.background = if (i == which) rounded(C.CARD2, 14) else null
        }
        firewallStatus = null; firewallToggle = null; logButton = null
        scanProgress = null; appAdapter = null
        content.removeAllViews()
        content.addView(
            when (which) {
                TAB_FIREWALL -> firewallView()
                TAB_SCAN -> scanView()
                else -> homeView()
            }
        )
    }

    private fun scrolling(body: LinearLayout): ScrollView = ScrollView(this).apply {
        body.setPadding(dp(16), dp(8), dp(16), dp(24))
        addView(body)
    }

    // ---------------------------------------------------------------- Home

    private fun homeView(): View {
        val body = column()
        val fwOn = FirewallService.running
        val scanned = rules.lastScanTime > 0
        val high = rules.lastScanHigh
        val issues = rules.lastScanIssues

        val (color, title, sub) = when {
            scanned && high > 0 -> Triple(C.RED, "Problems found",
                "Your last scan found $high high-risk item${if (high == 1) "" else "s"}. Open Scan to fix ${if (high == 1) "it" else "them"}.")
            !fwOn && !scanned -> Triple(C.AMBER, "Let's protect your phone",
                "Turn on the firewall and run your first scan.")
            !fwOn -> Triple(C.AMBER, "Firewall is off", "Apps can use the internet freely. Turn it on below.")
            !scanned -> Triple(C.AMBER, "Firewall is on", "Run a scan to check for spy apps.")
            issues > 0 -> Triple(C.GREEN, "You're protected",
                "Firewall on. $issues thing${if (issues == 1) "" else "s"} worth a look from your last scan.")
            else -> Triple(C.GREEN, "You're protected", "Firewall on and your last scan was clean.")
        }
        val status = card(C.CARD2).apply { gravity = Gravity.CENTER_HORIZONTAL }
        status.put(ImageView(this).apply {
            setImageResource(R.drawable.ic_shield)
            setColorFilter(color)
        }.also { it.layoutParams = LinearLayout.LayoutParams(dp(72), dp(72)) }, 8, wrap = true)
        status.put(label(title, 22f, color, true).apply { gravity = Gravity.CENTER }, 4)
        status.put(label(sub, 14f, C.SUB).apply { gravity = Gravity.CENTER }, 0)
        body.put(status)

        val fw = card()
        fw.put(label("Firewall", 18f, bold = true), 4)
        fw.put(label(firewallSummary(), 14f, C.SUB), 12)
        val fwRow = row()
        fwRow.put(pill(if (fwOn) "Turn off" else "Turn on", if (fwOn) C.RED else C.GREEN, filled = !fwOn) {
            setFirewall(!FirewallService.running)
        }, 10, wrap = true)
        fwRow.put(pill("Choose apps", C.GREEN, filled = false) { show(TAB_FIREWALL) }, 0, wrap = true)
        fw.put(fwRow, 0)
        body.put(fw)

        val sc = card()
        sc.put(label("Spyware scan", 18f, bold = true), 4)
        sc.put(label(
            if (!scanned) "Never scanned. Checks for known spy apps, hidden apps, apps that can read your screen or messages, and risky settings."
            else "Last scan ${DateUtils.getRelativeTimeSpanString(rules.lastScanTime)}: " +
                if (issues == 0) "nothing found." else "$issues item${if (issues == 1) "" else "s"} to review.",
            14f, C.SUB), 12)
        sc.put(pill("Scan now") { show(TAB_SCAN); startScan() }, 0, wrap = true)
        body.put(sc)

        val na = card()
        val naRow = row()
        val naText = column()
        naText.put(label("Lock new apps", 18f, bold = true), 4)
        naText.put(label("New apps get no internet until you allow them, and you get an alert with what they can access. Works while the firewall is on.", 14f, C.SUB), 0)
        naRow.put(naText, 8, weight = 1f)
        naRow.put(Switch(this).apply {
            isChecked = rules.lockNewApps
            setOnCheckedChangeListener { _, on -> rules.lockNewApps = on }
        }, 0, wrap = true)
        na.put(naRow, 0)
        body.put(na)

        val setup = card()
        setup.put(label("Setup", 18f, bold = true), 8)
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            setup.put(label("Allow alerts so PhoneGuard can warn you when a new app is installed.", 14f, C.SUB), 8)
            setup.put(pill("Allow alerts") {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIFY)
            }, 16, wrap = true)
        }
        setup.put(label("Keep the firewall on after a restart:", 14f, C.TEXT, true), 4)
        setup.put(label("Open VPN settings → tap ⚙ next to PhoneGuard → turn ON \"Always-on VPN\". Leave \"Block connections without VPN\" OFF, or every app loses internet.", 14f, C.SUB), 8)
        setup.put(pill("Open VPN settings", C.GREEN, filled = false) { runFix(Fix.VPN, null) }, 0, wrap = true)
        body.put(setup)

        val privacy = card()
        privacy.put(label("Your privacy", 18f, bold = true), 6)
        privacy.put(bullet("PhoneGuard has no internet permission. It cannot send anything off your phone."), 4)
        privacy.put(bullet("The firewall is a local VPN: it does not connect to any server. Blocked apps' traffic is simply dropped."), 4)
        privacy.put(bullet("Everything (rules, scan results, logs) stays on this phone."), 0)
        body.put(privacy)

        val tips = card()
        tips.put(label("More ways to stay safe", 18f, bold = true), 6)
        listOf(
            "Use a screen lock PIN nobody else knows, and don't hand your unlocked phone to others.",
            "Turn on Google Play Protect: Play Store → profile → Play Protect.",
            "Check Google account → Security → Your devices, and sign out anything you don't recognise.",
            "Change your Google/Samsung account password if you think someone knows it, and turn on 2-step verification.",
            "Install system updates as soon as they arrive.",
            "On public Wi-Fi, prefer mobile data for banking. Never install a certificate or profile a Wi-Fi page asks for.",
            "If you think someone is spying on you and you feel unsafe, contact a local domestic-violence helpline before removing anything.",
        ).forEach { tips.put(bullet(it), 6) }
        body.put(tips)

        return scrolling(body)
    }

    private fun firewallSummary(): String {
        if (!FirewallService.running) return "Off. Turn it on, then choose which apps may use Wi-Fi and mobile data."
        val net = when (FirewallService.currentNet) {
            NetType.WIFI -> "Wi-Fi"
            NetType.MOBILE -> "mobile data"
            NetType.NONE -> "no network"
        }
        val n = FirewallService.blockedCount
        val attempts = TrafficStore.totalBlocked()
        return "On · connected to $net · blocking $n app${if (n == 1) "" else "s"} here" +
            if (attempts > 0) " · stopped $attempts connection${if (attempts == 1) "" else "s"}" else ""
    }

    private fun setFirewall(on: Boolean) {
        if (on) {
            val consent = VpnService.prepare(this)
            if (consent == null) onActivityResult(REQ_VPN, RESULT_OK, null)
            else try {
                startActivityForResult(consent, REQ_VPN)
            } catch (_: Exception) {
                toast("This phone doesn't allow VPN apps.")
            }
        } else {
            FirewallService.send(this, FirewallService.ACTION_STOP)
            handler.postDelayed({ refreshAfterToggle() }, 400)
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VPN) return
        if (resultCode == RESULT_OK) {
            FirewallService.send(this, FirewallService.ACTION_START)
            handler.postDelayed({ refreshAfterToggle() }, 600)
        } else {
            toast("The firewall needs the VPN permission to work.")
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (tab == TAB_HOME) show(TAB_HOME)
    }

    private fun refreshAfterToggle() {
        if (tab == TAB_FIREWALL) updateFirewallStatus() else show(tab)
    }

    // ---------------------------------------------------------------- Firewall

    private fun firewallView(): View {
        val body = column().apply { setPadding(dp(16), dp(8), dp(16), 0) }

        val top = card()
        val topRow = row()
        val status = label("", 14f, C.SUB)
        firewallStatus = status
        topRow.put(status, 10, weight = 1f)
        val toggle = pill("", C.GREEN) { setFirewall(!FirewallService.running) }
        firewallToggle = toggle
        topRow.put(toggle, 0, wrap = true)
        top.put(topRow, 0)
        body.put(top, 10)

        val search = EditText(this).apply {
            hint = "Search apps"
            setHintTextColor(C.SUB)
            setTextColor(C.TEXT)
            isSingleLine = true
            background = rounded(C.CARD, 22)
            setPadding(dp(16), dp(10), dp(16), dp(10))
        }
        body.put(search, 8)

        val adapter = AppAdapter()
        appAdapter = adapter

        val filters = row()
        val showAll = pill("Show system apps", C.SUB, filled = false) {}
        showAll.setOnClickListener {
            adapter.showSystem = !adapter.showSystem
            showAll.text = if (adapter.showSystem) "Hide system apps" else "Show system apps"
            adapter.applyFilter()
        }
        filters.put(showAll, 8, wrap = true)
        val log = pill("Blocked log", C.BLUE, filled = false) { showLog() }
        logButton = log
        filters.put(log, 0, wrap = true)
        body.put(filters, 8)
        body.put(label("Tap Wi-Fi or Data to cut an app off that network. Red = blocked.", 13f, C.SUB), 6)

        val list = ListView(this).apply {
            divider = null
            dividerHeight = 0
            this.adapter = adapter
            isFastScrollEnabled = true
        }
        body.addView(list, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                adapter.query = s?.toString()?.trim() ?: ""
                adapter.applyFilter()
            }
        })
        adapter.reloadApps()
        updateFirewallStatus()
        return body
    }

    private fun updateFirewallStatus() {
        val on = FirewallService.running
        firewallStatus?.text = firewallSummary()
        firewallToggle?.apply {
            text = if (on) "Turn off" else "Turn on"
            setTextColor(if (on) C.RED else C.ON_ACCENT)
            background = if (on) rounded(0, 22, C.RED, 1.5) else rounded(C.GREEN, 22)
        }
        val total = TrafficStore.totalBlocked()
        logButton?.text = if (total > 0) "Blocked log ($total)" else "Blocked log"
    }

    private fun scheduleReload() {
        handler.removeCallbacks(reload)
        handler.postDelayed(reload, 700)
    }

    private class AppEntry(val pkg: String, val label: String, val uid: Int, val system: Boolean, val info: ApplicationInfo) {
        var icon: Drawable? = null
    }

    private inner class AppAdapter : BaseAdapter() {
        private var all: List<AppEntry> = emptyList()
        private var shown: List<AppEntry> = emptyList()
        var showSystem = false
        var query = ""

        fun reloadApps() {
            Thread {
                val pm = packageManager
                @Suppress("DEPRECATION")
                val apps = pm.getInstalledApplications(0)
                    .filter {
                        it.packageName != packageName &&
                            pm.checkPermission(android.Manifest.permission.INTERNET, it.packageName) ==
                            PackageManager.PERMISSION_GRANTED
                    }
                    .map {
                        AppEntry(it.packageName, it.loadLabel(pm).toString(), it.uid,
                            it.flags and ApplicationInfo.FLAG_SYSTEM != 0 &&
                                it.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP == 0 &&
                                pm.getLaunchIntentForPackage(it.packageName) == null,
                            it)
                    }
                    .sortedBy { it.label.lowercase() }
                runOnUiThread {
                    all = apps
                    applyFilter()
                }
            }.start()
        }

        fun applyFilter() {
            val q = query.lowercase()
            shown = all.filter {
                (showSystem || !it.system) &&
                    (q.isEmpty() || it.label.lowercase().contains(q) || it.pkg.contains(q))
            }
            notifyDataSetChanged()
        }

        override fun getCount() = shown.size
        override fun getItem(position: Int) = shown[position]
        override fun getItemId(position: Int) = position.toLong()

        private inner class Holder(
            val root: LinearLayout, val icon: ImageView, val name: TextView,
            val sub: TextView, val wifi: TextView, val data: TextView,
        )

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val h = (convertView?.tag as? Holder) ?: run {
                val r = row().apply {
                    background = rounded(C.CARD, 14)
                    setPadding(dp(12), dp(10), dp(10), dp(10))
                }
                val icon = ImageView(this@MainActivity)
                r.addView(icon, LinearLayout.LayoutParams(dp(40), dp(40)).apply { marginEnd = dp(12) })
                val texts = column()
                val name = label("", 15f, bold = true).apply { isSingleLine = true }
                val sub = label("", 12f, C.SUB).apply { isSingleLine = true }
                texts.addView(name)
                texts.addView(sub)
                r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                val wifi = label("", 12f, bold = true).apply {
                    gravity = Gravity.CENTER
                    setPadding(dp(10), dp(8), dp(10), dp(8))
                }
                val data = label("", 12f, bold = true).apply {
                    gravity = Gravity.CENTER
                    setPadding(dp(10), dp(8), dp(10), dp(8))
                }
                r.addView(wifi, LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(6) })
                r.addView(data, LinearLayout.LayoutParams(dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = dp(6) })
                val wrapper = LinearLayout(this@MainActivity).apply { setPadding(0, 0, 0, dp(8)) }
                wrapper.addView(r, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                Holder(wrapper, icon, name, sub, wifi, data).also { wrapper.tag = it }
            }
            val e = shown[position]
            if (e.icon == null) e.icon = try { e.info.loadIcon(packageManager) } catch (_: Exception) { null }
            h.icon.setImageDrawable(e.icon)
            h.name.text = e.label
            val attempts = TrafficStore.blockedFor(e.uid)
            h.sub.text = if (attempts > 0) "Stopped $attempts connection${if (attempts == 1) "" else "s"}" else e.pkg
            h.sub.setTextColor(if (attempts > 0) C.AMBER else C.SUB)
            bindToggle(h.wifi, "Wi-Fi", e.pkg, NetType.WIFI)
            bindToggle(h.data, "Data", e.pkg, NetType.MOBILE)
            return h.root
        }

        private fun bindToggle(v: TextView, name: String, pkg: String, net: NetType) {
            val blocked = rules.isBlocked(pkg, net)
            v.text = if (blocked) "✕ $name" else "✓ $name"
            v.setTextColor(if (blocked) C.TEXT else C.GREEN)
            v.background = if (blocked) rounded(C.RED, 12) else rounded(0, 12, C.LINE, 1.5)
            v.setOnClickListener {
                rules.setBlocked(pkg, net, !rules.isBlocked(pkg, net))
                notifyDataSetChanged()
                if (!FirewallService.running && rules.isBlocked(pkg, net)) {
                    toast("Saved. Turn the firewall on to apply.")
                }
                scheduleReload()
            }
        }
    }

    private fun showLog() {
        val entries = TrafficStore.recent().filter { it.blocked }
        val pm = packageManager
        val names = HashMap<Int, String>()
        fun appName(uid: Int): String = names.getOrPut(uid) {
            if (uid < 0) return@getOrPut "Unknown app"
            val pkg = pm.getPackagesForUid(uid)?.firstOrNull() ?: return@getOrPut "uid $uid"
            try { pm.getApplicationInfo(pkg, 0).loadLabel(pm).toString() } catch (_: Exception) { pkg }
        }
        val fmt = DateFormat.getTimeInstance(DateFormat.MEDIUM)
        val body = column().apply { setPadding(dp(20), dp(8), dp(20), dp(8)) }
        if (entries.isEmpty()) {
            body.put(label(
                if (FirewallService.running) "Nothing blocked yet. When a blocked app tries to go online, it shows up here."
                else "The firewall is off.", 14f, C.SUB), 0)
        } else {
            for (e in entries) {
                val what = if (e.kind == Kind.DNS) "DNS lookup ${e.domain ?: ""}" else "${e.domain ?: e.host} : ${e.port} (${e.kind})"
                body.put(label("${fmt.format(Date(e.time))}  ${appName(e.uid)}", 14f, C.TEXT, true), 0)
                body.put(label("→ $what", 13f, C.SUB), 8)
            }
        }
        AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
            .setTitle("Blocked connections")
            .setView(ScrollView(this).apply { addView(body) })
            .setPositiveButton("Close", null)
            .setNeutralButton("Clear") { _, _ ->
                TrafficStore.clear()
                updateFirewallStatus()
                appAdapter?.notifyDataSetChanged()
            }
            .show()
    }

    // ---------------------------------------------------------------- Scan

    private fun scanView(): View {
        val body = column()

        val head = card(C.CARD2)
        head.put(label("Spyware & security scan", 20f, bold = true), 6)
        head.put(label("Looks for known spy apps, hidden apps, apps that can watch your screen, read your messages or track you, and settings someone could use to snoop on you over Wi-Fi or mobile data.", 14f, C.SUB), 12)
        val progress = label(if (scanning) "Scanning…" else "", 14f, C.GREEN)
        scanProgress = progress
        if (scanning) head.put(progress, 0)
        else head.put(pill(if (lastResult == null) "Scan my phone" else "Scan again") { startScan() }, 0, wrap = true)
        body.put(head)

        val result = lastResult
        if (result != null && !scanning) {
            val high = result.findings.count { it.severity == Severity.HIGH }
            val summary = card()
            if (result.findings.isEmpty()) {
                summary.put(label("✓ Nothing suspicious found", 18f, C.GREEN, true), 4)
                summary.put(label("Checked ${result.appsChecked} apps and your phone's security settings.", 14f, C.SUB), 0)
            } else {
                summary.put(label(
                    "${result.findings.size} thing${if (result.findings.size == 1) "" else "s"} to review",
                    18f, if (high > 0) C.RED else C.AMBER, true), 4)
                summary.put(label(
                    "Checked ${result.appsChecked} apps. Go through each one below. If you recognise an app and trust it, tap \"I trust this\" so it isn't shown again.",
                    14f, C.SUB), 0)
            }
            body.put(summary)

            for (f in result.findings) body.put(findingCard(f))

            if (result.hiddenByTrust > 0) {
                val t = card()
                t.put(label("${result.hiddenByTrust} item${if (result.hiddenByTrust == 1) "" else "s"} you marked as trusted ${if (result.hiddenByTrust == 1) "is" else "are"} hidden.", 14f, C.SUB), 8)
                t.put(pill("Show them again", C.SUB, filled = false) {
                    rules.clearTrusted()
                    startScan()
                }, 0, wrap = true)
                body.put(t)
            }
        }

        val note = card()
        note.put(label("Good to know", 16f, bold = true), 6)
        note.put(bullet("No app can find every kind of spyware. Advanced spyware sold to governments, or anything on a rooted phone, can hide from all apps. If you strongly suspect that, back up your photos and do a factory reset, then change your account passwords from a different device."), 6)
        note.put(bullet("Many normal apps (password managers, smartwatch apps, work apps) use these same powers. The scan shows what an app CAN do; you decide if that makes sense."), 6)
        note.put(bullet("Spy app database: Echap stalkerware-indicators (CC-BY 4.0)."), 0)
        body.put(note)

        return scrolling(body)
    }

    private fun findingCard(f: Finding): View {
        val c = card()
        val chip = label(f.severity.label.uppercase(), 11f, f.severity.color, true).apply {
            setPadding(dp(8), dp(3), dp(8), dp(3))
            background = rounded(0, 10, f.severity.color, 1)
        }
        c.put(chip, 8, wrap = true)
        val titleRow = row()
        if (f.pkg != null) {
            val icon = try { packageManager.getApplicationIcon(f.pkg) } catch (_: Exception) { null }
            if (icon != null) {
                titleRow.addView(ImageView(this).apply { setImageDrawable(icon) },
                    LinearLayout.LayoutParams(dp(32), dp(32)).apply { marginEnd = dp(10) })
            }
        }
        titleRow.put(column().apply {
            put(label(f.title, 17f, bold = true), 0)
            if (f.pkg != null) put(label(f.pkg, 12f, C.SUB), 0)
        }, 0, weight = 1f)
        c.put(titleRow, 8)
        f.details.forEach { c.put(bullet(it, C.TEXT), 4) }

        val actions = row().apply { setPadding(0, dp(8), 0, 0) }
        for (a in f.actions) {
            val color = if (a.fix == Fix.UNINSTALL) C.RED else C.GREEN
            actions.put(pill(a.label, color, filled = a.fix == Fix.UNINSTALL) { runFix(a.fix, f.pkg) }, 8, wrap = true)
        }
        actions.put(pill("I trust this", C.SUB, filled = false) {
            rules.trust(f.id)
            lastResult = lastResult?.let { r ->
                Scanner.Result(r.findings.filter { it.id != f.id }, r.hiddenByTrust + 1, r.appsChecked)
            }
            lastResult?.let { saveScanSummary(it) }
            show(TAB_SCAN)
        }, 0, wrap = true)
        c.put(HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(actions)
        }, 0)

        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(View(this@MainActivity).apply { background = rounded(f.severity.color, 3) },
                LinearLayout.LayoutParams(dp(5), ViewGroup.LayoutParams.MATCH_PARENT).apply { marginEnd = dp(6) })
            addView(c, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
    }

    private fun startScan() {
        if (scanning) return
        scanning = true
        if (tab == TAB_SCAN) show(TAB_SCAN)
        val appContext = applicationContext
        Thread {
            val result = try {
                Scanner(appContext).run { msg -> runOnUiThread { scanProgress?.text = msg } }
            } catch (e: Exception) {
                Scanner.Result(emptyList(), 0, 0).also {
                    runOnUiThread { toast("Scan failed: ${e.message}") }
                }
            }
            runOnUiThread {
                scanning = false
                lastResult = result
                rules.lastScanTime = System.currentTimeMillis()
                saveScanSummary(result)
                show(tab)
            }
        }.start()
    }

    private fun saveScanSummary(r: Scanner.Result) {
        rules.lastScanIssues = r.findings.size
        rules.lastScanHigh = r.findings.count { it.severity == Severity.HIGH }
    }

    // ---------------------------------------------------------------- Helpers

    private fun runFix(fix: Fix, pkg: String?) {
        val candidates = FixIntents.candidates(this, fix, pkg)
        for (i in candidates) {
            try {
                startActivity(i)
                return
            } catch (_: Exception) {
            }
        }
        toast("Couldn't open that screen. Look for it in Settings.")
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
