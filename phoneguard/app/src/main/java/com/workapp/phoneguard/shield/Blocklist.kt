package com.workapp.phoneguard.shield

import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.Reader
import java.nio.ByteBuffer
import java.util.Arrays

// Pure JVM parts of the Web Shield (no android.*), so they can be unit-tested.

/**
 * Why a domain is blocked.
 * @param category the list that blocks it, or null when the user blocked it themselves (denylist).
 * @param matched the entry that matched: the domain itself or one of its parents.
 */
data class Verdict(val category: ShieldCategory?, val matched: String) {
    /** Plain words for the activity log, e.g. "Phishing & scams" or "Blocked by you". */
    val reason: String get() = category?.title ?: "Blocked by you"
}

/** 64-bit hash of a domain name: FNV-1a over the lowercased bytes, then the murmur3 finalizer. */
object DomainHash {
    private const val OFFSET = -0x340d631b7bdddcdbL // 0xcbf29ce484222325
    private const val PRIME = 0x100000001b3L

    /** Hash of s[start, end). ASCII letters are lowercased on the fly so callers need not copy. */
    fun of(s: CharSequence, start: Int = 0, end: Int = s.length): Long {
        var h = OFFSET
        for (i in start until end) {
            var c = s[i].code
            if (c in 'A'.code..'Z'.code) c += 32
            if (c < 0x80) {
                h = (h xor c.toLong()) * PRIME
            } else {
                // Lists only hold ASCII names; anything else just has to hash deterministically.
                h = (h xor (c ushr 8).toLong()) * PRIME
                h = (h xor (c and 0xFF).toLong()) * PRIME
            }
        }
        h = h xor (h ushr 33)
        h *= -0xae502812aa7333L // 0xff51afd7ed558ccd
        h = h xor (h ushr 33)
        h *= -0x3b314601e57a13adL // 0xc4ceb9fe1a85ec53
        h = h xor (h ushr 33)
        return h
    }
}

/** An immutable set of domain hashes: a sorted LongArray searched with binary search. */
class HashList private constructor(private val hashes: LongArray) {
    val size: Int get() = hashes.size

    operator fun contains(h: Long): Boolean = hashes.isNotEmpty() && Arrays.binarySearch(hashes, h) >= 0

    fun contains(domain: String): Boolean = contains(DomainHash.of(domain))

    /** The raw sorted hashes (do not modify). */
    internal fun array(): LongArray = hashes

    companion object {
        val EMPTY = HashList(LongArray(0))

        /** Sorts and removes duplicates from the first [n] values (the array is reused). */
        fun of(values: LongArray, n: Int = values.size): HashList {
            if (n == 0) return EMPTY
            Arrays.sort(values, 0, n)
            var w = 1
            for (i in 1 until n) if (values[i] != values[w - 1]) values[w++] = values[i]
            return HashList(if (w == values.size) values else values.copyOf(w))
        }

        /** Wraps an array the caller guarantees is strictly increasing. */
        internal fun sortedUnique(values: LongArray): HashList = if (values.isEmpty()) EMPTY else HashList(values)

        fun ofDomains(domains: Collection<String>): HashList {
            val arr = LongArray(domains.size)
            var i = 0
            for (d in domains) arr[i++] = DomainHash.of(d)
            return of(arr, i)
        }
    }
}

/** Growable LongArray, for collecting hashes while streaming a list. */
class LongArrayBuilder(initial: Int = 1024) {
    private var arr = LongArray(maxOf(16, initial))
    var size = 0
        private set

    fun add(v: Long) {
        if (size == arr.size) arr = arr.copyOf(arr.size * 2)
        arr[size++] = v
    }

    fun build(): HashList = HashList.of(arr, size)
}

/**
 * Immutable snapshot of everything check() needs. Shield swaps whole snapshots, so a lookup
 * never sees half-updated state and never takes a lock.
 */
