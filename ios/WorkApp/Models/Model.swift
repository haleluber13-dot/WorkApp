import Foundation

// MARK: - Domain model
//
// Mirrors the production workbook one-to-one. Every column of every sheet
// (הפקה / קיטריינג / רכבים / ניקיון / שמירה) appears here as a slot or field,
// so the app is a superset of the spreadsheet rather than a reinterpretation.
// The shape matches the web app's model.js exactly, which is what lets both
// clients share one Supabase project.

// MARK: Departments

enum Dept: String, Codable, CaseIterable, Identifiable {
    case production, camera, sound, lighting, catering, vehicles, cleaning, security, cast

    var id: String { rawValue }

    var he: String {
        switch self {
        case .production: return "הפקה"
        case .camera:     return "מצלמה"
        case .sound:      return "סאונד"
        case .lighting:   return "תאורה"
        case .catering:   return "קיטרינג"
        case .vehicles:   return "רכבים"
        case .cleaning:   return "ניקיון"
        case .security:   return "שמירה"
        case .cast:       return "שחקנים"
        }
    }

    /// Hex fills chosen so white or near-black initials clear 4.5:1 on top.
    var hex: String {
        switch self {
        case .production: return "#F5A524"
        case .camera:     return "#0072E5"
        case .sound:      return "#B034EF"
        case .lighting:   return "#FFD60A"
        case .catering:   return "#30D158"
        case .vehicles:   return "#5E5CE6"
        case .cleaning:   return "#64D2FF"
        case .security:   return "#EC0D00"
        case .cast:       return "#E9002F"
        }
    }
}

// MARK: Crew slots — the columns of each sheet

struct CrewSlot: Identifiable, Hashable {
    let slot: String      // stable key, shared with the web client
    let he: String        // the exact spreadsheet column header
    let dept: Dept
    let short: String

    var id: String { slot }
}

enum Sheets {

    /// Sheet "הפקה", in the workbook's column order.
    static let crew: [CrewSlot] = [
        .init(slot: "pa_snr_1",  he: "ע הפקה ג", dept: .production, short: "ע.הפקה ג"),
        .init(slot: "pa_snr_2",  he: "ע הפקה ג", dept: .production, short: "ע.הפקה ג"),
        .init(slot: "pa_1",      he: "ע הפקה",   dept: .production, short: "ע.הפקה"),
        .init(slot: "pa_2",      he: "ע הפקה",   dept: .production, short: "ע.הפקה"),
        .init(slot: "water",     he: "נערת מים", dept: .production, short: "מים"),
        .init(slot: "cam_1",     he: "צלם 1",    dept: .camera,     short: "צלם 1"),
        .init(slot: "cam_2",     he: "צלם 2",    dept: .camera,     short: "צלם 2"),
        .init(slot: "cam_3",     he: "צלם 3",    dept: .camera,     short: "צלם 3"),
        .init(slot: "cam_ac_1",  he: "ע צלם",    dept: .camera,     short: "ע.צלם"),
        .init(slot: "cam_ac_2",  he: "ע צלם 2",  dept: .camera,     short: "ע.צלם 2"),
        .init(slot: "sound",     he: "מקליט",    dept: .sound,      short: "מקליט"),
        .init(slot: "boom",      he: "בום",      dept: .sound,      short: "בום"),
        .init(slot: "gaffer",    he: "תאורן",    dept: .lighting,   short: "תאורן"),
        .init(slot: "gaffer_ac", he: "ע תאורן",  dept: .lighting,   short: "ע.תאורן"),
        .init(slot: "grip",      he: "גריפ",     dept: .lighting,   short: "גריפ"),
    ]

    /// Sheet "ניקיון".
    static let cleaning: [CrewSlot] = [
        .init(slot: "cleaner_1", he: "מנקה", dept: .cleaning, short: "מנקה 1"),
        .init(slot: "cleaner_2", he: "מנקה", dept: .cleaning, short: "מנקה 2"),
    ]

    /// Sheet "שמירה" — present but empty in the workbook; built out here.
    static let security: [CrewSlot] = [
        .init(slot: "guard_1", he: "שומר", dept: .security, short: "שומר 1"),
        .init(slot: "guard_2", he: "שומר", dept: .security, short: "שומר 2"),
    ]

    static let all: [CrewSlot] = crew + cleaning + security

    static func slot(_ key: String) -> CrewSlot? { all.first { $0.slot == key } }

