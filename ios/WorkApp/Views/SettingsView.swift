import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var store: Store

    @State private var editingLocation: Location?
    @State private var addingLocation = false
    @State private var configuringSync = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ForEach(store.locations) { loc in
                        HStack(spacing: 12) {
                            Image(systemName: "mappin.circle.fill")
                                .foregroundStyle(Color.accentColor)
                            Button {
                                editingLocation = loc
                            } label: {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(loc.name).foregroundStyle(.primary)
                                    let sub = [loc.address, loc.parking.isEmpty ? nil : "חניה: \(loc.parking)"]
                                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                                    Text(sub.isEmpty ? "ללא כתובת" : sub)
                                        .font(.footnote).foregroundStyle(.secondary)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            Button {
                                Actions.navigate(to: loc, using: store.settings.navApp)
                            } label: { Image(systemName: "location.fill") }
                                .buttonStyle(.plain)
                                .foregroundStyle(Color.accentColor)
                                .accessibilityLabel("ניווט אל \(loc.name)")
                        }
                    }
                    Button { addingLocation = true } label: {
                        Label("מיקום חדש", systemImage: "plus")
                    }
                } header: {
                    Text("מיקומים")
                } footer: {
                    Text("מיקום שמור נותן ניווט בלחיצה אחת מכל מסך באפליקציה.")
                }

                Section {
                    Picker("אפליקציית ניווט", selection: Binding(
                        get: { store.settings.navApp },
                        set: { v in store.updateSettings { $0.navApp = v } })) {
                        ForEach(NavApp.allCases) { Text($0.he).tag($0) }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("ניווט")
                } footer: {
                    Text("כפתורי הניווט באפליקציה ייפתחו באפליקציה שבחרתם.")
                }

                Section("מראה") {
                    Picker("ערכת נושא", selection: Binding(
                        get: { store.settings.theme },
                        set: { v in store.updateSettings { $0.theme = v } })) {
                        ForEach(ThemeChoice.allCases) { Text($0.he).tag($0) }
                    }
                    .pickerStyle(.segmented)
                }

                Section("ההפקה") {
                    TextField("שם ההפקה", text: Binding(
                        get: { store.settings.productionName },
                        set: { v in store.updateSettings { $0.productionName = v } }))
                }

                Section {
                    Button { configuringSync = true } label: {
                        HStack {
                            Image(systemName: "icloud")
                                .foregroundStyle(store.settings.sync.enabled ? .green : .secondary)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(store.settings.sync.enabled ? "סנכרון פעיל" : "הפעלת סנכרון")
                                    .foregroundStyle(.primary)
                                Text(store.settings.sync.enabled
                                     ? "פרויקט: \(store.settings.sync.projectId)"
                                     : "שיתוף הנתונים עם הצוות בין מכשירים")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.forward").foregroundStyle(.tertiary)
                        }
                    }
                    if store.settings.sync.enabled {
                        Button("סנכרון עכשיו") { store.syncNow() }
                    }
                } header: {
                    HStack {
                        Text("סנכרון צוות")
                        Spacer()
                        syncBadge
                    }
                } footer: {
                    Text("בלי סנכרון האפליקציה עובדת במלואה על המכשיר. עם סנכרון, כל מי שמזין את אותם פרטי חיבור רואה את אותם ימים, אנשי קשר ומיקומים.")
                }

                Section {
                    Text("יומן הפקה · גרסה 1.0")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
                .listRowBackground(Color.clear)
            }
            .navigationTitle("הגדרות")
            .sheet(isPresented: $addingLocation) {
                LocationEditor(draft: Location(), isNew: true)
            }
            .sheet(item: $editingLocation) { loc in
                LocationEditor(draft: loc, isNew: false)
            }
            .sheet(isPresented: $configuringSync) { SyncSetupView() }
        }
    }

    @ViewBuilder
    private var syncBadge: some View {
        switch store.syncStatus {
        case .off:      Pill(text: "כבוי")
        case .syncing:  Pill(text: "מסנכרן…", hex: "#FF9F0A")
        case .offline:  Pill(text: "לא מקוון")
        case .error:    Pill(text: "שגיאה", hex: "#EC0D00")
        case .ok(let at):
            Pill(text: "מסונכרן " + at.formatted(date: .omitted, time: .shortened), hex: "#30D158")
        }
    }
}

struct SyncSetupView: View {
    @EnvironmentObject var store: Store
    @Environment(\.dismiss) private var dismiss

    @State private var draft = SyncConfig()
    @State private var testing = false
    @State private var message: String?
    @State private var messageIsError = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://xxxx.supabase.co", text: $draft.url)
                        .keyboardType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("מפתח anon", text: $draft.anonKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    TextField("מזהה פרויקט", text: $draft.projectId)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("חיבור")
                } footer: {
                    Text("הסנכרון עובד מול פרויקט Supabase חינמי משלכם. צרו פרויקט, הריצו את הקובץ supabase/schema.sql, והדביקו כאן את הכתובת והמפתח הציבורי. מזהה הפרויקט מפריד בין הפקות שונות על אותו שרת.")
                }

                if let message {
                    Section {
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(messageIsError ? Color.red : Color.green)
                    }
                }

                Section {
                    Button {
                        Task { await test() }
                    } label: {
                        HStack {
                            Text("בדיקת חיבור")
                            if testing { Spacer(); ProgressView() }
                        }
                    }
                    .disabled(testing || draft.url.isEmpty || draft.anonKey.isEmpty)

                    if store.settings.sync.enabled {
                        Button("כיבוי סנכרון", role: .destructive) {
                            store.updateSettings { $0.sync.enabled = false }
                            dismiss()
                        }
                    }
                }
            }
            .navigationTitle("סנכרון צוות")
            .navigationBarTitleDisplayMode(.inline)
            .onAppear {
                draft = store.settings.sync
                if draft.projectId.isEmpty { draft.projectId = "default" }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("ביטול") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("הפעלה") { Task { await enable() } }
                        .disabled(testing || draft.url.isEmpty || draft.anonKey.isEmpty)
                }
            }
        }
    }

    private func test() async {
        testing = true
        defer { testing = false }
        switch await store.testSync(draft) {
        case .success:
            message = "✅ החיבור תקין"
            messageIsError = false
        case .failure(let e):
            message = "❌ " + (e.errorDescription ?? "שגיאה")
            messageIsError = true
        }
    }

    private func enable() async {
        testing = true
        defer { testing = false }
        switch await store.testSync(draft) {
        case .failure(let e):
            message = "❌ " + (e.errorDescription ?? "שגיאה")
            messageIsError = true
        case .success:
            var cfg = draft
            cfg.enabled = true
            if cfg.projectId.isEmpty { cfg.projectId = "default" }
            store.updateSettings { $0.sync = cfg }
            store.syncNow()
            dismiss()
        }
    }
}
