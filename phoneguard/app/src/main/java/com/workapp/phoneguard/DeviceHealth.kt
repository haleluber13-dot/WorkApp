package com.workapp.phoneguard

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.net.wifi.WifiInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.workapp.phoneguard.shield.DnsSettings
import com.workapp.phoneguard.shield.DnsStatus

enum class WifiSafety { SAFE, OPEN, WEAK, UNKNOWN }

/**
 * Pure Wi-Fi decisions (no android.* calls), kept apart so they can be unit tested.
 */
object WifiLogic {
    /** Don't repeat an alert for the same network within this time. */
    const val COOLDOWN_MS = 6 * 60 * 60 * 1000L

    /** When we can't tell networks apart, at most one alert per this time, so flapping Wi-Fi doesn't spam. */
    const val UNIDENTIFIED_GAP_MS = 30 * 60 * 1000L

    /** Maps WifiInfo.getCurrentSecurityType() (Android 12+) to how safe it is. */
    fun fromSecurityType(type: Int): WifiSafety = when (type) {
        WifiInfo.SECURITY_TYPE_OPEN -> WifiSafety.OPEN
        WifiInfo.SECURITY_TYPE_WEP -> WifiSafety.WEAK
        // OWE ("Enhanced Open") has no password but is encrypted, so neighbours can't read it.
        WifiInfo.SECURITY_TYPE_OWE,
        WifiInfo.SECURITY_TYPE_PSK,
        WifiInfo.SECURITY_TYPE_SAE,
        WifiInfo.SECURITY_TYPE_EAP,
        WifiInfo.SECURITY_TYPE_EAP_WPA3_ENTERPRISE,
        WifiInfo.SECURITY_TYPE_EAP_WPA3_ENTERPRISE_192_BIT,
        WifiInfo.SECURITY_TYPE_WAPI_PSK,
        WifiInfo.SECURITY_TYPE_WAPI_CERT,
        WifiInfo.SECURITY_TYPE_OSEN,
        WifiInfo.SECURITY_TYPE_PASSPOINT_R1_R2,
        WifiInfo.SECURITY_TYPE_PASSPOINT_R3,
        WifiInfo.SECURITY_TYPE_DPP -> WifiSafety.SAFE
        else -> WifiSafety.UNKNOWN
    }

    /**
     * Maps a ScanResult.capabilities string such as "[WPA2-PSK-CCMP][RSN-PSK-CCMP][ESS]"
     * (Android 10–11 fallback) to how safe it is.
     */
    fun fromScanCapabilities(caps: String?): WifiSafety {
        if (caps == null) return WifiSafety.UNKNOWN
        val tokens = Regex("\\[([^\\]]*)]").findAll(caps).map { it.groupValues[1].uppercase() }.toList()
        if (tokens.isEmpty()) return WifiSafety.UNKNOWN
        val secure = tokens.any { t ->
            // "OWE_TRANSITION" is advertised by the *open* half of a transition network, so it doesn't count.
            (t.contains("OWE") && !t.contains("OWE_TRANSITION")) ||
                listOf("PSK", "SAE", "EAP", "WAPI", "DPP", "OSEN").any { t.contains(it) }
        }
        return when {
            secure -> WifiSafety.SAFE
            tokens.any { it.startsWith("WEP") } -> WifiSafety.WEAK
            else -> WifiSafety.OPEN
        }
    }

    /** "\"Cafe\"" -> "Cafe"; null when Android hid the name (no location permission). */
    fun cleanSsid(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        if (raw == "<unknown ssid>") return null
        val s = if (raw.length >= 2 && raw.startsWith("\"") && raw.endsWith("\"")) raw.substring(1, raw.length - 1) else raw
        return s.ifBlank { null }
    }

    /** Null when the BSSID is missing or redacted. */
    fun cleanBssid(raw: String?): String? {
        if (raw.isNullOrBlank()) return null
        val b = raw.lowercase()
        if (b == "02:00:00:00:00:00" || b == "00:00:00:00:00:00") return null
        return b
    }

