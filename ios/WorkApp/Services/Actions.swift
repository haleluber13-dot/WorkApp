import Foundation
import SwiftUI
import UIKit

/// One-tap outbound actions: call, WhatsApp, SMS, navigate, share.
enum Actions {

    private static let israelCC = "972"

    // MARK: Phone normalisation
    //
    // Numbers get entered every which way — 050-123-4567, +972 50 1234567,
    // 0501234567. tel: tolerates all of them; WhatsApp needs strict E.164.

    static func digits(_ phone: String) -> String {
        phone.filter { $0.isNumber || $0 == "+" }
    }

    /// "0501234567" -> "972501234567"
    static func e164(_ phone: String) -> String {
        var d = digits(phone)
        if d.isEmpty { return "" }
        if d.hasPrefix("+")  { return String(d.dropFirst()) }
        if d.hasPrefix("00") { return String(d.dropFirst(2)) }
        if d.hasPrefix(israelCC) { return d }
        if d.hasPrefix("0")  { d.removeFirst(); return israelCC + d }
        return d
    }

    /// 050-123-4567 for display.
    static func pretty(_ phone: String) -> String {
        var d = digits(phone)
        if d.hasPrefix("+972") { d = "0" + d.dropFirst(4) }
        else if d.hasPrefix("972") { d = "0" + d.dropFirst(3) }
        if d.count == 10, d.hasPrefix("0") {
            let a = d.prefix(3), b = d.dropFirst(3).prefix(3), c = d.dropFirst(6)
            return "\(a)-\(b)-\(c)"
        }
        if d.count == 9, d.hasPrefix("0") {
            let a = d.prefix(2), b = d.dropFirst(2).prefix(3), c = d.dropFirst(5)
            return "\(a)-\(b)-\(c)"
        }
        return phone
    }

    static func hasPhone(_ person: Person) -> Bool { digits(person.phone).count >= 7 }

    // MARK: Opening

    private static func open(_ string: String) {
        guard let url = URL(string: string), UIApplication.shared.canOpenURL(url) else { return }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        UIApplication.shared.open(url)
    }

    static func call(_ person: Person) {
        guard hasPhone(person) else { return }
        open("tel:\(digits(person.phone))")
    }

    static func sms(_ person: Person, body: String = "") {
        guard hasPhone(person) else { return }
        let encoded = body.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        open("sms:\(digits(person.phone))" + (body.isEmpty ? "" : "&body=\(encoded)"))
    }

    static func whatsapp(_ person: Person, text: String = "") {
        guard hasPhone(person) else { return }
        let encoded = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        open("https://wa.me/\(e164(person.phone))" + (text.isEmpty ? "" : "?text=\(encoded)"))
    }

    // MARK: Navigation

    static func navigate(to location: Location, using app: NavApp) {
        let query = (location.address.isEmpty ? location.name : location.address)
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let coords = location.hasCoords ? "\(location.lat!),\(location.lng!)" : nil

        switch app {
        case .waze:
            open(coords.map { "https://waze.com/ul?ll=\($0)&navigate=yes" }
                 ?? "https://waze.com/ul?q=\(query)&navigate=yes")
        case .google:
            open("https://www.google.com/maps/dir/?api=1&destination=" + (coords ?? query))
        case .apple:
            open(coords.map { "https://maps.apple.com/?daddr=\($0)&dirflg=d" }
                 ?? "https://maps.apple.com/?daddr=\(query)&dirflg=d")
        }
    }

    // MARK: Message templates

    /// What one crew member is told about their own call.
    static func callMessage(day: ShootDay, person: Person, call: CallInfo, location: Location?) -> String {
        var lines = [
            "היי \(person.name),",
            HebDate.long(day.date) + (day.title.isEmpty ? "" : " — \(day.title)"),
            "שעת קריאה: \(call.time.isEmpty ? day.generalCall : call.time)",
        ]
        if let loc = location {
            lines.append("מיקום: \(loc.name)" + (loc.address.isEmpty ? "" : " — \(loc.address)"))
            if !loc.parking.isEmpty { lines.append("חניה: \(loc.parking)") }
        }
        if !call.note.isEmpty { lines.append("הערה: \(call.note)") }
        lines.append(contentsOf: ["", "נא לאשר קבלה 🙏"])
        return lines.joined(separator: "\n")
    }

    /// The whole day sheet, as WhatsApp-ready text.
    static func daySheet(day: ShootDay, location: Location?, roster: [RosterEntry]) -> String {
        var lines = ["📋 " + HebDate.long(day.date)]
        if !day.title.isEmpty { lines.append(day.title) }
        lines.append(contentsOf: [
            "",
            "קריאה כללית: \(day.generalCall)",
            "תחילת צילום: \(day.shootingCall)",
            "סיום משוער: \(day.wrap)",
        ])
        if let loc = location {
            lines.append("")
            lines.append("📍 \(loc.name)" + (loc.address.isEmpty ? "" : " — \(loc.address)"))
            if !loc.parking.isEmpty { lines.append("חניה: \(loc.parking)") }
        }
        if !roster.isEmpty {
            lines.append("")
            lines.append("👥 צוות:")
            for entry in roster {
                let roles = entry.roleLabels.joined(separator: "/")
                lines.append("\(entry.call.time) — \(entry.person.name)"
                             + (roles.isEmpty ? "" : " (\(roles))"))
            }
        }
        if !day.notes.isEmpty {
            lines.append("")
            lines.append("הערות: \(day.notes)")
        }
        return lines.joined(separator: "\n")
    }
}

// MARK: - Colour helpers

extension Color {
    /// #RRGGBB from the department palette.
    init(hex: String) {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        self.init(
            .sRGB,
            red:   Double((value >> 16) & 0xFF) / 255,
            green: Double((value >>  8) & 0xFF) / 255,
            blue:  Double( value        & 0xFF) / 255,
            opacity: 1)
    }

    /// Readable ink on a coloured fill. The palette spans very dark to very
    /// light, so a fixed white is unreadable on the lighting yellow.
    static func ink(on hex: String) -> Color {
        let cleaned = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        var value: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&value)
        func lin(_ c: Double) -> Double {
            c <= 0.03928 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4)
        }
        let r = lin(Double((value >> 16) & 0xFF) / 255)
        let g = lin(Double((value >>  8) & 0xFF) / 255)
        let b = lin(Double( value        & 0xFF) / 255)
        let L = 0.2126 * r + 0.7152 * g + 0.0722 * b
        return (1.05 / (L + 0.05)) >= ((L + 0.05) / 0.10) ? .white : Color(hex: "#141414")
    }
}
