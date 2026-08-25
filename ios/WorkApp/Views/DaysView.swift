import SwiftUI

/// The shoot calendar — every day, upcoming first, then what's already wrapped.
struct DaysView: View {
    @EnvironmentObject var store: Store
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Group {
                if store.days.isEmpty {
                    EmptyState(
                        icon: "calendar",
                        title: "לוח הצילומים ריק",
                        message: "כל יום צילום מרכז את הצוות, השעות והלוקיישן שלו — בדיוק כמו שורה בגיליון, רק שאפשר להתקשר ממנה.",
                        actionTitle: "יום צילום חדש") { creating = true }
                } else {
                    List {
                        let today = ShootDay.isoToday()
                        let upcoming = store.days.filter { $0.date >= today }
                        let past = store.days.filter { $0.date < today }.reversed()

                        if !upcoming.isEmpty {
                            Section("קרובים") { ForEach(upcoming) { row($0, today: today) } }
                        }
                        if !past.isEmpty {
                            Section("עברו") { ForEach(Array(past)) { row($0, today: today) } }
                        }
                    }
                }
            }
            .navigationTitle("ימים")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { creating = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("יום צילום חדש")
                }
            }
            .sheet(isPresented: $creating) { DayEditor(draft: ShootDay(), isNew: true) }
        }
    }

    private func row(_ day: ShootDay, today: String) -> some View {
        let loc = store.location(day.locationId)
        let count = store.roster(for: day).count
        let isToday = day.date == today

        return NavigationLink {
            DayDetailView(dayId: day.id)
        } label: {
            HStack(spacing: 12) {
                VStack(spacing: 0) {
                    Text(HebDate.weekdayName(day.date))
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(.secondary)
                    Text(HebDate.short(day.date))
                        .font(.title3.bold().monospacedDigit())
                        .foregroundStyle(isToday ? Color.accentColor : .primary)
                        .environment(\.layoutDirection, .leftToRight)
                }
                .frame(width: 48)

                VStack(alignment: .leading, spacing: 1) {
                    Text(day.title.isEmpty ? "יום צילום" : day.title)
                    Text([loc?.name, "\(count) אנשי צוות", "קריאה \(day.generalCall)"]
                            .compactMap { $0 }.joined(separator: " · "))
                        .font(.footnote).foregroundStyle(.secondary)
                }

                Spacer()
                if isToday { Pill(text: "היום", hex: "#F5A524") }
            }
        }
    }
}

/// A single day opened from the calendar: its sheets, in place.
struct DayDetailView: View {
    @EnvironmentObject var store: Store
    let dayId: String
    @State private var editing = false

    var body: some View {
        Group {
            if let day = store.day(dayId) {
                SheetsBody(day: day)
                    .navigationTitle(day.title.isEmpty ? HebDate.short(day.date) : day.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("עריכה") { editing = true }
                        }
                    }
                    .sheet(isPresented: $editing) { DayEditor(draft: day, isNew: false) }
            } else {
                EmptyState(icon: "calendar", title: "היום נמחק", message: "חזרו אחורה כדי לבחור יום אחר.")
            }
        }
    }
}
