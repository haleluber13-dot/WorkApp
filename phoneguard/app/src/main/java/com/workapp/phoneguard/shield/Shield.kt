package com.workapp.phoneguard.shield

import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.io.FilterInputStream
import java.io.IOException
import java.io.InputStream
import java.io.InputStreamReader
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.GZIPInputStream
import javax.net.ssl.HttpsURLConnection

enum class ShieldCategory(val title: String, val description: String, val defaultOn: Boolean) {
    MALWARE("Malware", "Sites that spread viruses and malicious apps", true),
    PHISHING("Phishing & scams", "Fake login pages and scam sites that steal passwords and money", true),
    STALKERWARE("Stalkerware servers", "Servers that spy apps send your data to", true),
    TRACKERS("Ads & trackers", "Companies that follow you across apps and websites", true),
}

data class ListInfo(val category: ShieldCategory, val domains: Int, val updatedAt: Long, val source: String)

/**
 * Domain blocklists. All methods are thread-safe.
 *
 * Lists are kept in memory as sorted 64-bit hashes (about 8 bytes per domain). They come from
 * the app's bundled assets or, if newer, from the last weekly download; both are cached in
 * filesDir/shield as ready-to-load hash files so start-up is a single file read per list.
 * Lookups read one immutable [Blocklist] snapshot and never touch storage or take a lock.
 */
object Shield {
    private const val TAG = "PhoneGuard"
    private const val PREFS = "shield"
    private const val KEY_ALLOW = "allow"
    private const val KEY_DENY = "deny"
    private const val KEY_LAST_CHECK = "lastUpdateCheck"
    private const val ASSET_DIR = "blocklists"

    /** JobScheduler id of the weekly list update. */
    const val UPDATE_JOB_ID = 0x50470731
    private const val WEEK_MS = 7 * 24 * 60 * 60 * 1000L
    private const val DAY_MS = 24 * 60 * 60 * 1000L
    private const val MAX_DOWNLOAD = 20 * 1024 * 1024

    /** Where each list comes from. Same sources as tools/update_blocklists.py. */
    private val SOURCES = mapOf(
        ShieldCategory.MALWARE to "https://urlhaus.abuse.ch/downloads/hostfile/",
        ShieldCategory.PHISHING to "https://malware-filter.gitlab.io/malware-filter/phishing-filter-hosts.txt",
        ShieldCategory.STALKERWARE to "https://raw.githubusercontent.com/AssoEchap/stalkerware-indicators/master/generated/hosts",
        ShieldCategory.TRACKERS to "https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts",
    )

    @Volatile private var snapshot: Blocklist = Blocklist.EMPTY
    @Volatile private var loaded = false
    @Volatile private var info: Map<ShieldCategory, ListInfo> = emptyMap()
    private val lock = Any()
    private val updating = AtomicBoolean(false)

    /** Result of one update run, for [ListUpdateJob]. */
    internal class UpdateResult(val updated: Int, val failed: Int, val busy: Boolean = false)

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun dir(context: Context) = File(context.applicationContext.filesDir, "shield")
    private fun fileName(c: ShieldCategory) = c.name.lowercase()
    private fun downloadedFile(context: Context, c: ShieldCategory) = File(dir(context), fileName(c) + ".bin")
    private fun bundledCacheFile(context: Context, c: ShieldCategory) = File(dir(context), fileName(c) + ".bundled.bin")
    private fun source(c: ShieldCategory) = SOURCES.getValue(c)

    /** Load lists (bundled or last downloaded). Blocking; call off the main thread. Safe to call repeatedly. */
    fun init(context: Context) {
        if (loaded) return
        synchronized(lock) {
            if (loaded) return
            val ctx = context.applicationContext
            val start = System.currentTimeMillis()
            val bundledAt = bundledGeneratedAt(ctx)
            val lists = HashMap<ShieldCategory, HashList>()
            val infos = HashMap<ShieldCategory, ListInfo>()
            for (c in ShieldCategory.values()) {
                val (list, updatedAt) = try {
                    loadCategory(ctx, c, bundledAt)
                } catch (e: Exception) {
                    Log.w(TAG, "Shield: can't load ${c.name}", e)
                    HashList.EMPTY to 0L
                }
                lists[c] = list
                infos[c] = ListInfo(c, list.size, updatedAt, source(c))
            }
            val p = prefs(ctx)
            snapshot = Blocklist(lists, enabledFrom(p), HashList.ofDomains(stringSet(p, KEY_ALLOW)), HashList.ofDomains(stringSet(p, KEY_DENY)))
            info = infos
            loaded = true
            Log.i(TAG, "Shield: ${lists.values.sumOf { it.size }} domains loaded in ${System.currentTimeMillis() - start} ms")
        }
    }