    /**
     * Key used to remember which networks we already warned about.
     * Returns (key, stable): stable keys (name / access point) survive reconnects;
     * a network handle changes on every connection.
     */
    fun alertKey(ssid: String?, bssid: String?, networkHandle: Long?): Pair<String, Boolean> = when {
        ssid != null -> "s:$ssid" to true
        bssid != null -> "b:$bssid" to true
        networkHandle != null -> "n:$networkHandle" to false
        else -> "unknown" to false
    }

    /**
     * One plain sentence on whether lookups are private on an unsafe Wi-Fi. Only claims privacy when
     * Full protection is actually running and lookups are going out encrypted right now.
     */
    fun protectionLine(fullRunning: Boolean, encryptedNow: Boolean, providerEncrypts: Boolean): String = when {
        fullRunning && encryptedNow -> "PhoneGuard's Web Shield keeps your lookups private, but avoid banking here."
        fullRunning && !providerEncrypts ->
            "Pick an encrypted DNS in PhoneGuard's settings so your lookups stay private, and avoid banking here."
        fullRunning -> "Your lookups aren't encrypted on this network right now, so avoid banking and private sites here."
        else -> "Turn on PhoneGuard's Full protection so your lookups stay private, and avoid banking here."
    }

    /** Whether to alert now, given when we last alerted for this key and for any unidentified network. */
    fun shouldAlert(now: Long, lastForKey: Long?, lastUnidentified: Long?, stableKey: Boolean): Boolean {
        // A time in the future means the clock was changed; treat it as expired rather than muting forever.
        fun within(t: Long?, window: Long) = t != null && t <= now && now - t < window
        if (within(lastForKey, COOLDOWN_MS)) return false
        if (!stableKey && within(lastUnidentified, UNIDENTIFIED_GAP_MS)) return false
        return true
    }
}

object WifiGuard {
    private const val CHANNEL = "wifi_safety"
    private const val NOTIFICATION_ID = 0x57694669 // "WiFi": fixed, so a new alert replaces the old one
    private const val PREFS = "wifi_guard"
    private const val KEY_UNIDENTIFIED = "last_unidentified"

    /** Security of the Wi-Fi network described by [caps] (null = current Wi-Fi, if any). */
    fun check(context: Context, caps: NetworkCapabilities? = null): WifiSafety = try {
        val c = caps ?: currentWifi(context)?.second
        when {
            c == null || !c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> WifiSafety.UNKNOWN
            Build.VERSION.SDK_INT >= 31 -> {
                // The caps from a network callback may lack WifiInfo; ask again for the live Wi-Fi.
                val info = (c.transportInfo as? WifiInfo) ?: (currentWifi(context)?.second?.transportInfo as? WifiInfo)
                info?.let { WifiLogic.fromSecurityType(it.currentSecurityType) } ?: WifiSafety.UNKNOWN
            }
            else -> legacyCheck(context)
        }
    } catch (_: Throwable) {
        WifiSafety.UNKNOWN
    }

    /** Called by the firewall service whenever a Wi-Fi network connects; alerts once per network if unsafe. */
    fun onWifiConnected(context: Context, caps: NetworkCapabilities) = onWifiConnected(context, caps, null)

