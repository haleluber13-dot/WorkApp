import Foundation

/// Reads the catalog that ships in the bundle. The same JSON files the Android
/// app uses, referenced from this project rather than copied.
enum Catalog {

    static func loadSpots() -> [Spot] {
        guard let catalogData = data(named: "spots") else { return [] }
        let decoder = JSONDecoder()
        guard let catalog = try? decoder.decode(SpotCatalog.self, from: catalogData) else {
            return []
        }
        let cams = loadCams()
        return catalog.spots.map { spot in
            var copy = spot
            if let resolved = cams[spot.id], !resolved.isEmpty {
                copy.cams = resolved + spot.cams
            }
            return copy
        }
    }

    static func loadAirports() -> [Airport] {
        guard
            let data = data(named: "airports"),
            let index = try? JSONDecoder().decode(AirportIndex.self, from: data)
        else { return [] }
        return index.airports
    }

    static func loadLand() -> [[[Double]]] {
        struct Land: Codable { var polygons: [[[Double]]] = [] }
        guard
            let data = data(named: "world_land"),
            let land = try? JSONDecoder().decode(Land.self, from: data)
        else { return [] }
        return land.polygons
    }

    /// cams.json is the resolver's output: spot id -> verified live streams.
    private static func loadCams() -> [String: [Cam]] {
        struct Resolved: Codable {
            var videoId: String = ""
            var channelId: String = ""
            var title: String = ""
            var channel: String = ""
            var channelUrl: String = ""
        }
        guard
            let data = data(named: "cams"),
            let raw = try? JSONDecoder().decode([String: [Resolved]].self, from: data)
        else { return [:] }

        return raw.mapValues { list in
            list.enumerated().map { index, entry in
                Cam(
                    id: "\(entry.channelId)-\(index)",
                    title: entry.title.isEmpty ? "Live cam" : entry.title,
                    kind: .youtube,
                    source: entry.channelId.isEmpty ? entry.videoId : entry.channelId,
                    provider: entry.channel,
                    attribution: entry.channel,
                    pageUrl: entry.channelUrl.isEmpty
                        ? "https://www.youtube.com/watch?v=\(entry.videoId)"
                        : entry.channelUrl,
                    isChannel: !entry.channelId.isEmpty,
                    videoId: entry.videoId
                )
            }
        }
    }

    /// XcodeGen adds the shared asset folder as a blue folder reference, so the
    /// files can land either at the bundle root or under `assets/`.
    private static func data(named name: String) -> Data? {
        let candidates = [
            Bundle.main.url(forResource: name, withExtension: "json"),
            Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "assets"),
        ]
        for case let url? in candidates {
            if let data = try? Data(contentsOf: url) { return data }
        }
        return nil
    }
}
