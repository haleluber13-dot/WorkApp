package com.workapp.phoneguard

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager

/** Reacts to apps being installed while the firewall is running. */
object NewAppGuard {
    private const val CHANNEL = "new_apps"

    fun onInstalled(context: Context, pkg: String) {
        val pm = context.packageManager
        val rules = Rules(context)
        val pi = try {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(pkg, AppProfile.flags())
        } catch (_: Exception) { return }
        val app = try { AppProfile.of(context, pi, Ioc.load(context)) } catch (_: Exception) { return }

        val usesInternet = pi.requestedPermissions?.contains("android.permission.INTERNET") == true
        val locked = rules.lockNewApps && usesInternet
        if (locked) rules.setBlocked(pkg, NetType.NONE, true)

        val lines = ArrayList<String>()
        if (app.knownSpyware != null) lines += "⚠ This is known stalkerware (${app.knownSpyware}). Remove it."
        if (app.sideloaded) lines += "Not from an app store."
        if (app.hiddenIcon) lines += "Has no app icon."
        if (app.sensitive.isNotEmpty()) lines += "Already allowed: " + app.sensitive.joinToString(", ")
        lines += if (locked) "Internet is BLOCKED until you allow it in PhoneGuard."
        else "Didn't install this? Open PhoneGuard to check it."

        val title = if (app.knownSpyware != null) "Spy app installed: ${app.label}"
        else "New app installed: ${app.label}"
        notify(context, pkg.hashCode(), title, lines.joinToString("\n"))
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
