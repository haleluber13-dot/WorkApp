import SwiftUI
import CoreLocation
import Combine

// MARK: - Person

struct PersonEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State var draft: Person
    var isNew: Bool
    var onSave: ((Person) -> Void)?

    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("שם מלא", text: $draft.name)
                    TextField("050-000-0000", text: $draft.phone)
                        .keyboardType(.phonePad)
                    Picker("מחלקה", selection: $draft.dept) {
                        ForEach(Dept.allCases) { Text($0.he).tag($0) }
                    }
                    Picker("תפקיד קבוע", selection: $draft.defaultSlot) {
                        Text("ללא").tag("")
                        ForEach(Sheets.all) { Text($0.short).tag($0.slot) }
                    }
                }

                Section {
                    TextField("אימייל (לא חובה)", text: $draft.email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("יוצא מ־ (עיר / אזור)", text: $draft.homeBase)
                } footer: {
                    Text("״יוצא מ־״ עוזר לתכנן איסופים ולהעריך זמני נסיעה.")
                }

                Section("הערות") {
                    TextField("ציוד, העדפות, מגבלות…", text: $draft.notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if !isNew {
                    Section {
                        Button("מחיקת איש קשר", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(isNew ? "איש קשר חדש" : "עריכת איש קשר")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("ביטול") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("שמירה") {
                        store.upsert(draft)
                        onSave?(draft)
                        dismiss()
                    }
                    .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("למחוק את \(draft.name)? הוא יוסר מכל ימי הצילום.",
                                isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("מחק", role: .destructive) {
                    store.deletePerson(draft.id)
                    dismiss()
                }
            }
        }
    }
}

// MARK: - Location

struct LocationEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State var draft: Location
    var isNew: Bool
    var onSave: ((Location) -> Void)?

    @StateObject private var locator = OneShotLocator()
    @State private var confirmDelete = false

    /// Coordinates are optional, and an empty field has to stay empty rather
    /// than collapsing to 0 — which rules out the numeric TextField overloads.
    private func coordinateField(_ label: String, _ placeholder: String,
                                 _ value: Binding<Double?>) -> some View {
        let text = Binding<String>(
            get: { value.wrappedValue.map { String($0) } ?? "" },
            set: { value.wrappedValue = Double($0.replacingOccurrences(of: ",", with: ".")) })
        return HStack {
            Text(label)
            Spacer()
            TextField(placeholder, text: text)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 130)
                .environment(\.layoutDirection, .leftToRight)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("לוקיישן / סט", text: $draft.name)
                    TextField("רחוב, עיר", text: $draft.address)
                    TextField("איפה חונים", text: $draft.parking)
                }

                Section {
                    coordinateField("קו רוחב", "32.0853", $draft.lat)
                    coordinateField("קו אורך", "34.7818", $draft.lng)
                    Button {
                        locator.request()
                    } label: {
                        Label(locator.isWorking ? "מאתר מיקום…" : "השתמש במיקום הנוכחי שלי",
                              systemImage: "location.fill")
                    }
                    .disabled(locator.isWorking)
                } footer: {
                    Text("קואורדינטות הן לא חובה. בלעדיהן הניווט מחפש לפי הכתובת; איתן הניווט מדויק גם בשטח פתוח בלי כתובת.")
                }

                Section("הערות") {
                    TextField("גישה, מפתחות, איש קשר בשטח…", text: $draft.notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if !isNew {
                    Section {
                        Button("מחיקת מיקום", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(isNew ? "מיקום חדש" : "עריכת מיקום")
            .navigationBarTitleDisplayMode(.inline)
            .onReceive(locator.$coordinate.compactMap { $0 }) { coord in
                draft.lat = coord.latitude
                draft.lng = coord.longitude
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("שמירה") {
                        store.upsert(draft)
                        onSave?(draft)
                        dismiss()
                    }
                    .disabled(draft.name.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .confirmationDialog("למחוק את המיקום \"\(draft.name)\"?",
                                isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("מחק", role: .destructive) {
                    store.deleteLocation(draft.id)
                    dismiss()
                }
            }
        }
    }
}

// MARK: - Person picker (fills a sheet slot)

struct PersonPicker: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    var title: String
    var slot: String?
    var selectedId: String?
    var allowNone: Bool = true
    var onPick: (String) -> Void

    @State private var query = ""
    @State private var creating = false

    /// People whose default role matches this slot float to the top, then the
    /// rest of the department, then everyone else.
    private var ordered: [Person] {
        let dept = slot.flatMap { Sheets.slot($0)?.dept }
        let filtered = query.isEmpty ? store.people : store.people.filter {
            "\($0.name) \($0.phone) \($0.dept.he)".localizedCaseInsensitiveContains(query)
        }
        return filtered.sorted { a, b in
            func rank(_ p: Person) -> Int {
                if let slot, p.defaultSlot == slot { return 0 }
                if let dept, p.dept == dept { return 1 }
                return 2
            }
            return rank(a) == rank(b)
                ? a.name.localizedCompare(b.name) == .orderedAscending
                : rank(a) < rank(b)
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if allowNone {
                    Button {
                        onPick("")
                        dismiss()
                    } label: {
                        HStack {
                            Text("להשאיר ריק").foregroundStyle(.primary)
                            Spacer()
                            if selectedId?.isEmpty ?? true {
                                Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }

                ForEach(ordered) { person in
                    Button {
                        onPick(person.id)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            AvatarView(name: person.name, size: 38, hex: person.dept.hex)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(person.name).foregroundStyle(.primary)
                                Text([person.dept.he,
                                      Sheets.slot(person.defaultSlot)?.short]
                                        .compactMap { $0 }.joined(separator: " · "))
                                    .font(.footnote)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            if person.defaultSlot == slot, slot != nil {
                                Pill(text: "ברירת מחדל")
                            }
                            if selectedId == person.id {
                                Image(systemName: "checkmark").foregroundStyle(Color.accentColor)
                            }
                        }
                    }
                }

                Section {
                    Button {
                        creating = true
                    } label: {
                        Label("איש קשר חדש", systemImage: "plus")
                    }
                }
            }
            .searchable(text: $query, prompt: "חיפוש")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
            }
            .sheet(isPresented: $creating) {
                PersonEditor(
                    draft: Person(dept: slot.flatMap { Sheets.slot($0)?.dept } ?? .production,
                                  defaultSlot: slot ?? ""),
                    isNew: true,
                    onSave: { person in
                        onPick(person.id)
                        dismiss()
                    })
            }
        }
    }
}

// MARK: - Per-person call time and status

struct CallEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    let day: ShootDay
    let person: Person
    @State var draft: CallInfo

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("שעת קריאה (HH:MM)", text: $draft.time)
                        .keyboardType(.numbersAndPunctuation)
                    Picker("מיקום", selection: $draft.locationId) {
                        Text("כמו היום").tag("")
                        ForEach(store.locations) { Text($0.name).tag($0.id) }
                    }
                } footer: {
                    Text("קריאה כללית ליום זה: \(day.generalCall). השאירו ריק כדי להשתמש בה.")
                }

                Section("סטטוס") {
                    Picker("סטטוס", selection: $draft.status) {
                        ForEach(CallStatus.allCases) { Text($0.he).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("הערה") {
                    TextField("איסוף, ציוד מיוחד…", text: $draft.note, axis: .vertical)
                        .lineLimit(2...5)
                }

                Section {
                    Button {
                        Actions.call(person)
                    } label: { Label("חיוג", systemImage: "phone.fill") }
                    Button {
                        Actions.whatsapp(person, text: Actions.callMessage(
                            day: day, person: person, call: draft,
                            location: store.location(draft.locationId.isEmpty ? day.locationId : draft.locationId)))
                    } label: { Label("שליחת קריאה בוואטסאפ", systemImage: "message.fill") }
                }
            }
            .navigationTitle(person.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("שמירה") {
                        store.setCall(day: day.id, person: person.id, draft)
                        dismiss()
                    }
                }
            }
        }
    }
}

// MARK: - Shoot day

struct DayEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State var draft: ShootDay
    var isNew: Bool
    var onSave: ((ShootDay) -> Void)?

    @State private var date = Date()
    @State private var addingLocation = false
    @State private var confirmDelete = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    DatePicker("תאריך", selection: $date, displayedComponents: .date)
                    TextField("יום 4 — סצנות 12-18", text: $draft.title)
                    Picker("מיקום", selection: $draft.locationId) {
                        Text("לא נבחר").tag("")
                        ForEach(store.locations) { Text($0.name).tag($0.id) }
                    }
                    Button {
                        addingLocation = true
                    } label: { Label("מיקום חדש", systemImage: "plus") }
                }

                Section("שעות") {
                    TextField("קריאה כללית", text: $draft.generalCall)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("תחילת צילום", text: $draft.shootingCall)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("סיום משוער", text: $draft.wrap)
                        .keyboardType(.numbersAndPunctuation)
                }

                Section("הערות הפקה") {
                    TextField("מזג אוויר, ציוד מיוחד, שינויים…", text: $draft.notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if !isNew {
                    Section {
                        Button("מחיקת יום", role: .destructive) { confirmDelete = true }
                    }
                }
            }
            .navigationTitle(isNew ? "יום צילום חדש" : "הגדרות היום")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear { date = HebDate.parse(draft.date) ?? Date() }
            .onChange(of: date) { _, new in draft.date = ShootDay.isoToday(new) }
            .sheet(isPresented: $addingLocation) {
                LocationEditor(draft: Location(), isNew: true) { loc in
                    draft.locationId = loc.id
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("שמירה") {
                        store.upsert(draft)
                        onSave?(draft)
                        dismiss()
                    }
                }
            }
            .confirmationDialog("למחוק את יום הצילום הזה על כל הנתונים שבו?",
                                isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("מחק", role: .destructive) {
                    store.deleteDay(draft.id)
                    dismiss()
                }
            }
        }
    }
}

