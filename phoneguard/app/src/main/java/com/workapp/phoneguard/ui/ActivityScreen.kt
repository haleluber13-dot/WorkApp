package com.workapp.phoneguard.ui

import android.os.Bundle
import android.text.TextUtils
import android.view.View
import android.view.ViewGroup
import android.widget.AbsListView
import android.widget.BaseAdapter
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import com.workapp.phoneguard.C
import com.workapp.phoneguard.FirewallService
import com.workapp.phoneguard.ProtectionMode
import com.workapp.phoneguard.card
import com.workapp.phoneguard.chip
import com.workapp.phoneguard.column
import com.workapp.phoneguard.core.AppTraffic
import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.TrafficStore
import com.workapp.phoneguard.dp
import com.workapp.phoneguard.label
import com.workapp.phoneguard.pill
import com.workapp.phoneguard.put
import com.workapp.phoneguard.rounded
import com.workapp.phoneguard.row
import com.workapp.phoneguard.sectionTitle
import com.workapp.phoneguard.setChipSelected
import java.text.DateFormat
import java.util.Date

/** Live view of what apps connect to, and which apps send the most data. */
class ActivityScreen(host: Host) : Screen(host) {

    enum class Filter(val title: String) { ALL("All"), BLOCKED("Blocked"), SCREEN_OFF("Screen-off uploaders") }

    private companion object {
        const val SENDERS_SHORT = 5
        const val SENDERS_LONG = 30
    }

    private var filter = Filter.ALL
    private var showAllSenders = false
    private var events: List<ConnEvent> = emptyList()
    private val timeFormat = DateFormat.getTimeInstance(DateFormat.MEDIUM)

    private lateinit var list: ListView
    private lateinit var intro: TextView
    private lateinit var retryFull: TextView
    private lateinit var senders: LinearLayout
    private lateinit var moreSenders: TextView
    private lateinit var emptyEvents: TextView
    private val chips = HashMap<Filter, TextView>()
    private val adapter = Adapter()

    fun setFilter(f: Filter) {
        filter = f
        if (::list.isInitialized) {
            chips.forEach { (k, v) -> v.setChipSelected(k == f) }
            refresh()
            list.setSelection(0)
        }
    }

    override fun save(out: Bundle) {
        out.putString("filter", filter.name)
        out.putBoolean("allSenders", showAllSenders)
    }

    override fun restore(state: Bundle) {
        filter = try { Filter.valueOf(state.getString("filter") ?: "ALL") } catch (_: Exception) { Filter.ALL }
        showAllSenders = state.getBoolean("allSenders", false)
    }

    override fun create(): View {
        val header = ctx.column().apply { setPadding(0, ctx.dp(8), 0, 0) }

        intro = ctx.label("", 14f, C.SUB)
        header.put(intro, 10)
        retryFull = ctx.pill("Try Full protection again", C.GREEN) { retryFullProtection(host) }
        header.put(retryFull, 10, wrap = true)

        val who = ctx.card()
        who.put(ctx.sectionTitle("Who is sending data"), 4)
        who.put(ctx.label(
            "Apps that upload a lot while your screen is off deserve a closer look — spy apps do this. Tap an app for details.",
            13f, C.SUB), 10)
        senders = ctx.column()
        who.put(senders, 4)
        moreSenders = ctx.label("", 14f, C.GREEN, bold = true).apply {
            minHeight = ctx.dp(44)
            gravity = android.view.Gravity.CENTER_VERTICAL
            isClickable = true
            setOnClickListener {
                showAllSenders = !showAllSenders
                refreshSenders()
            }
        }
        who.put(moreSenders, 0)
        header.put(who, 12)

        header.put(ctx.sectionTitle("Connections"), 6)
        val chipRow = ctx.row()
        for (f in Filter.values()) {
            val c = ctx.chip(f.title, f == filter) { setFilter(f) }
            chips[f] = c
            chipRow.put(c, 8, wrap = true)
        }
        header.put(HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            addView(chipRow)
        }, 6)
        header.put(ctx.label("Tap a connection to allow or block the site or the app.", 13f, C.SUB), 8)
        emptyEvents = ctx.label("", 14f, C.SUB).apply { setPadding(0, ctx.dp(12), 0, ctx.dp(12)) }
        header.put(emptyEvents, 0)

