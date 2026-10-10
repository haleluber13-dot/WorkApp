package com.workapp.phoneguard

import android.app.Activity
import android.app.AlertDialog
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.net.VpnService
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowInsets
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.workapp.phoneguard.ui.ActivityScreen
import com.workapp.phoneguard.ui.AppNames
import com.workapp.phoneguard.ui.AppsScreen
import com.workapp.phoneguard.ui.HomeScreen
import com.workapp.phoneguard.ui.Host
import com.workapp.phoneguard.ui.ScanScreen
import com.workapp.phoneguard.ui.Screen
import com.workapp.phoneguard.ui.SettingsScreen
import com.workapp.phoneguard.ui.UiBus

/**
 * Thin host for the screens in ui/: header, bottom tabs, VPN permission,
 * notification permission and opening Android settings screens.
 */
class MainActivity : Activity(), Host {

    companion object {
        const val EXTRA_TAB = "tab"
        /** From the "protection is off" notification: turn protection on (asks for VPN consent if needed). */
        const val EXTRA_TURN_ON = "turn_on"
        const val TAB_HOME = 0
        const val TAB_FIREWALL = 1
        const val TAB_SCAN = 2
        const val TAB_ACTIVITY = 3
        const val TAB_SETTINGS = 4
        private const val REQ_VPN = 10
        private const val REQ_NOTIFY = 11
        private const val TICK_MS = 2000L

        /** Bottom bar order. Settings is reached from the gear in the header. */
        private val NAV = listOf(
            Triple(TAB_HOME, "🛡", "Home"),
            Triple(TAB_FIREWALL, "🔥", "Firewall"),
            Triple(TAB_ACTIVITY, "📶", "Activity"),
            Triple(TAB_SCAN, "🔍", "Scan"),
        )

        private val main = Handler(Looper.getMainLooper())

        /**
         * Rule changes are batched into one firewall reload. It lives outside the activity
         * so a reload is never lost if the screen turns right after a tap.
         */
        private var reloadContext: Context? = null
        private val reload = Runnable {
            val c = reloadContext ?: return@Runnable
            if (FirewallService.running) {
                try { FirewallService.send(c, FirewallService.ACTION_RELOAD) } catch (_: Exception) {}
            }
        }
    }

    override val activity: Activity get() = this
    override lateinit var rules: Rules
    override val alive: Boolean get() = !isFinishing && !isDestroyed

    private lateinit var content: FrameLayout
    private lateinit var gear: TextView
    private val navViews = HashMap<Int, LinearLayout>()
    private val screens = HashMap<Int, Screen>()
    private var savedScreens: Bundle? = null
    private var tab = -1
    private var backTab = TAB_HOME
    private var resumed = false
    private val dialogs = ArrayList<AlertDialog>()
    private val busListener: () -> Unit = { current()?.onDataChanged() }

