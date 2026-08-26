package com.olakai.app.data.youtube

import android.util.Log
import com.olakai.app.data.Http
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Turns a YouTube channel into the video id it is currently broadcasting.
 *
 * A cam catalog cannot pin a video id: operators restart their stream and the
 * old id dies. It cannot rely on the `embed/live_stream?channel=` endpoint
 * either -- that resolves inconsistently. So the channel's own `/live` page,
 * which YouTube resolves to the current broadcast, is the source of truth, and
 * the app embeds the concrete video id it names.
 */
class LiveStreamResolver {

    private data class Entry(val videoId: String?, val atMillis: Long)

    private val cache = mutableMapOf<String, Entry>()
    private val lock = Mutex()

    suspend fun currentVideoId(channelId: String): String? {
        if (channelId.isBlank()) return null

        lock.withLock {
            cache[channelId]?.let { entry ->
                if (System.currentTimeMillis() - entry.atMillis < TTL_MS) return entry.videoId
            }
        }

        val resolved = withContext(Dispatchers.IO) {
            // YouTube serves different markup to non-browser agents, and the
            // extraction depends on the markup, so ask as a browser would.
            runCatching {
                extract(
                    Http.getString(
                        url = liveUrl(channelId),
                        userAgent = BROWSER_UA,
                        // Without a consent cookie European requests get
                        // redirected to the consent wall instead of the page.
                        headers = mapOf(
                            "Accept-Language" to "en-US,en;q=0.9",
                            "Cookie" to "CONSENT=YES+1; SOCS=CAI",
                        ),
                    ),
                )
            }
                .onFailure { Log.w(TAG, "resolve failed for $channelId: ${it.message}") }
                .getOrNull()
        }

        lock.withLock { cache[channelId] = Entry(resolved, System.currentTimeMillis()) }
        return resolved
    }

    private fun liveUrl(channelId: String) =
        "https://www.youtube.com/channel/$channelId/live"

    /**
     * Only trust ids that came from a watch page.
     *
     * `videoDetails` and the canonical link exist only when the channel actually
     * resolved to a broadcast. When it is offline YouTube serves the ordinary
     * channel page, whose first `"videoId"` is a recommendation -- taking that
     * would put a random video in a surf cam tile, which is worse than showing
     * the catalogued one. So there is no loose fallback here on purpose.
     */
    private fun extract(html: String): String? =
        CANONICAL.find(html)?.groupValues?.get(1)
            ?: PLAYER_VIDEO_ID.find(html)?.groupValues?.get(1)

    private companion object {
        const val TAG = "LiveStreamResolver"

        /** Streams run for days; re-checking every 15 minutes is plenty. */
        const val TTL_MS = 15 * 60 * 1000L

        const val BROWSER_UA =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/125.0.0.0 Mobile Safari/537.36"

        val CANONICAL = Regex("""<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})"""")
        val PLAYER_VIDEO_ID = Regex(""""videoDetails":\{[^}]*?"videoId":"([\w-]{11})"""")
    }
}
