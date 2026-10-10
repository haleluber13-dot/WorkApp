package com.workapp.phoneguard.ui

import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import com.workapp.phoneguard.C
import com.workapp.phoneguard.FirewallService
import com.workapp.phoneguard.MainActivity
import com.workapp.phoneguard.NetType
import com.workapp.phoneguard.card
import com.workapp.phoneguard.chip
import com.workapp.phoneguard.column
import com.workapp.phoneguard.core.AppTraffic
import com.workapp.phoneguard.core.TrafficStore
import com.workapp.phoneguard.dp
import com.workapp.phoneguard.label
import com.workapp.phoneguard.pill
import com.workapp.phoneguard.put
import com.workapp.phoneguard.rounded
import com.workapp.phoneguard.row
import com.workapp.phoneguard.setChipSelected
import com.workapp.phoneguard.textBox

/** The firewall: every app that can use the internet, with Wi-Fi and mobile data switches. */
class AppsScreen(host: Host) : Screen(host) {

    private class AppEntry(val pkg: String, val label: String, val uid: Int, val system: Boolean, val info: ApplicationInfo) {
        /** Shares an Android system identity: the firewall always lets it through, so no switches. */
        val systemUid = isSystemUid(uid)
        var icon: Drawable? = null
        var iconLoaded = false
    }

    private var showSystem = false
    private var sortByData = false
    private var query = ""
    private var all: List<AppEntry> = emptyList()
    private var shown: List<AppEntry> = emptyList()
    private var traffic: Map<Int, AppTraffic> = emptyMap()
    private var loadGeneration = 0
    private var loaded = false

    private lateinit var status: TextView
    private lateinit var toggle: TextView
    private lateinit var logButton: TextView
    private lateinit var empty: TextView
    private val adapter = Adapter()

    override fun save(out: Bundle) {
        out.putBoolean("system", showSystem)
        out.putBoolean("byData", sortByData)
    }

    override fun restore(state: Bundle) {
        showSystem = state.getBoolean("system", false)
        sortByData = state.getBoolean("byData", false)
    }

    override fun create(): View {
        val body = ctx.column().apply { setPadding(ctx.dp(16), ctx.dp(8), ctx.dp(16), 0) }

        val top = ctx.card()
        val topRow = ctx.row()
        status = ctx.label("", 14f, C.SUB)
        topRow.put(status, 10, weight = 1f)
        toggle = ctx.pill("", C.GREEN) {
            if (FirewallService.running) confirmTurnOff(host) else host.setProtection(true)
        }
        topRow.put(toggle, 0, wrap = true)
        top.put(topRow, 0)
        body.put(top, 10)

        val search = ctx.textBox("Search apps").apply { id = Ids.FIREWALL_SEARCH }
        body.put(search, 8)

        val chips = ctx.row()
        val systemChip = ctx.chip("System apps", showSystem) {}
        systemChip.setOnClickListener {
            showSystem = !showSystem
            systemChip.setChipSelected(showSystem)
            applyFilter()
        }
        chips.put(systemChip, 8, wrap = true)
        val sortChip = ctx.chip(sortLabel(), false) {}
        sortChip.setOnClickListener {
            sortByData = !sortByData
            sortChip.text = sortLabel()
            traffic = trafficByUid()
            applyFilter()
        }
        chips.put(sortChip, 8, wrap = true)
        logButton = ctx.chip("Blocked log", false) {
            (host.screen(MainActivity.TAB_ACTIVITY) as? ActivityScreen)?.setFilter(ActivityScreen.Filter.BLOCKED)
            host.show(MainActivity.TAB_ACTIVITY)
        }
        chips.put(logButton, 0, wrap = true)
        body.put(HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            addView(chips)
        }, 8)
        body.put(ctx.label("Tap Wi-Fi or Data to cut an app off that network (red = blocked). Tap an app to see what it sends.", 13f, C.SUB), 6)

