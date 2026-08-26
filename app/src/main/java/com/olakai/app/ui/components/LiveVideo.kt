package com.olakai.app.ui.components

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.olakai.app.Graph
import com.olakai.app.data.model.Cam

private const val TAG = "LiveVideo"

/** Tag key for the URL a WebView already loaded; any int with a high byte >= 2. */
private val R_LOADED = "olakai_loaded_url".hashCode()

/**
 * A YouTube live stream in the official embedded player.
 *
 * YouTube's terms require playback through their player rather than by pulling
 * the underlying stream, so this is a WebView on the IFrame embed page.
 *
 * Two details are load-bearing, and getting either wrong shows a black player:
 *  - the embed page is loaded as a top-level navigation, so the document really
 *    is on youtube.com. Wrapping it in an iframe inside a `data:` document
 *    leaves the page on an origin the player refuses to run on.
 *  - the URL names a concrete video id. `embed/live_stream?channel=` is the
 *    obvious choice for a live channel and does not resolve reliably.
 */
@Composable
fun YouTubeLive(
    cam: Cam,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
    showControls: Boolean = false,
) {
    // A catalogued video id goes stale the moment an operator restarts their
    // broadcast, so for a channel cam wait for the current id before loading.
    // Resolution falls back to the catalogued id, so this cannot hang.
    var videoId by remember(cam.id) {
        mutableStateOf(if (cam.isChannel) "" else cam.source)
    }
    LaunchedEffect(cam.id) {
        if (cam.isChannel) {
            videoId = Graph.liveStreams.currentVideoId(cam.source)
                ?: cam.videoId.ifBlank { cam.source }
        }
    }

    var failed by remember(cam.id) { mutableStateOf(false) }

    if (failed) {
        CamUnavailable(modifier, "Cam unavailable")
        return
    }
    if (videoId.isBlank()) {
        CamUnavailable(modifier, "Finding the live stream…")
        return
    }

    val url = remember(videoId, showControls) {
        embedUrl(cam.embedUrl(videoId), showControls)
    }
    val label = cam.id

    AndroidView(
        modifier = modifier,
        // Built here rather than in a remember: Compose owns this view's
        // lifetime, and handing it one built elsewhere risks re-attaching a
        // WebView that a previous release already destroyed.
        factory = { context ->
            runCatching { createPlayerWebView(context, label) { failed = true } }
                .onFailure {
                    // A device can be without a usable WebView (provider
                    // updating, or disabled) and construction then throws.
                    Log.w(TAG, "no usable WebView: ${it.message}")
                    failed = true
                }
                .getOrElse { WebView(context) }
        },
        update = { view ->
            // Load once per URL. Reloading on every recomposition would restart
            // the stream and thrash the decoder.
            if (view.getTag(R_LOADED) != url) {
                view.setTag(R_LOADED, url)
                view.loadUrl(url)
            }
        },
        // Runs after the view is detached, which is what WebView.destroy()
        // requires. Doing this in a DisposableEffect destroys it while it is
        // still parented, and a recycling grid then leaves dead tiles behind.
        onRelease = { view ->
            runCatching {
                view.stopLoading()
                view.loadUrl("about:blank")
                (view.parent as? ViewGroup)?.removeView(view)
                view.destroy()
            }
        },
    )
}

