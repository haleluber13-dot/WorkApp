package com.workapp.hafaka.data

import com.workapp.hafaka.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.JsonElement
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class SyncException(val he: String) : Exception(he)

/**
 * Optional team sync over Supabase's PostgREST endpoint.
 *
 * Speaks REST directly with HttpURLConnection rather than pulling in the
 * Supabase SDK: one fewer dependency, and the wire format stays byte-identical
 * to the web and iOS clients so all three can share one project. Records
 * reconcile last-write-wins on `updatedAt`, which is right here because a
 * shoot day has one coordinator at a time.
 */
class Sync(private val store: Store) {

    @Serializable
    private data class Row<T>(
        val id: String,
        val project_id: String,
        val updated_at: Double,
        val data: T,
    )

    private var started = false

    private fun config(): SyncConfig? = store.settings.sync.takeIf { it.isUsable }

    private fun base(cfg: SyncConfig) = cfg.url.trim().trimEnd('/')

    private fun project(cfg: SyncConfig) = cfg.projectId.ifBlank { "default" }

    private fun HttpURLConnection.auth(cfg: SyncConfig) {
        setRequestProperty("apikey", cfg.anonKey)
        setRequestProperty("Authorization", "Bearer ${cfg.anonKey}")
    }

    // ---------------------------------------------------------------- public

    suspend fun start() {
        if (started) return
        started = true
        pull()
        push()
    }

    suspend fun test(cfg: SyncConfig): Result<Unit> = withContext(Dispatchers.IO) {
        val url = runCatching { URL("${base(cfg)}/rest/v1/people?select=id&limit=1") }.getOrNull()
            ?: return@withContext Result.failure(SyncException("כתובת לא תקינה"))
        runCatching {
            (url.openConnection() as HttpURLConnection).run {
                requestMethod = "GET"
                connectTimeout = 15_000
                readTimeout = 15_000
                auth(cfg)
                val code = responseCode
                disconnect()
                when {
                    code in 200..299 -> Result.success(Unit)
                    code == 404 -> Result.failure(SyncException("הטבלאות לא נוצרו — הריצו את supabase/schema.sql"))
                    code == 401 || code == 403 -> Result.failure(SyncException("המפתח נדחה (anon key שגוי או RLS חוסם)"))
                    else -> Result.failure(SyncException("שגיאת שרת $code"))
                }
            }
        }.getOrElse { Result.failure(SyncException("אין חיבור לשרת")) }
    }

    /**
     * Upload the whole local dataset. Cheap at production scale (tens of
     * people, tens of days) and far more robust than tracking a dirty set.
     */
    suspend fun push() = withContext(Dispatchers.IO) {
        val cfg = config() ?: return@withContext
        store.setSyncStatus(Store.SyncStatus.Syncing)
        val s = store.state.value
        runCatching {
            upload(cfg, "people", s.people, Person.serializer()) { it.id to it.updatedAt }
            upload(cfg, "locations", s.locations, Location.serializer()) { it.id to it.updatedAt }
            upload(cfg, "days", s.days, ShootDay.serializer()) { it.id to it.updatedAt }
        }.fold(
            onSuccess = { store.setSyncStatus(Store.SyncStatus.Ok(System.currentTimeMillis())) },
            onFailure = { e ->
                store.setSyncStatus(Store.SyncStatus.Error((e as? SyncException)?.he ?: "שגיאת סנכרון"))
            })
    }

    private fun <T> upload(
        cfg: SyncConfig,
        table: String,
        items: List<T>,
        serializer: KSerializer<T>,
        key: (T) -> Pair<String, Double>,
    ) {
        if (items.isEmpty()) return
        val rows = items.map { item ->
            val (id, updated) = key(item)
            Row(id, project(cfg), updated, AppJson.encodeToJsonElement(serializer, item))
        }
        val body = AppJson.encodeToString(ListSerializer(Row.serializer(JsonElement.serializer())), rows)

        val conn = URL("${base(cfg)}/rest/v1/$table?on_conflict=id").openConnection() as HttpURLConnection
        conn.run {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 20_000
            readTimeout = 20_000
            auth(cfg)
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("Prefer", "resolution=merge-duplicates,return=minimal")
            outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val code = responseCode
            disconnect()
            if (code !in 200..299) throw SyncException("שגיאת שרת $code")
        }
    }

    /** Fetch remote rows and merge by `updatedAt`, honouring local tombstones. */
    suspend fun pull() = withContext(Dispatchers.IO) {
        val cfg = config() ?: return@withContext
        store.setSyncStatus(Store.SyncStatus.Syncing)
        runCatching {
            val s = store.state.value
            val next = s.copy(
                people = merge(cfg, "people", s.people, s.deleted, Person.serializer()) { it.id to it.updatedAt },
                locations = merge(cfg, "locations", s.locations, s.deleted, Location.serializer()) { it.id to it.updatedAt },
                days = merge(cfg, "days", s.days, s.deleted, ShootDay.serializer()) { it.id to it.updatedAt },
            )
            store.replace(next)
        }.fold(
            onSuccess = { store.setSyncStatus(Store.SyncStatus.Ok(System.currentTimeMillis())) },
            onFailure = { e ->
                store.setSyncStatus(Store.SyncStatus.Error((e as? SyncException)?.he ?: "שגיאת סנכרון"))
            })
    }

    private fun <T> merge(
        cfg: SyncConfig,
        table: String,
        local: List<T>,
        deleted: Map<String, Double>,
        serializer: KSerializer<T>,
        key: (T) -> Pair<String, Double>,
    ): List<T> {
        val q = URLEncoder.encode(project(cfg), "UTF-8")
        val url = URL("${base(cfg)}/rest/v1/$table?project_id=eq.$q&select=id,updated_at,data")
        val conn = url.openConnection() as HttpURLConnection
        val text = conn.run {
            requestMethod = "GET"
            connectTimeout = 20_000
            readTimeout = 20_000
            auth(cfg)
            val code = responseCode
            if (code !in 200..299) { disconnect(); throw SyncException("שגיאת שרת $code") }
            inputStream.bufferedReader().use { it.readText() }.also { disconnect() }
        }

        val remote = AppJson.decodeFromString(
            ListSerializer(Row.serializer(JsonElement.serializer())), text)

        val byId = local.associateByTo(LinkedHashMap()) { key(it).first }
        for (row in remote) {
            // A record deleted here stays deleted unless the remote copy is newer.
            val tombstone = deleted[row.id]
            if (tombstone != null && tombstone >= row.updated_at) continue
            val existing = byId[row.id]
            if (existing != null && key(existing).second >= row.updated_at) continue
            runCatching { AppJson.decodeFromJsonElement(serializer, row.data) }
                .onSuccess { byId[row.id] = it }
        }
        return byId.values.toList()
    }
}
