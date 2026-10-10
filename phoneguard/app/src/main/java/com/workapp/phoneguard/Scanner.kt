package com.workapp.phoneguard

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.TimeUnit

enum class Severity(val label: String, val color: Int) {
    HIGH("High risk", 0xFFFF5252.toInt()),
    MEDIUM("Check this", 0xFFFFB300.toInt()),
    LOW("Worth a look", 0xFF64B5F6.toInt()),
}

enum class Fix {
    APP_INFO, UNINSTALL, ACCESSIBILITY, DEVICE_ADMIN, NOTIFICATION_ACCESS, DEV_OPTIONS,
    SECURITY, VPN, NETWORK, SCREEN_LOCK, UPDATE,
}

data class Action(val label: String, val fix: Fix)

data class Finding(
    val id: String,
    val severity: Severity,
    val title: String,
    val details: List<String>,
    val pkg: String? = null,
    val actions: List<Action> = emptyList(),
)

/** What one installed app can do, gathered from Android's own records. */
class AppProfile(
    val pkg: String,
    val label: String,
    val system: Boolean,
    val installer: String?,
    val installedDaysAgo: Long,
    val hiddenIcon: Boolean,
    val sensitive: List<String>,
    val sensitiveScore: Int,
    val knownSpyware: String?,
) {
    val sideloaded: Boolean get() = installer == null || installer !in TRUSTED_STORES

    companion object {
        val TRUSTED_STORES = setOf(
            "com.android.vending",                 // Google Play
            "com.sec.android.app.samsungapps",     // Galaxy Store
            "com.amazon.venezia",                  // Amazon Appstore
            "com.huawei.appmarket",                // Huawei AppGallery
            "com.xiaomi.market", "com.xiaomi.mipicks",
            "com.oppo.market", "com.heytap.market",
            "com.bbk.appstore",                    // vivo
            "com.google.android.feedback",         // older Play installs
            "org.fdroid.fdroid",
        )

        /** Permission -> (plain description, weight). */
        val SENSITIVE = linkedMapOf(
            "android.permission.ACCESS_BACKGROUND_LOCATION" to ("Your location all the time, even when closed" to 3),
            "android.permission.ACCESS_FINE_LOCATION" to ("Your exact location" to 1),
            "android.permission.RECORD_AUDIO" to ("Microphone" to 2),
            "android.permission.CAMERA" to ("Camera" to 1),
            "android.permission.READ_SMS" to ("Read your text messages" to 3),
            "android.permission.RECEIVE_SMS" to ("See incoming text messages" to 2),
            "android.permission.READ_CALL_LOG" to ("Your call history" to 2),
            "android.permission.READ_CONTACTS" to ("Your contacts" to 1),
            "android.permission.READ_MEDIA_IMAGES" to ("Your photos" to 1),
            "android.permission.READ_EXTERNAL_STORAGE" to ("Your files and photos" to 1),
        )

        @Suppress("DEPRECATION")
        fun flags(): Int = PackageManager.GET_PERMISSIONS or
            if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES
            else PackageManager.GET_SIGNATURES

        @Suppress("DEPRECATION")
        fun of(context: Context, pi: PackageInfo, ioc: Ioc): AppProfile {
            val pm = context.packageManager
            val ai = pi.applicationInfo!!
            val granted = ArrayList<String>()
            var score = 0
            val perms = pi.requestedPermissions ?: emptyArray()
            val pflags = pi.requestedPermissionsFlags ?: IntArray(0)
            for (i in perms.indices) {
                val info = SENSITIVE[perms[i]] ?: continue
                if (i < pflags.size && pflags[i] and PackageInfo.REQUESTED_PERMISSION_GRANTED != 0) {
                    granted += info.first
                    score += info.second
                }
            }
            val installer = try {
                if (Build.VERSION.SDK_INT >= 30) pm.getInstallSourceInfo(pi.packageName).installingPackageName
                else pm.getInstallerPackageName(pi.packageName)
            } catch (_: Exception) { null }

            val certs = if (Build.VERSION.SDK_INT >= 28) {
                val si = pi.signingInfo
                when {
                    si == null -> emptyArray()
                    si.hasMultipleSigners() -> si.apkContentsSigners
                    else -> si.signingCertificateHistory ?: emptyArray()
                }
            } else pi.signatures ?: emptyArray()
            val sha1 = MessageDigest.getInstance("SHA-1")
            val certMatch = certs.firstNotNullOfOrNull { sig ->
                val hex = sha1.digest(sig.toByteArray()).joinToString("") { "%02X".format(it) }
                ioc.certs[hex]
            }

            return AppProfile(
                pkg = pi.packageName,
                label = ai.loadLabel(pm).toString(),
                system = ai.flags and ApplicationInfo.FLAG_SYSTEM != 0,
                installer = installer,
                installedDaysAgo = TimeUnit.MILLISECONDS.toDays(System.currentTimeMillis() - pi.firstInstallTime),
                hiddenIcon = pm.getLaunchIntentForPackage(pi.packageName) == null,
                sensitive = granted,
                sensitiveScore = score,
                knownSpyware = ioc.packages[pi.packageName] ?: certMatch,
            )
        }

        fun installerName(pkg: String?): String = when (pkg) {
            null -> "unknown (often a computer or a direct download)"
            "com.google.android.packageinstaller", "com.android.packageinstaller" ->
                "a downloaded file (package installer)"
            else -> pkg
        }
    }
}

