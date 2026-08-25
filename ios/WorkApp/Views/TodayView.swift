import SwiftUI
import UIKit

/// The screen that replaces the daily spreadsheet row: times, location,
/// the quick-dial contact bar, and the roster grouped into arrival waves.
struct TodayView: View {
    @EnvironmentObject var store: Store

    @State private var editingDay = false
    @State private var addingCrew = false
    @State private var selectedEntry: RosterEntry?
    @State private var sharing = false

    private var day: ShootDay? { store.currentDay }

    var body: some View {
        NavigationStack {
            Group {
                if let day {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) {
                            hero(day)
                            contactBar(day)
                            roster(day)
                            if !day.notes.isEmpty { notes(day) }
                        }
                        .padding(.vertical, 8)
                    }
                } else {
                    EmptyState(
                        icon: "calendar.badge.plus",
                        title: "אין עדיין ימי צילום",
                        message: "צרו את יום הצילום הראשון — ומשם תוכלו לשבץ צוות, לקבוע שעות קריאה ולנווט ללוקיישן בלחיצה אחת.",
                        actionTitle: "יום צילום חדש") { editingDay = true }
                }
            }
            .navigationTitle("היום")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { editingDay = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("יום צילום חדש")
                }
            }
            .sheet(isPresented: $editingDay) {
                DayEditor(draft: day ?? ShootDay(), isNew: day == nil)
            }
            .sheet(isPresented: $addingCrew) {
                if let day {
                    PersonPicker(title: "הוספה ליום", slot: nil, allowNone: false) { id in
                        assignToFirstFreeSlot(day: day, personId: id)
                    }
                }
            }
            .sheet(item: $selectedEntry) { entry in
                if let day { CrewActionSheet(day: day, entry: entry) }
            }
            .sheet(isPresented: $sharing) {
                if let day {
                    ShareSheet(text: Actions.daySheet(
                        day: day,
                        location: store.location(day.locationId),
                        roster: store.roster(for: day)))
                }
            }
        }
    }

    // MARK: Hero

    @ViewBuilder
    private func hero(_ day: ShootDay) -> some View {
        let loc = store.location(day.locationId)
        let entries = store.roster(for: day)
        let confirmed = entries.filter { $0.call.status == .confirmed || $0.call.status == .onset }.count
        let isToday = day.date == ShootDay.isoToday()

        let marks: [(String, String)] = [
            ("קריאה כללית", day.generalCall),
            ("תחילת צילום", day.shootingCall),
            ("סיום", day.wrap),
        ]
        // The next milestone still ahead of us is the live one.
        let activeIndex: Int? = isToday
            ? marks.firstIndex { (HebDate.minutesFromNow(iso: day.date, time: $0.1) ?? -1) >= 0 }
            : nil

        VStack(alignment: .leading, spacing: 10) {
            Text(HebDate.long(day.date) + (isToday ? " · היום" : ""))
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.78))

            Text(day.title.isEmpty ? "יום צילום" : day.title)
                .font(.title2.bold())
                .foregroundStyle(.white)

            if let loc {
                Button {
                    Actions.navigate(to: loc, using: store.settings.navApp)
                } label: {
                    Label(loc.address.isEmpty ? loc.name : "\(loc.name) — \(loc.address)",
                          systemImage: "mappin.and.ellipse")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.86))
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 8) {
                ForEach(Array(marks.enumerated()), id: \.offset) { i, mark in
                    VStack(spacing: 1) {
                        Text(mark.0)
                            .font(.system(size: 10, weight: .semibold))
                            .opacity(0.75)
                        Text(mark.1)
                            .font(.title3.bold().monospacedDigit())
                            .environment(\.layoutDirection, .leftToRight)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 9)
                    .background(i == activeIndex ? Color(hex: "#F5A524") : Color.white.opacity(0.1),
                                in: RoundedRectangle(cornerRadius: 12))
                    .foregroundStyle(i == activeIndex ? Color(hex: "#1A1206") : .white)
                }
            }
            .padding(.top, 6)

            if let i = activeIndex,
               let mins = HebDate.minutesFromNow(iso: day.date, time: marks[i].1) {
                Label(countdown(label: marks[i].0, minutes: mins), systemImage: "clock")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.9))
            }

            Label("\(entries.count) אנשי צוות · \(confirmed) אישרו", systemImage: "person.2")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.9))

            HStack(spacing: 8) {
                if let loc {
                    Button {
                        Actions.navigate(to: loc, using: store.settings.navApp)
                    } label: {
                        Label("ניווט", systemImage: "location.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(hex: "#F5A524"))
                    .foregroundStyle(Color(hex: "#1A1206"))
                }
                Button { editingDay = true } label: {
                    Label("עריכה", systemImage: "square.and.pencil").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.white)
                Button { sharing = true } label: {
                    Label("שיתוף", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.white)
            }
            .padding(.top, 4)
        }
        .padding(18)
        .background(
            LinearGradient(colors: [Color(hex: "#2B2118"), Color(hex: "#141414")],
                           startPoint: .topTrailing, endPoint: .bottomLeading),
            in: RoundedRectangle(cornerRadius: 20))
        .padding(.horizontal, 16)
    }

    private func countdown(label: String, minutes: Int) -> String {
        if minutes <= 0 { return "\(label) עכשיו" }
        if minutes > 90 { return "\(label) בעוד \(Int((Double(minutes) / 60).rounded())) שעות" }
        return "\(label) בעוד \(minutes) דקות"
    }

    // MARK: Contact bar

    @ViewBuilder
    private func contactBar(_ day: ShootDay) -> some View {
        let entries = store.roster(for: day)
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("אנשי קשר ליום הזה")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer()
                Pill(text: "\(entries.count)")
            }
            .padding(.horizontal, 20)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 14) {
                    ForEach(entries) { entry in
                        ContactChip(entry: entry) { selectedEntry = entry }
                    }
                    Button { addingCrew = true } label: {
                        VStack(spacing: 6) {
                            Circle()
                                .fill(Color(.tertiarySystemFill))
                                .frame(width: 54, height: 54)
                                .overlay(Image(systemName: "plus").font(.title3)
                                    .foregroundStyle(Color.accentColor))
                            Text("הוספה").font(.system(size: 11, weight: .semibold))
                        }
                        .frame(width: 68)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
            }
        }
    }

    // MARK: Roster, grouped into arrival waves

    @ViewBuilder
    private func roster(_ day: ShootDay) -> some View {
        let entries = store.roster(for: day)
        if entries.isEmpty {
            EmptyState(icon: "person.2",
                       title: "אין עדיין צוות ליום הזה",
                       message: "שבצו אנשי צוות מגיליון ההפקה, או הוסיפו ישירות מהסרגל למעלה.")
        } else {
            let waves = Dictionary(grouping: entries) { $0.call.time }
            VStack(alignment: .leading, spacing: 16) {
                Text("לוח קריאות")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 20)

                ForEach(waves.keys.sorted(), id: \.self) { time in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(time)
                                .font(.subheadline.bold().monospacedDigit())
                                .environment(\.layoutDirection, .leftToRight)
                            Spacer()
                            Text("\(waves[time]?.count ?? 0) אנשים")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 20)

                        VStack(spacing: 0) {
                            ForEach(waves[time] ?? []) { entry in
                                rosterRow(day: day, entry: entry)
                                if entry.id != waves[time]?.last?.id { Divider().padding(.leading, 68) }
                            }
                        }
                        .background(Color(.secondarySystemGroupedBackground),
                                    in: RoundedRectangle(cornerRadius: 14))
                        .padding(.horizontal, 16)
                    }
                }
            }
        }
    }

    private func rosterRow(day: ShootDay, entry: RosterEntry) -> some View {
        HStack(spacing: 12) {
            AvatarView(name: entry.person.name, size: 40, hex: entry.person.dept.hex)
            Button {
                selectedEntry = entry
            } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(entry.person.name).foregroundStyle(.primary)
                    Text(entry.roleLabels.joined(separator: " · ").isEmpty
                         ? entry.person.dept.he
                         : entry.roleLabels.joined(separator: " · "))
                        .font(.footnote).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            Circle().fill(Color(hex: entry.call.status.hex)).frame(width: 8, height: 8)

            if Actions.hasPhone(entry.person) {
                Button { Actions.call(entry.person) } label: { Image(systemName: "phone.fill") }
                    .buttonStyle(.plain).foregroundStyle(Color.accentColor)
                    .accessibilityLabel("חיוג ל\(entry.person.name)")
                Button {
                    Actions.whatsapp(entry.person, text: Actions.callMessage(
                        day: day, person: entry.person, call: entry.call,
                        location: store.location(entry.call.locationId)))
                } label: { Image(systemName: "message.fill") }
                    .buttonStyle(.plain).foregroundStyle(Color.accentColor)
                    .accessibilityLabel("וואטסאפ ל\(entry.person.name)")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 9)
    }

    @ViewBuilder
    private func notes(_ day: ShootDay) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("הערות הפקה")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 20)
            Text(day.notes)
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(Color(.secondarySystemGroupedBackground),
                            in: RoundedRectangle(cornerRadius: 14))
                .padding(.horizontal, 16)
        }
    }

    /// Put a newly added person into the slot that fits them best.
    private func assignToFirstFreeSlot(day: ShootDay, personId: String) {
        guard !personId.isEmpty, let person = store.person(personId) else { return }
        let free = Sheets.crew.first { day.slots[$0.slot] == nil && person.defaultSlot == $0.slot }
            ?? Sheets.crew.first { day.slots[$0.slot] == nil && $0.dept == person.dept }
            ?? Sheets.crew.first { day.slots[$0.slot] == nil }
        guard let slot = free else { return }
        store.assign(day: day.id, slot: slot.slot, personId: personId)
    }
}

