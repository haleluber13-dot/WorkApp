package com.workapp.phoneguard.net

/**
 * The little bit of DNS the engine needs itself: the name being looked up (for the activity
 * log) and a REFUSED answer for apps the firewall blocks. Full DNS handling is the Web Shield's.
 */
internal object DnsBits {
    /** Offset just past the first question, or -1 if this isn't a well-formed message with a question. */
    fun questionEnd(b: ByteArray, off: Int, len: Int): Int {
        if (len < 12 || off < 0 || off + len > b.size || u16(b, off + 4) == 0) return -1
        val end = off + len
        var p = off + 12
        var nameLen = 0
        while (true) {
            if (p >= end) return -1
            val l = u8(b, p)
            if (l == 0) {
                p++
                break
            }
            if (l > 63) return -1 // compression pointer or bad label: not expected in a question
            nameLen += l + 1
            if (nameLen > 255) return -1
            p += 1 + l
        }
        return if (p + 4 <= end) p + 4 else -1
    }

    /** The first question's name, lowercase, e.g. "example.com"; null if missing or malformed. */
    fun questionName(b: ByteArray, off: Int, len: Int): String? {
        if (questionEnd(b, off, len) < 0) return null
        val sb = StringBuilder()
        var p = off + 12
        while (true) {
            val l = u8(b, p)
            if (l == 0) break
            if (sb.isNotEmpty()) sb.append('.')
            for (i in p + 1..p + l) {
                val c = b[i].toInt() and 0xFF
                sb.append(
                    when (c) {
                        in 'A'.code..'Z'.code -> (c + 32).toChar()
                        in 0x21..0x7E -> c.toChar()
                        else -> '?'
                    }
                )
            }
            p += 1 + l
        }
        return if (sb.isEmpty()) null else sb.toString()
    }

    /** A REFUSED response to [query] (header + its question), or null if it isn't a usable query. */
    fun refused(query: ByteArray): ByteArray? {
        val end = questionEnd(query, 0, query.size)
        if (end < 0 || query[2].toInt() and 0x80 != 0) return null
        val r = query.copyOf(end)
        r[2] = ((query[2].toInt() and 0x79) or 0x80).toByte() // response; keep opcode and RD; clear AA, TC
        r[3] = (0x80 or 5).toByte() // recursion available, RCODE 5 = refused
        put16(r, 4, 1)
        put16(r, 6, 0)
        put16(r, 8, 0)
        put16(r, 10, 0)
        return r
    }
}