@SuppressLint("SetJavaScriptEnabled")
private fun createPlayerWebView(
    context: Context,
    label: String,
    onRenderGone: () -> Unit,
): WebView = WebView(context).apply {
    layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT,
    )
    setBackgroundColor(Color.Black.toArgb())
    isVerticalScrollBarEnabled = false
    isHorizontalScrollBarEnabled = false

    // Required for HTML5 video to render at all; the console hook is how a
    // playback refusal becomes visible instead of just a black rectangle.
    webChromeClient = object : WebChromeClient() {
        override fun onConsoleMessage(message: ConsoleMessage): Boolean {
            Log.d(TAG, "$label console: ${message.message()}")
            return true
        }
    }

    webViewClient = object : WebViewClient() {
        /**
         * Critical on a wall of streams: when Android kills a WebView render
         * process (usually memory pressure with several videos decoding),
         * returning false lets the platform kill the whole app. Returning true
         * keeps OlaKai alive and drops just this tile.
         */
        override fun onRenderProcessGone(
            view: WebView?,
            detail: RenderProcessGoneDetail?,
        ): Boolean {
            Log.w(TAG, "$label render process gone; dropping the tile")
            view?.destroy()
            onRenderGone()
            return true
        }

        override fun onReceivedError(
            view: WebView?,
            request: WebResourceRequest?,
            error: WebResourceError?,
        ) {
            if (request?.isForMainFrame == true) {
                Log.w(TAG, "$label load error: ${error?.description}")
            }
        }

        override fun onReceivedHttpError(
            view: WebView?,
            request: WebResourceRequest?,
            response: WebResourceResponse?,
        ) {
            if (request?.isForMainFrame == true) {
                Log.w(TAG, "$label http ${response?.statusCode} for ${request.url}")
            }
        }
    }

    settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        // Without this the embed will not start until the user taps it, which
        // defeats a wall of always-on cams.
        mediaPlaybackRequiresUserGesture = false
        loadWithOverviewMode = true
        useWideViewPort = true
        cacheMode = WebSettings.LOAD_DEFAULT
        // Android appends "; wv" to mark a WebView. YouTube treats that as an
        // embedded browser and can serve a degraded player, so drop it.
        userAgentString = userAgentString.replace("; wv", "")
    }
}

/**
 * Query string for the IFrame player.
 *
 * `mute=1` is not a preference, it is a requirement: browsers refuse to autoplay
 * audible video, so an unmuted embed simply sits there paused. Tiles stay muted
 * for good; the focused player shows controls, and unmuting by hand is itself
 * the gesture that permits audio.
 *
 * `fs=0` because a plain WebChromeClient implements neither onShowCustomView
 * nor onHideCustomView -- offering a fullscreen button we cannot service would
 * blank the video with no way back.
 */
private fun embedUrl(base: String, controls: Boolean): String {
    val joiner = if (base.contains('?')) "&" else "?"
    return base + joiner + buildString {
        append("autoplay=1")
        append("&mute=1")
        append("&playsinline=1")
        append("&controls=").append(if (controls) 1 else 0)
        append("&modestbranding=1&rel=0&fs=0&iv_load_policy=3")
    }
}

@Composable
private fun CamUnavailable(modifier: Modifier = Modifier, message: String) {
    Box(
        modifier.background(Color(0xFF07223A)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            message,
            color = Color(0xFF9FB6C6),
            fontSize = 12.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(12.dp),
        )
    }
}

/** A direct HLS feed, played by ExoPlayer -- far cheaper per tile than a WebView. */
@Composable
fun HlsLive(
    cam: Cam,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
    showControls: Boolean = false,
) {
    val context = LocalContext.current
    val player = remember(cam.source) {
        runCatching {
            ExoPlayer.Builder(context).build().apply {
                setMediaItem(MediaItem.fromUri(cam.source))
                repeatMode = Player.REPEAT_MODE_OFF
                volume = if (muted) 0f else 1f
                playWhenReady = true
                prepare()
            }
        }.onFailure { Log.w(TAG, "player init failed: ${it.message}") }.getOrNull()
    }

    if (player == null) {
        CamUnavailable(modifier, "Cam unavailable")
        return
    }

    androidx.compose.runtime.DisposableEffect(player) {
        onDispose { runCatching { player.release() } }
    }

    AndroidView(
        modifier = modifier,
        factory = {
            PlayerView(it).apply {
                useController = showControls
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_ZOOM
                setShutterBackgroundColor(Color.Black.toArgb())
                this.player = player
            }
        },
        update = { view ->
            view.useController = showControls
            player.volume = if (muted) 0f else 1f
        },
    )
}
