import Foundation

/// Live conditions from Open-Meteo's free marine and forecast endpoints.
///
/// Both accept comma-separated coordinate lists and answer in request order, so
/// the whole wall refreshes in two calls instead of two per spot. No API key.
struct MarineService {

    private let marineFields = [
        "wave_height", "wave_direction", "wave_period",
        "swell_wave_height", "swell_wave_period", "swell_wave_direction",
        "sea_level_height_msl", "sea_surface_temperature",
    ].joined(separator: ",")

    private let windFields = [
        "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "temperature_2m",
    ].joined(separator: ",")

    func load(spots: [Spot]) async -> [String: Conditions] {
        guard !spots.isEmpty else { return [:] }
        var merged: [String: Conditions] = [:]
        // Open-Meteo caps URL length, so chunk rather than sending 60 at once.
        for chunk in spots.chunked(into: 40) {
            for (id, conditions) in await loadChunk(chunk) {
                merged[id] = conditions
            }
        }
        return merged
    }

    private func loadChunk(_ spots: [Spot]) async -> [String: Conditions] {
        let lats = spots.map { String(format: "%.4f", $0.lat) }.joined(separator: ",")
        let lons = spots.map { String(format: "%.4f", $0.lon) }.joined(separator: ",")

        let marineURL = "https://marine-api.open-meteo.com/v1/marine"
            + "?latitude=\(lats)&longitude=\(lons)&current=\(marineFields)"
            + "&hourly=sea_level_height_msl&forecast_days=1&timeformat=unixtime"
        let windURL = "https://api.open-meteo.com/v1/forecast"
            + "?latitude=\(lats)&longitude=\(lons)&current=\(windFields)&timeformat=unixtime"

        async let marine = fetchArray(marineURL)
        async let wind = fetchArray(windURL)
        let (marineResults, windResults) = await (marine, wind)

        var out: [String: Conditions] = [:]
        for (index, spot) in spots.enumerated() {
            let m = marineResults?[safe: index]
            let w = windResults?[safe: index]
            let mc = m?["current"] as? [String: Any]
            let wc = w?["current"] as? [String: Any]
            out[spot.id] = Conditions(
                spotId: spot.id,
                waveHeightM: mc?["wave_height"] as? Double,
                wavePeriodS: mc?["wave_period"] as? Double,
                waveDirectionDeg: mc?["wave_direction"] as? Double,
                swellHeightM: mc?["swell_wave_height"] as? Double,
                swellPeriodS: mc?["swell_wave_period"] as? Double,
                swellDirectionDeg: mc?["swell_wave_direction"] as? Double,
                windSpeedKmh: wc?["wind_speed_10m"] as? Double,
                windGustKmh: wc?["wind_gusts_10m"] as? Double,
                windDirectionDeg: wc?["wind_direction_10m"] as? Double,
                waterTempC: mc?["sea_surface_temperature"] as? Double,
                airTempC: wc?["temperature_2m"] as? Double,
                seaLevelM: mc?["sea_level_height_msl"] as? Double,
                seaLevelNextM: nextHourSeaLevel(m, now: mc?["time"] as? Double)
            )
        }
        return out
    }

    /// Sea level roughly an hour out — the delta is what says push or drain.
    private func nextHourSeaLevel(_ root: [String: Any]?, now: Double?) -> Double? {
        guard
            let hourly = root?["hourly"] as? [String: Any],
            let times = hourly["time"] as? [Double],
            let values = hourly["sea_level_height_msl"] as? [Double]
        else { return nil }

        let target = (now ?? Date().timeIntervalSince1970) + 3600
        var best: Int?
        var bestDelta = Double.greatestFiniteMagnitude
        for (index, time) in times.enumerated() {
            let delta = abs(time - target)
            if delta < bestDelta {
                bestDelta = delta
                best = index
            }
        }
        return best.flatMap { values[safe: $0] }
    }

    /// One coordinate comes back as an object, many as an array.
    private func fetchArray(_ urlString: String) async -> [[String: Any]]? {
        guard let url = URL(string: urlString) else { return nil }
        guard let (data, _) = try? await URLSession.shared.data(from: url) else { return nil }
        let json = try? JSONSerialization.jsonObject(with: data)
        if let array = json as? [[String: Any]] { return array }
        if let object = json as? [String: Any] { return [object] }
        return nil
    }
}

extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }

    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map {
            Array(self[$0 ..< Swift.min($0 + size, count)])
        }
    }
}