/** Known stalkerware, from the Echap stalkerware-indicators project (CC-BY 4.0). */
class Ioc(val packages: Map<String, String>, val certs: Map<String, String>) {
    companion object {
        @Volatile
        private var cached: Ioc? = null

        fun load(context: Context): Ioc = cached ?: synchronized(this) {
            cached ?: run {
                val p = HashMap<String, String>()
                val c = HashMap<String, String>()
                context.assets.open("stalkerware.tsv").bufferedReader().useLines { lines ->
                    for (line in lines) {
                        if (line.startsWith("#")) continue
                        val parts = line.split('\t')
                        if (parts.size < 3) continue
                        if (parts[0] == "P") p[parts[1]] = parts[2] else c[parts[1]] = parts[2]
                    }
                }
                Ioc(p, c).also { cached = it }
            }
        }
    }
}

class Scanner(private val context: Context) {
    private val pm = context.packageManager

    class Result(val findings: List<Finding>, val hiddenByTrust: Int, val appsChecked: Int)

    fun run(progress: (String) -> Unit): Result {
        val out = ArrayList<Finding>()
        progress("Loading spyware database…")
        val ioc = Ioc.load(context)

        progress("Checking phone settings…")
        checkDevice(out)

        progress("Finding apps with special access…")
        val a11y = accessibilityPackages()
        val admins = adminPackages()
        val listeners = notificationListenerPackages()

        @Suppress("DEPRECATION")
        val packages = pm.getInstalledPackages(AppProfile.flags())
        var i = 0
        for (pi in packages) {
            i++
            if (pi.applicationInfo == null || pi.packageName == context.packageName) continue
            if (i % 20 == 0) progress("Checking apps… $i of ${packages.size}")
            try {
                checkApp(pi, ioc, a11y, admins, listeners)?.let { out += it }
            } catch (_: Exception) {
            }
        }

        val trusted = Rules(context).trusted
        val shown = out.filter { it.id !in trusted }.sortedBy { it.severity.ordinal }
        return Result(shown, out.size - shown.size, packages.size)
    }

    private fun checkApp(
        pi: PackageInfo, ioc: Ioc,
        a11y: Set<String>, admins: Set<String>, listeners: Set<String>,
    ): Finding? {
        val app = AppProfile.of(context, pi, ioc)
        val pkg = app.pkg
        val uninstall = listOf(Action("Uninstall", Fix.UNINSTALL), Action("App info", Fix.APP_INFO))

        if (app.knownSpyware != null) {
            val details = mutableListOf(
                "Matches the known stalkerware \"${app.knownSpyware}\".",
                "Stalkerware lets someone else read your messages, track your location and more.",
            )
            if (pkg in admins) details += "It is a device administrator: turn that off first (Security settings), then uninstall."
            details += "If you are in danger, think about your safety before removing it: the person who installed it may notice."
            return Finding(
                "app:$pkg", Severity.HIGH, "Known spy app: ${app.label}", details, pkg,
                (if (pkg in admins) listOf(Action("Device admin apps", Fix.DEVICE_ADMIN)) else emptyList()) + uninstall,
            )
        }
        if (app.system) return null

        val reasons = ArrayList<String>()
        val actions = ArrayList<Action>()
        var power = 0
        if (pkg in a11y) {
            power += 4
            reasons += "Accessibility is ON: it can see and tap anything on your screen, including messages and passwords."
            actions += Action("Accessibility", Fix.ACCESSIBILITY)
        }
        if (pkg in admins) {
            power += 4
            reasons += "Device administrator: it can lock or wipe your phone and is hard to uninstall."
            actions += Action("Device admin apps", Fix.DEVICE_ADMIN)
        }
        if (pkg in listeners) {
            power += 3
            reasons += "Notification access: it reads every notification, including your chats and codes."
            actions += Action("Notification access", Fix.NOTIFICATION_ACCESS)
        }
        val perms = pi.requestedPermissions?.toSet() ?: emptySet()
        if ("android.permission.PACKAGE_USAGE_STATS" in perms && opAllowed("android:get_usage_stats", pi)) {
            power += 1
            reasons += "Usage access: it sees which apps you use and when."
        }
        if ("android.permission.SYSTEM_ALERT_WINDOW" in perms && opAllowed("android:system_alert_window", pi)) {
            power += 1
            reasons += "Can draw over other apps (can fake login screens)."
        }
        if ("android.permission.REQUEST_INSTALL_PACKAGES" in perms && opAllowed("android:request_install_packages", pi)) {
            power += 1
            reasons += "Allowed to install other apps."
        }

        val hidden = app.hiddenIcon && (power > 0 || app.sensitiveScore > 0)
        val stealthy = app.sideloaded || hidden || pkg in a11y || pkg in admins || pkg in listeners
        if (!stealthy) return null

        var score = power
        if (hidden) {
            score += 3
            reasons.add(0, "Has no icon in your app drawer, so it is easy to miss.")
        }
        if (app.sideloaded) {
            score += 2
            reasons += "Not from an app store: installed by ${AppProfile.installerName(app.installer)}."
        }
        if (app.sensitive.isNotEmpty()) {
            score += app.sensitiveScore
            reasons += "Has access to: " + app.sensitive.joinToString(", ") + "."
        }
        if (app.installedDaysAgo <= 30) {
            score += 1
            reasons += if (app.installedDaysAgo == 0L) "Installed today." else "Installed ${app.installedDaysAgo} days ago."
        }

        val severity = when {
            score >= 9 -> Severity.HIGH
            score >= 5 -> Severity.MEDIUM
            else -> Severity.LOW
        }
        reasons += "If you don't know this app or didn't install it yourself, remove it."
        return Finding("app:$pkg", severity, app.label, reasons, pkg, actions + uninstall)
    }

