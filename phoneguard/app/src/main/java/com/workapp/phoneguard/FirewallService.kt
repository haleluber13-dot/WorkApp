package com.workapp.phoneguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.os.PowerManager
import android.os.Process
import android.os.SystemClock
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.DomainMap
import com.workapp.phoneguard.core.FirewallPolicy
import com.workapp.phoneguard.core.Kind
import com.workapp.phoneguard.core.TrafficStore
import com.workapp.phoneguard.net.AndroidTun
import com.workapp.phoneguard.net.ConnectivityUidResolver
import com.workapp.phoneguard.net.Engine
import com.workapp.phoneguard.net.EngineConfig
import com.workapp.phoneguard.net.EngineListener
import com.workapp.phoneguard.net.NetFacts
import com.workapp.phoneguard.net.NetworkPick
import com.workapp.phoneguard.net.VpnProtector
import com.workapp.phoneguard.shield.DnsService
import com.workapp.phoneguard.shield.Shield
import java.net.InetAddress
import java.net.InetSocketAddress
import java.util.concurrent.ConcurrentHashMap

/**
 * The firewall. Android only lets an app filter other apps' traffic by acting as a VPN, so this
 * is a local VPN on the phone; it never sends your traffic to a VPN server.
 *
 * Full mode: every app except PhoneGuard goes through the VPN. The engine (net/) relays each
 * connection of allowed apps over a normal socket, refuses blocked apps, answers DNS through
 * the Web Shield and counts traffic per app. Rule and network changes apply without rebuilding
 * the VPN, so open connections of allowed apps are not disturbed.
 *
 * Basic mode: only blocked apps are routed into the VPN and their packets are dropped; allowed
 * apps skip it entirely (with nothing blocked, the VPN takes in nothing at all). It is also the
 * fallback if the engine ever fails.
 *
 * The rules that apply are those of the network traffic really goes over (see [NetworkPick]).
 */
class FirewallService : VpnService() {

    companion object {
        const val ACTION_START = "com.workapp.phoneguard.START"
        const val ACTION_STOP = "com.workapp.phoneguard.STOP"
        const val ACTION_RELOAD = "com.workapp.phoneguard.RELOAD"

        /** Shown (notification and [problem]) when Full protection failed and basic mode took over. */
        const val FALLBACK_MESSAGE = "Full protection stopped unexpectedly; running in basic mode"

        private const val VPN_ADDRESS4 = "10.215.173.1"
        private const val VPN_ADDRESS6 = "fd00:2bd:5a7::1"
        private const val VPN_DNS = "10.215.173.53"
        /** Basic mode with nothing to block routes only this unused address into the VPN: nothing. */
        private const val IDLE_ROUTE = "10.215.173.2"
        private const val MTU = 1500
        private const val ALERT_CHANNEL = "protection"
        private const val FALLBACK_NOTIFICATION = 0x5047
        private const val WATCHDOG_MS = 20_000L

        /** True while the firewall is on. */
        @Volatile
        var running = false
            private set

        /** The network the rules are applied for right now. */
        @Volatile
        var currentNet = NetType.NONE
            private set

        /** How many installed apps are blocked on the current network (both modes). */
        @Volatile
        var blockedCount = 0
            private set

        /** The mode actually running; BASIC while Rules.mode is FULL means it fell back. Null when off. */
        @Volatile
        var activeMode: ProtectionMode? = null
            private set

        /** A problem to show in plain words (currently only [FALLBACK_MESSAGE]); null when all is well. */
        @Volatile
        var problem: String? = null
            private set

        @Volatile
        private var liveEngine: Engine? = null

        /** Connections open through Full protection right now (0 in basic mode or when off). */
        val activeConnections: Int get() = liveEngine?.activeFlows ?: 0

        /** The TCP part of [activeConnections]. */
        val activeTcp: Int get() = liveEngine?.tcpFlows ?: 0

        /** The UDP part of [activeConnections]. */
        val activeUdp: Int get() = liveEngine?.udpFlows ?: 0

        fun send(context: Context, action: String) {
            context.startService(Intent(context, FirewallService::class.java).setAction(action))
        }

        /** Set on a start from [startFromBackground]: the service must go foreground at once. */
        private const val EXTRA_FOREGROUND = "foreground"
        private const val STATUS_CHANNEL = "status"
        private const val STARTING_NOTIFICATION = 0x5048
        private const val TURN_ON_NOTIFICATION = 0x5049

        /**
         * Turns protection on without the app on screen (after a restart or an update). Android
         * only lets a background app start a service as a foreground service; the service shows
         * a quiet notification while it sets up and removes it once the VPN is up. Android 14+
         * also wants a declared foreground service type, so there a plain start is tried.
         * Throws if Android refuses; the caller then asks the user with [notifyTurnBackOn].
         */
        fun startFromBackground(context: Context) {
            val intent = Intent(context, FirewallService::class.java).setAction(ACTION_START)
            if (Build.VERSION.SDK_INT < 34) {
                context.startForegroundService(intent.putExtra(EXTRA_FOREGROUND, true))
            } else {
                context.startService(intent)
            }
        }

        /**
         * Protection should be on but couldn't restart by itself, or was switched off from
         * outside PhoneGuard: one tap turns it back on. Removed once protection is on again.
         */
        fun notifyTurnBackOn(
            context: Context,
            title: String = "PhoneGuard protection is off",
            text: String = "Tap to turn it back on.",
        ) {
            val nm = context.getSystemService(NotificationManager::class.java) ?: return
            if (Build.VERSION.SDK_INT >= 33 &&
                context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) return
            try {
                nm.createNotificationChannel(
                    NotificationChannel(ALERT_CHANNEL, "Protection alerts", NotificationManager.IMPORTANCE_DEFAULT)
                )
                val open = PendingIntent.getActivity(
                    context, 3,
                    Intent(context, MainActivity::class.java)
                        .putExtra(MainActivity.EXTRA_TURN_ON, true)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                )
                nm.notify(
                    TURN_ON_NOTIFICATION,
                    Notification.Builder(context, ALERT_CHANNEL)
                        .setSmallIcon(R.drawable.ic_shield)
                        .setContentTitle(title)
                        .setContentText(text)
                        .setStyle(Notification.BigTextStyle().bigText(text))
                        .setContentIntent(open)
                        .setAutoCancel(true)
                        .build(),
                )
            } catch (_: Exception) {
            }
        }

        fun cancelTurnBackOn(context: Context) {
            try {
                context.getSystemService(NotificationManager::class.java)?.cancel(TURN_ON_NOTIFICATION)
            } catch (_: Exception) {
            }
        }
    }

