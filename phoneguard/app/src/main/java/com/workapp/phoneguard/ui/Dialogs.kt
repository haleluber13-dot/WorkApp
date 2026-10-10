package com.workapp.phoneguard.ui

import android.net.Uri
import android.provider.Settings
import android.content.Intent
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import com.workapp.phoneguard.C
import com.workapp.phoneguard.FirewallService
import com.workapp.phoneguard.NetType
import com.workapp.phoneguard.column
import com.workapp.phoneguard.divider
import com.workapp.phoneguard.dp
import com.workapp.phoneguard.label
import com.workapp.phoneguard.pill
import com.workapp.phoneguard.put
import com.workapp.phoneguard.row
import com.workapp.phoneguard.shield.Shield
import com.workapp.phoneguard.switchRow
import com.workapp.phoneguard.core.TrafficStore
import java.text.DateFormat
import java.util.Date

/*
 * Dialogs shared by the Firewall and Activity screens.
 */

private fun Host.builder() =
    android.app.AlertDialog.Builder(activity, android.R.style.Theme_Material_Dialog_Alert)

/**
 * Details for one app: data used (screen-off amounts stand out), sites contacted,
 * sites blocked, and its Wi-Fi / mobile data switches.
 * [packages] are the packages the switches apply to; [onChanged] runs after a rule changes.
 */