    /**
     * Picks the newer of the downloaded list and the bundled one. The bundled list is parsed
     * from assets only once per app version; after that its hash cache is used.
     */
    private fun loadCategory(ctx: Context, c: ShieldCategory, bundledAt: Long): Pair<HashList, Long> {
        val downloaded = downloadedFile(ctx, c)
        val dl = HashFile.readHeader(downloaded)
        if (dl != null && dl.updatedAt >= bundledAt) {
            HashFile.read(downloaded)?.let { return it.second to it.first.updatedAt }
        }
        val cache = bundledCacheFile(ctx, c)
        val cached = HashFile.readHeader(cache)
        if (cached != null && bundledAt != 0L && cached.updatedAt == bundledAt) {
            HashFile.read(cache)?.let { return it.second to bundledAt }
        }
        val parsed = try {
            parseAsset(ctx, c)
        } catch (e: IOException) {
            Log.w(TAG, "Shield: bundled ${c.name} list unreadable", e)
            null
        }
        if (parsed != null && parsed.size > 0) {
            try {
                HashFile.write(cache, parsed, bundledAt)
            } catch (e: IOException) {
                Log.w(TAG, "Shield: can't cache ${c.name}", e) // still usable, just slower next time
            }
            return parsed to bundledAt
        }
        // No usable bundled list: an older download beats nothing.
        HashFile.read(downloaded)?.let { return it.second to it.first.updatedAt }
        return HashList.EMPTY to 0L
    }

    private fun parseAsset(ctx: Context, c: ShieldCategory): HashList {
        val b = LongArrayBuilder(1 shl 15)
        ctx.assets.open("$ASSET_DIR/${fileName(c)}.txt.gz").use { raw ->
            InputStreamReader(GZIPInputStream(raw, 64 * 1024), Charsets.UTF_8).use { reader ->
                HostsParser.parse(reader) { b.add(DomainHash.of(it)) }
            }
        }
        return b.build()
    }

    /** When the bundled lists were generated (from assets/blocklists/meta.json), or 0. */
    private fun bundledGeneratedAt(ctx: Context): Long = try {
        val text = ctx.assets.open("$ASSET_DIR/meta.json").use { it.readBytes().toString(Charsets.UTF_8) }
        JSONObject(text).optLong("generatedMillis", 0L)
    } catch (e: Exception) {
        0L
    }

    private fun enabledFrom(p: SharedPreferences): Set<ShieldCategory> =
        ShieldCategory.values().filter { p.getBoolean(enabledKey(it), it.defaultOn) }.toSet()

    private fun enabledKey(c: ShieldCategory) = "on.${c.name}"

    // getStringSet's result must not be modified, so always copy it.
    private fun stringSet(p: SharedPreferences, key: String): Set<String> =
        p.getStringSet(key, null)?.toSet() ?: emptySet()

    /** The category that blocks [domain] (checks parent domains too), or null if allowed. Fast; called per DNS query. */
    fun check(domain: String): ShieldCategory? = snapshot.check(domain)?.category

    /**
     * Full answer for [domain]: null if allowed, else a [Verdict] whose category is null when
     * the user's own denylist blocks it. Unlike [check], this also reports denylist hits,
     * so use it to decide whether to block.
     */
    fun checkDetailed(domain: String): Verdict? = snapshot.check(domain)

    /** True if [domain] would be blocked right now, by a list or by the user's denylist. */
    fun isBlocked(domain: String): Boolean = snapshot.check(domain) != null

    /** True once the lists are in memory. */
    fun isLoaded(): Boolean = loaded