    /// Sheet "רכבים".
    static let vehicles: [(slot: String, he: String)] = [
        ("truck",         "משאית"),
        ("art",           "ארט"),
        ("prod_camera",   "הפקה - מצלמה"),
        ("lighting_grip", "תאורה גריפ"),
        ("camp",          "מחנה"),
        ("production",    "הפקה"),
        ("props",         "פרופס"),
        ("scouter",       "סקאוטר"),
    ]

    /// Sheet "קיטריינג".
    static let cateringFields: [(key: String, he: String)] = [
        ("crew",             "צוות"),
        ("actors",           "שחקנים"),
        ("extras",           "ניצבים/ביטים"),
        ("orderedBreakfast", "הוזמן בוקר"),
        ("orderedLunch",     "הוזמן צהריים"),
        ("ateBreakfast",     "אכלו בוקר"),
        ("ateLunch",         "אכלו צהריים"),
    ]

    /// Numbered when a header repeats, so "ע הפקה ג" ×2 reads unambiguously.
    static func labels(for slots: [CrewSlot]) -> [String] {
        var totals: [String: Int] = [:]
        for s in slots { totals[s.he, default: 0] += 1 }
        var seen: [String: Int] = [:]
        return slots.map { s in
            seen[s.he, default: 0] += 1
            return totals[s.he]! > 1 ? "\(s.he) \(seen[s.he]!)" : s.he
        }
    }
}

// MARK: Call status

enum CallStatus: String, Codable, CaseIterable, Identifiable {
    case pending, confirmed, onset, out

    var id: String { rawValue }

    var he: String {
        switch self {
        case .pending:   return "ממתין"
        case .confirmed: return "אושר"
        case .onset:     return "בסט"
        case .out:       return "לא מגיע"
        }
    }

    var hex: String {
        switch self {
        case .pending:   return "#FF9F0A"
        case .confirmed: return "#30D158"
        case .onset:     return "#0A84FF"
        case .out:       return "#FF453A"
        }
    }
}

// MARK: Records

struct Person: Identifiable, Codable, Hashable {
    var id: String = "per_" + String(UUID().uuidString.prefix(12)).lowercased()
    var name: String = ""
    var phone: String = ""
    var email: String = ""
    var dept: Dept = .production
    var defaultSlot: String = ""
    var homeBase: String = ""       // where they travel from — drives pickups
    var notes: String = ""
    var updatedAt: Double = Date().timeIntervalSince1970 * 1000
}

struct Location: Identifiable, Codable, Hashable {
    var id: String = "loc_" + String(UUID().uuidString.prefix(12)).lowercased()
    var name: String = ""
    var address: String = ""
    var lat: Double?
    var lng: Double?
    var parking: String = ""
    var notes: String = ""
    var updatedAt: Double = Date().timeIntervalSince1970 * 1000

    var hasCoords: Bool { lat != nil && lng != nil }
}

struct CallInfo: Codable, Hashable {
    var time: String = ""
    var status: CallStatus = .pending
    var locationId: String = ""
    var note: String = ""
}

struct VehicleAssignment: Codable, Hashable {
    var driverId: String = ""
    var plate: String = ""
    var note: String = ""
}

struct ShootDay: Identifiable, Codable, Hashable {
    var id: String = "day_" + String(UUID().uuidString.prefix(12)).lowercased()
    var date: String = ShootDay.isoToday()          // "yyyy-MM-dd"
    var title: String = ""
    var locationId: String = ""
    var generalCall: String = "07:00"               // קריאה כללית
    var shootingCall: String = "08:00"              // תחילת צילום
    var wrap: String = "19:00"                      // סיום
    var slots: [String: String] = [:]               // slotKey -> personId
    var calls: [String: CallInfo] = [:]             // personId -> override
    var catering: [String: Int] = [:]
    var vehicles: [String: VehicleAssignment] = [:]
    var notes: String = ""
    var updatedAt: Double = Date().timeIntervalSince1970 * 1000