fun showAppDetail(host: Host, uid: Int, packages: List<String>, onChanged: () -> Unit = {}) {
    val ctx = host.activity
    val who = AppNames.of(ctx, uid)
    val t = TrafficStore.app(uid)
    val body = ctx.column().apply { setPadding(ctx.dp(20), ctx.dp(16), ctx.dp(20), ctx.dp(8)) }

    val head = ctx.row()
    if (who.icon != null) {
        head.addView(ImageView(ctx).apply { setImageDrawable(who.icon) },
            LinearLayout.LayoutParams(ctx.dp(44), ctx.dp(44)).apply { marginEnd = ctx.dp(12) })
    }
    head.put(ctx.column().apply {
        put(ctx.label(who.label, 19f, bold = true), 0)
        val sub = packages.firstOrNull() ?: who.packages.firstOrNull()
        if (sub != null) put(ctx.label(sub, 12f, C.SUB), 0)
    }, 0, weight = 1f)
    body.put(head, 14)

    if (packages.isNotEmpty()) {
        val rules = host.rules
        for ((net, name) in listOf(NetType.WIFI to "Allowed on Wi-Fi", NetType.MOBILE to "Allowed on mobile data")) {
            val allowed = packages.none { rules.isBlocked(it, net) }
            body.put(ctx.switchRow(name, null, allowed) { on ->
                for (p in packages) rules.setBlocked(p, net, !on)
                host.scheduleReload()
                onChanged()
                if (!on && !FirewallService.running) host.toast("Saved. Turn on protection to apply it.")
            }, 4)
        }
        if (packages.size > 1) {
            body.put(ctx.label("These apps share one internet identity, so the switches apply to all of them: " +
                packages.joinToString(", "), 12f, C.SUB), 8)
        }
        body.put(ctx.divider(), 12)
    }

    if (t == null || (t.sent == 0L && t.received == 0L && t.domains.isEmpty() && t.blockedDomains.isEmpty())) {
        body.put(ctx.label(
            if (FirewallService.running) "No internet use seen yet since ${time(TrafficStore.since())}."
            else "No internet use seen. PhoneGuard only counts data while protection is on in Full mode.",
            14f, C.SUB), 8)
    } else {
        body.put(ctx.label("Since ${time(TrafficStore.since())}", 13f, C.SUB), 8)
        body.put(amountRow(host, "Sent (uploaded)", t.sent, t.sentScreenOff), 6)
        body.put(amountRow(host, "Received (downloaded)", t.received, t.receivedScreenOff), 6)
        val counts = "${Format.count(t.connections, "connection")} · ${Format.count(t.blocked, "attempt")} stopped"
        body.put(ctx.label(counts, 13f, if (t.blocked > 0) C.AMBER else C.SUB), 12)
        if (t.sentScreenOff >= Format.SCREEN_OFF_NOTABLE) {
            body.put(ctx.label("This app uploaded ${Format.bytes(t.sentScreenOff)} while your screen was off. " +
                "If you don't know why it would, take a closer look or block it.", 13f, C.AMBER), 12)
        }
        domainList(host, body, "Sites contacted", t.domains, C.TEXT, uid)
        domainList(host, body, "Sites blocked", t.blockedDomains, C.RED, uid)
    }

    val b = host.builder()
        .setView(ScrollView(ctx).apply { addView(body) })
        .setPositiveButton("Close", null)
    val infoPkg = packages.firstOrNull() ?: who.packages.firstOrNull()
    if (infoPkg != null) {
        b.setNeutralButton("Open app info") { _, _ ->
            if (!host.open(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", infoPkg, null)))) {
                host.toast("Couldn't open app info.")
            }
        }
    }
    host.dialog(b)
}

private fun amountRow(host: Host, title: String, total: Long, screenOff: Long): View {
    val ctx = host.activity
    val r = ctx.column()
    r.put(ctx.label("$title: ${Format.bytes(total)}", 15f, bold = true), 0)
    if (screenOff > 0) {
        val notable = screenOff >= Format.SCREEN_OFF_NOTABLE
        r.put(ctx.label("${Format.bytes(screenOff)} of it while the screen was off", 13f,
            if (notable) C.AMBER else C.SUB, bold = notable), 0)
    }
    return r
}

private fun domainList(host: Host, body: LinearLayout, title: String, map: Map<String, Int>, color: Int, uid: Int) {
    if (map.isEmpty()) return
    val ctx = host.activity
    val top = Format.top(map, 30)
    body.put(ctx.label(if (map.size > top.size) "$title (top ${top.size} of ${map.size})" else title, 15f, bold = true), 6)
    for ((domain, n) in top) {
        val r = ctx.row().apply {
            minimumHeight = ctx.dp(40)
            isClickable = true
            setOnClickListener { showSiteActions(host, domain, uid, blocked = color == C.RED) }
        }
        r.put(ctx.label(domain, 14f, color).apply { isSingleLine = true; ellipsize = android.text.TextUtils.TruncateAt.MIDDLE }, 8, weight = 1f)
        r.put(ctx.label("×$n", 13f, C.SUB), 0, wrap = true)
        body.put(r, 0)
    }
    body.put(View(ctx), 12)
}

/**
 * What to do about a site (and the app that contacted it): always allow, block, or block the app.
 * [domain] may be null for connections without a known name; then only "Block this app" is offered.
 */
fun showSiteActions(host: Host, domain: String?, uid: Int, blocked: Boolean, onChanged: () -> Unit = {}) {
    val ctx = host.activity
    val who = AppNames.of(ctx, uid)
    val body = ctx.column().apply { setPadding(ctx.dp(20), ctx.dp(16), ctx.dp(20), ctx.dp(8)) }
    body.put(ctx.label(domain ?: "Connection by ${who.label}", 18f, bold = true), 4)
    if (domain != null) body.put(ctx.label("Used by ${who.label}", 13f, C.SUB), 14)

    var dialog: android.app.AlertDialog? = null
    fun action(text: String, color: Int, filled: Boolean, run: () -> Unit) {
        body.put(ctx.pill(text, color, filled) {
            try {
                run()
            } catch (_: Exception) {
                host.toast("Couldn't save that. Please try again.")
            }
            onChanged()
            dialog?.dismiss()
        }, 8)
    }

    if (domain != null) {
        val allowed = try { Shield.allowed(ctx) } catch (_: Exception) { emptySet() }
        val denied = try { Shield.denied(ctx) } catch (_: Exception) { emptySet() }
        if (domain in allowed) {
            action("Stop always allowing this site", C.SUB, false) {
                Shield.unallow(ctx, domain)
                host.toast("$domain is checked by the Web Shield again.")
            }
        } else {
            action("Always allow this site", C.GREEN, blocked) {
                // Drop an earlier block so the two lists never disagree.
                if (domain in denied) Shield.undeny(ctx, domain)
                Shield.allow(ctx, domain)
                host.toast("$domain will always be allowed. Apps may take a minute to notice.")
            }
        }
        if (domain in denied) {
            action("Unblock this site", C.SUB, false) {
                Shield.undeny(ctx, domain)
                host.toast("$domain is no longer on your blocked list.")
            }
        } else {
            action("Block this site", C.RED, false) {
                if (domain in allowed) Shield.unallow(ctx, domain)
                Shield.deny(ctx, domain)
                host.toast("$domain is blocked for all apps. Apps may take a minute to notice.")
            }
        }
        body.put(ctx.label("Sites are blocked for every app, including subdomains. Changes need protection to be on in Full mode.", 12f, C.SUB), 12)
    }

    if (who.isApp && ctx.packageName !in who.packages) {
        action("Block this app", C.RED, false) { blockApp(host, who) }
    } else if (uid in 0 until android.os.Process.FIRST_APPLICATION_UID) {
        body.put(ctx.label("${who.label} is part of Android and can't be blocked here: blocking it could break your phone's internet.", 12f, C.SUB), 8)
    }

    dialog = host.dialog(host.builder().setView(ScrollView(ctx).apply { addView(body) }).setNegativeButton("Cancel", null))
}

private fun blockApp(host: Host, who: AppIdentity) {
    for (p in who.packages) host.rules.setBlocked(p, NetType.NONE, true)
    host.scheduleReload()
    host.toast(
        if (FirewallService.running) "${who.label} can no longer use the internet. Undo this on the Firewall tab."
        else "Saved. ${who.label} will be blocked when you turn protection on."
    )
}

private fun time(t: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(Date(t))
