package com.workapp.phoneguard.ui

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import com.workapp.phoneguard.Rules
import com.workapp.phoneguard.Scanner
import com.workapp.phoneguard.Severity
import com.workapp.phoneguard.shield.ListInfo
import com.workapp.phoneguard.shield.Shield

/*
 * Long-running work lives here, outside any activity, so turning the phone or switching
 * tabs never starts it twice or loses the result. Results are delivered through UiBus.
 * Fields are only read and written on the main thread.
 */

object ScanTask {
    private val main = Handler(Looper.getMainLooper())

    /** Last scan in this process (kept so switching tabs doesn't lose it). */
    var result: Scanner.Result? = null
        private set
    var running = false
        private set
    var progress = ""
        private set

    fun start(context: Context) {
        if (running) return
        running = true
        progress = "Starting…"
        UiBus.post()
        val app = context.applicationContext
        Thread({
            val r = try {
                Scanner(app).run { msg -> main.post { progress = msg; UiBus.post() } }
            } catch (_: Throwable) {
                main.post { Toast.makeText(app, "The scan stopped early. Please try again.", Toast.LENGTH_LONG).show() }
                null
            }
            main.post {
                running = false
                if (r != null) {
                    result = r
                    val rules = Rules(app)
                    rules.lastScanTime = System.currentTimeMillis()
                    saveSummary(rules, r)
                }
                UiBus.post()
            }
        }, "pg-scan").start()
    }

    /** The user trusted a finding: drop it from the shown result. */
    fun trust(context: Context, id: String) {
        val rules = Rules(context)
        rules.trust(id)
        val r = result ?: return
        val updated = Scanner.Result(r.findings.filter { it.id != id }, r.hiddenByTrust + 1, r.appsChecked)
        result = updated
        saveSummary(rules, updated)
    }

    /** Drop findings about apps that have since been uninstalled (e.g. from the Uninstall button). */
    fun dropRemoved(context: Context) {
        val r = result ?: return
        if (running) return
        val pm = context.packageManager
        val keep = r.findings.filter { f ->
            f.pkg == null || try { pm.getPackageInfo(f.pkg, 0); true } catch (_: Exception) { false }
        }
        if (keep.size == r.findings.size) return
        val updated = Scanner.Result(keep, r.hiddenByTrust, r.appsChecked)
        result = updated
        saveSummary(Rules(context), updated)
    }

    private fun saveSummary(rules: Rules, r: Scanner.Result) {
        rules.lastScanIssues = r.findings.size
        rules.lastScanHigh = r.findings.count { it.severity == Severity.HIGH }
    }
}

object ShieldTask {
    private val main = Handler(Looper.getMainLooper())

    /** Blocklist details, or null until loaded. */
    var lists: List<ListInfo>? = null
        private set
    var updating = false
        private set
    private var loading = false

    /** Load list details in the background (reading the lists can take a moment). */
    fun loadInfo(context: Context) {
        if (loading) return
        loading = true
        val app = context.applicationContext
        Thread({
            val info = try {
                Shield.init(app)
                Shield.listInfo(app)
            } catch (_: Throwable) { null }
            main.post {
                loading = false
                if (info != null) lists = info
                UiBus.post()
            }
        }, "pg-lists").start()
    }

    fun updateNow(context: Context) {
        if (updating) return
        updating = true
        UiBus.post()
        val app = context.applicationContext
        Thread({
            val ok = try { Shield.updateNow(app) } catch (_: Throwable) { false }
            val info = try { Shield.listInfo(app) } catch (_: Throwable) { null }
            main.post {
                updating = false
                if (info != null) lists = info
                Toast.makeText(
                    app,
                    if (ok) "Blocklists updated." else "Couldn't update the lists right now. PhoneGuard keeps using the lists it has. Try again later.",
                    Toast.LENGTH_LONG,
                ).show()
                UiBus.post()
            }
        }, "pg-update").start()
    }
}
