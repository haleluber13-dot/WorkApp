import SwiftUI

/// The five workbook sheets. Day mode fills in the current day one tappable
/// column at a time; grid mode shows the familiar table across all days in
/// the workbook's own column order.
struct SheetsView: View {
    @EnvironmentObject var store: Store
    @State private var creating = false

    var body: some View {
        NavigationStack {
            Group {
                if let day = store.currentDay {
                    SheetsBody(day: day)
                } else {
                    EmptyState(
                        icon: "tablecells",
                        title: "אין יום צילום פעיל",
                        message: "הגיליונות ממלאים את עצמם לפי יום — צרו יום צילום כדי להתחיל.",
                        actionTitle: "יום צילום חדש") { creating = true }
                }
            }
            .navigationTitle("גיליונות")
            .sheet(isPresented: $creating) { DayEditor(draft: ShootDay(), isNew: true) }
        }
    }
}

enum SheetTab: String, CaseIterable, Identifiable {
    case production, catering, vehicles, cleaning, security
    var id: String { rawValue }
    var he: String {
        switch self {
        case .production: return "הפקה"
        case .catering:   return "קיטריינג"
        case .vehicles:   return "רכבים"
        case .cleaning:   return "ניקיון"
        case .security:   return "שמירה"
        }
    }
}

struct SheetsBody: View {
    @EnvironmentObject var store: Store
    let day: ShootDay

    @State private var tab: SheetTab = .production
    @State private var showGrid = false
    @State private var pickingSlot: String?
    @State private var editingVehicle: String?
    @State private var editingDay = false

    var body: some View {
        VStack(spacing: 0) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(SheetTab.allCases) { t in
                        Button { tab = t } label: {
                            Text(t.he)
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 12).padding(.vertical, 7)
                                .background(tab == t ? Color(hex: "#F5A524") : Color(.tertiarySystemFill),
                                            in: Capsule())
                                .foregroundStyle(tab == t ? Color(hex: "#1A1206") : Color.primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
            }

            Picker("", selection: $showGrid) {
                Text("היום").tag(false)
                Text("טבלה מלאה").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16)
            .padding(.bottom, 8)

            if showGrid {
                GridSheet(tab: tab)
            } else {
                List {
                    Section {
                        HStack {
                            Text(HebDate.long(day.date)).font(.footnote).foregroundStyle(.secondary)
                            Spacer()
                            Button("שינוי יום") { editingDay = true }.font(.footnote)
                        }
                    }
                    .listRowBackground(Color.clear)

                    dayContent
                }
            }
        }
        .sheet(item: Binding(get: { pickingSlot.map { IdentifiableString($0) } },
                             set: { pickingSlot = $0?.value })) { wrapper in
            PersonPicker(title: label(for: wrapper.value),
                         slot: wrapper.value,
                         selectedId: day.slots[wrapper.value]) { id in
                store.assign(day: day.id, slot: wrapper.value, personId: id)
            }
        }
        .sheet(item: Binding(get: { editingVehicle.map { IdentifiableString($0) } },
                             set: { editingVehicle = $0?.value })) { wrapper in
            VehicleEditor(day: day, vslot: wrapper.value,
                          draft: day.vehicles[wrapper.value] ?? VehicleAssignment())
        }
        .sheet(isPresented: $editingDay) { DayEditor(draft: day, isNew: false) }
    }

    // MARK: Day mode

    @ViewBuilder
    private var dayContent: some View {
        switch tab {
        case .production: slotSection(Sheets.crew)
        case .cleaning:   slotSection(Sheets.cleaning)
        case .security:   slotSection(Sheets.security)
        case .vehicles:   vehicleSection
        case .catering:   cateringSection
        }
    }

    private func slotSection(_ slots: [CrewSlot]) -> some View {
        let labels = Sheets.labels(for: slots)
        return Section {
            ForEach(Array(slots.enumerated()), id: \.element.id) { i, slot in
                let person = day.slots[slot.slot].flatMap { store.person($0) }
                let dial: (() -> Void)? = {
                    guard let p = person, Actions.hasPhone(p) else { return nil }
                    return { Actions.call(p) }
                }()
                SlotRow(label: labels[i],
                        person: person,
                        time: person.flatMap { day.calls[$0.id]?.time },
                        onTap: { pickingSlot = slot.slot },
                        onCall: dial)
            }
        }
    }

