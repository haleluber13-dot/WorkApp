package com.workapp.phoneguard.ui

import android.content.Context
import android.graphics.drawable.Drawable
import android.os.Process

/** Who an Android user id (uid) belongs to, in words a person recognises. */
class AppIdentity(
    val uid: Int,
    val label: String,
    /** Installed packages sharing this uid (usually one; empty for system ids). */
    val packages: List<String>,
    val icon: Drawable?,
) {
    /** Ordinary apps can be firewalled; core Android ids are best left alone. */
    val isApp: Boolean get() = uid >= Process.FIRST_APPLICATION_UID && packages.isNotEmpty()
}

/** Cached uid -> name/icon lookups. Main thread only. */
object AppNames {
    private val cache = HashMap<Int, AppIdentity>()

    /** Forget everything, e.g. after apps may have been installed or removed. */
    fun clear() = cache.clear()

    fun of(context: Context, uid: Int): AppIdentity = cache.getOrPut(uid) { load(context, uid) }

    private fun load(context: Context, uid: Int): AppIdentity {
        val pm = context.packageManager
        when (uid) {
            -1 -> return AppIdentity(uid, "Unknown app", emptyList(), null)
            0 -> return AppIdentity(uid, "Android (core system)", emptyList(), null)
            Process.SYSTEM_UID -> return AppIdentity(uid, "Android system", emptyList(), null)
        }
        // Each Android user (Secure Folder, work profile) has its own range of 100000 ids.
        if (uid / 100_000 != Process.myUid() / 100_000) {
            return AppIdentity(uid, "App in Secure Folder or work profile", emptyList(), null)
        }
        val pkgs = try { pm.getPackagesForUid(uid)?.toList() } catch (_: Exception) { null } ?: emptyList()
        if (pkgs.isEmpty()) {
            val name = try { pm.getNameForUid(uid) } catch (_: Exception) { null }
            val label = when {
                name.isNullOrEmpty() -> "App no longer installed"
                uid < Process.FIRST_APPLICATION_UID -> "Android system ($name)"
                else -> name
            }
            return AppIdentity(uid, label, emptyList(), null)
        }
        // With several packages on one id, name the one people would recognise (it has an icon in the launcher).
        val main = pkgs.firstOrNull { pm.getLaunchIntentForPackage(it) != null } ?: pkgs.first()
        val info = try { pm.getApplicationInfo(main, 0) } catch (_: Exception) { null }
        var label = info?.loadLabel(pm)?.toString() ?: main
        if (pkgs.size > 1) label += " (+${pkgs.size - 1} more)"
        val icon = try { info?.loadIcon(pm) } catch (_: Exception) { null }
        val shown = if (uid < Process.FIRST_APPLICATION_UID) emptyList() else pkgs
        return AppIdentity(uid, label, shown, icon)
    }
}
