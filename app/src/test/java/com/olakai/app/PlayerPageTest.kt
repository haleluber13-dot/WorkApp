package com.olakai.app

import com.olakai.app.data.youtube.PlayerPage
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * These assertions are the difference between a wall of video and a wall of
 * black rectangles. Each one records something that was measured against the
 * real endpoint, so treat a failure here as a regression, not a nit.
 */
class PlayerPageTest {

    private val embed = "https://www.youtube.com/embed/Fp7l8XASb9Y"
    private val origin = "https://com.olakai.app"

    @Test
    fun `autoplay is always muted`() {
        // Browsers refuse to autoplay audible video; an unmuted embed sits paused.
        listOf(true, false).forEach { controls ->
            assertTrue(PlayerPage.playerUrl(embed, controls, origin).contains("mute=1"))
        }
        assertFalse(PlayerPage.playerUrl(embed, true, origin).contains("mute=0"))
    }

    @Test
    fun `origin matches the host page domain and is never youtube`() {
        val url = PlayerPage.playerUrl(embed, false, origin)
        assertTrue(url.contains("origin=$origin"))
        // youtube.com as the referring origin is rejected: "This video is unavailable".
        assertFalse(url.contains("origin=https://www.youtube.com"))
    }

    @Test
    fun `autoplay permission is delegated to the cross-origin iframe`() {
        // Without allow="autoplay" the iframe's play() is rejected outright.
        assertTrue(PlayerPage.html(embed, false, origin).contains("allow=\"autoplay"))
    }

    @Test
    fun `fullscreen is disabled because nothing can service it`() {
        assertTrue(PlayerPage.playerUrl(embed, true, origin).contains("fs=0"))
        assertFalse(PlayerPage.html(embed, true, origin).contains("allowfullscreen"))
    }

    @Test
    fun `the player is inline and never the channel-live endpoint`() {
        val url = PlayerPage.playerUrl(embed, false, origin)
        assertTrue(url.contains("playsinline=1"))
        assertFalse(url.contains("live_stream"))
    }

    @Test
    fun `controls are on only when asked for`() {
        assertTrue(PlayerPage.playerUrl(embed, true, origin).contains("controls=1"))
        assertTrue(PlayerPage.playerUrl(embed, false, origin).contains("controls=0"))
    }

    @Test
    fun `an embed base that already has a query string keeps it`() {
        val withQuery = "https://www.youtube.com/embed/abc?foo=1"
        assertTrue(PlayerPage.playerUrl(withQuery, false, origin).contains("foo=1&autoplay=1"))
    }
}
