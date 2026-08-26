import SwiftUI
import WebKit

/// The YouTube IFrame player in a `WKWebView`.
///
/// The host page is served from the app's own pseudo-domain (see `PlayerPage`),
/// because the embed refuses to play both when there is no referring page and
/// when that page is youtube.com itself.
struct YouTubePlayerView: UIViewRepresentable {

    let embedBase: String
    var controls: Bool = false

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Both are required, and both default the wrong way for a video wall:
        // without them iOS plays fullscreen and only after a tap.
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = .black
        view.scrollView.isScrollEnabled = false
        view.scrollView.bounces = false
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        let html = PlayerPage.html(embedBase: embedBase, controls: controls)
        // Load once per page: reloading on every SwiftUI update would restart
        // the stream and thrash the decoder.
        guard context.coordinator.loaded != html else { return }
        context.coordinator.loaded = html
        view.loadHTMLString(html, baseURL: URL(string: PlayerPage.origin))
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.loadHTMLString("", baseURL: nil)
    }

    func makeCoordinator() -> Coordinator { Coordinator() }

    final class Coordinator {
        var loaded: String?
    }
}
