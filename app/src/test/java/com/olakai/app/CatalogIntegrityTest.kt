package com.olakai.app

import com.olakai.app.data.model.Cam
import com.olakai.app.data.model.CamKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogIntegrityTest {

    /**
     * The embed must always name a concrete video, never the channel-live
     * endpoint -- pointing the player at `embed/live_stream?channel=` is what
     * left every tile black.
     */
    @Test
    fun `a channel cam embeds the resolved video, not the channel`() {
        val cam = Cam(
            id = "x",
            title = "Test",
            kind = CamKind.YOUTUBE,
            source = "UCabcdefghijklmnopqrstuv",
            isChannel = true,
            videoId = "aaaaaaaaaaa",
        )
        assertEquals("https://www.youtube.com/embed/bbbbbbbbbbb", cam.embedUrl("bbbbbbbbbbb"))
        // With nothing resolved yet it falls back to the catalogued video.
        assertEquals("https://www.youtube.com/embed/aaaaaaaaaaa", cam.embedUrl(null))
        assertTrue(!cam.embedUrl(null).contains("live_stream"))
        assertTrue(cam.youTubeWatchUrl.endsWith("/live"))
    }

    @Test
    fun `a video-pinned cam embeds that video and has a poster frame`() {
        val cam = Cam(id = "x", title = "Test", kind = CamKind.YOUTUBE, source = "dQw4w9WgXcQ")
        assertEquals("https://www.youtube.com/embed/dQw4w9WgXcQ", cam.embedUrl(null))
        assertEquals("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", cam.thumbnailUrl)
    }

    @Test
    fun `a channel cam still offers a poster frame from its catalogued video`() {
        val cam = Cam(
            id = "x",
            title = "Test",
            kind = CamKind.YOUTUBE,
            source = "UCabcdefghijklmnopqrstuv",
            isChannel = true,
            videoId = "dQw4w9WgXcQ",
        )
        assertEquals("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg", cam.thumbnailUrl)
    }

    @Test
    fun `external cams are not treated as playable video`() {
        val cam = Cam(
            id = "x",
            title = "Operator page",
            kind = CamKind.EXTERNAL,
            source = "https://example.com",
        )
        assertTrue(!cam.isLiveVideo)
    }
}
