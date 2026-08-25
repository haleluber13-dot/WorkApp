import SwiftUI

/// Initials on a department-coloured circle, with ink picked for contrast.
struct AvatarView: View {
    let name: String
    var size: CGFloat = 40
    var hex: String = "#8E8E93"

    private var initials: String {
        name.split(separator: " ").prefix(2).compactMap { $0.first }.map(String.init).joined()
    }

    var body: some View {
        Circle()
            .fill(Color(hex: hex))
            .frame(width: size, height: size)
            .overlay(
                Text(initials.isEmpty ? "?" : initials)
                    .font(.system(size: size * 0.38, weight: .bold))
                    .foregroundStyle(Color.ink(on: hex)))
    }
}

/// A small status pill — call status, counts, labels.
struct Pill: View {
    let text: String
    var hex: String?

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 9)
            .padding(.vertical, 3)
            .background(hex.map { Color(hex: $0) } ?? Color(.tertiarySystemFill),
                        in: Capsule())
            .foregroundStyle(hex.map { Color.ink(on: $0) } ?? Color.secondary)
    }
}

/// The quick-dial chip used in the contact bar on the Today screen.
struct ContactChip: View {
    let entry: RosterEntry
    var onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            VStack(spacing: 6) {
                AvatarView(name: entry.person.name, size: 54, hex: entry.person.dept.hex)
                    .overlay(alignment: .topTrailing) {
                        Circle()
                            .fill(Color(hex: entry.call.status.hex))
                            .frame(width: 14, height: 14)
                            .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2.5))
                            .offset(x: 2, y: -2)
                    }
                Text(entry.person.name)
                    .font(.system(size: 11, weight: .semibold))
                    .lineLimit(2)
                    .multilineTextAlignment(.center)
                if let role = entry.roleLabels.first {
                    Text(role)
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(width: 68)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(entry.person.name), \(entry.roleLabels.joined(separator: " "))")
    }
}

/// A tappable row for a spreadsheet column that may or may not be filled.
struct SlotRow: View {
    let label: String
    let person: Person?
    let time: String?
    var onTap: () -> Void
    var onCall: (() -> Void)?

    var body: some View {
        HStack(spacing: 12) {
            if let person {
                AvatarView(name: person.name, size: 38, hex: person.dept.hex)
            } else {
                Circle()
                    .fill(Color(.tertiarySystemFill))
                    .frame(width: 38, height: 38)
                    .overlay(Image(systemName: "plus").foregroundStyle(.tertiary))
            }

            Button(action: onTap) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(person?.name ?? "לא שובץ")
                        .font(.body)
                        .foregroundStyle(person == nil ? .tertiary : .primary)
                    Text(label)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let time, !time.isEmpty {
                Text(time)
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
                    .environment(\.layoutDirection, .leftToRight)
            }

            if let onCall {
                Button(action: onCall) {
                    Image(systemName: "phone.fill")
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.accentColor)
                .accessibilityLabel("חיוג ל\(person?.name ?? "")")
            }
        }
    }
}

/// Empty-state block used across the tabs.
struct EmptyState: View {
    let icon: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 42))
                .foregroundStyle(.tertiary)
            Text(title).font(.title3.bold())
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.vertical, 44)
    }
}

/// Digits stay in dialling order inside an otherwise right-to-left layout.
struct LTRText: View {
    let text: String
    var font: Font = .subheadline

    var body: some View {
        Text(text)
            .font(font)
            .environment(\.layoutDirection, .leftToRight)
    }
}
