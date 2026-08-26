import Foundation

struct FlightOption: Identifiable {
    let stops: Int
    let minutes: Int
    let price: Double

    var id: Int { stops }
    var durationText: String { "\(minutes / 60)h \(String(format: "%02d", minutes % 60))m" }
    var stopsText: String { stops == 0 ? "Direct" : stops == 1 ? "1 stop" : "\(stops) stops" }
}

struct SearchLink { let label: String; let url: String }

/// The same offline fare model as the Android build: fare and block time from
/// distance, airport size, season and booking lead time, with one routing per
/// stop count so the cheapest/fastest trade is real.
///
/// Every number here is an estimate, and the UI says so. Real fares need a
/// provider key; the booking links are always one tap away.
enum FlightEstimator {

    static func options(from: Airport, to: Airport, depart: Date, ret: Date?) -> [FlightOption] {
        let km = distanceKm(from.lat, from.lon, to.lat, to.lon)
        guard km > 1 else { return [] }

        let hub = from.size + to.size
        let minStops = km < 3500 ? (hub >= 5 ? 0 : 1)
            : km < 9000 ? (hub == 6 ? 0 : 1)
            : (hub == 6 ? 1 : 2)

        let base: Double
        switch km {
        case ..<800: base = 70 + km * 0.075
        case ..<2500: base = 95 + km * 0.052
        case ..<6000: base = 150 + km * 0.038
        case ..<11000: base = 260 + km * 0.030
        default: base = 420 + km * 0.024
        }

        let month = Calendar.current.component(.month, from: depart)
        let peak = to.lat >= 0 ? [6, 7, 8, 12].contains(month) : [12, 1, 2, 7].contains(month)
        let days = Calendar.current.dateComponents([.day], from: .now, to: depart).day ?? 30
        let lead: Double = days < 0 ? 1 : days < 7 ? 1.55 : days < 21 ? 1.18
            : days <= 90 ? 0.95 : days <= 200 ? 1.02 : 1.10
        let connectivity = 1 + Double(6 - hub) * 0.06

        return (0 ... 2).map { extra in
            let stops = minStops + extra
            let detour = 1 + Double(stops) * 0.07
            let air = Int((35 + (km * detour) / 13.7).rounded())
            let minutes = air + stops * (km > 6000 ? 150 : 95)
            var price = base * connectivity * (peak ? 1.22 : 0.97) * lead * pow(0.86, Double(extra))
            if ret != nil { price *= 1.85 }
            return FlightOption(stops: stops, minutes: minutes, price: price)
        }
    }

    /// "Fast, for less money": normalise both axes across the board and minimise
    /// a weighted blend. The slider is that weight.
    static func bestValue(_ options: [FlightOption], priceWeight: Double) -> FlightOption {
        guard options.count > 1 else { return options[0] }
        let prices = options.map(\.price), times = options.map { Double($0.minutes) }
        let minP = prices.min()!, maxP = prices.max()!
        let minT = times.min()!, maxT = times.max()!
        func norm(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
            hi - lo < 1e-9 ? 0 : (v - lo) / (hi - lo)
        }
        return options.min {
            norm($0.price, minP, maxP) * priceWeight + norm(Double($0.minutes), minT, maxT) * (1 - priceWeight)
                < norm($1.price, minP, maxP) * priceWeight + norm(Double($1.minutes), minT, maxT) * (1 - priceWeight)
        }!
    }

    static func googleFlights(from: String, to: String, depart: Date, ret: Date?) -> String {
        var query = "flights from \(from) to \(to) on \(iso(depart))"
        if let ret { query += " returning \(iso(ret))" }
        let encoded = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        return "https://www.google.com/travel/flights?q=\(encoded)"
    }

    static func searchLinks(from: String, to: String, depart: Date, ret: Date?) -> [SearchLink] {
        let d = iso(depart)
        let r = ret.map(iso)
        return [
            SearchLink(label: "Google Flights", url: googleFlights(from: from, to: to, depart: depart, ret: ret)),
            SearchLink(label: "Skyscanner",
                       url: "https://www.skyscanner.net/transport/flights/\(from)/\(to)/\(compact(d))/"
                            + (r.map { compact($0) + "/" } ?? "")),
            SearchLink(label: "Kiwi",
                       url: "https://www.kiwi.com/en/search/results/\(from)/\(to)/\(d)" + (r.map { "/\($0)" } ?? "")),
            SearchLink(label: "Kayak",
                       url: "https://www.kayak.com/flights/\(from)-\(to)/\(d)" + (r.map { "/\($0)" } ?? "")),
        ]
    }

    private static func iso(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }

    /// yyyy-MM-dd -> yymmdd, which is what Skyscanner's path wants.
    private static func compact(_ isoDate: String) -> String {
        String(isoDate.replacingOccurrences(of: "-", with: "").dropFirst(2))
    }
}

func distanceKm(_ lat1: Double, _ lon1: Double, _ lat2: Double, _ lon2: Double) -> Double {
    let radius = 6371.0, rad = Double.pi / 180
    let dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad
    let a = sin(dLat / 2) * sin(dLat / 2)
        + cos(lat1 * rad) * cos(lat2 * rad) * sin(dLon / 2) * sin(dLon / 2)
    return 2 * radius * asin(min(1, sqrt(a)))
}
