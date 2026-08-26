package com.olakai.app.data.catalog

import android.content.Context
import android.util.Log
import com.olakai.app.data.Http
import com.olakai.app.data.model.Cam
import com.olakai.app.data.model.CamKind
import com.olakai.app.data.model.Spot
import com.olakai.app.data.model.SpotCatalog
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import java.io.File

/**
 * The spot catalog: place data ships in the APK, and the cam list is a separate
 * file so cams can be re-resolved (tools/resolve_cams.py) without touching the
 * hand-written descriptions.
 *
 * A catalog fetched from [remoteUrl] wins when present, which is how a broken
 * cam gets fixed for everyone without shipping an update.
 */
class SpotRepository(private val context: Context) {

    @Volatile private var cached: List<Spot>? = null

    suspend fun spots(): List<Spot> {
        cached?.let { return it }
        return withContext(Dispatchers.IO) {
            cached ?: load().also { cached = it }
        }
    }

    private fun load(): List<Spot> {
        val base = runCatching { readCatalog(overrideFile().takeIf { it.exists() }?.readText()) }
            .getOrNull()
            ?: runCatching { readCatalog(asset("spots.json")) }.getOrNull()
            ?: emptyList()

        val cams = runCatching { readCams(asset("cams.json")) }.getOrDefault(emptyMap())
        return base.map { spot ->
            val resolved = cams[spot.id].orEmpty()
            if (resolved.isEmpty()) spot else spot.copy(cams = resolved + spot.cams)
        }
    }

    private fun readCatalog(text: String?): List<Spot>? {
        if (text.isNullOrBlank()) return null
        return Http.json.decodeFromString<SpotCatalog>(text).spots
    }

    /**
     * cams.json is the resolver's output: spot id -> verified live streams.
     *
     * Two shapes share the file. An entry with `url` is a direct HLS stream,
     * which is cheaper to play and does not depend on a channel still being
     * live; anything else is a YouTube channel or video.
     */
    private fun readCams(text: String): Map<String, List<Cam>> {
        val raw = Http.json.decodeFromString<Map<String, List<ResolvedCam>>>(text)
        return raw.mapValues { (spotId, list) ->
            list.mapIndexedNotNull { index, r ->
                when {
                    r.url.isNotBlank() -> Cam(
                        id = "$spotId-hls-$index",
                        title = r.title.ifBlank { "Live cam" },
                        kind = CamKind.HLS,
                        source = r.url,
                        provider = r.channel,
                        attribution = r.channel,
                        pageUrl = r.channelUrl,
                    )

                    r.channelId.isNotBlank() || r.videoId.isNotBlank() -> Cam(
                        id = "$spotId-yt-$index",
                        title = r.title.ifBlank { "Live cam" },
                        kind = CamKind.YOUTUBE,
                        source = r.channelId.ifBlank { r.videoId },
                        isChannel = r.channelId.isNotBlank(),
                        videoId = r.videoId,
                        provider = r.channel,
                        attribution = r.channel,
                        pageUrl = r.channelUrl.ifBlank {
                            "https://www.youtube.com/watch?v=${r.videoId}"
                        },
                    )

                    else -> null
                }
            }
        }
    }

    /** Pull a newer catalog. Safe to fail -- the bundled one keeps working. */
    suspend fun refreshFromRemote(remoteUrl: String): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val body = Http.getString(remoteUrl)
            // Parse before persisting so a truncated download can't brick the list.
            val parsed = Http.json.decodeFromString<SpotCatalog>(body)
            require(parsed.spots.isNotEmpty()) { "empty catalog" }
            overrideFile().writeText(body)
            cached = null
            true
        }.onFailure { Log.w(TAG, "catalog refresh failed: ${it.message}") }.getOrDefault(false)
    }

    private fun overrideFile() = File(context.filesDir, "spots-override.json")

    private fun asset(name: String) =
        context.assets.open(name).bufferedReader().use { it.readText() }

    @Serializable
    private data class ResolvedCam(
        /** Set for a direct HLS stream; empty for a YouTube entry. */
        val url: String = "",
        val videoId: String = "",
        val channelId: String = "",
        val title: String = "",
        val channel: String = "",
        val channelUrl: String = "",
        val score: Int = 0,
    )

    private companion object {
        const val TAG = "SpotRepository"
    }
}
