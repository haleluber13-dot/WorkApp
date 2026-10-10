package com.workapp.phoneguard

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.AppOpsManager
import android.app.KeyguardManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import java.io.File
import java.security.KeyStore
import java.security.MessageDigest
import java.security.cert.X509Certificate
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

enum class Severity(val label: String, val color: Int) {
    HIGH("High risk", 0xFFFF5252.toInt()),
    MEDIUM("Check this", 0xFFFFB300.toInt()),
    LOW("Worth a look", 0xFF64B5F6.toInt()),
}

/** Which Settings screen a finding's button opens. See [FixIntents] for the exact intents. */
enum class Fix {
    APP_INFO, UNINSTALL, ACCESSIBILITY, DEVICE_ADMIN, NOTIFICATION_ACCESS, DEV_OPTIONS,
    SECURITY, VPN, NETWORK, SCREEN_LOCK, UPDATE,
    /** Let PhoneGuard run in the background (battery optimization exemption). */
    BATTERY,
    /** Wi-Fi settings. */
    WIFI,
    /** "Install unknown apps" list. */
    INSTALL_SOURCES,
}

data class Action(val label: String, val fix: Fix)

data class Finding(
    val id: String,
    val severity: Severity,
    val title: String,
    val details: List<String>,
    val pkg: String? = null,
    val actions: List<Action> = emptyList(),
    /** False for findings "I trust this" must never hide (known stalkerware). */
    val trustable: Boolean = true,
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
    /** Android 11+: the app that really started the install (adb shows as com.android.shell). */
    val initiatingInstaller: String? = null,
    /** Android 11+: the app the install came from, when Android tells us (usually hidden). */
    val originatingInstaller: String? = null,
    /** Names of the sensitive permissions granted (keys of [SENSITIVE]). */
    val sensitivePermissions: List<String> = emptyList(),
    /** SHA-256 of the current signing certificate(s), hex; null if unknown. */
    val certHash: String? = null,
) {
    val sideloaded: Boolean get() = ScanLogic.isSideloaded(installer, initiatingInstaller, originatingInstaller)

    /** Claims to come from an app store, but something else really installed it (e.g. adb install -i). */
    val spoofedStore: Boolean get() = sideloaded && installer != null && installer in TRUSTED_STORES

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

        /**
         * Apps that may start an install without it being a sideload: the stores above, plus the
         * tools that restore apps onto a new phone (they record the store as the installer).
         */
        val TRUSTED_INITIATORS = TRUSTED_STORES + setOf(
            "com.sec.android.easyMover",           // Samsung Smart Switch
            "com.google.android.apps.restore",     // Google's restore during setup
            "com.google.android.gms",              // Google Play services (restores, instant apps)
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
            val grantedNames = ArrayList<String>()
            var score = 0
            val perms = pi.requestedPermissions ?: emptyArray()
            val pflags = pi.requestedPermissionsFlags ?: IntArray(0)
            for (i in perms.indices) {
                val info = SENSITIVE[perms[i]] ?: continue
                if (i < pflags.size && pflags[i] and PackageInfo.REQUESTED_PERMISSION_GRANTED != 0) {
                    granted += info.first
                    grantedNames += perms[i]
                    score += info.second
                }
            }
            var installer: String? = null
            var initiating: String? = null
            var originating: String? = null
            try {
                if (Build.VERSION.SDK_INT >= 30) {
                    val src = pm.getInstallSourceInfo(pi.packageName)
                    installer = src.installingPackageName
                    // "adb install -i com.android.vending" fakes the installer, but not the initiator.
                    initiating = src.initiatingPackageName
                    originating = src.originatingPackageName
                } else {
                    installer = pm.getInstallerPackageName(pi.packageName)
                }
            } catch (_: Exception) {}

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
            val current = if (Build.VERSION.SDK_INT >= 28) pi.signingInfo?.apkContentsSigners ?: certs else certs
            val certHash = try {
                val sha256 = MessageDigest.getInstance("SHA-256")
                current.map { sig -> sha256.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) } }
                    .sorted().joinToString(",").ifEmpty { null }
            } catch (_: Exception) { null }

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
                initiatingInstaller = initiating,
                originatingInstaller = originating,
                sensitivePermissions = grantedNames,
                certHash = certHash,
            )
        }

        fun installerName(pkg: String?): String = when (pkg) {
            null -> "unknown (often a computer or a direct download)"
            "com.android.shell" -> "a computer connected by USB cable"
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

/**
 * Pure scan decisions (no android.* calls), kept apart so they can be unit tested.
 */
object ScanLogic {
    /** Galaxy Note20 / Note20 Ultra model numbers (SM-N980/N981 = Note20, SM-N985/N986 = Ultra; SC-53A/SCG06 = Japan). */
    fun isNote20(model: String?): Boolean {
        val m = model?.trim()?.uppercase() ?: return false
        return m.startsWith("SM-N98") || m == "SC-53A" || m == "SCG06"
    }

    /** Days since the security patch date ("2024-10-01"), or null if it can't be read. Never negative. */
    fun patchAgeDays(patch: String?, today: LocalDate): Long? = try {
        val date = LocalDate.parse(patch?.trim() ?: return null)
        ChronoUnit.DAYS.between(date, today).coerceAtLeast(0)
    } catch (_: Exception) { null }

    /** Null = recent enough. Capped at MEDIUM: the user can't fix it, and it isn't an active threat. */
    fun patchSeverity(days: Long): Severity? = when {
        days > 180 -> Severity.MEDIUM
        days > 90 -> Severity.LOW
        else -> null
    }

    /** "5 months", "over a year", "over 2 years". */
    fun ageText(days: Long): String {
        val months = days / 30
        return when {
            months < 12 -> "$months month${if (months == 1L) "" else "s"}"
            months < 24 -> "over a year"
            else -> "over ${months / 12} years"
        }
    }

    /** How worrying one app is, from the points gathered in Scanner.checkApp. */
    fun appSeverity(score: Int): Severity = when {
        score >= 9 -> Severity.HIGH
        score >= 5 -> Severity.MEDIUM
        else -> Severity.LOW
    }

    /**
     * True if an app didn't come from an app store. [installer] is the installer of record, which
     * "adb install -i com.android.vending" can fake. On Android 11+ [initiating] (and, when Android
     * shows it, [originating]) say who really started the install; null means Android doesn't know
     * (e.g. apps installed before an upgrade to Android 11), which is not held against the app.
     */
    fun isSideloaded(installer: String?, initiating: String?, originating: String?): Boolean {
        if (installer == null || installer !in AppProfile.TRUSTED_STORES) return true
        if (initiating != null && initiating !in AppProfile.TRUSTED_INITIATORS) return true
        if (originating != null && originating !in AppProfile.TRUSTED_INITIATORS) return true
        return false
    }

    /** The id "I trust this" used to store for an app (any state). Trusts saved like this no longer hide anything. */
    fun legacyAppFindingId(pkg: String): String = "app:$pkg"

    /**
     * Id of an app finding. It encodes what makes the app risky (its special powers and sensitive
     * permissions, whether it is known stalkerware, and who signed it), so trusting it stops
     * hiding it as soon as the app gains a new power, changes signer or turns out to be stalkerware.
     */
    fun appFindingId(pkg: String, powers: Collection<String>, knownSpyware: Boolean, certHash: String?): String {
        val p = powers.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.toSortedSet().joinToString(",")
        val cert = certHash?.trim()?.lowercase()?.take(16)?.ifEmpty { null } ?: "-"
        return "app:$pkg|$p|${if (knownSpyware) "spy" else "-"}|$cert"
    }

    /** Which findings the user's trusted ids hide. Findings that aren't trustable are never hidden. */
    fun hiddenByTrust(findings: List<Finding>, trusted: Set<String>): List<Finding> =
        findings.filter { it.trustable && it.id in trusted }

    /**
     * One-time move from the old "app:<pkg>" trusts: they count as trusting the app as it is now.
     * Returns the new ids to save.
     */
    fun migrateLegacyTrust(findings: List<Finding>, trusted: Set<String>): List<String> =
        findings.filter { f -> f.trustable && f.pkg != null && legacyAppFindingId(f.pkg) in trusted && f.id !in trusted }
            .map { it.id }

    /** Changes when the set of apps changes, so "I trust this" doesn't hide a newly allowed app. */
    fun installersFindingId(pkgs: Collection<String>): String = "dev:installers:" + pkgs.sorted().joinToString(",")
}

/** The Settings screens that each [Fix] opens, best first. Used by the UI's fix buttons. */
object FixIntents {
    /**
     * Intents to try in order (start the first one that works). Always ends with the main
     * Settings screen. Start them from an Activity, or add FLAG_ACTIVITY_NEW_TASK.
     */
    fun candidates(context: Context, fix: Fix, pkg: String?): List<Intent> {
        val pkgUri = pkg?.let { Uri.fromParts("package", it, null) }
        val list: List<Intent> = when (fix) {
            Fix.APP_INFO -> listOfNotNull(pkgUri?.let { Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, it) })
            Fix.UNINSTALL -> listOfNotNull(
                pkgUri?.let { Intent(Intent.ACTION_DELETE, it) },
                pkgUri?.let { Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, it) },
            )
            Fix.ACCESSIBILITY -> listOf(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            Fix.DEVICE_ADMIN -> listOf(
                Intent().setComponent(ComponentName("com.android.settings", "com.android.settings.DeviceAdminSettings")),
                Intent(Settings.ACTION_SECURITY_SETTINGS),
            )
            Fix.NOTIFICATION_ACCESS -> listOf(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS))
            Fix.DEV_OPTIONS -> listOf(Intent(Settings.ACTION_APPLICATION_DEVELOPMENT_SETTINGS))
            Fix.SECURITY -> listOf(Intent(Settings.ACTION_SECURITY_SETTINGS))
            Fix.VPN -> listOf(Intent(Settings.ACTION_VPN_SETTINGS))
            Fix.NETWORK -> listOf(Intent(Settings.ACTION_WIRELESS_SETTINGS))
            Fix.SCREEN_LOCK -> listOf(Intent(DevicePolicyManager.ACTION_SET_NEW_PASSWORD), Intent(Settings.ACTION_SECURITY_SETTINGS))
            Fix.UPDATE -> listOf(Intent("android.settings.SYSTEM_UPDATE_SETTINGS"), Intent(Settings.ACTION_DEVICE_INFO_SETTINGS))
            Fix.BATTERY -> listOfNotNull(
                // The "Allow" dialog (null once PhoneGuard is already exempt).
                DeviceHealth.batteryExemptionIntent(context),
                Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
            )
            Fix.WIFI -> listOf(Intent(Settings.ACTION_WIFI_SETTINGS), Intent(Settings.ACTION_WIRELESS_SETTINGS))
            Fix.INSTALL_SOURCES -> listOfNotNull(
                pkgUri?.let { Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, it) },
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES),
                Intent(Settings.ACTION_SECURITY_SETTINGS),
            )
        }
        return list + Intent(Settings.ACTION_SETTINGS)
    }
}

