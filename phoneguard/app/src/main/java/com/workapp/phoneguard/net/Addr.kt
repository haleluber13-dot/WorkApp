package com.workapp.phoneguard.net

import java.net.InetAddress

/** Address checks on raw IPv4 (4 bytes) and IPv6 (16 bytes) addresses. Plain Kotlin, no allocation. */
internal object Addr {
    private fun zero(b: ByteArray, off: Int, n: Int): Boolean {
        for (i in 0 until n) if (b[off + i].toInt() != 0) return false
        return true
    }

    /** An IPv4-mapped IPv6 address, ::ffff:a.b.c.d (16 bytes at [off]). */
    fun isMapped(b: ByteArray, off: Int): Boolean =
        zero(b, off, 10) && u8(b, off + 10) == 0xFF && u8(b, off + 11) == 0xFF

    /** False for multicast, broadcast and unspecified destinations. */
    fun isUnicast(b: ByteArray, off: Int, v6: Boolean): Boolean {
        if (v6) {
            if (isMapped(b, off)) return isUnicast(b, off + 12, false)
            return u8(b, off) != 0xFF && !zero(b, off, 16)
        }
        return u8(b, off) in 1..223
    }

    /**
     * An address on the local network: private IPv4 (10/8, 172.16/12, 192.168/16), link-local
     * (169.254/16, fe80::/10) or IPv6 unique-local (fc00::/7). Subnet broadcasts such as
     * 192.168.1.255 count too, so devices that answer them are on the local network as well.
     */
    fun isLan(b: ByteArray, off: Int, v6: Boolean): Boolean {
        if (v6) {
            if (isMapped(b, off)) return isLan(b, off + 12, false)
            val first = u8(b, off)
            return first and 0xFE == 0xFC || (first == 0xFE && u8(b, off + 1) and 0xC0 == 0x80)
        }
        val a = u8(b, off)
        val c = u8(b, off + 1)
        return a == 10 || (a == 172 && c and 0xF0 == 16) || (a == 192 && c == 168) || (a == 169 && c == 254)
    }

    fun isLan(a: InetAddress): Boolean {
        val b = a.address
        return isLan(b, 0, b.size == 16)
    }

    /** [v4] (4 bytes) as an IPv4-mapped IPv6 address. */
    fun mapped(v4: ByteArray): ByteArray {
        val r = ByteArray(16)
        r[10] = 0xFF.toByte()
        r[11] = 0xFF.toByte()
        System.arraycopy(v4, 0, r, 12, 4)
        return r
    }
}
