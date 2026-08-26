import Foundation

/// Builds the page the YouTube IFrame player runs in.
///
/// The exact shape here is what decides whether any video plays at all, and it
/// was expensive to establish. Measured against real catalog videos, varying
/// only the Referer:
///
/// ```
/// none, i.e. loading the embed URL directly -> "Video player configuration error"
/// https://www.youtube.com/                  -> "This video is unavailable"
/// https://app.olakai.ios                    -> plays
/// ```
///
/// So the player lives in a host page served from the app's own pseudo-domain,
/// with `origin` matching it. Kept free of UIKit so it can be unit tested.
enum PlayerPage {

    /// Must equal the `baseURL` the web view is given.
    static let origin = "https://app.olakai.ios"

    /// `mute=1` is a requirement, not a preference: browsers refuse to autoplay
    /// audible video, so an unmuted embed just sits there paused.
    ///
    /// `playsinline=1` matters more on iOS than anywhere else — without it the
    /// player takes over the whole screen the moment it starts.
    static func playerURL(embedBase: String, controls: Bool) -> String {
        let joiner = embedBase.contains("?") ? "&" : "?"
        return embedBase + joiner
            + "autoplay=1&mute=1&playsinline=1"
            + "&controls=\(controls ? 1 : 0)"
            + "&rel=0&fs=0&iv_load_policy=3"
            + "&enablejsapi=1&origin=\(origin)"
    }

    /// `allow="autoplay"` is required: autoplay permission has to be delegated
    /// to a cross-origin iframe explicitly, or play() is rejected.
    static func html(embedBase: String, controls: Bool) -> String {
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
            <iframe src="\(playerURL(embedBase: embedBase, controls: controls))"
                    allow="autoplay; encrypted-media; picture-in-picture"></iframe>
          </body>
        </html>
        """
    }
}
