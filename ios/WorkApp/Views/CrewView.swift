import SwiftUI

/// The contact book — grouped by department, searchable, one tap to reach anyone.
struct CrewView: View {
    @EnvironmentObject var store: Store

    @State private var query = ""
    @State private var deptFilter: Dept?
    @State private var editing: Person?
    @State private var creating = false

    private var filtered: [Person] {
        store.people
            .filter { person in
                if let deptFilter, person.dept != deptFilter { return false }
                guard !query.isEmpty else { return true }
                let haystack = [person.name, person.phone, person.homeBase, person.dept.he,
                                Sheets.slot(person.defaultSlot)?.short ?? ""].joined(separator: " ")
                return haystack.localizedCaseInsensitiveContains(query)
            }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private var usedDepts: [Dept] {
        Dept.allCases.filter { d in store.people.contains { $0.dept == d } }
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.people.isEmpty {
                    EmptyState(
                        icon: "person.2",
                        title: "אין עדיין אנשי קשר",
                        message: "הוסיפו את הצוות פעם אחת — ומשם כל שיבוץ ליום צילום הוא בחירה מרשימה, לא הקלדה מחדש.",
                        actionTitle: "איש קשר ראשון") { creating = true }
                } else {
                    List {
                        if usedDepts.count > 1 {
                            Section {
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        chip(title: "הכל · \(store.people.count)",
                                             selected: deptFilter == nil, hex: nil) { deptFilter = nil }
                                        ForEach(usedDepts) { d in
                                            let n = store.people.filter { $0.dept == d }.count
                                            chip(title: "\(d.he) · \(n)",
                                                 selected: deptFilter == d, hex: d.hex) {
                                                deptFilter = deptFilter == d ? nil : d
                                            }
                                        }
                                    }
                                    .padding(.vertical, 4)
                                }
                            }
                            .listRowInsets(EdgeInsets(top: 0, leading: 16, bottom: 0, trailing: 16))
                            .listRowBackground(Color.clear)
                        }

                        ForEach(grouped, id: \.0) { dept, people in
                            Section {
                                ForEach(people) { person in row(person) }
                            } header: {
                                HStack(spacing: 7) {
                                    Circle().fill(Color(hex: dept.hex)).frame(width: 8, height: 8)
                                    Text(dept.he).foregroundStyle(.primary)
                                    Spacer()
                                    Text("\(people.count)")
                                }
                            }
                        }
                    }
                    .searchable(text: $query, prompt: "חיפוש לפי שם, תפקיד או טלפון")
                }
            }
            .navigationTitle("אנשי קשר")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button { creating = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("איש קשר חדש")
                }
            }
            .sheet(isPresented: $creating) { PersonEditor(draft: Person(), isNew: true) }
            .sheet(item: $editing) { person in PersonEditor(draft: person, isNew: false) }
        }
    }

    private var grouped: [(Dept, [Person])] {
        Dept.allCases.compactMap { d in
            let list = filtered.filter { $0.dept == d }
            return list.isEmpty ? nil : (d, list)
        }
    }

    private func chip(title: String, selected: Bool, hex: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 11).padding(.vertical, 6)
                .background(selected ? Color(hex: hex ?? "#F5A524") : Color(.tertiarySystemFill),
                            in: Capsule())
                .foregroundStyle(selected ? Color.ink(on: hex ?? "#F5A524") : Color.primary)
        }
        .buttonStyle(.plain)
    }

    private func row(_ person: Person) -> some View {
        HStack(spacing: 12) {
            AvatarView(name: person.name, size: 42, hex: person.dept.hex)

            Button {
                editing = person
            } label: {
                VStack(alignment: .leading, spacing: 1) {
                    Text(person.name).foregroundStyle(.primary)
                    let meta = [Sheets.slot(person.defaultSlot)?.short, person.homeBase]
                        .compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                    if !meta.isEmpty {
                        Text(meta).font(.footnote).foregroundStyle(.secondary)
                    }
                    // Its own line: on one line the RTL truncation eats the
                    // leading digits, which makes the number worse than useless.
                    if !person.phone.isEmpty {
                        LTRText(text: Actions.pretty(person.phone), font: .footnote)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if Actions.hasPhone(person) {
                Button { Actions.call(person) } label: { Image(systemName: "phone.fill") }
                    .buttonStyle(.plain).foregroundStyle(Color.accentColor)
                    .accessibilityLabel("חיוג ל\(person.name)")
                Button { Actions.whatsapp(person) } label: { Image(systemName: "message.fill") }
                    .buttonStyle(.plain).foregroundStyle(Color.accentColor)
                    .accessibilityLabel("וואטסאפ ל\(person.name)")
            }
        }
    }
}