    private enum class Outcome { OK, NO_PERMISSION, FAILED }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var cm: ConnectivityManager
    private lateinit var rules: Rules
    private val policy = AppPolicy()
    private var tun: ParcelFileDescriptor? = null
    private var tunIo: AndroidTun? = null
    private var engine: Engine? = null
    private var dns: DnsService? = null
    private var reader: Reader? = null
    private var watching = false
    /** False after onDestroy, so late callbacks from other threads do nothing. */
    @Volatile
    private var alive = false
    /** Full protection failed: stay in basic mode until the firewall is turned on again or basic is picked. */
    private var fallback = false
    private val networks = HashMap<Network, NetworkCapabilities>()
    private val wifiSeen = HashSet<Network>()
    /**
     * PhoneGuard's default network: the network traffic really goes over. PhoneGuard is never
     * inside its own VPN (Full mode leaves it out, Basic mode only takes blocked apps, or none),
     * so this is the real Wi-Fi or mobile network, not the VPN.
     */
    private var defaultNet: Network? = null
    private var defaultCaps: NetworkCapabilities? = null
    /** The default network the Web Shield was last told about. */
    private var announcedNet: Network? = null

    private val defaultCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            if (network != defaultNet) {
                defaultNet = network
                defaultCaps = try {
                    cm.getNetworkCapabilities(network)
                } catch (_: Exception) {
                    null
                }
            }
            refreshNetwork()
        }

        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            defaultNet = network
            defaultCaps = caps
            refreshNetwork()
        }

        override fun onLost(network: Network) {
            if (network == defaultNet) {
                defaultNet = null
                defaultCaps = null
            }
            refreshNetwork()
        }
    }

    private val netCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            networks[network] = caps
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && wifiSeen.add(network)) {
                try {
                    WifiGuard.onWifiConnected(this@FirewallService, caps, network)
                } catch (_: Exception) {
                }
            }
            refreshNetwork()
        }

        override fun onLost(network: Network) {
            networks.remove(network)
            wifiSeen.remove(network)
            refreshNetwork()
        }
    }

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val pkg = intent.data?.schemeSpecificPart ?: return
            if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
            val action = intent.action
            val app = context.applicationContext
            val pending = goAsync()
            // Checking a new app reads its details and certificates: keep that off the main thread.
            Thread({
                try {
                    when (action) {
                        Intent.ACTION_PACKAGE_ADDED -> NewAppGuard.onInstalled(app, pkg)
                        Intent.ACTION_PACKAGE_FULLY_REMOVED -> rules.forget(pkg)
                    }
                } catch (_: Exception) {
                } finally {
                    // A newly installed app may now be locked: apply that to its connections.
                    main.post { if (alive && running) applyRules() }
                    pending.finish()
                }
            }, "pg-new-app").start()
        }
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_ON -> TrafficStore.screenOn = true
                Intent.ACTION_SCREEN_OFF -> TrafficStore.screenOn = false
            }
        }
    }

    private val engineListener = object : EngineListener {
        override fun onDied(error: Throwable) {
            // A revoke also kills the engine; give it a moment to arrive so we don't rebuild for nothing.
            main.postDelayed({ if (alive) onEngineDied() }, 1000)
        }
    }

    /**
     * Checks that the engine is neither hung nor dead (in case its death notice got lost):
     * either would leave every app without internet.
     */
    private val watchdog = object : Runnable {
        override fun run() {
            val eng = engine ?: return
            if (!alive || !running || activeMode != ProtectionMode.FULL) return
            if (eng.died || eng.isStuck()) fallBackToBasic() else main.postDelayed(this, WATCHDOG_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        alive = true
        cm = getSystemService(ConnectivityManager::class.java)
        rules = Rules(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Started with startForegroundService: Android requires startForeground right away.
        val foreground = intent?.getBooleanExtra(EXTRA_FOREGROUND, false) == true && enterForeground()
        try {
            return handleCommand(intent)
        } finally {
            // Once the VPN is up Android keeps the service running by itself; no notification needed.
            if (foreground) {
                try {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } catch (_: Exception) {
                }
            }
        }
    }

    private fun enterForeground(): Boolean = try {
        val nm = getSystemService(NotificationManager::class.java)
        nm?.createNotificationChannel(
            NotificationChannel(STATUS_CHANNEL, "Protection status", NotificationManager.IMPORTANCE_LOW)
        )
        startForeground(
            STARTING_NOTIFICATION,
            Notification.Builder(this, STATUS_CHANNEL)
                .setSmallIcon(R.drawable.ic_shield)
                .setContentTitle("PhoneGuard")
                .setContentText("Turning protection back on")
                .build(),
        )
        true
    } catch (_: Exception) {
        false
    }

    private fun handleCommand(intent: Intent?): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                rules.enabled = false
                stopFirewall()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_RELOAD -> {
                if (!running) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                reload()
                return if (running) START_STICKY else START_NOT_STICKY
            }
            null -> {
                // Restarted by the system after being killed.
                if (!rules.enabled) {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
            // ACTION_START, or Android starting us as the always-on VPN. A fresh start retries Full protection.
            else -> {
                rules.enabled = true
                fallback = false
                problem = null
                cancelTurnBackOn(this)
            }
        }
        startFirewall()
        return if (running) START_STICKY else START_NOT_STICKY
    }

    override fun onRevoke() {
        // Another VPN app took over, or the VPN was switched off in Android's settings. (Turning
        // protection off in PhoneGuard stops the service directly and never comes here.)
        val wasOn = rules.enabled
        rules.enabled = false
        stopFirewall()
        if (wasOn) {
            notifyTurnBackOn(
                this,
                "PhoneGuard protection was turned off",
                "This usually happens when another VPN app starts. Tap to turn it back on.",
            )
        }
        super.onRevoke()
    }

    override fun onDestroy() {
        stopFirewall()
        alive = false
        main.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun startFirewall() {
        if (!watching) startWatching()
        val want = desiredMode()
        if (running && activeMode == want) applyRules() else establish(want)
    }

    private fun stopFirewall() {
        stopWatching()
        stopEngine()
        closeTun(tun, reader)
        tun = null
        reader = null
        running = false
        activeMode = null
        blockedCount = 0
    }

    /** ACTION_RELOAD: rules changed, or the user picked another mode. */
    private fun reload() {
        val want = desiredMode()
        if (want != activeMode) establish(want) else applyRules()
    }

    private fun desiredMode(): ProtectionMode {
        val chosen = rules.mode
        if (chosen == ProtectionMode.BASIC && fallback) {
            // Picking basic on purpose ends the fallback, so picking Full later tries it again.
            fallback = false
            problem = null
        }
        return if (fallback) ProtectionMode.BASIC else chosen
    }

    /** Applies changed rules or a changed network to the running VPN. */
    private fun applyRules() {
        when (activeMode) {
            ProtectionMode.FULL -> {
                // No rebuild: forget cached decisions; the engine closes connections of apps now blocked.
                policy.reset(currentNet)
                engine?.onPolicyChanged()
                updateBlockedCount()
            }
            ProtectionMode.BASIC -> establish(ProtectionMode.BASIC)
            null -> {}
        }
    }

    /** (Re)builds the VPN in [mode]. Falls back to basic if Full protection can't start. */
    private fun establish(mode: ProtectionMode) {
        // Stop the engine while its interface is still up, so it can reset the apps' connections:
        // establishing a new interface makes Android shut the old one down.
        stopEngine()
        if (mode == ProtectionMode.FULL) {
            when (startFull()) {
                Outcome.OK, Outcome.NO_PERMISSION -> return
                Outcome.FAILED -> enterFallback()
            }
        }
        startBasic()
    }

    private fun startFull(): Outcome {
        policy.reset(currentNet)
        val builder = baseBuilder()
            .addDnsServer(VPN_DNS)
            .setMtu(MTU)
        try {
            // Every app but PhoneGuard: our own sockets (the relay, encrypted DNS) go straight out.
            builder.addDisallowedApplication(packageName)
        } catch (_: PackageManager.NameNotFoundException) {
        }
        val fd = try {
            builder.establish()
        } catch (_: Exception) {
            return Outcome.FAILED
        }
        if (fd == null) {
            lostPermission()
            return Outcome.NO_PERMISSION
        }
        replaceTun(fd)
        var io: AndroidTun? = null
        var shieldDns: DnsService? = null
        var eng: Engine? = null
        try {
            io = AndroidTun(fd.fileDescriptor)
            shieldDns = DnsService(this)
            eng = Engine(
                io, VpnProtector(this), ConnectivityUidResolver(cm), policy, shieldDns,
                engineListener, EngineConfig(mtu = MTU), ::blockReason,
            )
            eng.start()
        } catch (_: Throwable) {
            try {
                eng?.stop()
            } catch (_: Throwable) {
            }
            io?.close()
            closeDns(shieldDns)
            return Outcome.FAILED
        }
        tunIo = io
        dns = shieldDns
        engine = eng
        liveEngine = eng
        activeMode = ProtectionMode.FULL
        running = true
        if (!fallback) problem = null
        updateBlockedCount()
        startShield()
        main.removeCallbacks(watchdog)
        main.postDelayed(watchdog, WATCHDOG_MS)
        return Outcome.OK
    }

    private fun startBasic() {
        val blocked = (rules.blockedOn(currentNet) - packageName).filter { isInstalled(it) }
        var builder = baseBuilder()
        var count = 0
        for (pkg in blocked) {
            try {
                builder.addAllowedApplication(pkg)
                count++
            } catch (_: PackageManager.NameNotFoundException) {
            }
        }
        // Nothing to block. An empty list would capture every app, so instead the VPN takes
        // in nothing: only an unused address is routed into it, everything else goes straight
        // to the real network (DNS too, as the VPN names no DNS server). Nobody's internet is
        // affected, PhoneGuard's own list updates included, and an always-on VPN setting stays
        // satisfied. PhoneGuard is left out, so it still sees the real network (see defaultNet).
        if (count == 0) builder = idleBuilder()
        val fd = try {
            builder.establish()
        } catch (_: Exception) {
            null
        }
        if (fd == null) {
            lostPermission()
            return
        }
        replaceTun(fd)
        reader = Reader(fd).also { it.start() }
        blockedCount = count
        activeMode = ProtectionMode.BASIC
        running = true
    }

    /** A VPN that captures all traffic of the apps it applies to. */
    private fun baseBuilder(): Builder = commonBuilder()
        .addRoute("0.0.0.0", 0)
        .addRoute("::", 0)

    /**
     * A VPN that captures nothing: one unused address is its only route. The addresses keep both
     * IPv4 and IPv6 allowed for the apps it applies to, so their traffic falls through to the
     * real network instead of being blocked.
     */
    private fun idleBuilder(): Builder {
        val b = commonBuilder().addRoute(IDLE_ROUTE, 32)
        try {
            b.addDisallowedApplication(packageName)
        } catch (_: PackageManager.NameNotFoundException) {
        }
        return b
    }

    private fun commonBuilder(): Builder = Builder()
        .setSession(getString(R.string.app_name))
        .addAddress(VPN_ADDRESS4, 32)
        .addAddress(VPN_ADDRESS6, 128)
        // Non-blocking is the default, but the engine relies on it (it can't check on Android 10).
        .setBlocking(false)
        // Otherwise Android counts the VPN as metered and apps hold back (backups, updates) even on Wi-Fi.
        .setMetered(false)
        .setConfigureIntent(
            PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE
            )
        )

    /** Starts using [fd]; the previous interface is closed once its reader has let go. */
    private fun replaceTun(fd: ParcelFileDescriptor) {
        val old = tun
        val oldReader = reader
        tun = fd
        reader = null
        closeTun(old, oldReader)
    }

    private fun closeTun(fd: ParcelFileDescriptor?, rd: Reader?) {
        if (fd == null && rd == null) return
        rd?.quit = true
        Thread({
            try {
                rd?.join(1500)
            } catch (_: InterruptedException) {
            }
            try {
                fd?.close()
            } catch (_: Exception) {
            }
        }, "pg-close").start()
    }

    private fun stopEngine() {
        main.removeCallbacks(watchdog)
        val eng = engine
        engine = null
        liveEngine = null
        if (eng != null) {
            try {
                eng.stop()
            } catch (_: Throwable) {
            }
        }
        tunIo?.close()
        tunIo = null
        closeDns(dns)
        dns = null
    }

    private fun closeDns(d: DnsService?) {
        if (d == null) return
        Thread({
            try {
                d.close()
            } catch (_: Throwable) {
            }
        }, "pg-dns-close").start()
    }

    private fun lostPermission() {
        // Permission was withdrawn; the user has to turn the firewall on again.
        rules.enabled = false
        stopFirewall()
        stopSelf()
    }

    private fun onEngineDied() {
        val eng = engine ?: return
        if (!running || activeMode != ProtectionMode.FULL || !eng.died) return
        fallBackToBasic()
    }

    /** Full protection failed while running: keep the phone online and protected in basic mode. */
    private fun fallBackToBasic() {
        enterFallback()
        establish(ProtectionMode.BASIC)
    }

    private fun enterFallback() {
        fallback = true
        problem = FALLBACK_MESSAGE
        notifyFallback()
    }

    private fun notifyFallback() {
        val nm = getSystemService(NotificationManager::class.java) ?: return
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return
        try {
            nm.createNotificationChannel(
                NotificationChannel(ALERT_CHANNEL, "Protection alerts", NotificationManager.IMPORTANCE_DEFAULT)
            )
            val open = PendingIntent.getActivity(
                this, 2, Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val details = "$FALLBACK_MESSAGE. Blocked apps are still blocked, but the Web Shield and " +
                "the traffic monitor are paused. To try Full protection again, turn the firewall off and on in PhoneGuard."
            nm.notify(
                FALLBACK_NOTIFICATION,
                Notification.Builder(this, ALERT_CHANNEL)
                    .setSmallIcon(R.drawable.ic_shield)
                    .setContentTitle("PhoneGuard")
                    .setContentText(FALLBACK_MESSAGE)
                    .setStyle(Notification.BigTextStyle().bigText(details))
                    .setContentIntent(open)
                    .setAutoCancel(true)
                    .build(),
            )
        } catch (_: Exception) {
        }
    }

    private fun startShield() {
        val app = applicationContext
        Thread({
            try {
                Shield.init(app)
            } catch (_: Throwable) {
            }
        }, "pg-shield-init").start()
        try {
            Shield.scheduleUpdates(app)
        } catch (_: Throwable) {
        }
    }

    private fun blockReason(): String = when (currentNet) {
        NetType.WIFI -> "Firewall: blocked on Wi-Fi"
        NetType.MOBILE -> "Firewall: blocked on mobile data"
        NetType.NONE -> "Blocked by firewall"
    }

    private fun updateBlockedCount() {
        blockedCount = rules.blockedOn(currentNet).count { it != packageName && isInstalled(it) }
    }

    @Suppress("DEPRECATION")
    private fun isInstalled(pkg: String): Boolean = try {
        packageManager.getApplicationInfo(pkg, 0)
        true
    } catch (_: PackageManager.NameNotFoundException) {
        false
    }

    @Suppress("DEPRECATION")
    private fun startWatching() {
        networks.clear()
        for (n in cm.allNetworks) {
            val caps = cm.getNetworkCapabilities(n) ?: continue
            if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) networks[n] = caps
        }
        defaultNet = try {
            cm.activeNetwork
        } catch (_: Exception) {
            null
        }
        defaultCaps = defaultNet?.let {
            try {
                cm.getNetworkCapabilities(it)
            } catch (_: Exception) {
                null
            }
        }
        announcedNet = defaultNet
        currentNet = pickNetwork()
        policy.reset(currentNet)
        try {
            // The default request leaves out VPNs, so this only sees the real Wi-Fi and mobile networks.
            cm.registerNetworkCallback(NetworkRequest.Builder().build(), netCallback, main)
        } catch (_: Exception) {
        }
        try {
            // Which of them traffic actually goes over.
            cm.registerDefaultNetworkCallback(defaultCallback, main)
        } catch (_: Exception) {
        }
        val packages = IntentFilter().apply {
            addAction(Intent.ACTION_PACKAGE_ADDED)
            addAction(Intent.ACTION_PACKAGE_FULLY_REMOVED)
            addDataScheme("package")
        }
        val screen = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_ON)
            addAction(Intent.ACTION_SCREEN_OFF)
        }
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(packageReceiver, packages, Context.RECEIVER_NOT_EXPORTED)
            registerReceiver(screenReceiver, screen, Context.RECEIVER_NOT_EXPORTED)
        } else {
            registerReceiver(packageReceiver, packages)
            registerReceiver(screenReceiver, screen)
        }
        TrafficStore.screenOn = getSystemService(PowerManager::class.java)?.isInteractive ?: true
        watching = true
    }

    private fun stopWatching() {
        if (!watching) return
        try {
            cm.unregisterNetworkCallback(netCallback)
        } catch (_: Exception) {
        }
        try {
            cm.unregisterNetworkCallback(defaultCallback)
        } catch (_: Exception) {
        }
        defaultNet = null
        defaultCaps = null
        announcedNet = null
        try {
            unregisterReceiver(packageReceiver)
        } catch (_: Exception) {
        }
        try {
            unregisterReceiver(screenReceiver)
        } catch (_: Exception) {
        }
        wifiSeen.clear()
        watching = false
    }

    /** The rules of the network traffic really goes over; see [NetworkPick]. */
    private fun pickNetwork(): NetType =
        NetworkPick.pick(defaultCaps?.let { facts(it) }, networks.values.map { facts(it) })

    private fun facts(c: NetworkCapabilities) = NetFacts(
        wifi = c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET),
        cellular = c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR),
        vpn = c.hasTransport(NetworkCapabilities.TRANSPORT_VPN),
        internet = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET),
        validated = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED),
    )

    private fun refreshNetwork() {
        val def = defaultNet
        if (def != announcedNet) {
            announcedNet = def
            // Another network (Wi-Fi <-> mobile, or another Wi-Fi): answers learned on the old one
            // may not hold here.
            try {
                dns?.onNetworkChanged()
            } catch (_: Throwable) {
            }
        }
        val now = pickNetwork()
        if (now == currentNet) return
        currentNet = now
        // Full mode just switches rule sets; basic mode has to rebuild the list of captured apps.
        if (running) applyRules()
    }

    /**
     * Full mode's firewall policy: an app is blocked if any package sharing its uid is blocked on
     * the current network. Decisions are cached per uid until the rules or the network change.
     * Called from engine threads.
     */
    private inner class AppPolicy : FirewallPolicy {
        @Volatile
        private var net = NetType.NONE
        @Volatile
        private var cache = ConcurrentHashMap<Int, Boolean>()
        /** Whether connections of unknown owners may go out: only while no app is blocked here. */
        @Volatile
        private var unknownAllowed = true

        fun reset(now: NetType) {
            net = now
            cache = ConcurrentHashMap() // a lookup still running stores into the old map, which is dropped
            unknownAllowed = try {
                rules.blockedOn(now).none { it != packageName && isInstalled(it) }
            } catch (_: Exception) {
                false
            }
        }

        override fun isAllowed(uid: Int): Boolean {
            // Unknown owner (-1): the engine couldn't tell which app it is, almost always because
            // the socket was already closed. A blocked app could do that on purpose, so while any
            // app is blocked these are blocked too; with nothing blocked there's nothing to dodge.
            if (uid < 0) return unknownAllowed
            // Android's own system services are never blocked.
            if (uid % 100_000 < Process.FIRST_APPLICATION_UID) return true
            val c = cache
            c[uid]?.let { return it }
            val n = net
            val pkgs = try {
                packageManager.getPackagesForUid(uid)
            } catch (_: Exception) {
                return true // don't remember a failed lookup
            }
            val allowed = pkgs == null || pkgs.none { it != packageName && rules.isBlocked(it, n) }
            c[uid] = allowed
            return allowed
        }
    }

    /** Basic mode: reads (and drops) packets from blocked apps, noting who tried to connect where. */
    private inner class Reader(private val pfd: ParcelFileDescriptor) : Thread("pg-tun-basic") {
        @Volatile
        var quit = false
        private val seen = HashMap<String, Long>()

        override fun run() {
            val fd = pfd.fileDescriptor
            val buf = ByteArray(32767)
            val polls = arrayOf(StructPollfd().apply {
                this.fd = fd
                events = OsConstants.POLLIN.toShort()
            })
            while (!quit) {
                try {
                    if (Os.poll(polls, 1000) <= 0) continue
                    val len = Os.read(fd, buf, 0, buf.size)
                    if (len > 0) note(buf, len)
                } catch (e: ErrnoException) {
                    if (e.errno == OsConstants.EAGAIN || e.errno == OsConstants.EINTR) continue
                    break
                } catch (_: Exception) {
                    break
                }
            }
        }

        private fun note(b: ByteArray, len: Int) {
            val version = (b[0].toInt() shr 4) and 0xF
            val proto: Int
            val off: Int
            val src: InetAddress
            val dst: InetAddress
            when {
                version == 4 && len >= 20 -> {
                    off = (b[0].toInt() and 0xF) * 4
                    proto = b[9].toInt() and 0xFF
                    src = InetAddress.getByAddress(b.copyOfRange(12, 16))
                    dst = InetAddress.getByAddress(b.copyOfRange(16, 20))
                }
                version == 6 && len >= 40 -> {
                    off = 40
                    proto = b[6].toInt() and 0xFF
                    src = InetAddress.getByAddress(b.copyOfRange(8, 24))
                    dst = InetAddress.getByAddress(b.copyOfRange(24, 40))
                }
                else -> return
            }
            if ((proto != 6 && proto != 17) || len < off + 4) return
            val sport = ((b[off].toInt() and 0xFF) shl 8) or (b[off + 1].toInt() and 0xFF)
            val dport = ((b[off + 2].toInt() and 0xFF) shl 8) or (b[off + 3].toInt() and 0xFF)

            // Apps retry constantly; record each connection attempt once.
            val key = "$proto/$sport/${dst.hostAddress}/$dport"
            val now = SystemClock.elapsedRealtime()
            val last = seen[key]
            if (last != null && now - last < 15_000) return
            if (seen.size > 4000) seen.clear()
            seen[key] = now

            val uid = try {
                cm.getConnectionOwnerUid(proto, InetSocketAddress(src, sport), InetSocketAddress(dst, dport))
            } catch (_: Exception) {
                -1
            }
            if (uid == Process.myUid()) return // PhoneGuard is never captured; don't log itself if it ever is
            val host = dst.hostAddress ?: "?"
            TrafficStore.onEvent(
                ConnEvent(
                    System.currentTimeMillis(), uid,
                    if (dport == 53) Kind.DNS else if (proto == 6) Kind.TCP else Kind.UDP,
                    host, dport, DomainMap.get(host), blocked = true, reason = blockReason(),
                )
            )
        }
    }
}