        val list = ListView(ctx).apply {
            id = Ids.FIREWALL_LIST
            divider = null
            dividerHeight = 0
            adapter = this@AppsScreen.adapter
            isFastScrollEnabled = true
            setOnItemClickListener { _, _, position, _ -> shown.getOrNull(position)?.let { openDetail(it) } }
        }
        empty = ctx.label("Loading apps…", 15f, C.SUB).apply {
            gravity = Gravity.CENTER
            setPadding(0, ctx.dp(32), 0, 0)
        }
        val frame = android.widget.FrameLayout(ctx)
        frame.addView(list)
        frame.addView(empty, android.widget.FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        list.emptyView = empty
        body.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        search.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                query = s?.toString()?.trim() ?: ""
                applyFilter()
            }
        })
        return body
    }

    private fun sortLabel() = if (sortByData) "Sort: data sent" else "Sort: name"

    override fun onShown() {
        traffic = trafficByUid()
        updateStatus()
        // Apps may have been installed or removed since last time.
        reloadApps()
    }

    override fun tick() {
        traffic = trafficByUid()
        updateStatus()
        // Refresh numbers without re-sorting, so rows don't jump under your finger.
        adapter.notifyDataSetChanged()
    }

    private fun trafficByUid(): Map<Int, AppTraffic> = TrafficStore.apps().associateBy { it.uid }

    private fun updateStatus() {
        val on = FirewallService.running
        status.text = firewallSummary(host.rules)
        toggle.text = if (on) "Turn off" else "Turn on"
        toggle.setTextColor(if (on) C.RED else C.ON_ACCENT)
        toggle.background = if (on) ctx.rounded(0, 22, C.RED, 1.5) else ctx.rounded(C.GREEN, 22)
        val total = TrafficStore.totalBlocked()
        logButton.text = if (total > 0) "Blocked log ($total)" else "Blocked log"
    }

    private fun reloadApps() {
        val gen = ++loadGeneration
        val pm = ctx.packageManager
        val self = ctx.packageName
        Thread({
            val apps = try {
                @Suppress("DEPRECATION")
                pm.getInstalledApplications(0)
                    .filter {
                        it.packageName != self &&
                            pm.checkPermission(android.Manifest.permission.INTERNET, it.packageName) ==
                            PackageManager.PERMISSION_GRANTED
                    }
                    .map {
                        val label = try { it.loadLabel(pm).toString() } catch (_: Exception) { it.packageName }
                        AppEntry(
                            it.packageName, label, it.uid,
                            it.flags and ApplicationInfo.FLAG_SYSTEM != 0 &&
                                it.flags and ApplicationInfo.FLAG_UPDATED_SYSTEM_APP == 0 &&
                                pm.getLaunchIntentForPackage(it.packageName) == null,
                            it,
                        )
                    }
                    .sortedBy { it.label.lowercase() }
            } catch (_: Exception) { null }
            ctx.runOnUiThread {
                if (!host.alive || gen != loadGeneration) return@runOnUiThread
                if (apps != null) {
                    forgetSystemUidRules(apps)
                    // Keep icons already loaded, so the list doesn't flicker.
                    val old = all.associateBy { it.pkg }
                    for (a in apps) old[a.pkg]?.takeIf { it.iconLoaded }?.let { a.icon = it.icon; a.iconLoaded = true }
                    all = apps
                    loaded = true
                }
                applyFilter()
            }
        }, "pg-apps").start()
    }

    /**
     * Rules saved for apps on a system identity do nothing in Full mode, but in Basic mode they would
     * send all of that identity's traffic (core Android parts included) into the block. Drop them.
     */
    private fun forgetSystemUidRules(apps: List<AppEntry>) {
        val rules = host.rules
        var changed = false
        for (a in apps) {
            if (a.systemUid && rules.isBlocked(a.pkg, NetType.NONE)) {
                rules.setBlocked(a.pkg, NetType.NONE, false)
                changed = true
            }
        }
        if (changed) host.scheduleReload()
    }

    private fun applyFilter() {
        val q = query.lowercase()
        var list = all.filter {
            (showSystem || !it.system) &&
                (q.isEmpty() || it.label.lowercase().contains(q) || it.pkg.contains(q))
        }
        if (sortByData) list = list.sortedWith(compareByDescending<AppEntry> { traffic[it.uid]?.sent ?: 0L }.thenBy { it.label.lowercase() })
        shown = list
        empty.text = when {
            !loaded -> "Loading apps…"
            q.isNotEmpty() -> "No apps match \"$query\"."
            else -> "No apps found."
        }
        adapter.notifyDataSetChanged()
    }

    private fun openDetail(e: AppEntry) {
        showAppDetail(host, e.uid, listOf(e.pkg)) { adapter.notifyDataSetChanged(); updateStatus() }
    }

    private inner class Adapter : BaseAdapter() {
        override fun getCount() = shown.size
        override fun getItem(position: Int) = shown[position]
        override fun getItemId(position: Int) = position.toLong()

        private inner class Holder(
            val root: LinearLayout, val icon: ImageView, val name: TextView,
            val sub: TextView, val wifi: TextView, val data: TextView,
        )

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val h = (convertView?.tag as? Holder) ?: run {
                val r = ctx.row().apply {
                    background = ctx.rounded(C.CARD, 14)
                    setPadding(ctx.dp(12), ctx.dp(10), ctx.dp(10), ctx.dp(10))
                    minimumHeight = ctx.dp(64)
                }
                val icon = ImageView(ctx)
                r.addView(icon, LinearLayout.LayoutParams(ctx.dp(40), ctx.dp(40)).apply { marginEnd = ctx.dp(12) })
                val texts = ctx.column()
                val name = ctx.label("", 15f, bold = true).apply { isSingleLine = true; ellipsize = android.text.TextUtils.TruncateAt.END }
                val sub = ctx.label("", 12f, C.SUB).apply { isSingleLine = true; ellipsize = android.text.TextUtils.TruncateAt.END }
                texts.addView(name)
                texts.addView(sub)
                r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                fun toggleView() = ctx.label("", 12f, bold = true).apply {
                    gravity = Gravity.CENTER
                    minHeight = ctx.dp(44)
                    setPadding(ctx.dp(8), ctx.dp(8), ctx.dp(8), ctx.dp(8))
                }
                val wifi = toggleView()
                val data = toggleView()
                r.addView(wifi, LinearLayout.LayoutParams(ctx.dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = ctx.dp(6) })
                r.addView(data, LinearLayout.LayoutParams(ctx.dp(68), ViewGroup.LayoutParams.WRAP_CONTENT).apply { marginStart = ctx.dp(6) })
                val wrapper = LinearLayout(ctx).apply { setPadding(0, 0, 0, ctx.dp(8)) }
                wrapper.addView(r, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                Holder(wrapper, icon, name, sub, wifi, data).also { wrapper.tag = it }
            }
            val e = shown[position]
            if (!e.iconLoaded) {
                e.icon = try { e.info.loadIcon(ctx.packageManager) } catch (_: Exception) { null }
                e.iconLoaded = true
            }
            h.icon.setImageDrawable(e.icon)
            h.name.text = e.label
            bindSub(h.sub, e)
            val toggles = if (e.systemUid) View.GONE else View.VISIBLE
            h.wifi.visibility = toggles
            h.data.visibility = toggles
            if (!e.systemUid) {
                bindToggle(h.wifi, "Wi-Fi", e.pkg, NetType.WIFI)
                bindToggle(h.data, "Data", e.pkg, NetType.MOBILE)
            }
            return h.root
        }

        private fun bindSub(v: TextView, e: AppEntry) {
            val t = traffic[e.uid]
            val parts = ArrayList<String>()
            if (e.systemUid) parts += "System — always allowed"
            if (t == null || (t.sent == 0L && t.received == 0L && t.blocked == 0)) {
                v.text = parts.firstOrNull() ?: e.pkg
                v.setTextColor(C.SUB)
                return
            }
            if (t.sent > 0 || t.received > 0) parts += "↑ ${Format.bytes(t.sent)}  ↓ ${Format.bytes(t.received)}"
            // Firewall stops and Web Shield site blocks are different things; only the first means the app is cut off.
            if (t.firewallBlocked > 0) parts += "${t.firewallBlocked} stopped by firewall"
            if (t.siteBlocked > 0) parts += Format.count(t.siteBlocked, "site") + " blocked"
            v.text = parts.joinToString(" · ")
            v.setTextColor(if (t.firewallBlocked > 0 || t.sentScreenOff >= Format.SCREEN_OFF_NOTABLE) C.AMBER else C.SUB)
        }

        private fun bindToggle(v: TextView, name: String, pkg: String, net: NetType) {
            val rules = host.rules
            val blocked = rules.isBlocked(pkg, net)
            v.text = if (blocked) "✕ $name" else "✓ $name"
            v.setTextColor(if (blocked) C.TEXT else C.GREEN)
            v.background = if (blocked) ctx.rounded(C.RED, 12) else ctx.rounded(0, 12, C.LINE, 1.5)
            v.contentDescription = "$name ${if (blocked) "blocked" else "allowed"}"
            v.setOnClickListener {
                val nowBlocked = !rules.isBlocked(pkg, net)
                rules.setBlocked(pkg, net, nowBlocked)
                notifyDataSetChanged()
                if (!FirewallService.running && nowBlocked) host.toast("Saved. Turn on protection to apply it.")
                host.scheduleReload()
            }
        }
    }
}
