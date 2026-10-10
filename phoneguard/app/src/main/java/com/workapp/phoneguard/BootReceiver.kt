package com.workapp.phoneguard

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.VpnService

/**
 * Turns protection back on after the phone restarts or PhoneGuard is updated, if it was on.
 * Both end the VPN; without this the user stayed unprotected until they opened the app
 * (unless they had set PhoneGuard as the Always-on VPN, which also restarts it). If Android
 * won't let it start from the background, a notification turns it back on with one tap.
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED -> {}
            else -> return
        }
        try {
            if (!Rules(context).enabled || FirewallService.running) return
            // The VPN permission was withdrawn (or another VPN app took over): the user has to
            // turn protection on again from the app, which asks for it.
            if (VpnService.prepare(context) != null) return
        } catch (_: Exception) {
            return // never crash at boot; the Home screen still offers to turn protection on
        }
        try {
            FirewallService.startFromBackground(context)
        } catch (_: Exception) {
            // Android didn't allow a start from the background: ask the user instead.
            FirewallService.notifyTurnBackOn(context)
        }
    }
}