class Blocklist(
    lists: Map<ShieldCategory, HashList>,
    enabled: Set<ShieldCategory>,
    val allow: HashList = HashList.EMPTY,
    val deny: HashList = HashList.EMPTY,
) {
    private val lists: Array<HashList> = Array(CATEGORIES.size) { lists[CATEGORIES[it]] ?: HashList.EMPTY }
    private val enabled: BooleanArray = BooleanArray(CATEGORIES.size) { CATEGORIES[it] in enabled }

    fun list(c: ShieldCategory): HashList = lists[c.ordinal]
    fun isEnabled(c: ShieldCategory): Boolean = enabled[c.ordinal]
    private fun enabledSet() = CATEGORIES.filter { enabled[it.ordinal] }.toSet()
    private fun listMap() = CATEGORIES.associateWith { lists[it.ordinal] }

    fun withEnabled(on: Set<ShieldCategory>) = Blocklist(listMap(), on, allow, deny)
    fun withLists(changed: Map<ShieldCategory, HashList>) = Blocklist(listMap() + changed, enabledSet(), allow, deny)
    fun withUser(allow: HashList, deny: HashList) = Blocklist(listMap(), enabledSet(), allow, deny)

    /**
     * Checks [domain] and each parent domain (never the bare top-level domain like "com").
     * Order: the user's allowlist wins over everything, then the user's denylist, then the
     * enabled lists in category order (MALWARE first, so the most serious reason is shown).
     */
    fun check(domain: String): Verdict? {
        val name = normalizeQueryName(domain) ?: return null
        // Start index of every suffix that has at least two labels.
        val starts = IntArray(MAX_LABELS)
        var n = 0
        starts[n++] = 0
        for (i in name.indices) {
            if (name[i] == '.' && i + 1 < name.length) {
                if (n == MAX_LABELS) return null // absurd name; nothing real is that deep
                starts[n++] = i + 1
            }
        }
        n-- // drop the last label (the TLD)
        if (n <= 0) return null
        val hashes = LongArray(n) { DomainHash.of(name, starts[it]) }
        for (h in hashes) if (h in allow) return null
        for (i in 0 until n) if (hashes[i] in deny) return Verdict(null, name.substring(starts[i]))
        for (c in CATEGORIES) {
            if (!enabled[c.ordinal]) continue
            val list = lists[c.ordinal]
            if (list.size == 0) continue
            for (i in 0 until n) if (hashes[i] in list) return Verdict(c, name.substring(starts[i]))
        }
        return null
    }

    companion object {
        private val CATEGORIES = ShieldCategory.values()
        private const val MAX_LABELS = 128
        val EMPTY = Blocklist(emptyMap(), emptySet())

        /** Lowercase, trim, strip trailing dots. Null if nothing is left or it is absurdly long. */
        fun normalizeQueryName(domain: String): String? {
            var end = domain.length
            while (end > 0 && (domain[end - 1] == '.' || domain[end - 1].isWhitespace())) end--
            var start = 0
            while (start < end && domain[start].isWhitespace()) start++
            if (start >= end || end - start > 1024) return null
            return domain.substring(start, end).lowercase()
        }
    }
}

/**
 * Parser for hosts files ("0.0.0.0 a.com b.com # note") and plain domain lists ("a.com").
 * Must match parse_line()/normalize() in tools/update_blocklists.py.
 */
object HostsParser {
    /** Names hosts files map to loopback for the machine itself. Never blocked. */
    val LOCAL_NAMES = setOf(
        "localhost", "localhost.localdomain", "local", "broadcasthost", "0.0.0.0",
        "ip6-localhost", "ip6-loopback", "ip6-localnet", "ip6-mcastprefix",
        "ip6-allnodes", "ip6-allrouters", "ip6-allhosts",
    )

    /** Longest line we look at; longer lines are junk and skipped (keeps memory bounded). */
    const val MAX_LINE = 4096

    /** The cleaned domain, or null if [raw] is not a blockable domain name. */
    fun normalize(raw: String): String? {
        var end = raw.length
        while (end > 0 && raw[end - 1] == '.') end--
        if (end == 0 || end > 253) return null
        val d = if (end == raw.length) raw.lowercase() else raw.substring(0, end).lowercase()
        if (d in LOCAL_NAMES) return null
        var labels = 0
        var labelLen = 0
        var labelAllDigits = true
        for (c in d) {
            if (c == '.') {
                if (labelLen == 0) return null
                labels++
                labelLen = 0
                labelAllDigits = true
                continue
            }
            if (!(c in 'a'..'z' || c in '0'..'9' || c == '-' || c == '_')) return null
            if (++labelLen > 63) return null
            if (c !in '0'..'9') labelAllDigits = false
        }
        if (labelLen == 0) return null
        labels++
        // A bare name or TLD is never blocked; an all-digit last label is an IP address or junk.
        if (labels < 2 || labelAllDigits) return null
        return d
    }

    private fun isIp(token: String): Boolean {
        if (token.indexOf(':') >= 0) return true
        val parts = token.split('.')
        return parts.size == 4 && parts.all { p -> p.length in 1..3 && p.all { it in '0'..'9' } }
    }

    /** Calls [out] for each valid domain on one line. */
    fun parseLine(line: String, out: (String) -> Unit) {
        var s = line
        val hash = s.indexOf('#')
        if (hash >= 0) s = s.substring(0, hash)
        s = s.trim().trimStart('﻿').trim()
        if (s.isEmpty()) return
        val tokens = s.split(WHITESPACE)
        var first = 0
        if (isIp(tokens[0])) first = 1
        for (i in first until tokens.size) {
            val t = tokens[i]
            if (t.isEmpty()) continue
            normalize(t)?.let(out)
        }
    }

