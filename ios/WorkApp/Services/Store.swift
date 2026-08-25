import Foundation
import Combine

/// Local-first state.
///
/// Everything is held in memory and written to a JSON file in Application
/// Support. That keeps the app fully usable with no signal, which is the
/// normal condition on location. Team sync is a background reconciliation on
/// top, never a precondition for using the app.
@MainActor
final class Store: ObservableObject {

    @Published private(set) var state = AppState()

    /// Set by Sync so the UI can show what the connection is doing.
    @Published var syncStatus: SyncStatus = .off

    enum SyncStatus: Equatable {
        case off, syncing, ok(Date), offline, error(String)
    }

    private let fileURL: URL
    private var saveTask: Task<Void, Never>?
    private lazy var sync = Sync(store: self)

    init(filename: String = "workapp-state.json") {
        let dir = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent(filename)
        load()
    }

    // MARK: Persistence

    private func load() {
        guard let data = try? Data(contentsOf: fileURL) else { return }
        if let decoded = try? JSONDecoder().decode(AppState.self, from: data) {
            state = decoded
        }
    }

    /// Debounced write — typing into a text field shouldn't hit the disk on
    /// every keystroke.
    private func scheduleSave() {
        saveTask?.cancel()
        let snapshot = state
        saveTask = Task { [fileURL] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled else { return }
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.withoutEscapingSlashes]
            if let data = try? encoder.encode(snapshot) {
                try? data.write(to: fileURL, options: .atomic)
            }
        }
    }

    /// Flush immediately — used when the app is backgrounded.
    func saveNow() {
        saveTask?.cancel()
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        if let data = try? encoder.encode(state) {
            try? data.write(to: fileURL, options: .atomic)
        }
    }

    private func mutate(pushes: Bool = true, _ block: (inout AppState) -> Void) {
        block(&state)
        scheduleSave()
        if pushes && state.settings.sync.isUsable {
            Task { await sync.push() }
        }
    }

    /// Replace wholesale — sync pull and backup restore only.
    func replace(with next: AppState) {
        state = next
        saveNow()
    }

    // MARK: People

    var people: [Person] { state.people }

    func person(_ id: String) -> Person? { state.people.first { $0.id == id } }

    func upsert(_ person: Person) {
        var p = person
        p.updatedAt = Date().timeIntervalSince1970 * 1000
        mutate { s in
            if let i = s.people.firstIndex(where: { $0.id == p.id }) { s.people[i] = p }
            else { s.people.append(p) }
        }
    }

    func deletePerson(_ id: String) {
        mutate { s in
            s.people.removeAll { $0.id == id }
            s.deleted[id] = Date().timeIntervalSince1970 * 1000
            // Unassign everywhere so no sheet points at a ghost.
            for i in s.days.indices {
                s.days[i].slots = s.days[i].slots.filter { $0.value != id }
                s.days[i].calls.removeValue(forKey: id)
                for (k, v) in s.days[i].vehicles where v.driverId == id {
                    s.days[i].vehicles[k]?.driverId = ""
                }
                s.days[i].updatedAt = Date().timeIntervalSince1970 * 1000
            }
        }
    }

    // MARK: Locations

    var locations: [Location] { state.locations }

    func location(_ id: String) -> Location? { state.locations.first { $0.id == id } }

    func upsert(_ location: Location) {
        var l = location
        l.updatedAt = Date().timeIntervalSince1970 * 1000
        mutate { s in
            if let i = s.locations.firstIndex(where: { $0.id == l.id }) { s.locations[i] = l }
            else { s.locations.append(l) }
        }
    }

    func deleteLocation(_ id: String) {
        mutate { s in
            s.locations.removeAll { $0.id == id }
            s.deleted[id] = Date().timeIntervalSince1970 * 1000
            for i in s.days.indices where s.days[i].locationId == id {
                s.days[i].locationId = ""
            }
        }
    }

    // MARK: Days

    var days: [ShootDay] { state.days.sorted { $0.date < $1.date } }

    func day(_ id: String) -> ShootDay? { state.days.first { $0.id == id } }

    /// Today if it exists, else the next upcoming, else the most recent.
    var currentDay: ShootDay? {
        let today = ShootDay.isoToday()
        let all = days
        return all.first { $0.date == today }
            ?? all.first { $0.date > today }
            ?? all.last
    }

    func upsert(_ day: ShootDay) {
        var d = day
        d.updatedAt = Date().timeIntervalSince1970 * 1000
        mutate { s in
            if let i = s.days.firstIndex(where: { $0.id == d.id }) { s.days[i] = d }
            else { s.days.append(d) }
        }
    }

    func deleteDay(_ id: String) {
        mutate { s in
            s.days.removeAll { $0.id == id }
            s.deleted[id] = Date().timeIntervalSince1970 * 1000
        }
    }

    /// Apply an edit to one day in place.
    func editDay(_ id: String, _ block: (inout ShootDay) -> Void) {
        mutate { s in
            guard let i = s.days.firstIndex(where: { $0.id == id }) else { return }
            block(&s.days[i])
            s.days[i].updatedAt = Date().timeIntervalSince1970 * 1000
        }
    }

    func assign(day dayId: String, slot: String, personId: String?) {
        editDay(dayId) { d in
            if let pid = personId, !pid.isEmpty { d.slots[slot] = pid }
            else { d.slots.removeValue(forKey: slot) }
        }
    }

    func setCall(day dayId: String, person personId: String, _ call: CallInfo) {
        editDay(dayId) { $0.calls[personId] = call }
    }

    // MARK: Derived

    /// Everyone on a day, with their call time resolved against the day's
    /// general call, sorted into arrival waves.
    func roster(for day: ShootDay) -> [RosterEntry] {
        var bySlot: [String: (slots: [String], vehicles: [String])] = [:]

        for (slot, personId) in day.slots {
            bySlot[personId, default: ([], [])].slots.append(slot)
        }
        for (vslot, v) in day.vehicles where !v.driverId.isEmpty {
            bySlot[v.driverId, default: ([], [])].vehicles.append(vslot)
        }

        return bySlot.compactMap { personId, roles -> RosterEntry? in
            guard let person = person(personId) else { return nil }
            let override = day.calls[personId]
            var call = override ?? CallInfo()
            if call.time.isEmpty { call.time = day.generalCall }
            if call.locationId.isEmpty { call.locationId = day.locationId }
            return RosterEntry(
                person: person,
                // Keep the workbook's column order, not dictionary order.
                slots: roles.slots.sorted { a, b in
                    (Sheets.all.firstIndex { $0.slot == a } ?? 0)
                        < (Sheets.all.firstIndex { $0.slot == b } ?? 0)
                },
                vehicles: roles.vehicles.sorted(),
                call: call,
                isOverride: !(override?.time.isEmpty ?? true))
        }
        .sorted {
            $0.call.time == $1.call.time
                ? $0.person.name.localizedCompare($1.person.name) == .orderedAscending
                : $0.call.time < $1.call.time
        }
    }

    // MARK: Settings

    var settings: AppSettings { state.settings }

    func updateSettings(_ block: (inout AppSettings) -> Void) {
        mutate(pushes: false) { block(&$0.settings) }
    }

    // MARK: Sync entry points

    func startSync() { Task { await sync.start() } }
    func syncNow() { Task { await sync.pull(); await sync.push() } }
    func testSync(_ cfg: SyncConfig) async -> Result<Void, SyncError> { await sync.test(cfg) }
}