// MARK: - The action sheet behind a contact chip

struct CrewActionSheet: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    let day: ShootDay
    let entry: RosterEntry

    @State private var editingCall = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        AvatarView(name: entry.person.name, size: 46, hex: entry.person.dept.hex)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.person.name).font(.headline)
                            Text([entry.person.dept.he, entry.roleLabels.joined(separator: " · ")]
                                    .filter { !$0.isEmpty }.joined(separator: " — "))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Pill(text: entry.call.status.he, hex: entry.call.status.hex)
                    }
                    .padding(.vertical, 4)
                }

                Section {
                    Button { editingCall = true } label: {
                        HStack {
                            Text("שעת קריאה").foregroundStyle(.primary)
                            Spacer()
                            LTRText(text: entry.call.time).foregroundStyle(.secondary)
                            Image(systemName: "chevron.forward").foregroundStyle(.tertiary)
                        }
                    }
                    if !entry.person.homeBase.isEmpty {
                        HStack {
                            Text("יוצא מ־")
                            Spacer()
                            Text(entry.person.homeBase).foregroundStyle(.secondary)
                        }
                    }
                    if let loc = store.location(entry.call.locationId) {
                        Button {
                            Actions.navigate(to: loc, using: store.settings.navApp)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text("מיקום").foregroundStyle(.primary)
                                    if !loc.address.isEmpty {
                                        Text(loc.address).font(.footnote).foregroundStyle(.secondary)
                                    }
                                }
                                Spacer()
                                Text(loc.name).foregroundStyle(.secondary)
                                Image(systemName: "location.fill").foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }

                Section {
                    Button {
                        Actions.call(entry.person)
                    } label: { Label("חיוג", systemImage: "phone.fill") }

                    Button {
                        Actions.whatsapp(entry.person, text: Actions.callMessage(
                            day: day, person: entry.person, call: entry.call,
                            location: store.location(entry.call.locationId)))
                    } label: { Label("שליחת קריאה בוואטסאפ", systemImage: "message.fill") }
                }

                Section {
                    Button("הסרה מהיום הזה", role: .destructive) {
                        store.editDay(day.id) { d in
                            for slot in entry.slots { d.slots.removeValue(forKey: slot) }
                            for v in entry.vehicles { d.vehicles[v]?.driverId = "" }
                        }
                        dismiss()
                    }
                }
            }
            .navigationTitle(entry.person.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("סגור") { dismiss() } }
            }
            .sheet(isPresented: $editingCall) {
                CallEditor(day: day, person: entry.person,
                           draft: day.calls[entry.person.id] ?? CallInfo())
            }
        }
    }
}

// MARK: - UIActivityViewController bridge

struct ShareSheet: UIViewControllerRepresentable {
    let text: String

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [text], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