class Scanner(private val context: Context) {
    private val pm = context.packageManager

    class Result(val findings: List<Finding>, val hiddenByTrust: Int, val appsChecked: Int)

    companion object {
        private const val KEY_TRUST_MIGRATED = "trust_ids_v2"

        /**
         * Device admins that are part of the phone's own anti-theft or account protection
         * (Samsung Find My Mobile, Google Find My Device, Samsung Knox Guard). Not flagged when they
         * come preinstalled or from an app store; a known-spyware match is still always flagged.
         */
        val TRUSTED_ADMINS = setOf(
            "com.samsung.android.fmm",
            "com.google.android.gms",
            "com.google.android.apps.adm",
            "com.samsung.android.kgclient",
        )

        /**
         * Preinstalled apps that commonly get "Install unknown apps" switched on by the user
         * (files, browsers, chat and mail). Browsers are also found automatically.
         */
        val INSTALL_WATCH = setOf(
            "com.sec.android.app.myfiles",            // Samsung My Files
            "com.sec.android.app.sbrowser",           // Samsung Internet
            "com.sec.android.app.sbrowser.beta",
            "com.android.chrome",
            "com.google.android.apps.nbu.files",      // Files by Google
            "com.google.android.apps.docs",           // Google Drive
            "com.google.android.gm",                  // Gmail
            "com.samsung.android.messaging",          // Samsung Messages
            "com.google.android.apps.messaging",      // Google Messages
            "com.samsung.android.email.provider",     // Samsung Email
        )
    }

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
        val installWatch = INSTALL_WATCH + browserPackages()
        val installers = ArrayList<Pair<String, String>>()

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
            try {
                if (canInstallApps(pi, installWatch)) installers += pi.packageName to appLabel(pi)
            } catch (_: Exception) {
            }
        }
        if (installers.isNotEmpty()) out += installersFinding(installers)

        val rules = Rules(context)
        var trusted = rules.trusted
        val prefs = context.getSharedPreferences("scanner", Context.MODE_PRIVATE)
        if (!prefs.getBoolean(KEY_TRUST_MIGRATED, false)) {
            for (id in ScanLogic.migrateLegacyTrust(out, trusted)) rules.trust(id)
            prefs.edit().putBoolean(KEY_TRUST_MIGRATED, true).apply()
            trusted = rules.trusted
        }
        val hidden = ScanLogic.hiddenByTrust(out, trusted).toSet()
        val shown = out.filter { it !in hidden }.sortedBy { it.severity.ordinal }
        return Result(shown, hidden.size, packages.size)
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
            details += "Known spy apps always stay on this list until they are removed."
            return Finding(
                ScanLogic.appFindingId(pkg, emptyList(), true, app.certHash), Severity.HIGH,
                "Known spy app: ${app.label}", details, pkg,
                (if (pkg in admins) listOf(Action("Device admin apps", Fix.DEVICE_ADMIN)) else emptyList()) + uninstall,
                trustable = false,
            )
        }
        // Preinstalled (Samsung/Google) apps legitimately hold these powers, e.g. Find My Mobile as device admin.
        if (app.system) return null

        val reasons = ArrayList<String>()
        val actions = ArrayList<Action>()
        // What the app can do, for the finding id: a new power must undo "I trust this".
        val powers = ArrayList<String>()
        var power = 0
        if (pkg in a11y) {
            powers += "a11y"
            power += 4
            reasons += "Accessibility is ON: it can see and tap anything on your screen, including messages and passwords."
            actions += Action("Accessibility", Fix.ACCESSIBILITY)
        }
        val trustedAdmin = pkg in TRUSTED_ADMINS && !app.sideloaded
        if (pkg in admins) powers += "admin"
        if (pkg in admins && !trustedAdmin) {
            power += 4
            reasons += "Device administrator: it can lock or wipe your phone and is hard to uninstall."
            actions += Action("Device admin apps", Fix.DEVICE_ADMIN)
        }
        if (pkg in listeners) {
            powers += "listener"
            power += 3
            reasons += "Notification access: it reads every notification, including your chats and codes."
            actions += Action("Notification access", Fix.NOTIFICATION_ACCESS)
        }
        val perms = pi.requestedPermissions?.toSet() ?: emptySet()
        if ("android.permission.PACKAGE_USAGE_STATS" in perms && opAllowed("android:get_usage_stats", pi)) {
            powers += "usage"
            power += 1
            reasons += "Usage access: it sees which apps you use and when."
        }
        if ("android.permission.SYSTEM_ALERT_WINDOW" in perms && opAllowed("android:system_alert_window", pi)) {
            powers += "overlay"
            power += 1
            reasons += "Can draw over other apps (can fake login screens)."
        }
        if ("android.permission.REQUEST_INSTALL_PACKAGES" in perms && opAllowed("android:request_install_packages", pi)) {
            powers += "install"
            power += 1
            reasons += "Allowed to install other apps."
        }

        val hidden = app.hiddenIcon && (power > 0 || app.sensitiveScore > 0)
        val stealthy = app.sideloaded || hidden || pkg in a11y || (pkg in admins && !trustedAdmin) || pkg in listeners
        if (!stealthy) return null

        var score = power
        if (hidden) {
            score += 3
            reasons.add(0, "Has no icon in your app drawer, so it is easy to miss.")
        }
        if (app.sideloaded) {
            score += 2
            reasons += if (app.spoofedStore) {
                "Says it came from an app store, but it was really installed by " +
                    AppProfile.installerName(app.initiatingInstaller ?: app.originatingInstaller) + "."
            } else {
                "Not from an app store: installed by ${AppProfile.installerName(app.installer)}."
            }
        }
        if (app.sensitive.isNotEmpty()) {
            score += app.sensitiveScore
            reasons += "Has access to: " + app.sensitive.joinToString(", ") + "."
        }
        if (app.installedDaysAgo <= 30) {
            score += 1
            reasons += if (app.installedDaysAgo == 0L) "Installed today." else "Installed ${app.installedDaysAgo} days ago."
        }

        reasons += "If you don't know this app or didn't install it yourself, remove it."
        if (hidden) powers += "hidden"
        if (app.sideloaded) powers += "sideloaded"
        for (p in app.sensitivePermissions) powers += "perm:" + p.substringAfterLast('.')
        val id = ScanLogic.appFindingId(pkg, powers, false, app.certHash)
        return Finding(id, ScanLogic.appSeverity(score), app.label, reasons, pkg, actions + uninstall)
    }

    /** True if [pi] may install apps (the "Install unknown apps" switch is on for it). */
    private fun canInstallApps(pi: PackageInfo, watch: Set<String>): Boolean {
        val pkg = pi.packageName
        if (pkg in AppProfile.TRUSTED_STORES) return false
        val system = (pi.applicationInfo?.flags ?: 0) and ApplicationInfo.FLAG_SYSTEM != 0
        if (system && pkg !in watch) return false
        if (pi.requestedPermissions?.contains("android.permission.REQUEST_INSTALL_PACKAGES") != true) return false
        return opAllowed("android:request_install_packages", pi)
    }

    private fun installersFinding(apps: List<Pair<String, String>>): Finding {
        val names = apps.map { it.second }.distinct().sortedBy { it.lowercase() }
        return Finding(
            ScanLogic.installersFindingId(apps.map { it.first }), Severity.LOW,
            if (names.size == 1) "1 app can install other apps" else "${names.size} apps can install other apps",
            listOf(
                "\"Install unknown apps\" is on for: " + names.joinToString(", ") + ".",
                "This is how most spy apps get onto a phone: someone sends a link or file that installs an app.",
                "Turn it off for any app you don't use to install apps. You can switch it back on when you need it.",
            ),
            actions = listOf(Action("Install unknown apps", Fix.INSTALL_SOURCES)),
        )
    }

    private fun appLabel(pi: PackageInfo): String = try {
        pi.applicationInfo?.loadLabel(pm)?.toString() ?: pi.packageName
    } catch (_: Exception) { pi.packageName }

    /** Apps that can open web pages; on Samsung these include preinstalled browsers. */
    private fun browserPackages(): Set<String> = try {
        val probe = Intent(Intent.ACTION_VIEW, Uri.parse("http://example.com")).addCategory(Intent.CATEGORY_BROWSABLE)
        pm.queryIntentActivities(probe, PackageManager.MATCH_ALL).mapNotNull { it.activityInfo?.packageName }.toSet()
    } catch (_: Exception) { emptySet() }

    private fun opAllowed(op: String, pi: PackageInfo): Boolean {
        val aom = context.getSystemService(AppOpsManager::class.java) ?: return false
        val uid = pi.applicationInfo?.uid ?: return false
        return try {
            aom.unsafeCheckOpNoThrow(op, uid, pi.packageName) == AppOpsManager.MODE_ALLOWED
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

    /** Runs one check; a failure in one check must never stop the others. */
    private inline fun safely(block: () -> Unit) {
        try {
            block()
        } catch (_: Throwable) {
        }
    }

    private fun checkDevice(out: MutableList<Finding>) {
        val cm = context.getSystemService(ConnectivityManager::class.java)

        safely {
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
        }

        safely {
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
        }

        safely {
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
        }

        safely {
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
        }

        safely {
            val proxy = cm?.defaultProxy
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
        }

        safely {
            @Suppress("DEPRECATION")
            val otherVpn = !FirewallService.running && cm?.allNetworks?.any {
                cm.getNetworkCapabilities(it)?.hasTransport(NetworkCapabilities.TRANSPORT_VPN) == true
            } == true
            if (otherVpn) {
                out += Finding(
                    "dev:vpn", Severity.MEDIUM, "Another VPN is active",
                    listOf("A VPN can see all your internet traffic. Make sure it's one you chose and trust."),
                    actions = listOf(Action("VPN settings", Fix.VPN)),
                )
            }
        }

        safely { checkPrivateDns(cm, out) }
        safely { checkWifi(out) }
        safely { checkBattery(out) }
        safely { checkPatch(out) }
    }

    private fun checkPrivateDns(cm: ConnectivityManager?, out: MutableList<Finding>) {
        cm ?: return
        // Read the real network: the VPN's own settings don't tell us what the phone is set to.
        @Suppress("DEPRECATION")
        val server = cm.allNetworks.firstNotNullOfOrNull { n ->
            val caps = cm.getNetworkCapabilities(n)
            if (caps == null || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ||
                !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            ) return@firstNotNullOfOrNull null
            val lp = cm.getLinkProperties(n) ?: return@firstNotNullOfOrNull null
            lp.privateDnsServerName?.trim()?.takeIf { lp.isPrivateDnsActive && it.isNotEmpty() }
        } ?: return
        val path = if (DeviceHealth.isSamsung()) "Settings → Connections → More connection settings → Private DNS"
        else "Settings → Network & internet → Private DNS"
        out += Finding(
            "dev:privdns:$server", Severity.LOW, "Private DNS skips the Web Shield",
            listOf(
                "Your phone sends its website lookups straight to $server, so PhoneGuard's Web Shield can't check them for dangerous sites.",
                "To let the Web Shield protect you, set Private DNS to Automatic or Off: $path.",
                "If you chose this provider yourself and trust it, you can keep it.",
            ),
            actions = listOf(Action("Network settings", Fix.NETWORK)),
        )
    }

    private fun checkWifi(out: MutableList<Finding>) {
        val safety = WifiGuard.check(context)
        if (safety != WifiSafety.OPEN && safety != WifiSafety.WEAK) return
        val ssid = WifiGuard.currentWifiName(context)
        val name = ssid?.let { "\"$it\"" } ?: "This Wi-Fi"
        val weak = safety == WifiSafety.WEAK
        out += Finding(
            "dev:wifi:" + (if (weak) "weak" else "open") + (ssid?.let { ":$it" } ?: ""),
            Severity.MEDIUM,
            if (weak) "Your Wi-Fi has weak security" else "Your Wi-Fi has no password",
            listOf(
                if (weak) "$name uses old security (WEP) that is easy to break. People nearby could see what you do."
                else "$name isn't password protected. People nearby could see what you do.",
                WifiGuard.protectionLine(context),
                "If this is your own Wi-Fi, set a password with WPA2 or WPA3 in your router's settings.",
            ),
            actions = listOf(Action("Wi-Fi settings", Fix.WIFI)),
        )
    }

    private fun checkBattery(out: MutableList<Finding>) {
        if (DeviceHealth.isBatteryExempt(context)) return
        val details = mutableListOf(
            "Android may stop PhoneGuard in the background to save battery, which turns your protection off without telling you.",
            "Tap \"Allow in background\" and choose Allow. PhoneGuard uses very little battery.",
        )
        if (DeviceHealth.isSamsung()) {
            details += if (Build.VERSION.SDK_INT < 30) {
                "Also add PhoneGuard to Settings → Device care → Battery → App power management → Apps that won't be put to sleep."
            } else {
                "Also add PhoneGuard to Settings → Battery and device care → Battery → Background usage limits → Never sleeping apps."
            }
        }
        out += Finding(
            "dev:battery", Severity.MEDIUM, "Battery saving can switch protection off", details,
            actions = listOf(Action("Allow in background", Fix.BATTERY)),
        )
    }

    private fun checkPatch(out: MutableList<Finding>) {
        val patch = Build.VERSION.SECURITY_PATCH
        val days = ScanLogic.patchAgeDays(patch, LocalDate.now()) ?: return
        val severity = ScanLogic.patchSeverity(days) ?: return
        val details = mutableListOf("Security patch level: $patch.")
        if (DeviceHealth.isSamsung() && ScanLogic.isNote20(Build.MODEL)) {
            details += "Samsung has ended regular security updates for the Galaxy Note20 series, so this phone may not get many more fixes."
            details += "Updates fix holes that spyware uses to get in. Without them, PhoneGuard's Web Shield, the firewall and careful app installs matter more."
            details += "Only install apps from Google Play or Galaxy Store, and don't open links or files from people you don't know."
            details += "Still check for updates now and then, in case one arrives."
        } else {
            details += "Updates fix holes that spyware uses to get in. Install any available system update."
        }
        out += Finding(
            "dev:patch:$patch", severity, "Security updates are ${ScanLogic.ageText(days)} old", details,
            actions = listOf(Action("Check for update", Fix.UPDATE)),
        )
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
}
