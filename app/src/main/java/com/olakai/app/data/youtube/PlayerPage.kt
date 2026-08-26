package com.olakai.app.data.youtube

/**
 * Builds the one-line page the YouTube IFrame player runs in.
 *
 * Lives outside the UI layer purely so it can be tested: the exact shape of this
 * page is what decides whether any video plays at all, and it was expensive to
 * establish. Measured against real catalog videos, varying only the Referer:
 *
 * ```
 * none (a top-level loadUrl of the embed) -> "Video player configuration error"
 * https://www.youtube.com/                -> "This video is unavailable"
 * https://com.olakai.app                  -> plays
 * ```
 */
object PlayerPage {

    /**
     * @param embedBase `https://www.youtube.com/embed/<videoId>`
     * @param controls whether to show the player's own controls
     * @param origin the app's pseudo-domain; must equal the WebView base URL
     */
    fun html(embedBase: String, controls: Boolean, origin: String): String =
        """
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
            <iframe src="${playerUrl(embedBase, controls, origin)}"
                    allow="autoplay; encrypted-media; picture-in-picture"></iframe>
          </body>
        </html>
        """.trimIndent()

    /**
     * `mute=1` is a requirement, not a preference: browsers refuse to autoplay
     * audible video, so an unmuted embed just sits there paused.
     *
     * `fs=0` because a plain WebChromeClient implements neither onShowCustomView
     * nor onHideCustomView, and a fullscreen button we cannot service would
     * blank the video with no way back.
     */
    fun playerUrl(embedBase: String, controls: Boolean, origin: String): String {
        val joiner = if (embedBase.contains('?')) "&" else "?"
        return embedBase + joiner + buildString {
            append("autoplay=1")
            append("&mute=1")
            append("&playsinline=1")
            append("&controls=").append(if (controls) 1 else 0)
            append("&rel=0&fs=0&iv_load_policy=3")
            append("&enablejsapi=1&origin=").append(origin)
        }
    }
}
