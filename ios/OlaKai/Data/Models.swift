import Foundation

/// How a cam's video gets on screen.
enum CamKind: String, Codable {
    case hls, youtube, still, external
}

struct Cam: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var kind: CamKind
    /// Channel id when `isChannel`, else a video id, a stream URL, or a page URL.
    var source: String
    var provider: String = ""
    var attribution: String = ""
    var pageUrl: String = ""
    var isChannel: Bool = false
    /// Last video id known to be live on this channel.
    var videoId: String = ""

    var isLiveVideo: Bool { kind == .hls || kind == .youtube }

    /// Always a concrete video. `embed/live_stream?channel=` no longer resolves.
    func embedBase(resolved: String?) -> String {
        let id = resolved?.isEmpty == false ? resolved!
            : (videoId.isEmpty ? source : videoId)
        return "https://www.youtube.com/embed/\(id)"
    }

    var watchURL: String {
        isChannel
            ? "https://www.youtube.com/channel/\(source)/live"
            : "https://www.youtube.com/watch?v=\(source)"
    }

    var thumbnailURL: URL? {
        switch kind {
        case .youtube:
            let id = videoId.isEmpty ? (isChannel ? "" : source) : videoId
            return id.isEmpty ? nil : URL(string: "https://i.ytimg.com/vi/\(id)/hqdefault.jpg")
        case .still:
            return URL(string: source)
        default:
            return nil
        }
    }
}

struct SpotInfo: Codable, Hashable {
    var about: String
    var breakType: String
    var bottom: String
    var wave: String
    var level: String
    var bestSwell: String
    var bestWind: String
    var bestTide: String
    var bestSeason: String
    var waterTemp: String
    var crowd: String
    var hazards: [String] = []
    var localTip: String = ""
}

struct Access: Codable, Hashable {
    var airports: [String]
    var transfer: String
    var transferMinutes: Int
    var visaNote: String = ""
}

struct Spot: Codable, Identifiable, Hashable {
    var id: String
    var name: String
    var region: String
    var country: String
    var countryCode: String
    var lat: Double
    var lon: Double
    var timezone: String
    var tags: [String] = []
    var info: SpotInfo
    var access: Access
    var cams: [Cam] = []
    var externalCams: [Cam] = []

    var subtitle: String { "\(region), \(country)" }
    var hasLiveCam: Bool { cams.contains { $0.isLiveVideo } }
}

struct SpotCatalog: Codable {
    var version: Int = 1
    var updated: String = ""
    var spots: [Spot] = []
}

struct Airport: Codable, Identifiable, Hashable {
    var iata: String
    var name: String
    var city: String
    var country: String
    var countryCode: String
    var lat: Double
    var lon: Double
    var size: Int = 2

    var id: String { iata }
}

struct AirportIndex: Codable {
    var airports: [Airport] = []
}

enum Tide { case rising, falling, slack, unknown }

/// Live marine and wind readings for one spot, as served by Open-Meteo.
struct Conditions: Hashable {
    var spotId: String
    var waveHeightM: Double?
    var wavePeriodS: Double?
    var waveDirectionDeg: Double?
    var swellHeightM: Double?
    var swellPeriodS: Double?
    var swellDirectionDeg: Double?
    var windSpeedKmh: Double?
    var windGustKmh: Double?
    var windDirectionDeg: Double?
    var waterTempC: Double?
    var airTempC: Double?
    var seaLevelM: Double?
    var seaLevelNextM: Double?

    var tide: Tide {
        guard let now = seaLevelM, let next = seaLevelNextM else { return .unknown }
        let delta = next - now
        if delta > 0.05 { return .rising }
        if delta < -0.05 { return .falling }
        return .slack
    }

    /// Mirrors the Android model exactly, including the multiplicative shape:
    /// size sets the ceiling, period and wind scale it down. An additive model
    /// rewards a flat ocean for being windless.
    var score: Int {
        guard let h = waveHeightM else { return 0 }
        let p = wavePeriodS ?? 8
        let wind = windSpeedKmh ?? 0

        let size: Double
        switch h {
        case ..<0.3: size = 5
        case ..<0.8: size = 30 + (h - 0.3) * 80
        case ...2.5: size = 70 + (h - 0.8) * 15
        case ...4.0: size = 95 - (h - 2.5) * 8
        default: size = 70
        }
        let periodQuality = min(max((p - 6) / 10, 0), 1)
        let windQuality = min(max(1 - wind / 35, 0), 1)
        let quality = 0.5 + 0.3 * periodQuality + 0.2 * windQuality
        return Int(min(max(size * quality, 0), 100).rounded())
    }

    var verdict: String {
        switch score {
        case 85...: return "Firing"
        case 70..<85: return "Very good"
        case 55..<70: return "Fun"
        case 40..<55: return "Rideable"
        case 20..<40: return "Marginal"
        default: return "Flat / blown"
        }
    }
}

func compassPoint(_ degrees: Double) -> String {
    let points = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
    let normalised = degrees.truncatingRemainder(dividingBy: 360)
    let positive = normalised < 0 ? normalised + 360 : normalised
    return points[Int((positive / 22.5).rounded()) % 16]
}