    /**
     * Streams [reader] line by line. Lines longer than [MAX_LINE] are skipped whole so a broken
     * or hostile download can't make us build a huge string. [checkCancel] runs now and then.
     */
    fun parse(reader: Reader, checkCancel: () -> Unit = {}, out: (String) -> Unit) {
        val buf = CharArray(16 * 1024)
        val line = StringBuilder(256)
        var overflow = false
        var lines = 0
        while (true) {
            val n = reader.read(buf)
            if (n < 0) break
            for (i in 0 until n) {
                val c = buf[i]
                if (c == '\n' || c == '\r') {
                    if (!overflow && line.isNotEmpty()) parseLine(line.toString(), out)
                    line.setLength(0)
                    overflow = false
                    if (++lines and 0x3FFF == 0) checkCancel()
                } else if (!overflow) {
                    if (line.length >= MAX_LINE) {
                        overflow = true
                        line.setLength(0)
                    } else {
                        line.append(c)
                    }
                }
            }
        }
        if (!overflow && line.isNotEmpty()) parseLine(line.toString(), out)
    }

    /**
     * Turns what a person typed ("https://www.Example.com:443/page", "*.example.com") into a
     * domain, or null if it isn't one.
     */
    fun cleanUserInput(input: String): String? {
        var s = input.trim()
        val scheme = s.indexOf("://")
        if (scheme >= 0) s = s.substring(scheme + 3)
        val cut = s.indexOfFirst { it == '/' || it == '?' || it == '#' }
        if (cut >= 0) s = s.substring(0, cut)
        val at = s.lastIndexOf('@')
        if (at >= 0) s = s.substring(at + 1)
        val colon = s.lastIndexOf(':')
        if (colon >= 0 && s.substring(colon + 1).all { it in '0'..'9' }) s = s.substring(0, colon)
        while (s.startsWith("*.") || s.startsWith(".")) s = s.removePrefix("*").removePrefix(".")
        return normalize(s)
    }

    private val WHITESPACE = Regex("\\s+")
}

/**
 * On-disk form of a hash list, so loading 100k+ domains is a single read instead of parsing.
 * Layout (big-endian): magic, format version, updatedAt (ms), count, then count sorted hashes.
 * The version includes the hash function: changing DomainHash must bump it.
 */
object HashFile {
    private const val MAGIC = 0x50474853 // "PGHS"
    const val VERSION = 1
    private const val HEADER = 4 + 4 + 8 + 4
    private const val MAX_COUNT = 5_000_000

    class Header(val updatedAt: Long, val count: Int)

    /** Header of [file], or null if missing, foreign, from another version or truncated. */
    fun readHeader(file: File): Header? = try {
        if (!file.isFile || file.length() < HEADER) null
        else DataInputStream(file.inputStream().buffered(64)).use { readHeader(it, file.length()) }
    } catch (_: IOException) {
        null
    }

    private fun readHeader(input: DataInputStream, length: Long): Header? {
        if (input.readInt() != MAGIC || input.readInt() != VERSION) return null
        val updatedAt = input.readLong()
        val count = input.readInt()
        if (count < 0 || count > MAX_COUNT || length != HEADER + count * 8L) return null
        return Header(updatedAt, count)
    }

    /** Reads a whole file; null if it is not a valid hash file. */
    fun read(file: File): Pair<Header, HashList>? = try {
        val bytes = file.readBytes()
        val header = readHeader(DataInputStream(bytes.inputStream()), bytes.size.toLong())
        if (header == null) null else {
            val arr = LongArray(header.count)
            ByteBuffer.wrap(bytes, HEADER, header.count * 8).asLongBuffer().get(arr)
            var sorted = true
            for (i in 1 until arr.size) if (arr[i - 1] >= arr[i]) { sorted = false; break }
            header to if (sorted) HashList.sortedUnique(arr) else HashList.of(arr)
        }
    } catch (_: IOException) {
        null
    } catch (_: OutOfMemoryError) {
        null
    }

    /** Writes atomically: a temp file in the same folder, synced, then renamed over [file]. */
    fun write(file: File, list: HashList, updatedAt: Long) {
        val dir = file.parentFile ?: throw IOException("no parent folder for $file")
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("can't create $dir")
        val tmp = File(dir, file.name + ".tmp")
        val fos = FileOutputStream(tmp)
        try {
            val out = DataOutputStream(fos.buffered(64 * 1024))
            out.writeInt(MAGIC)
            out.writeInt(VERSION)
            out.writeLong(updatedAt)
            val arr = list.array()
            out.writeInt(arr.size)
            for (h in arr) out.writeLong(h)
            out.flush()
            fos.fd.sync()
        } finally {
            fos.close()
        }
        if (!tmp.renameTo(file)) {
            tmp.delete()
            throw IOException("can't replace $file")
        }
    }
}
