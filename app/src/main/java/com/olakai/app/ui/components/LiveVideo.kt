package com.olakai.app.ui.components

import android.annotation.SuppressLint
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.ui.AspectRatioFrameLayout
import androidx.media3.ui.PlayerView
import com.olakai.app.data.model.Cam

/**
 * A YouTube live stream in the official embedded player.
 *
 * YouTube's terms require playback through their player rather than by pulling
 * the underlying stream, so this is a WebView around the IFrame embed. Where a
 * cam is pinned to a channel we load the channel-live endpoint, which follows
 * the operator to whatever broadcast is running now instead of breaking when
 * they restart the stream.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun YouTubeLive(
    cam: Cam,
    modifier: Modifier = Modifier,
    muted: Boolean = true,
    showControls: Boolean = false,
) {
    val context = LocalContext.current
    val html = remember(cam.source, muted, showControls) {
        buildEmbedHtml(cam.youTubeEmbedUrl, muted, showControls)
    }

    val webView = remember {
        WebView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.Black.toArgb())
            webChromeClient = WebChromeClient()
            webViewClient = WebViewClient()
            isVerticalScrollBarEnabled = false
            isHorizontalScrollBarEnabled = false
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                // Without this the embed will not start until the user taps it,
                // which defeats a wall of always-on cams.
                mediaPlaybackRequiresUserGesture = false
                loadWithOverviewMode = true
                useWideViewPort = true
                cacheMode = WebSettings.LOAD_DEFAULT
            }
        }
    }

    DisposableEffect(webView) {
        onDispose {
            // Release the decoder immediately -- a wall recycles these constantly.
            webView.loadUrl("about:blank")
            webView.stopLoading()
            webView.destroy()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { webView },
        update = { view ->
            view.loadDataWithBaseURL(
                "https://www.youtube.com",
                html,
                "text/html",
                "utf-8",
                null,
            )
        },
    )
}

private fun buildEmbedHtml(embedUrl: String, muted: Boolean, controls: Boolean): String {
    // The channel-live endpoint already carries a query string, a video embed
    // does not -- pick the joiner rather than assuming one.
    val joiner = if (embedUrl.contains('?')) "&" else "?"
    val src = embedUrl + joiner + buildString {
        append("autoplay=1")
        append("&mute=").append(if (muted) 1 else 0)
        append("&playsinline=1")
        append("&controls=").append(if (controls) 1 else 0)
        append("&modestbranding=1&rel=0&fs=0&iv_load_policy=3")
    }
    return """
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
            <style>
              html, body { margin:0; padding:0; background:#000; height:100%; overflow:hidden; }
              iframe { border:0; width:100%; height:100%; display:block; }
            </style>
          </head>
          <body>
            <iframe src="$src"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowfullscreen></iframe>
          </body>
        </html>
    """.trimIndent()
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
        ExoPlayer.Builder(context).build().apply {
            setMediaItem(MediaItem.fromUri(cam.source))
            repeatMode = Player.REPEAT_MODE_OFF
            volume = if (muted) 0f else 1f
            playWhenReady = true
            prepare()
        }
    }

    DisposableEffect(player) {
        onDispose { player.release() }
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
