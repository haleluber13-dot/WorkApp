package com.workapp.phoneguard.shield

// DNS wire format (RFC 1035) parsing and building. Pure JVM, no android.*.

class DnsFormatException(message: String) : Exception(message)

/** A question. [name] keeps the asker's letter case; [nameWire] is its uncompressed wire form. */
class Question(val name: String, val type: Int, val qclass: Int, val nameWire: ByteArray) {
    /** Lowercase name without trailing dot, for cache keys and blocklist checks. */
    val key: String = name.lowercase().trimEnd('.')

    fun sameAs(other: Question) =
        type == other.type && qclass == other.qclass && key == other.key
}

/** A parsed query. [raw] is the message exactly as the app sent it. */
class DnsQuery(val raw: ByteArray, val id: Int, val flags: Int, val question: Question) {
    val isResponse: Boolean get() = flags and 0x8000 != 0
    val opcode: Int get() = (flags ushr 11) and 0xF
    val recursionDesired: Boolean get() = flags and 0x0100 != 0
}

class ResourceRecord(
    val name: String,
    val type: Int,
    val rclass: Int,
    /** TTL in seconds (values above 2^31 count as 0, RFC 2181). */
    val ttl: Long,
    /** Where the 4-byte TTL sits in the message, so cached answers can count it down. */
    val ttlOffset: Int,
    val rdataOffset: Int,
    val rdLength: Int,
)

class DnsResponse(
    val raw: ByteArray,
    val id: Int,
    val flags: Int,
    val questions: List<Question>,
    val answers: List<ResourceRecord>,
    val authority: List<ResourceRecord>,
    val additional: List<ResourceRecord>,
) {
    val isResponse: Boolean get() = flags and 0x8000 != 0
    val truncated: Boolean get() = flags and 0x0200 != 0
    val rcode: Int get() = flags and 0xF
}

object Dns {
    const val TYPE_A = 1
    const val TYPE_NS = 2
    const val TYPE_CNAME = 5
    const val TYPE_SOA = 6
    const val TYPE_AAAA = 28
    const val TYPE_OPT = 41
    const val CLASS_IN = 1

    const val NOERROR = 0
    const val FORMERR = 1
    const val SERVFAIL = 2
    const val NXDOMAIN = 3
    const val NOTIMP = 4
    const val REFUSED = 5

    /** TTL of the 0.0.0.0 / :: answer for blocked names: short, so unblocking works quickly. */
    const val BLOCKED_TTL = 60

    /** Cache lifetime bounds in seconds. */
    const val MIN_CACHE_TTL = 30L
    const val MAX_CACHE_TTL = 3600L

    private const val HEADER = 12
    private const val MAX_NAME = 255

    fun u16(b: ByteArray, off: Int): Int = ((b[off].toInt() and 0xFF) shl 8) or (b[off + 1].toInt() and 0xFF)

    fun u32(b: ByteArray, off: Int): Long =
        (u16(b, off).toLong() shl 16) or u16(b, off + 2).toLong()

    fun putU16(b: ByteArray, off: Int, v: Int) {
        b[off] = (v ushr 8).toByte()
        b[off + 1] = v.toByte()
    }

    fun putU32(b: ByteArray, off: Int, v: Long) {
        putU16(b, off, (v ushr 16).toInt())
        putU16(b, off + 2, v.toInt())
    }

    fun id(msg: ByteArray): Int = u16(msg, 0)

    fun setId(msg: ByteArray, id: Int) = putU16(msg, 0, id)

    class Name(val text: String, val wire: ByteArray, val next: Int)

    /**
     * Reads a possibly compressed name at [start]. Pointers must point strictly backwards,
     * which rules out loops, and the name may not exceed 255 bytes.
     */
    fun readName(msg: ByteArray, start: Int, end: Int = msg.size): Name {
        val wire = ByteArray(MAX_NAME)
        var w = 0
        val text = StringBuilder(64)
        var p = start
        var next = -1
        var jumps = 0
        while (true) {
            if (p >= end) throw DnsFormatException("name runs past the end")
            val len = msg[p].toInt() and 0xFF
            when {
                len == 0 -> {
                    if (w + 1 > MAX_NAME) throw DnsFormatException("name too long")
                    wire[w++] = 0
                    if (next < 0) next = p + 1
                    return Name(text.toString(), wire.copyOf(w), next)
                }
                len and 0xC0 == 0xC0 -> {
                    if (p + 1 >= end) throw DnsFormatException("cut pointer")
                    val target = ((len and 0x3F) shl 8) or (msg[p + 1].toInt() and 0xFF)
                    if (target >= p || ++jumps > 64) throw DnsFormatException("bad pointer")
                    if (next < 0) next = p + 2
                    p = target
                }
                len and 0xC0 != 0 -> throw DnsFormatException("unknown label type")
                else -> {
                    if (p + 1 + len > end) throw DnsFormatException("label runs past the end")
                    if (w + 1 + len + 1 > MAX_NAME) throw DnsFormatException("name too long")
                    wire[w++] = len.toByte()
                    if (text.isNotEmpty()) text.append('.')
                    for (i in 1..len) {
                        val b = msg[p + i]
                        wire[w++] = b
                        text.append((b.toInt() and 0xFF).toChar())
                    }
                    p += 1 + len
                }
            }
        }
    }

