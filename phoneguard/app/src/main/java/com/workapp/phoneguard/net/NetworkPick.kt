package com.workapp.phoneguard.net

import com.workapp.phoneguard.NetType

/** What a network is, in plain values taken from Android's NetworkCapabilities. */
data class NetFacts(
    /** Wi-Fi or Ethernet: the Wi-Fi rules apply to it. */
    val wifi: Boolean,
    val cellular: Boolean,
    val vpn: Boolean,
    val internet: Boolean,
    val validated: Boolean,
)

/**
 * Which firewall rules apply: those of the network the phone's traffic really goes over. That is
 * the default network as PhoneGuard sees it; PhoneGuard is never inside its own VPN, so this is
 * the real Wi-Fi or mobile network that relayed connections (and allowed apps in basic mode) use.
 * Wi-Fi can stay connected while traffic goes over mobile data (no internet on the Wi-Fi, a login
 * page, or Samsung's "switch to mobile data"), so "a Wi-Fi is connected" is not enough.
 */
object NetworkPick {
    /**
     * [default] is PhoneGuard's default network (null if none is known yet); [all] are the
     * networks that are up. When it can't be told which network carries the traffic, and both
     * Wi-Fi and mobile data are up, the answer is [NetType.NONE]: an app is then blocked if it is
     * blocked on either, the stricter choice.
     */
    fun pick(default: NetFacts?, all: Collection<NetFacts>): NetType {
        if (default != null && !default.vpn) {
            return when {
                default.wifi -> NetType.WIFI
                default.cellular -> NetType.MOBILE
                else -> NetType.NONE // e.g. Bluetooth tethering: neither rule set fits, use both
            }
        }
        // No usable default network (none yet, or a VPN): look at the real networks that are up.
        val up = all.filter { it.internet && !it.vpn }
        val wifi = up.filter { it.wifi }
        val mobile = up.filter { it.cellular && !it.wifi }
        return when {
            wifi.isEmpty() && mobile.isEmpty() -> NetType.NONE
            mobile.isEmpty() -> NetType.WIFI
            wifi.isEmpty() -> NetType.MOBILE
            // Both up: a network that works beats one that doesn't (yet).
            wifi.any { it.validated } && mobile.none { it.validated } -> NetType.WIFI
            mobile.any { it.validated } && wifi.none { it.validated } -> NetType.MOBILE
            else -> NetType.NONE
        }
    }
}