    private var vehicleSection: some View {
        Section {
            ForEach(Sheets.vehicles, id: \.slot) { v in
                let rec = day.vehicles[v.slot]
                let driver = rec?.driverId.flatMap { store.person($0) }
                Button {
                    editingVehicle = v.slot
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "truck.box.fill")
                            .foregroundStyle(driver == nil ? Color.secondary : Color.accentColor)
                            .frame(width: 38)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(v.he).foregroundStyle(.primary)
                            Text([driver?.name ?? "ללא נהג", rec?.plate, rec?.note]
                                    .compactMap { $0 }.filter { !$0.isEmpty }
                                    .joined(separator: " · "))
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Image(systemName: "chevron.forward").foregroundStyle(.tertiary)
                    }
                }
            }
        }
    }

    private var cateringSection: some View {
        let c = day.catering
        let total = ["crew", "actors", "extras"].reduce(0) { $0 + (c[$1] ?? 0) }

        return Group {
            Section {
                HStack(spacing: 8) {
                    stat(total == 0 ? "—" : "\(total)", "סה״כ נפשות")
                    stat(c["orderedLunch"].map { String($0) } ?? "—", "הוזמן צהריים")
                    stat(c["ateLunch"].map { String($0) } ?? "—", "אכלו צהריים")
                }
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 16, bottom: 4, trailing: 16))

            Section("ספירת נפשות") {
                ForEach(Sheets.cateringFields.filter { ["crew", "actors", "extras"].contains($0.key) }, id: \.key) {
                    countRow($0.key, $0.he)
                }
            }
            Section("הוזמן") {
                ForEach(Sheets.cateringFields.filter { $0.key.hasPrefix("ordered") }, id: \.key) {
                    countRow($0.key, $0.he)
                }
            }
            Section("אכלו בפועל") {
                ForEach(Sheets.cateringFields.filter { $0.key.hasPrefix("ate") }, id: \.key) {
                    countRow($0.key, $0.he)
                }
            }
        }
    }

    private func stat(_ value: String, _ label: String) -> some View {
        VStack(spacing: 1) {
            Text(value).font(.title.bold().monospacedDigit())
            Text(label).font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 14))
    }

    /// A number field bound straight through to the day record. Writing on
    /// each edit means nothing is lost if the app is backgrounded mid-entry.
    ///
    /// Bound through a String rather than `Binding<Int?>`: an empty field has
    /// to mean "not filled in yet", which is different from zero, and the
    /// numeric TextField overloads can't express that.
    private func countRow(_ key: String, _ label: String) -> some View {
        let binding = Binding<String>(
            get: { store.day(day.id)?.catering[key].map { String($0) } ?? "" },
            set: { text in
                let cleaned = text.filter(\.isNumber)
                store.editDay(day.id) { d in
                    if let v = Int(cleaned) { d.catering[key] = v }
                    else { d.catering.removeValue(forKey: key) }
                }
            })
        return HStack {
            Text(label)
            Spacer()
            TextField("—", text: binding)
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 90)
        }
    }

    private func label(for slot: String) -> String {
        for group in [Sheets.crew, Sheets.cleaning, Sheets.security] {
            let labels = Sheets.labels(for: group)
            if let i = group.firstIndex(where: { $0.slot == slot }) { return labels[i] }
        }
        return ""
    }
}

// MARK: - Grid mode

struct GridSheet: View {
    @EnvironmentObject var store: Store
    let tab: SheetTab

    private var headers: [String] {
        switch tab {
        case .catering:   return ["תאריך"] + Sheets.cateringFields.map(\.he)
        case .vehicles:   return ["תאריך"] + Sheets.vehicles.map(\.he)
        case .production: return ["תאריך"] + Sheets.labels(for: Sheets.crew)
        case .cleaning:   return ["תאריך"] + Sheets.labels(for: Sheets.cleaning)
        case .security:   return ["תאריך"] + Sheets.labels(for: Sheets.security)
        }
    }

    private func cells(for day: ShootDay) -> [String] {
        func name(_ id: String?) -> String {
            guard let id, !id.isEmpty else { return "" }
            return store.person(id)?.name ?? ""
        }
        switch tab {
        case .catering:
            return [HebDate.short(day.date)]
                + Sheets.cateringFields.map { day.catering[$0.key].map { String($0) } ?? "" }
        case .vehicles:
            return [HebDate.short(day.date)] + Sheets.vehicles.map { v in
                let r = day.vehicles[v.slot]
                return [name(r?.driverId), r?.plate].compactMap { $0 }
                    .filter { !$0.isEmpty }.joined(separator: " · ")
            }
        case .production: return [HebDate.short(day.date)] + Sheets.crew.map { name(day.slots[$0.slot]) }
        case .cleaning:   return [HebDate.short(day.date)] + Sheets.cleaning.map { name(day.slots[$0.slot]) }
        case .security:   return [HebDate.short(day.date)] + Sheets.security.map { name(day.slots[$0.slot]) }
        }
    }

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Grid(alignment: .leading, horizontalSpacing: 0, verticalSpacing: 0) {
                GridRow {
                    ForEach(Array(headers.enumerated()), id: \.offset) { _, h in
                        Text(h)
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 11).padding(.vertical, 9)
                            .frame(minWidth: 92, alignment: .leading)
                            .background(Color(.tertiarySystemGroupedBackground))
                    }
                }
                ForEach(store.days) { day in
                    GridRow {
                        ForEach(Array(cells(for: day).enumerated()), id: \.offset) { _, cell in
                            Text(cell.isEmpty ? "—" : cell)
                                .font(.footnote)
                                .foregroundStyle(cell.isEmpty ? .tertiary : .primary)
                                .padding(.horizontal, 11).padding(.vertical, 9)
                                .frame(minWidth: 92, alignment: .leading)
                        }
                    }
                    Divider()
                }
            }
        }
        .background(Color(.secondarySystemGroupedBackground))
    }
}

/// `sheet(item:)` needs an Identifiable; a bare String isn't one.
struct IdentifiableString: Identifiable {
    let value: String
    var id: String { value }
    init(_ value: String) { self.value = value }
}