    private val ticker = object : Runnable {
        override fun run() {
            current()?.tick()
            main.postDelayed(this, TICK_MS)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        rules = Rules(this)
        reloadContext = applicationContext
        savedScreens = savedInstanceState?.getBundle("screens")

        val root = column().apply { setBackgroundColor(C.BG) }
        val header = row().apply { setPadding(dp(20), dp(8), dp(8), dp(4)) }
        header.put(ImageView(this).apply {
            setImageResource(R.drawable.ic_shield)
            setColorFilter(C.GREEN)
        }, 10, wrap = true)
        header.put(label(getString(R.string.app_name), 22f, bold = true), 0, weight = 1f)
        gear = label("⚙", 24f, C.SUB).apply {
            gravity = Gravity.CENTER
            contentDescription = "Settings"
            isClickable = true
            isFocusable = true
            setOnClickListener { show(if (tab == TAB_SETTINGS) backTab else TAB_SETTINGS) }
        }
        header.addView(gear, LinearLayout.LayoutParams(dp(52), dp(52)))
        root.addView(header)

        content = FrameLayout(this)
        root.addView(content, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        val nav = row().apply {
            setBackgroundColor(C.CARD)
            setPadding(dp(6), dp(4), dp(6), dp(4))
        }
        for ((id, icon, name) in NAV) {
            val item = column().apply {
                gravity = Gravity.CENTER
                setPadding(0, dp(6), 0, dp(6))
                minimumHeight = dp(56)
                isClickable = true
                isFocusable = true
                contentDescription = name
                setOnClickListener { show(id) }
            }
            item.addView(label(icon, 18f).apply { gravity = Gravity.CENTER })
            item.addView(label(name, 12f, C.SUB, bold = true).apply { gravity = Gravity.CENTER })
            navViews[id] = item
            nav.addView(item, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply {
                marginStart = dp(2); marginEnd = dp(2)
            })
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
        UiBus.add(busListener)

        backTab = savedInstanceState?.getInt("backTab", TAB_HOME) ?: TAB_HOME
        show(savedInstanceState?.getInt("tab", TAB_HOME) ?: (intent?.getIntExtra(EXTRA_TAB, TAB_HOME) ?: TAB_HOME))
        if (savedInstanceState == null) handleTurnOn(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent.hasExtra(EXTRA_TAB)) show(intent.getIntExtra(EXTRA_TAB, TAB_HOME))
        handleTurnOn(intent)
    }

    private fun handleTurnOn(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_TURN_ON, false) != true) return
        intent.removeExtra(EXTRA_TURN_ON) // only once, not again after the screen turns
        if (!FirewallService.running) setProtection(true)
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        // Apps may have been installed or removed while we were away.
        AppNames.clear()
        current()?.shown()
        main.removeCallbacks(ticker)
        main.postDelayed(ticker, TICK_MS)
    }

    override fun onPause() {
        super.onPause()
        resumed = false
        main.removeCallbacks(ticker)
        current()?.hidden()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putInt("tab", tab)
        outState.putInt("backTab", backTab)
        val all = Bundle(savedScreens ?: Bundle())
        for ((id, s) in screens) all.putBundle("s$id", Bundle().also { s.save(it) })
        outState.putBundle("screens", all)
    }

    override fun onDestroy() {
        UiBus.remove(busListener)
        main.removeCallbacks(ticker)
        // Close dialogs ourselves so they don't leak when the screen turns.
        for (d in dialogs.toList()) try { d.dismiss() } catch (_: Exception) {}
        dialogs.clear()
        super.onDestroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        when (tab) {
            TAB_SETTINGS -> show(backTab)
            TAB_HOME -> super.onBackPressed()
            else -> show(TAB_HOME)
        }
    }

    // ---------------------------------------------------------------- Tabs

    private fun current(): Screen? = screens[tab]

    override fun screen(tab: Int): Screen = screens.getOrPut(tab) {
        val s = when (tab) {
            TAB_FIREWALL -> AppsScreen(this)
            TAB_ACTIVITY -> ActivityScreen(this)
            TAB_SCAN -> ScanScreen(this)
            TAB_SETTINGS -> SettingsScreen(this)
            else -> HomeScreen(this)
        }
        savedScreens?.getBundle("s$tab")?.let { s.restore(it) }
        s
    }

    override fun show(tab: Int) {
        val t = if (tab in TAB_HOME..TAB_SETTINGS) tab else TAB_HOME
        if (t == TAB_SETTINGS && this.tab != TAB_SETTINGS && this.tab >= 0) backTab = this.tab
        current()?.hidden()
        this.tab = t
        for ((id, v) in navViews) {
            val on = id == t
            v.background = if (on) rounded(C.CARD2, 14) else null
            (v.getChildAt(1) as? TextView)?.setTextColor(if (on) C.GREEN else C.SUB)
        }
        gear.setTextColor(if (t == TAB_SETTINGS) C.GREEN else C.SUB)
        gear.background = if (t == TAB_SETTINGS) rounded(C.CARD2, 14) else null

        val s = screen(t)
        val v = s.view()
        content.removeAllViews()
        (v.parent as? ViewGroup)?.removeView(v)
        content.addView(v)
        if (resumed) s.shown()
    }

    // ---------------------------------------------------------------- Protection on/off

    override fun setProtection(on: Boolean) {
        if (!on) {
            sendToFirewall(FirewallService.ACTION_STOP)
            refreshSoon()
            return
        }
        val consent = try {
            VpnService.prepare(this)
        } catch (_: Exception) {
            toast("This phone doesn't allow VPN apps, so PhoneGuard can't protect your internet.")
            return
        }
        if (consent == null) {
            startProtection()
        } else {
            try {
                startActivityForResult(consent, REQ_VPN)
            } catch (_: Exception) {
                toast("This phone doesn't allow VPN apps, so PhoneGuard can't protect your internet.")
            }
        }
    }

    private fun startProtection() {
        sendToFirewall(FirewallService.ACTION_START)
        refreshSoon()
    }

    private fun sendToFirewall(action: String) {
        try {
            FirewallService.send(this, action)
        } catch (_: Exception) {
            toast("Couldn't reach the PhoneGuard service. Please try again.")
        }
    }

    /** The service starts and stops in the background; check its state a few times. */
    private fun refreshSoon() {
        for (delay in longArrayOf(400, 1500, 4000)) {
            main.postDelayed({ if (alive) current()?.tick() }, delay)
        }
    }

    override fun scheduleReload() {
        main.removeCallbacks(reload)
        main.postDelayed(reload, 700)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_VPN) return
        if (resultCode == RESULT_OK) {
            startProtection()
        } else {
            toast("PhoneGuard needs the VPN permission to protect you. If another VPN app is set to \"Always-on\", turn that off first.")
        }
    }

    // ---------------------------------------------------------------- Notifications

    override fun requestNotifications() {
        if (Build.VERSION.SDK_INT < 33) return
        val perm = android.Manifest.permission.POST_NOTIFICATIONS
        if (checkSelfPermission(perm) == PackageManager.PERMISSION_GRANTED) return
        val prefs = getSharedPreferences("ui", MODE_PRIVATE)
        // After two "Don't allow" answers Android stops showing the question; send the user to settings instead.
        if (prefs.getBoolean("askedNotify", false) && !shouldShowRequestPermissionRationale(perm)) {
            open(
                Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)),
            )
            return
        }
        prefs.edit().putBoolean("askedNotify", true).apply()
        requestPermissions(arrayOf(perm), REQ_NOTIFY)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        current()?.onDataChanged()
    }

    // ---------------------------------------------------------------- Helpers

    override fun runFix(fix: Fix, pkg: String?) {
        if (!open(*fixIntents(fix, pkg).toTypedArray(), Intent(Settings.ACTION_SETTINGS))) {
            toast("Couldn't open that screen. Look for it in Settings.")
        }
    }

    /** Settings screens that can fix [fix], best first. */
    private fun fixIntents(fix: Fix, pkg: String?): List<Intent> = FixIntents.candidates(this, fix, pkg)

    override fun open(vararg intents: Intent?): Boolean {
        for (i in intents) {
            if (i == null) continue
            try {
                startActivity(i)
                return true
            } catch (_: Exception) {
                // Not on this phone (or not allowed); try the next one.
            }
        }
        return false
    }

    override fun dialog(builder: AlertDialog.Builder): AlertDialog? {
        if (!alive) return null
        val d = builder.create()
        d.setOnDismissListener { dialogs.remove(d) }
        dialogs += d
        d.show()
        d.window?.setBackgroundDrawable(rounded(C.CARD, 18))
        return d
    }

    override fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
}