        list = ListView(ctx).apply {
            id = Ids.ACTIVITY_LIST
            divider = null
            dividerHeight = 0
            setPadding(ctx.dp(16), 0, ctx.dp(16), ctx.dp(16))
            clipToPadding = false
            addHeaderView(header, null, false)
            adapter = this@ActivityScreen.adapter
            setOnItemClickListener { _, _, position, _ -> eventAt(position)?.let { onEvent(it) } }
            setOnItemLongClickListener { _, _, position, _ ->
                eventAt(position)?.let { onEvent(it); true } ?: false
            }
            setOnScrollListener(object : AbsListView.OnScrollListener {
                override fun onScrollStateChanged(view: AbsListView?, state: Int) { scrollState = state }
                override fun onScroll(view: AbsListView?, first: Int, visible: Int, total: Int) {}
            })
        }
        return list
    }

    private fun eventAt(position: Int): ConnEvent? = events.getOrNull(position - list.headerViewsCount)

    private fun onEvent(e: ConnEvent) {
        // Nothing to offer for an unnamed connection from something that can't be blocked.
        if (e.domain == null && !AppNames.of(ctx, e.uid).isApp) return
        showSiteActions(host, e.domain, e.uid, e.blocked, e.reason) { refresh() }
    }

    override fun onShown() = refresh()

    override fun tick() = refresh()

    private fun refresh() {
        if (!::list.isInitialized) return
        val apps = TrafficStore.apps()
        refreshIntro()
        refreshSenders(apps)

        val newEvents = when (filter) {
            Filter.ALL -> TrafficStore.recent()
            // Blocked events have their own log, so lots of allowed traffic can't push them out.
            Filter.BLOCKED -> TrafficStore.recentBlocked()
            Filter.SCREEN_OFF -> {
                val uids = apps.filter { it.sentScreenOff >= Format.SCREEN_OFF_NOTABLE }.map { it.uid }.toSet()
                TrafficStore.recent().filter { it.uid in uids }
            }
        }
        emptyEvents.text = when {
            newEvents.isNotEmpty() -> ""
            // Same source as the "Blocked log (N)" count, so the two never contradict each other.
            filter == Filter.BLOCKED -> Format.emptyBlockedText(FirewallService.running, TrafficStore.totalBlocked())
            !FirewallService.running -> "Nothing to show. Turn on protection to see connections."
            filter == Filter.SCREEN_OFF -> "No app has uploaded much while your screen was off. That's good."
            else -> "No connections seen yet."
        }
        emptyEvents.visibility = if (newEvents.isEmpty()) View.VISIBLE else View.GONE
        updateEvents(newEvents)
    }

    /** Swap in new events while keeping the row you are looking at in place. */
    private fun updateEvents(newEvents: List<ConnEvent>) {
        // Don't move rows while a finger is on the list; the next refresh catches up.
        if (scrollState != AbsListView.OnScrollListener.SCROLL_STATE_IDLE) return
        val first = list.firstVisiblePosition - list.headerViewsCount
        if (first < 0 || events.isEmpty()) {
            events = newEvents
            adapter.notifyDataSetChanged()
            return
        }
        val anchor = events.getOrNull(first)
        val top = list.getChildAt(0)?.top ?: 0
        events = newEvents
        adapter.notifyDataSetChanged()
        // Events are shared objects from TrafficStore, so identity finds the same row.
        val idx = if (anchor == null) -1 else newEvents.indexOfFirst { it === anchor }
        if (idx >= 0) {
            list.setSelectionFromTop(idx + list.headerViewsCount, top)
        }
    }

    private var scrollState = AbsListView.OnScrollListener.SCROLL_STATE_IDLE

    private fun refreshIntro() {
        val mode = runningMode(host.rules)
        val fellBack = fellBackToBasic(host.rules)
        retryFull.visibility = if (fellBack) View.VISIBLE else View.GONE
        intro.text = when {
            mode == null -> "Protection is off, so PhoneGuard can't see connections right now. Turn it on from Home."
            fellBack -> FALLBACK_TEXT
            mode == ProtectionMode.BASIC && host.rules.mode == ProtectionMode.FULL -> "Switching to Full protection…"
            mode == ProtectionMode.BASIC -> "Basic mode only sees apps you've blocked. Choose Full protection in Settings to see every app's traffic."
            else -> "Live view of where your apps connect, updated every 2 seconds. Counting since " +
                android.text.format.DateUtils.formatSameDayTime(
                    TrafficStore.since(), System.currentTimeMillis(), DateFormat.MEDIUM, DateFormat.SHORT,
                ) + "."
        }
        intro.setTextColor(if (mode == ProtectionMode.FULL) C.SUB else C.AMBER)
    }

    private fun refreshSenders(apps: List<AppTraffic> = TrafficStore.apps()) {
        val withData = apps.filter { it.sent > 0 || it.received > 0 }.sortedByDescending { it.sent }
        val limit = if (showAllSenders) SENDERS_LONG else SENDERS_SHORT
        val top = withData.take(limit)
        // Reuse row views so the list doesn't flicker every refresh.
        for (i in senders.childCount - 1 downTo 0) if (senders.getChildAt(i).tag == "empty") senders.removeViewAt(i)
        while (senders.childCount > top.size) senders.removeViewAt(senders.childCount - 1)
        while (senders.childCount < top.size) senders.addView(senderRow())
        top.forEachIndexed { i, t -> bindSender(senders.getChildAt(i), t) }
        if (top.isEmpty()) {
            senders.addView(ctx.label(
                if (runningMode(host.rules) == ProtectionMode.FULL) "No data counted yet." else "Data is counted while protection is on in Full mode.",
                14f, C.SUB).apply { tag = "empty" })
        }
        moreSenders.visibility = if (withData.size > SENDERS_SHORT) View.VISIBLE else View.GONE
        moreSenders.text = if (showAllSenders) "Show fewer" else "Show all ${withData.size.coerceAtMost(SENDERS_LONG)}"
    }

    private class SenderHolder(val icon: ImageView, val name: TextView, val amounts: TextView, val off: TextView)

    private fun senderRow(): View {
        val r = ctx.row().apply {
            minimumHeight = ctx.dp(56)
            setPadding(0, ctx.dp(6), 0, ctx.dp(6))
            isClickable = true
        }
        val icon = ImageView(ctx)
        r.addView(icon, LinearLayout.LayoutParams(ctx.dp(36), ctx.dp(36)).apply { marginEnd = ctx.dp(12) })
        val texts = ctx.column()
        val name = ctx.label("", 15f, bold = true).apply { isSingleLine = true; ellipsize = TextUtils.TruncateAt.END }
        val amounts = ctx.label("", 13f, C.SUB)
        val off = ctx.label("", 13f, C.AMBER, bold = true)
        texts.addView(name)
        texts.addView(amounts)
        texts.addView(off)
        r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        r.tag = SenderHolder(icon, name, amounts, off)
        return r
    }

    private fun bindSender(v: View, t: AppTraffic) {
        val h = v.tag as? SenderHolder ?: return
        val who = AppNames.of(ctx, t.uid)
        h.icon.setImageDrawable(who.icon)
        h.name.text = who.label
        h.amounts.text = "↑ ${Format.bytes(t.sent)} sent · ↓ ${Format.bytes(t.received)} received"
        val notable = t.sentScreenOff >= Format.SCREEN_OFF_NOTABLE
        h.off.visibility = if (t.sentScreenOff > 0) View.VISIBLE else View.GONE
        h.off.text = "${Format.bytes(t.sentScreenOff)} sent while the screen was off"
        h.off.setTextColor(if (notable) C.AMBER else C.SUB)
        v.setOnClickListener { showAppDetail(host, t.uid, if (who.isApp) who.packages else emptyList()) { refresh() } }
    }

    private inner class Adapter : BaseAdapter() {
        override fun getCount() = events.size
        override fun getItem(position: Int) = events[position]
        override fun getItemId(position: Int) = position.toLong()

        private inner class Holder(
            val wrapper: View, val card: View, val icon: ImageView, val app: TextView, val time: TextView,
            val target: TextView, val detail: TextView,
        )

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val h = (convertView?.tag as? Holder) ?: run {
                val r = ctx.row().apply {
                    setPadding(ctx.dp(12), ctx.dp(10), ctx.dp(12), ctx.dp(10))
                    minimumHeight = ctx.dp(60)
                }
                val icon = ImageView(ctx)
                r.addView(icon, LinearLayout.LayoutParams(ctx.dp(32), ctx.dp(32)).apply { marginEnd = ctx.dp(12) })
                val texts = ctx.column()
                val top = ctx.row()
                val app = ctx.label("", 14f, bold = true).apply { isSingleLine = true; ellipsize = TextUtils.TruncateAt.END }
                val time = ctx.label("", 12f, C.SUB)
                top.put(app, 8, weight = 1f)
                top.put(time, 0, wrap = true)
                texts.addView(top)
                val target = ctx.label("", 14f).apply { isSingleLine = true; ellipsize = TextUtils.TruncateAt.MIDDLE }
                val detail = ctx.label("", 12f, C.SUB).apply { isSingleLine = true; ellipsize = TextUtils.TruncateAt.END }
                texts.addView(target)
                texts.addView(detail)
                r.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                val wrapper = LinearLayout(ctx).apply { setPadding(0, 0, 0, ctx.dp(6)) }
                wrapper.addView(r, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
                Holder(wrapper, r, icon, app, time, target, detail).also { wrapper.tag = it }
            }
            val e = events[position]
            val who = AppNames.of(ctx, e.uid)
            h.icon.setImageDrawable(who.icon)
            h.app.text = who.label
            h.time.text = timeFormat.format(Date(e.time))
            h.target.text = Format.endpoint(e)
            h.target.setTextColor(if (e.blocked) C.RED else C.TEXT)
            h.detail.text = if (e.blocked) listOfNotNull("Blocked", e.reason, Format.kind(e.kind)).joinToString(" · ") else Format.kind(e.kind)
            h.detail.setTextColor(if (e.blocked) C.RED else C.SUB)
            h.card.background = if (e.blocked) ctx.rounded(C.CARD, 14, C.RED, 1) else ctx.rounded(C.CARD, 14)
            return h.wrapper
        }
    }
}
