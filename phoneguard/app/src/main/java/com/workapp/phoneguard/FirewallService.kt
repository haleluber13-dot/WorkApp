package com.workapp.phoneguard

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
import android.os.SystemClock
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import java.net.InetAddress
import java.net.InetSocketAddress

/**
 * The firewall. Android only lets an app filter traffic by acting as a VPN,
 * so this is a local VPN that never connects anywhere: blocked apps are routed
 * into it and their packets are dropped. Apps you allow skip it entirely, so
 * their traffic is untouched and nothing is slowed down or sent to a server.
 */
class FirewallService : VpnService() {

    companion object {
        const val ACTION_START = "com.workapp.phoneguard.START"
        const val ACTION_STOP = "com.workapp.phoneguard.STOP"
        const val ACTION_RELOAD = "com.workapp.phoneguard.RELOAD"

        @Volatile
        var running = false
            private set

        @Volatile
        var currentNet = NetType.NONE
            private set

        @Volatile
        var blockedCount = 0
            private set

        fun send(context: Context, action: String) {
            context.startService(Intent(context, FirewallService::class.java).setAction(action))
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private lateinit var cm: ConnectivityManager
    private lateinit var rules: Rules
    private var tun: ParcelFileDescriptor? = null
    private var reader: Reader? = null
    private var watching = false
    private val networks = HashMap<Network, NetworkCapabilities>()

    private val netCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
            networks[network] = caps
            refreshNetwork()
        }

        override fun onLost(network: Network) {
            networks.remove(network)
            refreshNetwork()
        }
    }

    private val packageReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val pkg = intent.data?.schemeSpecificPart ?: return
            if (intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return
            when (intent.action) {
                Intent.ACTION_PACKAGE_ADDED -> NewAppGuard.onInstalled(context, pkg)
                Intent.ACTION_PACKAGE_FULLY_REMOVED -> rules.forget(pkg)
            }
            if (running) establish()
        }
    }

    override fun onCreate() {
        super.onCreate()
        cm = getSystemService(ConnectivityManager::class.java)
        rules = Rules(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                rules.enabled = false
                stopFirewall()
                stopSelf()
                return START_NOT_STICKY
            }
            ACTION_RELOAD -> {
                if (running) establish() else stopSelf()
                return if (running) START_STICKY else START_NOT_STICKY
            }
            null -> {
                // Restarted by the system after being killed.
                if (!rules.enabled) {
                    stopSelf()
                    return START_NOT_STICKY
                }
            }
            // ACTION_START, or Android starting us as the always-on VPN.
            else -> rules.enabled = true
        }
        startFirewall()
        return START_STICKY
    }

    override fun onRevoke() {
        // The user switched the VPN off in Settings, or another VPN app took over.
        rules.enabled = false
        stopFirewall()
        super.onRevoke()
    }

    override fun onDestroy() {
        stopFirewall()
        super.onDestroy()
    }

    @Suppress("DEPRECATION")
    private fun startFirewall() {
        if (!watching) {
            networks.clear()
            for (n in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(n) ?: continue
                if (!caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) networks[n] = caps
            }
            currentNet = pickNetwork()
            // The default request excludes VPNs, so we only see real Wi-Fi/mobile networks.
            cm.registerNetworkCallback(NetworkRequest.Builder().build(), netCallback, main)
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_PACKAGE_ADDED)
                addAction(Intent.ACTION_PACKAGE_FULLY_REMOVED)
                addDataScheme("package")
            }
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(packageReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                registerReceiver(packageReceiver, filter)
            }
            watching = true
        }
        establish()
    }

    private fun stopFirewall() {
        if (watching) {
            try { cm.unregisterNetworkCallback(netCallback) } catch (_: Exception) {}
            try { unregisterReceiver(packageReceiver) } catch (_: Exception) {}
            watching = false
        }
        reader?.quit = true
        reader = null
        try { tun?.close() } catch (_: Exception) {}
        tun = null
        running = false
        blockedCount = 0
    }

    private fun pickNetwork(): NetType {
        var mobile = false
        for (caps in networks.values) {
            if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            ) return NetType.WIFI
            if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) mobile = true
        }
        return if (mobile) NetType.MOBILE else NetType.NONE
    }

    private fun refreshNetwork() {
        val now = pickNetwork()
        if (now != currentNet) {
            currentNet = now
            if (running) establish()
        }
    }

    /** (Re)build the VPN so exactly the apps blocked on the current network are captured. */
    private fun establish() {
        val blocked = rules.blockedOn(currentNet) - packageName
        val builder = Builder()
            .setSession(getString(R.string.app_name))
            .addAddress("10.215.173.1", 32)
            .addAddress("fd00:2bd:5a7::1", 128)
            .addRoute("0.0.0.0", 0)
            .addRoute("::", 0)
            .setConfigureIntent(
                PendingIntent.getActivity(
                    this, 0, Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
        var count = 0
        for (pkg in blocked) {
            try {
                builder.addAllowedApplication(pkg)
                count++
            } catch (_: PackageManager.NameNotFoundException) {
            }
        }
        // Always include ourselves so the list is never empty (an empty list would
        // capture every app). PhoneGuard has no internet permission, so nothing is lost.
        builder.addAllowedApplication(packageName)

        val fd = try { builder.establish() } catch (_: Exception) { null }
        if (fd == null) {
            // Permission was withdrawn; the user has to turn the firewall on again.
            rules.enabled = false
            stopFirewall()
            stopSelf()
            return
        }
        reader?.quit = true
        val old = tun
        tun = fd
        reader = Reader(fd).also { it.start() }
        try { old?.close() } catch (_: Exception) {}
        blockedCount = count
        running = true
    }

    /** Reads (and drops) packets from blocked apps, noting who tried to connect where. */
    private inner class Reader(private val pfd: ParcelFileDescriptor) : Thread("pg-tun") {
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

            val uid = if (Build.VERSION.SDK_INT >= 29) {
                try {
                    cm.getConnectionOwnerUid(
                        proto, InetSocketAddress(src, sport), InetSocketAddress(dst, dport)
                    )
                } catch (_: Exception) { -1 }
            } else -1
            BlockLog.add(
                BlockLog.Entry(
                    System.currentTimeMillis(), uid, dst.hostAddress ?: "?", dport,
                    if (proto == 6) "TCP" else "UDP"
                )
            )
        }
    }
}