    private fun readQuestion(msg: ByteArray, off: Int): Pair<Question, Int> {
        val n = readName(msg, off)
        if (n.next + 4 > msg.size) throw DnsFormatException("question cut short")
        return Question(n.text, u16(msg, n.next), u16(msg, n.next + 2), n.wire) to n.next + 4
    }

    /** Parses a query with exactly one question. Throws [DnsFormatException] if malformed. */
    fun parseQuery(msg: ByteArray): DnsQuery {
        if (msg.size < HEADER) throw DnsFormatException("shorter than a DNS header")
        if (u16(msg, 4) != 1) throw DnsFormatException("not exactly one question")
        val (q, _) = readQuestion(msg, HEADER)
        return DnsQuery(msg, u16(msg, 0), u16(msg, 2), q)
    }

    /** Parses a whole response. Throws [DnsFormatException] if any part is malformed. */
    fun parseResponse(msg: ByteArray): DnsResponse {
        if (msg.size < HEADER) throw DnsFormatException("shorter than a DNS header")
        val qd = u16(msg, 4)
        val counts = intArrayOf(u16(msg, 6), u16(msg, 8), u16(msg, 10))
        var p = HEADER
        val questions = ArrayList<Question>(1)
        repeat(qd) {
            val (q, next) = readQuestion(msg, p)
            questions += q
            p = next
        }
        val sections = Array(3) { ArrayList<ResourceRecord>() }
        for (s in 0 until 3) {
            repeat(counts[s]) {
                val n = readName(msg, p)
                p = n.next
                if (p + 10 > msg.size) throw DnsFormatException("record cut short")
                val type = u16(msg, p)
                val rclass = u16(msg, p + 2)
                var ttl = u32(msg, p + 4)
                if (ttl > Int.MAX_VALUE) ttl = 0
                val rdLen = u16(msg, p + 8)
                val rd = p + 10
                if (rd + rdLen > msg.size) throw DnsFormatException("record data cut short")
                sections[s] += ResourceRecord(n.text, type, rclass, ttl, p + 4, rd, rdLen)
                p = rd + rdLen
            }
        }
        return DnsResponse(msg, u16(msg, 0), u16(msg, 2), questions, sections[0], sections[1], sections[2])
    }

    private fun responseFlags(q: DnsQuery, rcode: Int): Int =
        0x8000 or (q.opcode shl 11) or (if (q.recursionDesired) 0x0100 else 0) or 0x0080 or rcode

    /**
     * Answer for a blocked name: NOERROR with A 0.0.0.0 or AAAA :: (TTL 60) for those types,
     * and no answers for any other type. Not NXDOMAIN: some apps treat that as "no internet"
     * and retry forever, while 0.0.0.0 fails fast.
     */
    fun blockedResponse(q: DnsQuery): ByteArray {
        val qn = q.question.nameWire
        val inClass = q.question.qclass == CLASS_IN
        val addrLen = when {
            inClass && q.question.type == TYPE_A -> 4
            inClass && q.question.type == TYPE_AAAA -> 16
            else -> 0
        }
        val answerLen = if (addrLen > 0) 2 + 10 + addrLen else 0
        val out = ByteArray(HEADER + qn.size + 4 + answerLen)
        putU16(out, 0, q.id)
        putU16(out, 2, responseFlags(q, NOERROR))
        putU16(out, 4, 1)
        putU16(out, 6, if (addrLen > 0) 1 else 0)
        var p = HEADER
        System.arraycopy(qn, 0, out, p, qn.size)
        p += qn.size
        putU16(out, p, q.question.type)
        putU16(out, p + 2, q.question.qclass)
        p += 4
        if (addrLen > 0) {
            putU16(out, p, 0xC000 or HEADER) // pointer to the question name
            putU16(out, p + 2, q.question.type)
            putU16(out, p + 4, CLASS_IN)
            putU32(out, p + 6, BLOCKED_TTL.toLong())
            putU16(out, p + 10, addrLen)
            // address bytes stay zero: 0.0.0.0 or ::
        }
        return out
    }

