package com.workapp.phoneguard

import android.content.Context
import android.content.Intent
import android.net.NetworkCapabilities

// STUB — owned by the Scanner agent. Keep public signatures; replace bodies.

enum class WifiSafety { SAFE, OPEN, WEAK, UNKNOWN }

object WifiGuard {
    /** Security of the Wi-Fi network described by [caps] (null = current Wi-Fi, if any). */
    fun check(context: Context, caps: NetworkCapabilities? = null): WifiSafety = WifiSafety.UNKNOWN

    /** Called by the firewall service whenever a Wi-Fi network connects; alerts once per network if unsafe. */
    fun onWifiConnected(context: Context, caps: NetworkCapabilities) {}
}

object DeviceHealth {
    /** True if Android/Samsung battery saving won't stop the firewall. */
    fun isBatteryExempt(context: Context): Boolean = true

    /** Intent that asks the user to exempt PhoneGuard from battery optimization (null if not needed). */
    fun batteryExemptionIntent(context: Context): Intent? = null

    /** True on Samsung phones (for Samsung-specific advice). */
    fun isSamsung(): Boolean = android.os.Build.MANUFACTURER.equals("samsung", ignoreCase = true)

    /** Plain-language, device-specific advice lines for the Home screen (e.g. Samsung "Never sleeping apps"). */
    fun setupTips(context: Context): List<String> = emptyList()
}