    /**
     * Same, but with the [network] so separate connections can be told apart when Android hides
     * the Wi-Fi name. Safe to call on every capabilities change: repeat calls are cheap and silent.
     */
    fun onWifiConnected(context: Context, caps: NetworkCapabilities, network: Network?) {
        try {
            val safety = check(context, caps)
            if (safety != WifiSafety.OPEN && safety != WifiSafety.WEAK) return
            if (!canNotify(context)) return // try again on a later call once notifications are allowed

            val info = if (Build.VERSION.SDK_INT >= 31) caps.transportInfo as? WifiInfo else null
            val ssid = WifiLogic.cleanSsid(info?.ssid)
            val bssid = WifiLogic.cleanBssid(info?.bssid)
            val (key, stable) = WifiLogic.alertKey(ssid, bssid, network?.networkHandle)

            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            // Store a hash, not the Wi-Fi name itself.
            val prefKey = "k:" + key.hashCode()
            val now = System.currentTimeMillis()
            val last = if (prefs.contains(prefKey)) prefs.getLong(prefKey, 0) else null
            val lastUnidentified = if (prefs.contains(KEY_UNIDENTIFIED)) prefs.getLong(KEY_UNIDENTIFIED, 0) else null
            if (!WifiLogic.shouldAlert(now, last, lastUnidentified, stable)) return

            val e = prefs.edit()
            // Forget old entries so the file never grows.
            for ((k, v) in prefs.all) {
                if (k.startsWith("k:") && (v !is Long || v > now || now - v >= WifiLogic.COOLDOWN_MS)) e.remove(k)
            }
            e.putLong(prefKey, now)
            if (!stable) e.putLong(KEY_UNIDENTIFIED, now)
            e.apply()

            notify(context, safety, ssid)
        } catch (_: Throwable) {
        }
    }

    /** The current Wi-Fi name, if Android lets us see it. */
    fun currentWifiName(context: Context): String? = try {
        val c = currentWifi(context)?.second
        if (Build.VERSION.SDK_INT >= 31) WifiLogic.cleanSsid((c?.transportInfo as? WifiInfo)?.ssid)
        else null
    } catch (_: Throwable) { null }

    /** One plain sentence on whether PhoneGuard is keeping lookups private right now. */
    fun protectionLine(context: Context): String {
        // What is running, not what is configured: after a fall back to Basic mode the Web Shield is off,
        // and a network that blocks encrypted DNS makes lookups go out in the clear.
        val full = FirewallService.running && FirewallService.activeMode == ProtectionMode.FULL
        val providerEncrypts = try { DnsSettings.provider(context).dohUrl != null } catch (_: Throwable) { false }
        return WifiLogic.protectionLine(full, DnsStatus.encrypted, providerEncrypts)
    }

    /** The real (non-VPN) Wi-Fi network and its capabilities, if connected. */
    @Suppress("DEPRECATION")
    internal fun currentWifi(context: Context): Pair<Network, NetworkCapabilities>? {
        val cm = context.getSystemService(ConnectivityManager::class.java) ?: return null
        for (n in cm.allNetworks) {
            val c = try { cm.getNetworkCapabilities(n) } catch (_: Exception) { null } ?: continue
            if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) && !c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
                return n to c
            }
        }
        return null
    }

    /**
     * Android 10–11: WifiInfo has no security type, so match the connected access point against
     * scan results. That needs location permission, which PhoneGuard normally doesn't have.
     */
    @Suppress("DEPRECATION")
    private fun legacyCheck(context: Context): WifiSafety {
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            return WifiSafety.UNKNOWN
        }
        val wm = context.applicationContext.getSystemService(WifiManager::class.java) ?: return WifiSafety.UNKNOWN
        val bssid = WifiLogic.cleanBssid(wm.connectionInfo?.bssid) ?: return WifiSafety.UNKNOWN
        val match = wm.scanResults?.firstOrNull { WifiLogic.cleanBssid(it.BSSID) == bssid } ?: return WifiSafety.UNKNOWN
        return WifiLogic.fromScanCapabilities(match.capabilities)
    }

    private fun canNotify(context: Context): Boolean {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return false
        if (Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) return false
        return nm.areNotificationsEnabled()
    }

    private fun notify(context: Context, safety: WifiSafety, ssid: String?) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "Wi-Fi safety", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Warns you when you join Wi-Fi that others nearby could snoop on"
            }
        )
        val name = ssid?.let { "\"$it\"" } ?: "This Wi-Fi"
        val title = if (safety == WifiSafety.WEAK) "Weak Wi-Fi security" else "Wi-Fi without a password"
        val first = if (safety == WifiSafety.WEAK) {
            "$name uses old security that is easy to break. People nearby could see what you do."
        } else {
            "$name isn't password protected. People nearby could see what you do."
        }
        val text = first + " " + protectionLine(context)
        val open = PendingIntent.getActivity(
            context, NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, MainActivity.TAB_HOME),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        nm.notify(
            NOTIFICATION_ID,
            Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_shield)
                .setContentTitle(title)
                .setContentText(first)
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }
}

