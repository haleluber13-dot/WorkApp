package com.workapp.phoneguard.ui

import android.view.View
import android.view.ViewGroup
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.workapp.phoneguard.C
import com.workapp.phoneguard.Finding
import com.workapp.phoneguard.Fix
import com.workapp.phoneguard.Severity
import com.workapp.phoneguard.bullet
import com.workapp.phoneguard.card
import com.workapp.phoneguard.column
import com.workapp.phoneguard.dp
import com.workapp.phoneguard.label
import com.workapp.phoneguard.pill
import com.workapp.phoneguard.put
import com.workapp.phoneguard.rounded
import com.workapp.phoneguard.row

/** Spyware and security scan: findings with what to do about each. */
class ScanScreen(host: Host) : Screen(host) {
    private lateinit var scroll: ScrollView
    private lateinit var body: LinearLayout
    private var progress: TextView? = null
    /** What the layout shows, so progress updates don't rebuild everything. */
    private var builtFor: Pair<Boolean, Any?>? = null

    override fun create(): View {
        body = ctx.column()
        scroll = scrolling(body, Ids.SCAN_SCROLL)
        rebuild()
        return scroll
    }

    override fun onShown() {
        ScanTask.dropRemoved(ctx)
        refresh()
    }

    override fun onDataChanged() = refresh()

    private fun refresh() {
        if (builtFor != (ScanTask.running to ScanTask.result)) {
            val y = scroll.scrollY
            rebuild()
            scroll.post { scroll.scrollTo(0, y) }
        } else {
            progress?.text = ScanTask.progress
        }
    }

    private fun rebuild() {
        val scanning = ScanTask.running
        val result = ScanTask.result
        builtFor = scanning to result
        body.removeAllViews()
        progress = null

        val head = ctx.card(C.CARD2)
        head.put(ctx.label("Spyware & security scan", 20f, bold = true), 6)
        head.put(ctx.label("Looks for known spy apps, hidden apps, apps that can watch your screen, read your messages or track you, and settings someone could use to snoop on you over Wi-Fi or mobile data.", 14f, C.SUB), 12)
        if (scanning) {
            head.put(ctx.label("Scanning…", 16f, C.GREEN, true), 2)
            progress = ctx.label(ScanTask.progress, 14f, C.GREEN).also { head.put(it, 0) }
        } else {
            head.put(ctx.pill(if (result == null) "Scan my phone" else "Scan again") { ScanTask.start(ctx) }, 0, wrap = true)
        }
        body.put(head)

        if (result != null && !scanning) {
            val high = result.findings.count { it.severity == Severity.HIGH }
            val summary = ctx.card()
            if (result.findings.isEmpty()) {
                summary.put(ctx.label("✓ Nothing suspicious found", 18f, C.GREEN, true), 4)
                summary.put(ctx.label("Checked ${result.appsChecked} apps and your phone's security settings.", 14f, C.SUB), 0)
            } else {
                summary.put(ctx.label(
                    "${Format.count(result.findings.size, "thing")} to review",
                    18f, if (high > 0) C.RED else C.AMBER, true), 4)
                summary.put(ctx.label(
                    "Checked ${result.appsChecked} apps. Go through each one below. If you recognise an app and trust it, tap \"I trust this\" so it isn't shown again, unless it gets new powers later.",
                    14f, C.SUB), 0)
            }
            body.put(summary)

            for (f in result.findings) body.put(findingCard(f))

            if (result.hiddenByTrust > 0) {
                val t = ctx.card()
                val n = result.hiddenByTrust
                t.put(ctx.label("${Format.count(n, "item")} you marked as trusted ${if (n == 1) "is" else "are"} hidden.", 14f, C.SUB), 8)
                t.put(ctx.pill("Show them again", C.SUB, filled = false) {
                    host.rules.clearTrusted()
                    ScanTask.start(ctx)
                }, 0, wrap = true)
                body.put(t)
            }
        } else if (!scanning && host.rules.lastScanTime > 0) {
            // Results are kept only while the app is open; the summary is remembered.
            val c = ctx.card()
            val issues = host.rules.lastScanIssues
            c.put(ctx.label(
                "Your last scan found " + (if (issues <= 0) "nothing." else "${Format.count(issues, "item")} to review.") +
                    " Scan again to see the details.", 14f, C.SUB), 0)
            body.put(c)
        }

        val note = ctx.card()
        note.put(ctx.label("Good to know", 16f, bold = true), 6)
        note.put(ctx.bullet("No app can find every kind of spyware. Advanced spyware sold to governments, or anything on a rooted phone, can hide from all apps. If you strongly suspect that, back up your photos and do a factory reset, then change your account passwords from a different device."), 6)
        note.put(ctx.bullet("Many normal apps (password managers, smartwatch apps, work apps) use these same powers. The scan shows what an app CAN do; you decide if that makes sense."), 6)
        note.put(ctx.bullet("Spy app database: Echap stalkerware-indicators (CC-BY 4.0)."), 0)
        body.put(note)
    }

    private fun findingCard(f: Finding): View {
        val c = ctx.card()
        val chip = ctx.label(f.severity.label.uppercase(), 11f, f.severity.color, true).apply {
            setPadding(ctx.dp(8), ctx.dp(3), ctx.dp(8), ctx.dp(3))
            background = ctx.rounded(0, 10, f.severity.color, 1)
        }
        c.put(chip, 8, wrap = true)
        val titleRow = ctx.row()
        if (f.pkg != null) {
            val icon = try { ctx.packageManager.getApplicationIcon(f.pkg) } catch (_: Exception) { null }
            if (icon != null) {
                titleRow.addView(ImageView(ctx).apply { setImageDrawable(icon) },
                    LinearLayout.LayoutParams(ctx.dp(32), ctx.dp(32)).apply { marginEnd = ctx.dp(10) })
            }
        }
        titleRow.put(ctx.column().apply {
            put(ctx.label(f.title, 17f, bold = true), 0)
            if (f.pkg != null) put(ctx.label(f.pkg, 12f, C.SUB), 0)
        }, 0, weight = 1f)
        c.put(titleRow, 8)
        f.details.forEach { c.put(ctx.bullet(it, C.TEXT), 4) }

        val actions = ctx.row().apply { setPadding(0, ctx.dp(8), 0, 0) }
        for (a in f.actions) {
            val color = if (a.fix == Fix.UNINSTALL) C.RED else C.GREEN
            actions.put(ctx.pill(a.label, color, filled = a.fix == Fix.UNINSTALL) { host.runFix(a.fix, f.pkg) }, 8, wrap = true)
        }
        // Known stalkerware can't be hidden: someone holding the phone could otherwise make it disappear.
        if (f.trustable) {
            actions.put(ctx.pill("I trust this", C.SUB, filled = false) {
                ScanTask.trust(ctx, f.id)
                refresh()
            }, 0, wrap = true)
        }
        c.put(HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            addView(actions)
        }, 0)

        return LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(View(ctx).apply { background = ctx.rounded(f.severity.color, 3) },
                LinearLayout.LayoutParams(ctx.dp(5), ViewGroup.LayoutParams.MATCH_PARENT).apply { marginEnd = ctx.dp(6) })
            addView(c, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        }
    }
}