// MARK: - Vehicle (sheet "רכבים")

struct VehicleEditor: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    let day: ShootDay
    let vslot: String
    @State var draft: VehicleAssignment

    @State private var pickingDriver = false

    private var label: String {
        Sheets.vehicles.first { $0.slot == vslot }?.he ?? "רכב"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("נהג") {
                    Button {
                        pickingDriver = true
                    } label: {
                        HStack(spacing: 12) {
                            if let p = store.person(draft.driverId) {
                                AvatarView(name: p.name, size: 36, hex: p.dept.hex)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(p.name).foregroundStyle(.primary)
                                    if !p.phone.isEmpty {
                                        LTRText(text: Actions.pretty(p.phone), font: .footnote)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            } else {
                                Circle().fill(Color(.tertiarySystemFill))
                                    .frame(width: 36, height: 36)
                                    .overlay(Image(systemName: "plus").foregroundStyle(.tertiary))
                                Text("שיוך נהג").foregroundStyle(.primary)
                            }
                            Spacer()
                            Image(systemName: "chevron.forward").foregroundStyle(.tertiary)
                        }
                    }
                }

                Section {
                    TextField("מספר רכב", text: $draft.plate)
                        .keyboardType(.numbersAndPunctuation)
                    TextField("מה נוסע ברכב הזה…", text: $draft.note, axis: .vertical)
                        .lineLimit(2...4)
                }
            }
            .navigationTitle(label)
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $pickingDriver) {
                PersonPicker(title: "נהג — \(label)", slot: nil, selectedId: draft.driverId) { id in
                    draft.driverId = id
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("שמירה") {
                        store.editDay(day.id) { $0.vehicles[vslot] = draft }
                        dismiss()
                    }
                }
            }
        }
    }
}
