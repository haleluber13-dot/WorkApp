import Foundation

/// Turns a YouTube channel into the video id it is currently broadcasting.
///
/// A catalog cannot pin a video id — operators restart their stream and the old
/// id dies — and `embed/live_stream?channel=` no longer resolves. So the
/// channel's own `/live` page is the source of truth.
actor LiveStreamResolver {

    private struct Entry {
        let videoId: String?
        let at: Date
    }

    private var cache: [String: Entry] = [:]

    /// Streams run for days; re-checking every fifteen minutes is plenty.
    private let ttl: TimeInterval = 15 * 60

    private let browserAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
        + "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

    func currentVideoId(channelId: String) async -> String? {
        guard !channelId.isEmpty else { return nil }

        if let entry = cache[channelId], Date().timeIntervalSince(entry.at) < ttl {
            return entry.videoId
        }

        let resolved = await fetchVideoId(channelId: channelId)
        cache[channelId] = Entry(videoId: resolved, at: Date())
        return resolved
    }

    private func fetchVideoId(channelId: String) async -> String? {
        guard let url = URL(string: "https://www.youtube.com/channel/\(channelId)/live") else {
            return nil
        }
        var request = URLRequest(url: url)
        request.setValue(browserAgent, forHTTPHeaderField: "User-Agent")
        request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")
        // Without a consent cookie European requests land on the consent wall.
        request.setValue("CONSENT=YES+1; SOCS=CAI", forHTTPHeaderField: "Cookie")

        guard
            let (data, _) = try? await URLSession.shared.data(for: request),
            let html = String(data: data, encoding: .utf8)
        else { return nil }

        return Self.extract(from: html)
    }

    /// Only ids that came from a watch page are trusted.
    ///
    /// When a channel is offline YouTube serves the ordinary channel page, whose
    /// first `"videoId"` is a recommendation. Putting a random video in a surf
    /// cam tile is worse than showing a stale one, so there is deliberately no
    /// loose fallback here.
    static func extract(from html: String) -> String? {
        let patterns = [
            #"<link rel="canonical" href="https://www\.youtube\.com/watch\?v=([\w-]{11})""#,
            #""videoDetails":\{[^}]*?"videoId":"([\w-]{11})""#,
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            let range = NSRange(html.startIndex..., in: html)
            if let match = regex.firstMatch(in: html, range: range),
               let idRange = Range(match.range(at: 1), in: html) {
                return String(html[idRange])
            }
        }
        return nil
    }
}