    private fun opAllowed(op: String, pi: PackageInfo): Boolean {
        val aom = context.getSystemService(AppOpsManager::class.java) ?: return false
        val uid = pi.applicationInfo?.uid ?: return false
        return try {
            val mode = if (Build.VERSION.SDK_INT >= 29) aom.unsafeCheckOpNoThrow(op, uid, pi.packageName)
            else @Suppress("DEPRECATION") aom.checkOpNoThrow(op, uid, pi.packageName)
            mode == AppOpsManager.MODE_ALLOWED
        } catch (_: Exception) { false }
    }

    private fun accessibilityPackages(): Set<String> {
        val out = HashSet<String>()
        try {
            val am = context.getSystemService(AccessibilityManager::class.java)
            am?.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
                ?.forEach { out += it.resolveInfo.serviceInfo.packageName }
        } catch (_: Exception) {}
        out += componentPackages(Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        return out
    }

    private fun adminPackages(): Set<String> = try {
        context.getSystemService(DevicePolicyManager::class.java)?.activeAdmins
            ?.map { it.packageName }?.toSet() ?: emptySet()
    } catch (_: Exception) { emptySet() }

    private fun notificationListenerPackages(): Set<String> =
        componentPackages("enabled_notification_listeners")

    private fun componentPackages(key: String): Set<String> = try {
        (Settings.Secure.getString(context.contentResolver, key) ?: "")
            .split(':').mapNotNull { ComponentName.unflattenFromString(it)?.packageName }.toSet()
    } catch (_: Exception) { emptySet() }

    private fun globalInt(key: String): Int = try {
        Settings.Global.getInt(context.contentResolver, key, 0)
    } catch (_: Exception) { 0 }

    private fun checkDevice(out: MutableList<Finding>) {
        val km = context.getSystemService(KeyguardManager::class.java)
        if (km != null && !km.isDeviceSecure) {
            out += Finding(
                "dev:lock", Severity.HIGH, "No screen lock",
                listOf(
                    "Anyone who picks up your phone can open it and install spy apps in a minute.",
                    "Set a PIN or password (6+ digits) that nobody else knows.",
                ),
                actions = listOf(Action("Set screen lock", Fix.SCREEN_LOCK)),
            )
        }

        if (isRooted()) {
            out += Finding(
                "dev:root", Severity.HIGH, "Phone appears to be rooted",
                listOf(
                    "Rooting removes Android's built-in protections. Spy tools can then hide from every app, including this one.",
                    "If you didn't do this yourself, back up your photos and do a factory reset.",
                ),
                actions = listOf(Action("Security settings", Fix.SECURITY)),
            )
        }

        userCaCertificates().takeIf { it.isNotEmpty() }?.let { names ->
            out += Finding(
                "dev:ca:" + names.sorted().joinToString(","), Severity.HIGH,
                "Extra security certificate installed",
                listOf(
                    "Certificates installed by a person (not Android) can let someone read your encrypted internet traffic on Wi-Fi or mobile data.",
                    "Installed: " + names.joinToString(", "),
                    "Unless your school or job installed it, remove it: Settings → Security → Encryption & credentials → User credentials / Trusted credentials → User.",
                ),
                actions = listOf(Action("Security settings", Fix.SECURITY)),
            )
        }

        if (globalInt("adb_wifi_enabled") == 1) {
            out += Finding(
                "dev:adbwifi", Severity.HIGH, "Wireless debugging is ON",
                listOf("Someone on the same Wi-Fi who has paired before can control your phone. Turn it off."),
                actions = listOf(Action("Developer options", Fix.DEV_OPTIONS)),
            )
        }
        if (globalInt(Settings.Global.ADB_ENABLED) == 1) {
            out += Finding(
                "dev:adb", Severity.MEDIUM, "USB debugging is ON",
                listOf("A computer plugged into your phone can install hidden apps. Turn it off unless you use it."),
                actions = listOf(Action("Developer options", Fix.DEV_OPTIONS)),
            )
        } else if (globalInt(Settings.Global.DEVELOPMENT_SETTINGS_ENABLED) == 1) {
            out += Finding(
                "dev:devopts", Severity.LOW, "Developer options are on",
                listOf("Not dangerous by itself, but if you didn't turn this on, someone else may have used your phone."),
                actions = listOf(Action("Developer options", Fix.DEV_OPTIONS)),
            )
        }

        val cm = context.getSystemService(ConnectivityManager::class.java)
        val proxy = try { cm?.defaultProxy } catch (_: Exception) { null }
        if (proxy != null && !proxy.host.isNullOrEmpty()) {
            out += Finding(
                "dev:proxy:${proxy.host}", Severity.MEDIUM, "Internet traffic goes through a proxy",
                listOf(
                    "Your traffic is being sent to ${proxy.host}:${proxy.port} first.",
                    "If you didn't set this up, open your Wi-Fi network's settings and set Proxy to None.",
                ),
                actions = listOf(Action("Network settings", Fix.NETWORK)),
            )
        }

        @Suppress("DEPRECATION")
        val otherVpn = !FirewallService.running && try {
            cm?.allNetworks?.any {
                cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
            } == true
        } catch (_: Exception) { false }
        if (otherVpn) {
            out += Finding(
                "dev:vpn", Severity.MEDIUM, "Another VPN is active",
                listOf("A VPN can see all your internet traffic. Make sure it's one you chose and trust."),
                actions = listOf(Action("VPN settings", Fix.VPN)),
            )
        }

        patchAgeDays()?.let { days ->
            if (days > 90) {
                out += Finding(
                    "dev:patch:${Build.VERSION.SECURITY_PATCH}",
                    if (days > 180) Severity.MEDIUM else Severity.LOW,
                    "Security updates are ${days / 30} months old",
                    listOf(
                        "Security patch level: ${Build.VERSION.SECURITY_PATCH}.",
                        "Updates fix holes that spyware uses to get in. Install any available system update.",
                    ),
                    actions = listOf(Action("Check for update", Fix.UPDATE)),
                )
            }
        }
    }

    private fun isRooted(): Boolean {
        if (Build.TAGS?.contains("test-keys") == true) return true
        val paths = listOf(
            "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/sbin/su", "/vendor/bin/su",
            "/su/bin/su", "/system/app/Superuser.apk", "/data/adb/magisk",
        )
        if (paths.any { File(it).exists() }) return true
        val rootApps = listOf("com.topjohnwu.magisk", "eu.chainfire.supersu", "me.weishu.kernelsu", "com.koushikdutta.superuser")
        return rootApps.any {
            try { pm.getPackageInfo(it, 0); true } catch (_: Exception) { false }
        }
    }

    private fun userCaCertificates(): List<String> = try {
        val ks = KeyStore.getInstance("AndroidCAStore")
        ks.load(null)
        ks.aliases().toList().filter { it.startsWith("user:") }.map { alias ->
            val cert = ks.getCertificate(alias) as? X509Certificate
            cert?.subjectX500Principal?.name?.split(',')
                ?.firstOrNull { it.trim().startsWith("CN=") }?.substringAfter("CN=")
                ?: alias
        }
    } catch (_: Exception) { emptyList() }

    private fun patchAgeDays(): Long? = try {
        val date = SimpleDateFormat("yyyy-MM-dd", Locale.US).parse(Build.VERSION.SECURITY_PATCH)
        date?.let { TimeUnit.MILLISECONDS.toDays(System.currentTimeMillis() - it.time) }
    } catch (_: Exception) { null }
}
