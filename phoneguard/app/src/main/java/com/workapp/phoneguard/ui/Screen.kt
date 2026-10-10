package com.workapp.phoneguard.ui

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import com.workapp.phoneguard.Fix
import com.workapp.phoneguard.Rules
import com.workapp.phoneguard.dp

/** What a screen may ask of the activity that hosts it. */
interface Host {
    val activity: Activity
    val rules: Rules

    /** Switch to a tab (MainActivity.TAB_*). */
    fun show(tab: Int)

    /** The screen object for a tab (created if needed), e.g. to preset a filter before showing it. */
    fun screen(tab: Int): Screen

    /** Start (asks for VPN permission if needed) or stop protection. */
    fun setProtection(on: Boolean)

    fun requestNotifications()

    /** Open the Android settings screen that fixes [fix]. */
    fun runFix(fix: Fix, pkg: String?)

    /** Try each intent in turn; false if none could be opened. */
    fun open(vararg intents: Intent?): Boolean

    fun toast(msg: String)

    /** Ask the firewall to pick up rule changes (batched, so quick taps cause one reload). */
    fun scheduleReload()

    /** Show a dialog that is closed automatically if the activity goes away (e.g. on rotation). */
    fun dialog(builder: AlertDialog.Builder): AlertDialog?

    /** False once the activity is finishing or destroyed; background work must then drop its result. */
    val alive: Boolean
}

/**
 * One screen of the app. The view is built once per activity and kept while switching
 * tabs, so scroll position and typed text survive. Everything runs on the main thread.
 */
abstract class Screen(protected val host: Host) {
    protected val ctx: Activity get() = host.activity
    private var built: View? = null
    protected var visible = false
        private set

    fun view(): View = built ?: create().also { built = it }

    protected abstract fun create(): View

    /** Became visible (tab chosen or app resumed). Refresh data here. */
    open fun onShown() {}

    open fun onHidden() {}

    /** Called every 2 seconds while visible. Keep it cheap. */
    open fun tick() {}

    /** Something changed elsewhere (scan finished, lists updated, permission answered). */
    open fun onDataChanged() {}

    /** Keep small choices (filters, sort order) across rotation. Typed text and scroll are saved by Android. */
    open fun save(out: Bundle) {}

    /** Called right after the screen object is created, before [view]. */
    open fun restore(state: Bundle) {}

    /** Dark dialog that matches the app, whatever the phone's own theme is. */
    protected fun dialogBuilder(): AlertDialog.Builder =
        AlertDialog.Builder(ctx, android.R.style.Theme_Material_Dialog_Alert)

    fun shown() {
        visible = true
        onShown()
    }

    fun hidden() {
        if (!visible) return
        visible = false
        onHidden()
    }

    protected fun scrolling(body: LinearLayout, id: Int): ScrollView = ScrollView(ctx).apply {
        // A fixed id lets Android restore the scroll position after rotation.
        this.id = id
        isFillViewport = true
        body.setPadding(ctx.dp(16), ctx.dp(8), ctx.dp(16), ctx.dp(24))
        addView(body)
    }
}

/** Fixed view ids, so Android saves their state (scroll, typed text) across rotation. */
object Ids {
    const val HOME_SCROLL = 0x00100001
    const val FIREWALL_LIST = 0x00100002
    const val FIREWALL_SEARCH = 0x00100003
    const val ACTIVITY_LIST = 0x00100004
    const val SCAN_SCROLL = 0x00100005
    const val SETTINGS_SCROLL = 0x00100006
}

/**
 * Tells whoever is listening (the visible activity) that background work finished.
 * Main thread only; [post] may be called from any thread.
 */
object UiBus {
    private val main = Handler(Looper.getMainLooper())
    private val listeners = LinkedHashSet<() -> Unit>()

    fun add(l: () -> Unit) { listeners += l }
    fun remove(l: () -> Unit) { listeners -= l }

    fun post() {
        main.post { listeners.toList().forEach { it() } }
    }
}
