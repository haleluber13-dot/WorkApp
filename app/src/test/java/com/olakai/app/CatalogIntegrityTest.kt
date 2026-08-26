package com.olakai.app

import com.olakai.app.data.model.Cam
import com.olakai.app.data.model.CamKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CatalogIntegrityTest {

    @Test
    fun `a channel-pinned cam embeds the channel-live endpoint`() {
        val cam = Cam(
            id = "x",
            title = "Test",
            kind = CamKind.YOUTUBE,
            source = "UCabcdefghijklmnopqrstuv",
            isChannel = true,
        )
        assertEquals(
            "https://www.youtube.com/embed/live_stream?channel=UCabcdefghijklmnopqrstuv",
            cam.youTubeEmbedUrl,
        )
        assertTrue(cam.youTubeWatchUrl.endsWith("/live"))
    }

    @Test
    fun `a video-pinned cam embeds that video and has a poster frame`() {
        val cam = Cam(id = "x", title = "Test", kind = CamKind.YOUTUBE, source = "dQw4w9WgXcQ")
        assertEquals("https://www.youtube.com/embed/dQw4w9WgXcQ", cam.youTubeEmbedUrl)
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