    /** Error response (e.g. SERVFAIL) with the question echoed. */
    fun errorResponse(q: DnsQuery, rcode: Int): ByteArray {
        val qn = q.question.nameWire
        val out = ByteArray(HEADER + qn.size + 4)
        putU16(out, 0, q.id)
        putU16(out, 2, responseFlags(q, rcode))
        putU16(out, 4, 1)
        System.arraycopy(qn, 0, out, HEADER, qn.size)
        putU16(out, HEADER + qn.size, q.question.type)
        putU16(out, HEADER + qn.size + 2, q.question.qclass)
        return out
    }

    /** Header-only error for a message we couldn't parse; null if it is not worth answering. */
    fun headerError(raw: ByteArray, rcode: Int): ByteArray? {
        if (raw.size < HEADER) return null
        val flags = u16(raw, 2)
        if (flags and 0x8000 != 0) return null // a response, not a query: never answer those
        val out = ByteArray(HEADER)
        out[0] = raw[0]
        out[1] = raw[1]
        putU16(out, 2, 0x8000 or (flags and 0x7800) or (flags and 0x0100) or 0x0080 or rcode)
        return out
    }

    /** True if [resp] is a response to [q] (question compared ignoring letter case). */
    fun answers(resp: DnsResponse, q: Question): Boolean =
        resp.isResponse && resp.questions.size == 1 && resp.questions[0].sameAs(q)

    /**
     * Copy of an upstream or cached response, ready for the app: its own ID, its RD bit and its
     * exact question spelling (some resolvers randomise letter case and check it comes back).
     */
    fun prepareReply(resp: ByteArray, q: DnsQuery): ByteArray {
        val out = resp.copyOf()
        setId(out, q.id)
        val flags = u16(out, 2)
        putU16(out, 2, if (q.recursionDesired) flags or 0x0100 else flags and 0x0100.inv())
        val qn = q.question.nameWire
        if (u16(out, 4) >= 1 && HEADER + qn.size <= out.size && sameIgnoringCase(out, HEADER, qn)) {
            System.arraycopy(qn, 0, out, HEADER, qn.size)
        }
        return out
    }

    // Label length bytes are 0..63, below every letter, so a plain ASCII case fold is safe.
    private fun sameIgnoringCase(msg: ByteArray, off: Int, wire: ByteArray): Boolean {
        for (i in wire.indices) {
            var a = msg[off + i].toInt() and 0xFF
            var b = wire[i].toInt() and 0xFF
            if (a in 65..90) a += 32
            if (b in 65..90) b += 32
            if (a != b) return false
        }
        return true
    }

    /** Targets of CNAME records in the answer section (lowercase), to catch disguised trackers. */
    fun cnameTargets(resp: DnsResponse): List<String> {
        var out: ArrayList<String>? = null
        for (r in resp.answers) {
            if (r.type != TYPE_CNAME || r.rclass != CLASS_IN) continue
            val target = try {
                readName(resp.raw, r.rdataOffset, r.rdataOffset + r.rdLength).text
            } catch (_: DnsFormatException) {
                // Compressed names may point outside the record; retry against the whole message.
                try { readName(resp.raw, r.rdataOffset).text } catch (_: DnsFormatException) { continue }
            }
            if (out == null) out = ArrayList(2)
            out += target.lowercase()
        }
        return out ?: emptyList()
    }

    /** Raw IPv4 / IPv6 addresses in A / AAAA answers. */
    fun addresses(resp: DnsResponse): List<ByteArray> {
        var out: ArrayList<ByteArray>? = null
        for (r in resp.answers) {
            if (r.rclass != CLASS_IN) continue
            val ok = (r.type == TYPE_A && r.rdLength == 4) || (r.type == TYPE_AAAA && r.rdLength == 16)
            if (!ok) continue
            if (out == null) out = ArrayList(4)
            out += resp.raw.copyOfRange(r.rdataOffset, r.rdataOffset + r.rdLength)
        }
        return out ?: emptyList()
    }

    /**
     * How long [resp] may be cached, in seconds, or null if it must not be cached
     * (truncated, or an error other than "no such name"). Positive answers use the lowest
     * answer TTL; negative ones the SOA rule of RFC 2308. Clamped to 30 s .. 1 h.
     */
    fun cacheTtl(resp: DnsResponse): Long? {
        if (!resp.isResponse || resp.truncated) return null
        val ttl: Long = when (resp.rcode) {
            NOERROR, NXDOMAIN -> {
                if (resp.rcode == NOERROR && resp.answers.isNotEmpty()) {
                    resp.answers.minOf { it.ttl }
                } else {
                    val soa = resp.authority.firstOrNull { it.type == TYPE_SOA && it.rdLength >= 22 }
                    if (soa != null) minOf(soa.ttl, minOf(u32(resp.raw, soa.rdataOffset + soa.rdLength - 4), Int.MAX_VALUE.toLong()))
                    else MIN_CACHE_TTL
                }
            }
            else -> return null
        }
        return ttl.coerceIn(MIN_CACHE_TTL, MAX_CACHE_TTL)
    }
}
