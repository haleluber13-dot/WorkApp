import Foundation
import SwiftUI

/// Single source of truth for the app. Small enough that an observable object
/// beats introducing an architecture.
@MainActor
final class AppStore: ObservableObject {

    @Published private(set) var spots: [Spot] = []
    @Published private(set) var airports: [Airport] = []
    @Published private(set) var conditions: [String: Conditions] = [:]
    @Published private(set) var refreshing = false

    @Published var query = ""
    @Published var sort: Sort = .firing
    @Published var favouritesOnly = false
    @Published var favourites: Set<String> = []
    @Published var useFeet = false
    /// How many tiles may hold a live player at once. Each one is a web view
    /// with its own video decoder, so this stays deliberately small.
    @Published var liveBudget = 2

    /// channel id -> the video it is broadcasting now.
    @Published private(set) var resolved: [String: String] = [:]

    private let marine = MarineService()
    private let resolver = LiveStreamResolver()
    private var refreshTask: Task<Void, Never>?

    enum Sort: String, CaseIterable {
        case firing = "Firing now"
        case name = "A–Z"
    }

    init() {
        spots = Catalog.loadSpots()
        airports = Catalog.loadAirports()
        favourites = Set(UserDefaults.standard.stringArray(forKey: "favourites") ?? [])
        useFeet = UserDefaults.standard.bool(forKey: "useFeet")
        if let saved = UserDefaults.standard.object(forKey: "liveBudget") as? Int {
            liveBudget = saved
        }
        refresh()
        // Marine models update hourly; ten minutes keeps the wall fresh without
        // hammering a free API.
        refreshTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(600))
                await self?.refresh()
            }
        }
    }

    deinit { refreshTask?.cancel() }

    func refresh() {
        Task { await refresh() }
    }

    private func refresh() async {
        guard !spots.isEmpty else { return }
        refreshing = true
        let loaded = await marine.load(spots: spots)
        if !loaded.isEmpty { conditions = loaded }
        refreshing = false
    }

    func conditions(for spot: Spot) -> Conditions? { conditions[spot.id] }

    func score(_ spot: Spot) -> Int { conditions[spot.id]?.score ?? 0 }

    func toggleFavourite(_ spot: Spot) {
        if favourites.contains(spot.id) { favourites.remove(spot.id) } else { favourites.insert(spot.id) }
        UserDefaults.standard.set(Array(favourites), forKey: "favourites")
    }

    func setUseFeet(_ value: Bool) {
        useFeet = value
        UserDefaults.standard.set(value, forKey: "useFeet")
    }

    func setLiveBudget(_ value: Int) {
        liveBudget = max(1, min(12, value))
        UserDefaults.standard.set(liveBudget, forKey: "liveBudget")
    }

    var visibleSpots: [Spot] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        var list = spots.filter { spot in
            let matches = q.isEmpty
                || spot.name.lowercased().contains(q)
                || spot.region.lowercased().contains(q)
                || spot.country.lowercased().contains(q)
                || spot.tags.contains { $0.lowercased().contains(q) }
            return matches && (!favouritesOnly || favourites.contains(spot.id))
        }
        switch sort {
        case .name: list.sort { $0.name < $1.name }
        case .firing: list.sort { score($0) > score($1) }
        }
        return list
    }

    struct Tile: Identifiable {
        let spot: Spot
        let cam: Cam
        var id: String { "\(spot.id)-\(cam.id)" }
    }

    /// Round-robin across spots rather than grouping each spot's cams together:
    /// three angles on one beach in a row buries everything else.
    var tiles: [Tile] {
        let spots = visibleSpots
        let camsBySpot = spots.map { ($0, $0.cams.filter(\.isLiveVideo)) }
        let depth = camsBySpot.map(\.1.count).max() ?? 0
        return (0 ..< depth).flatMap { round in
            camsBySpot.compactMap { spot, cams in
                cams.indices.contains(round) ? Tile(spot: spot, cam: cams[round]) : nil
            }
        }
    }

    /// A catalogued video id dies when an operator restarts their broadcast, so
    /// ask the channel what it is showing now.
    func resolveLive(for cam: Cam) async {
        guard cam.isChannel, resolved[cam.source] == nil else { return }
        if let id = await resolver.currentVideoId(channelId: cam.source) {
            resolved[cam.source] = id
        }
    }

    func summaryLine(_ c: Conditions?) -> String {
        guard let c, let h = c.waveHeightM else { return "No reading yet" }
        let size = useFeet
            ? String(format: "%.1f ft", h * 3.28084)
            : String(format: "%.1f m", h)
        let period = c.wavePeriodS.map { " · \(Int($0.rounded())) s" } ?? ""
        let wind = c.windSpeedKmh.map { speed in
            " · \(Int(speed.rounded())) km/h" + (c.windDirectionDeg.map { " " + compassPoint($0) } ?? "")
        } ?? ""
        return size + period + wind
    }
}

/// The 0–100 score, coloured the same way as the Android build.
func scoreColor(_ score: Int) -> Color {
    switch score {
    case 85...: return Color(red: 0.17, green: 0.89, blue: 0.78)
    case 70..<85: return Color(red: 0.39, green: 0.85, blue: 0.64)
    case 55..<70: return Color(red: 1.0, green: 0.70, blue: 0.36)
    case 40..<55: return Color(red: 0.91, green: 0.64, blue: 0.23)
    case 20..<40: return Color(red: 1.0, green: 0.48, blue: 0.35)
    default: return Color(red: 0.62, green: 0.71, blue: 0.78)
    }
}

enum Ocean {
    static let abyss = Color(red: 0.012, green: 0.063, blue: 0.110)
    static let deep = Color(red: 0.027, green: 0.133, blue: 0.227)
    static let mid = Color(red: 0.043, green: 0.208, blue: 0.341)
    static let aqua = Color(red: 0.169, green: 0.890, blue: 0.776)
    static let foam = Color(red: 0.910, green: 0.984, blue: 0.969)
    static let sand = Color(red: 0.953, green: 0.886, blue: 0.753)
    static let coral = Color(red: 1.0, green: 0.478, blue: 0.353)
    static let sunset = Color(red: 1.0, green: 0.702, blue: 0.361)
    static let slate = Color(red: 0.624, green: 0.714, blue: 0.776)
}