    private enum CodingKeys: String, CodingKey {
        case id, date, title, locationId, generalCall, shootingCall, wrap
        case slots, calls, catering, vehicles, notes, updatedAt
    }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id           = try c.decodeIfPresent(String.self, forKey: .id) ?? ShootDay().id
        date         = try c.decodeIfPresent(String.self, forKey: .date) ?? ShootDay.isoToday()
        title        = try c.decodeIfPresent(String.self, forKey: .title) ?? ""
        locationId   = try c.decodeIfPresent(String.self, forKey: .locationId) ?? ""
        generalCall  = try c.decodeIfPresent(String.self, forKey: .generalCall) ?? "07:00"
        shootingCall = try c.decodeIfPresent(String.self, forKey: .shootingCall) ?? "08:00"
        wrap         = try c.decodeIfPresent(String.self, forKey: .wrap) ?? "19:00"
        slots        = try c.decodeIfPresent([String: String].self, forKey: .slots) ?? [:]
        calls        = try c.decodeIfPresent([String: CallInfo].self, forKey: .calls) ?? [:]
        vehicles     = try c.decodeIfPresent([String: VehicleAssignment].self, forKey: .vehicles) ?? [:]
        notes        = try c.decodeIfPresent(String.self, forKey: .notes) ?? ""
        updatedAt    = try c.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0

        // A cleared catering field arrives as null from the web client.
        let raw = try c.decodeIfPresent([String: Int?].self, forKey: .catering) ?? [:]
        catering = raw.compactMapValues { $0 }
    }

    static func isoToday(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}

// MARK: A resolved place on the roster

struct RosterEntry: Identifiable, Hashable {
    var person: Person
    var slots: [String]
    var vehicles: [String]
    var call: CallInfo
    var isOverride: Bool

    var id: String { person.id }

    var roleLabels: [String] {
        var out = slots.compactMap { Sheets.slot($0)?.short }
        if !vehicles.isEmpty { out.append("נהג") }
        return out
    }
}

// MARK: Settings

enum NavApp: String, Codable, CaseIterable, Identifiable {
    case waze, apple, google
    var id: String { rawValue }
    var he: String {
        switch self {
        case .waze:   return "ווייז"
        case .apple:  return "מפות אפל"
        case .google: return "גוגל מפות"
        }
    }
}

enum ThemeChoice: String, Codable, CaseIterable, Identifiable {
    case auto, light, dark
    var id: String { rawValue }
    var he: String {
        switch self {
        case .auto:  return "אוטומטי"
        case .light: return "בהיר"
        case .dark:  return "כהה"
        }
    }
}

struct SyncConfig: Codable, Hashable {
    var url: String = ""
    var anonKey: String = ""
    var projectId: String = "default"
    var enabled: Bool = false

    var isUsable: Bool { enabled && !url.isEmpty && !anonKey.isEmpty }
}

struct AppSettings: Codable, Hashable {
    var productionName: String = "ההפקה שלי"
    var theme: ThemeChoice = .auto
    var navApp: NavApp = .waze
    var sync: SyncConfig = SyncConfig()
}

// MARK: Whole-app state, as persisted and as synced

struct AppState: Codable {
    var people: [Person] = []
    var locations: [Location] = []
    var days: [ShootDay] = []
    var settings: AppSettings = AppSettings()
    var deleted: [String: Double] = [:]     // id -> epoch ms, tombstones for sync
}

// MARK: - Hebrew date helpers

enum HebDate {
    static let weekdays = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]

    static func parse(_ iso: String) -> Date? {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso)
    }

    /// "יום שלישי, 25.8.2026"
    static func long(_ iso: String) -> String {
        guard let d = parse(iso) else { return iso }
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "he_IL")
        let c = cal.dateComponents([.year, .month, .day, .weekday], from: d)
        let wd = weekdays[(c.weekday ?? 1) - 1]
        return "יום \(wd), \(c.day ?? 0).\(c.month ?? 0).\(c.year ?? 0)"
    }

    /// "25.8"
    static func short(_ iso: String) -> String {
        guard let d = parse(iso) else { return iso }
        let c = Calendar(identifier: .gregorian).dateComponents([.month, .day], from: d)
        return "\(c.day ?? 0).\(c.month ?? 0)"
    }

    static func weekdayName(_ iso: String) -> String {
        guard let d = parse(iso) else { return "" }
        let wd = Calendar(identifier: .gregorian).component(.weekday, from: d)
        return weekdays[wd - 1]
    }

    /// Minutes from now until `time` ("HH:mm") on `iso`. Negative once past.
    static func minutesFromNow(iso: String, time: String) -> Int? {
        guard let day = parse(iso) else { return nil }
        let parts = time.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]) else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        guard let target = cal.date(bySettingHour: h, minute: m, second: 0, of: day) else { return nil }
        return Int((target.timeIntervalSinceNow / 60).rounded())
    }
}