    fun isEnabled(context: Context, c: ShieldCategory): Boolean =
        prefs(context).getBoolean(enabledKey(c), c.defaultOn)

    fun setEnabled(context: Context, c: ShieldCategory, on: Boolean) {
        synchronized(lock) {
            val p = prefs(context)
            p.edit().putBoolean(enabledKey(c), on).apply()
            if (loaded) snapshot = snapshot.withEnabled(enabledFrom(p))
        }
    }

    /**
     * Turns what the user typed ("https://www.example.com/page") into a domain, or null if it
     * isn't one. allow()/deny() apply this themselves; the UI can use it to validate input.
     */
    fun cleanDomain(input: String): String? = HostsParser.cleanUserInput(input)

    /** User allowlist: never block these (and their subdomains). */
    fun allowed(context: Context): Set<String> = stringSet(prefs(context), KEY_ALLOW)

    /** Adding a domain to one user list removes it from the other, so the two never disagree. */
    fun allow(context: Context, domain: String) {
        val d = cleanDomain(domain) ?: return
        editUserLists(context) { allow, deny -> allow += d; deny -= d }
    }

    fun unallow(context: Context, domain: String) {
        editUserLists(context) { allow, _ -> allow -= domain; allow -= domain.trim().lowercase(); cleanDomain(domain)?.let { allow -= it } }
    }

    /** User denylist: always block these (and their subdomains). */
    fun denied(context: Context): Set<String> = stringSet(prefs(context), KEY_DENY)

    fun deny(context: Context, domain: String) {
        val d = cleanDomain(domain) ?: return
        editUserLists(context) { allow, deny -> deny += d; allow -= d }
    }

    fun undeny(context: Context, domain: String) {
        editUserLists(context) { _, deny -> deny -= domain; deny -= domain.trim().lowercase(); cleanDomain(domain)?.let { deny -= it } }
    }

    private fun editUserLists(context: Context, change: (MutableSet<String>, MutableSet<String>) -> Unit) {
        synchronized(lock) {
            val p = prefs(context)
            val allow = stringSet(p, KEY_ALLOW).toMutableSet()
            val deny = stringSet(p, KEY_DENY).toMutableSet()
            change(allow, deny)
            p.edit().putStringSet(KEY_ALLOW, allow).putStringSet(KEY_DENY, deny).apply()
            if (loaded) snapshot = snapshot.withUser(HashList.ofDomains(allow), HashList.ofDomains(deny))
        }
    }

    /**
     * Size, date and source of each list. Before init() finishes this reads only the small
     * file headers, so it is cheap enough for the UI thread.
     */
    fun listInfo(context: Context): List<ListInfo> {
        if (loaded) return ShieldCategory.values().mapNotNull { info[it] }
        val ctx = context.applicationContext
        val bundledAt = bundledGeneratedAt(ctx)
        val counts = bundledCounts(ctx)
        return ShieldCategory.values().map { c ->
            val dl = HashFile.readHeader(downloadedFile(ctx, c))
            if (dl != null && dl.updatedAt >= bundledAt) ListInfo(c, dl.count, dl.updatedAt, source(c))
            else ListInfo(c, counts[c] ?: 0, bundledAt, source(c))
        }
    }

    private fun bundledCounts(ctx: Context): Map<ShieldCategory, Int> = try {
        val text = ctx.assets.open("$ASSET_DIR/meta.json").use { it.readBytes().toString(Charsets.UTF_8) }
        val lists = JSONObject(text).getJSONObject("lists")
        ShieldCategory.values().associateWith { lists.optJSONObject(it.name)?.optInt("count", 0) ?: 0 }
    } catch (e: Exception) {
        emptyMap()
    }

    /** When an update was last attempted (0 = never). */
    fun lastUpdateCheck(context: Context): Long = prefs(context).getLong(KEY_LAST_CHECK, 0L)

    /** Download fresh lists now. Blocking network call; returns true if at least one list updated. */
    fun updateNow(context: Context): Boolean = runUpdate(context, null).updated > 0