/**
 * Pure setup advice (no android.* calls), kept apart so it can be unit tested.
 */
object SetupLogic {
    /** Must go with every mention of Always-on VPN: lockdown cuts every app off if PhoneGuard ever stops. */
    const val LOCKDOWN_WARNING =
        "Leave \"Block connections without VPN\" OFF, or every app loses internet if PhoneGuard ever stops."

    /** How to turn on Always-on VPN, always with [LOCKDOWN_WARNING]. */
    fun alwaysOnVpnTip(samsung: Boolean): String {
        val path = if (samsung) "Settings → Connections → More connection settings → VPN"
        else "Settings → Network & internet → VPN"
        return "Open VPN settings ($path) → tap ⚙ next to PhoneGuard → turn ON \"Always-on VPN\". $LOCKDOWN_WARNING"
    }

    /**
     * Phone-specific lines for the Home Setup card. Leaves out what Home already shows elsewhere:
     * the background (battery) and Always-on VPN steps, Play Protect and system updates.
     */
    fun setupTips(samsung: Boolean, oldOneUi: Boolean, samsungDeviceProtection: Boolean): List<String> {
        val tips = ArrayList<String>()
        if (samsung) {
            // One UI 2.5 (Android 10) used older menu names; One UI 3+ (Android 11+) renamed them.
            tips += if (oldOneUi) {
                "Stop Samsung putting PhoneGuard to sleep: Settings → Device care → Battery → App power management → Apps that won't be put to sleep → add PhoneGuard."
            } else {
                "Stop Samsung putting PhoneGuard to sleep: Settings → Battery and device care → Battery → Background usage limits → Never sleeping apps → add PhoneGuard."
            }
            if (samsungDeviceProtection) {
                tips += if (oldOneUi) {
                    "Turn on Samsung's virus scan too: Settings → Device care → Security."
                } else {
                    "Turn on Samsung's virus scan too: Settings → Battery and device care → Device protection."
                }
            }
            tips += "Only install apps from Google Play or Galaxy Store, never from links or files people send you."
        } else {
            tips += "Only install apps from Google Play, never from links or files people send you."
        }
        return tips
    }
}

object DeviceHealth {
    private const val SAMSUNG_DEVICE_PROTECTION = "com.samsung.android.sm.devicesecurity"

    /** True if Android/Samsung battery saving won't stop the firewall. */
    fun isBatteryExempt(context: Context): Boolean = try {
        context.getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(context.packageName) ?: true
    } catch (_: Throwable) {
        true // can't tell: don't nag
    }

    /** Intent that asks the user to exempt PhoneGuard from battery optimization (null if not needed). */
    fun batteryExemptionIntent(context: Context): Intent? {
        if (isBatteryExempt(context)) return null
        // Allowed because the manifest declares REQUEST_IGNORE_BATTERY_OPTIMIZATIONS.
        return Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName))
    }

    /** True on Samsung phones (for Samsung-specific advice). */
    fun isSamsung(): Boolean = Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    /** True if Samsung's built-in virus scan ("Device protection") is on this phone. */
    fun hasSamsungDeviceProtection(context: Context): Boolean = try {
        context.packageManager.getPackageInfo(SAMSUNG_DEVICE_PROTECTION, 0)
        true
    } catch (_: Throwable) { false }

    /** Plain-language, device-specific advice lines for the Home screen (e.g. Samsung "Never sleeping apps"). */
    fun setupTips(context: Context): List<String> =
        SetupLogic.setupTips(isSamsung(), Build.VERSION.SDK_INT < 30, isSamsung() && hasSamsungDeviceProtection(context))

    /** How to turn on Always-on VPN on this phone, with the warning to leave lockdown off. */
    fun alwaysOnVpnTip(): String = SetupLogic.alwaysOnVpnTip(isSamsung())
}
