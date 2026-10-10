package com.workapp.phoneguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/**
 * Reacts to apps being installed while the firewall is running.
 * Rules are written before this returns, so the caller only needs to reload the firewall
 * afterwards (FULL mode reads rules live; BASIC mode rebuilds the VPN).
 */
object NewAppGuard {
    private const val CHANNEL = "new_apps"

    fun onInstalled(context: Context, pkg: String) {
        if (pkg == context.packageName) return
        val pm = context.packageManager
        val rules = Rules(context)
        val pi = try {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(pkg, AppProfile.flags())
        } catch (_: Exception) { return }

        // Block first, before the slower checks below, so a failure there can't leave the app unblocked.
        val usesInternet = pi.requestedPermissions?.contains("android.permission.INTERNET") == true
        var locked = false
        if (rules.lockNewApps && usesInternet) {
            rules.setBlocked(pkg, NetType.NONE, true)
            locked = true
        }

        val app = try { AppProfile.of(context, pi, Ioc.load(context)) } catch (_: Exception) { null }
        val spy = app?.knownSpyware
        // Known stalkerware never gets internet, even if new-app locking is off.
        if (spy != null && usesInternet && !locked) {
            rules.setBlocked(pkg, NetType.NONE, true)
            locked = true
        }
        val label = app?.label ?: try {
            pi.applicationInfo?.loadLabel(pm)?.toString()
        } catch (_: Exception) { null } ?: pkg

        val lines = ArrayList<String>()
        if (spy != null) lines += "⚠ This is known stalkerware ($spy). Remove it."
        if (app != null) {
            if (app.sideloaded) lines += "Not from an app store."
            if (app.hiddenIcon) lines += "Has no app icon."
            if (app.sensitive.isNotEmpty()) lines += "Already allowed: " + app.sensitive.joinToString(", ")
        }
        lines += when {
            locked && FirewallService.running -> "Internet is BLOCKED until you allow it in PhoneGuard."
            locked -> "Its internet will be blocked while PhoneGuard's protection is on. Allow it in PhoneGuard if you trust it."
            else -> "Didn't install this? Open PhoneGuard to check it."
        }

        val title = if (spy != null) "Spy app installed: $label" else "New app installed: $label"
        try {
            notify(context, pkg.hashCode(), title, lines.joinToString("\n"))
        } catch (_: Exception) {
        }
    }

    private fun notify(context: Context, id: Int, title: String, text: String) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) return
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, "New app alerts", NotificationManager.IMPORTANCE_HIGH)
        )
        val open = PendingIntent.getActivity(
            context, id,
            Intent(context, MainActivity::class.java).putExtra(MainActivity.EXTRA_TAB, MainActivity.TAB_FIREWALL),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        nm.notify(
            id,
            Notification.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_shield)
                .setContentTitle(title)
                .setContentText(text.lineSequence().first())
                .setStyle(Notification.BigTextStyle().bigText(text))
                .setContentIntent(open)
                .setAutoCancel(true)
                .build(),
        )
    }
}