    /**
     * Downloads every list. A list is only accepted if it is not empty and not less than half
     * the size of the current one (a broken source or a captive portal page must not wipe
     * protection). Each accepted list is written atomically and swapped in at once.
     */
    internal fun runUpdate(context: Context, cancel: AtomicBoolean?): UpdateResult {
        if (!updating.compareAndSet(false, true)) return UpdateResult(0, 0, busy = true)
        try {
            val ctx = context.applicationContext
            init(ctx)
            prefs(ctx).edit().putLong(KEY_LAST_CHECK, System.currentTimeMillis()).apply()
            var updated = 0
            var failed = 0
            for (c in ShieldCategory.values()) {
                if (cancel?.get() == true) break
                val url = source(c)
                val list = try {
                    download(url, cancel)
                } catch (e: Exception) {
                    Log.w(TAG, "Shield: download of ${c.name} failed: $e")
                    failed++
                    continue
                }
                val current = snapshot.list(c).size
                if (list.size == 0 || list.size < current / 2) {
                    Log.w(TAG, "Shield: rejected ${c.name} update: ${list.size} domains, had $current")
                    continue
                }
                // Never older than what it replaces, even if the phone's clock is wrong, so a
                // fresh download is never mistaken for older than the bundled list.
                val updatedAt = maxOf(System.currentTimeMillis(), (info[c]?.updatedAt ?: 0L) + 1)
                try {
                    HashFile.write(downloadedFile(ctx, c), list, updatedAt)
                } catch (e: IOException) {
                    Log.w(TAG, "Shield: can't save ${c.name}", e)
                    failed++
                    continue
                }
                synchronized(lock) {
                    snapshot = snapshot.withLists(mapOf(c to list))
                    info = info + (c to ListInfo(c, list.size, updatedAt, url))
                }
                updated++
            }
            return UpdateResult(updated, failed)
        } finally {
            updating.set(false)
        }
    }

    private fun download(url: String, cancel: AtomicBoolean?): HashList {
        val conn = URL(url).openConnection() as? HttpsURLConnection ?: throw IOException("not HTTPS: $url")
        try {
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.useCaches = false
            conn.setRequestProperty("User-Agent", "PhoneGuard")
            val code = conn.responseCode
            if (code != HttpsURLConnection.HTTP_OK) throw IOException("HTTP $code")
            if (conn.contentLengthLong > MAX_DOWNLOAD) throw IOException("list too large")
            val b = LongArrayBuilder(1 shl 15)
            LimitedStream(conn.inputStream, MAX_DOWNLOAD.toLong()).use { input ->
                val reader = InputStreamReader(input, Charsets.UTF_8)
                HostsParser.parse(reader, checkCancel = { if (cancel?.get() == true) throw IOException("cancelled") }) {
                    b.add(DomainHash.of(it))
                }
            }
            return b.build()
        } finally {
            conn.disconnect()
        }
    }

    /** Fails once more than [limit] bytes have been read. */
    private class LimitedStream(input: InputStream, private val limit: Long) : FilterInputStream(input) {
        private var count = 0L

        override fun read(): Int {
            val b = super.read()
            if (b >= 0 && ++count > limit) throw IOException("download larger than $limit bytes")
            return b
        }

        override fun read(b: ByteArray, off: Int, len: Int): Int {
            val n = super.read(b, off, len)
            if (n > 0) {
                count += n
                if (count > limit) throw IOException("download larger than $limit bytes")
            }
            return n
        }
    }

    /** Schedule periodic (weekly, on unmetered network) list updates. */
    fun scheduleUpdates(context: Context) {
        val ctx = context.applicationContext
        val js = ctx.getSystemService(JobScheduler::class.java) ?: return
        val pending = js.getPendingJob(UPDATE_JOB_ID)
        // Rescheduling an identical job would restart its 7-day clock on every app start.
        if (pending != null && pending.intervalMillis == WEEK_MS && pending.isPersisted) return
        val job = JobInfo.Builder(UPDATE_JOB_ID, ComponentName(ctx, ListUpdateJob::class.java))
            .setPeriodic(WEEK_MS, DAY_MS)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_UNMETERED)
            .setRequiresBatteryNotLow(true)
            .setPersisted(true)
            .build()
        try {
            js.schedule(job)
        } catch (e: Exception) {
            Log.w(TAG, "Shield: can't schedule list updates", e)
        }
    }
}
