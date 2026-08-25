import Foundation

enum SyncError: LocalizedError {
    case badURL
    case notInstalled          // tables missing
    case unauthorised
    case server(Int)
    case offline

    var errorDescription: String? {
        switch self {
        case .badURL:       return "כתובת לא תקינה"
        case .notInstalled: return "הטבלאות לא נוצרו — הריצו את supabase/schema.sql"
        case .unauthorised: return "המפתח נדחה (anon key שגוי או RLS חוסם)"
        case .server(let c): return "שגיאת שרת \(c)"
        case .offline:      return "אין חיבור לשרת"
        }
    }
}

/// Optional team sync over Supabase's PostgREST endpoint.
///
/// Deliberately built on URLSession rather than the Supabase SDK: one fewer
/// dependency, and the wire format stays identical to the web client so both
/// can share a project. Records reconcile last-write-wins on `updatedAt`,
/// which is right here because a shoot day has one coordinator at a time.
actor Sync {

    private weak var store: Store?
    private var started = false

    init(store: Store) { self.store = store }

    // MARK: Config

    private func config() async -> SyncConfig? {
        guard let store else { return nil }
        let cfg = await store.settings.sync
        return cfg.isUsable ? cfg : nil
    }

    private func endpoint(_ cfg: SyncConfig, _ table: String) -> URL? {
        var base = cfg.url.trimmingCharacters(in: .whitespaces)
        while base.hasSuffix("/") { base.removeLast() }
        return URL(string: "\(base)/rest/v1/\(table)")
    }

    private func headers(_ cfg: SyncConfig, write: Bool) -> [String: String] {
        var h = [
            "apikey": cfg.anonKey,
            "Authorization": "Bearer \(cfg.anonKey)",
        ]
        if write {
            h["Content-Type"] = "application/json"
            h["Prefer"] = "resolution=merge-duplicates,return=minimal"
        }
        return h
    }

    // MARK: Wire format — mirrors the web client exactly

    private struct Row<T: Codable>: Codable {
        var id: String
        var project_id: String
        var updated_at: Double
        var data: T
    }

    // MARK: Public API

    func start() async {
        guard !started else { return }
        started = true
        await pull()
        await push()
    }

    func test(_ cfg: SyncConfig) async -> Result<Void, SyncError> {
        guard let url = endpoint(cfg, "people")?
            .appending(queryItems: [URLQueryItem(name: "select", value: "id"),
                                    URLQueryItem(name: "limit", value: "1")])
        else { return .failure(.badURL) }

        var req = URLRequest(url: url)
        headers(cfg, write: false).forEach { req.setValue($1, forHTTPHeaderField: $0) }

        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            switch code {
            case 200..<300: return .success(())
            case 404:       return .failure(.notInstalled)
            case 401, 403:  return .failure(.unauthorised)
            default:        return .failure(.server(code))
            }
        } catch {
            return .failure(.offline)
        }
    }

    /// Upload the whole local dataset. Cheap at production scale (tens of
    /// people, tens of days) and far more robust than tracking a dirty set.
    func push() async {
        guard let store, let cfg = await config() else { return }
        await MainActor.run { store.syncStatus = .syncing }

        let snapshot = await MainActor.run { store.state }
        do {
            try await upload(cfg, "people",    snapshot.people)
            try await upload(cfg, "locations", snapshot.locations)
            try await upload(cfg, "days",      snapshot.days)
            await MainActor.run { store.syncStatus = .ok(Date()) }
        } catch let e as SyncError {
            await MainActor.run { store.syncStatus = .error(e.errorDescription ?? "שגיאה") }
        } catch {
            await MainActor.run { store.syncStatus = .error("שגיאת סנכרון") }
        }
    }

    private func upload<T: Codable & Identifiable & Timestamped>(
        _ cfg: SyncConfig, _ table: String, _ items: [T]
    ) async throws where T.ID == String {
        guard !items.isEmpty else { return }
        guard let base = endpoint(cfg, table),
              let url = URL(string: base.absoluteString + "?on_conflict=id")
        else { throw SyncError.badURL }

        let rows = items.map {
            Row(id: $0.id, project_id: cfg.projectId.isEmpty ? "default" : cfg.projectId,
                updated_at: $0.updatedAt, data: $0)
        }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        headers(cfg, write: true).forEach { req.setValue($1, forHTTPHeaderField: $0) }
        req.httpBody = try JSONEncoder().encode(rows)

        let (_, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw SyncError.server(code) }
    }

    /// Fetch remote rows and merge by `updatedAt`, honouring local tombstones.
    func pull() async {
        guard let store, let cfg = await config() else { return }
        await MainActor.run { store.syncStatus = .syncing }

        do {
            var next = await MainActor.run { store.state }
            next.people    = try await merge(cfg, "people",    local: next.people,    deleted: next.deleted)
            next.locations = try await merge(cfg, "locations", local: next.locations, deleted: next.deleted)
            next.days      = try await merge(cfg, "days",      local: next.days,      deleted: next.deleted)
            let merged = next
            await MainActor.run {
                store.replace(with: merged)
                store.syncStatus = .ok(Date())
            }
        } catch let e as SyncError {
            await MainActor.run { store.syncStatus = .error(e.errorDescription ?? "שגיאה") }
        } catch {
            await MainActor.run { store.syncStatus = .error("שגיאת סנכרון") }
        }
    }

    private func merge<T: Codable & Identifiable & Timestamped>(
        _ cfg: SyncConfig, _ table: String, local: [T], deleted: [String: Double]
    ) async throws -> [T] where T.ID == String {
        let project = cfg.projectId.isEmpty ? "default" : cfg.projectId
        guard let url = endpoint(cfg, table)?.appending(queryItems: [
            URLQueryItem(name: "project_id", value: "eq.\(project)"),
            URLQueryItem(name: "select", value: "id,updated_at,data"),
        ]) else { throw SyncError.badURL }

        var req = URLRequest(url: url)
        headers(cfg, write: false).forEach { req.setValue($1, forHTTPHeaderField: $0) }

        let (data, resp) = try await URLSession.shared.data(for: req)
        let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(code) else { throw SyncError.server(code) }

        let remote = try JSONDecoder().decode([Row<T>].self, from: data)
        var byId = local.reduce(into: [String: T]()) { $0[$1.id] = $1 }

        for row in remote {
            // A record deleted here stays deleted unless the remote copy is newer.
            if let tombstone = deleted[row.id], tombstone >= row.updated_at { continue }
            if let existing = byId[row.id], existing.updatedAt >= row.updated_at { continue }
            byId[row.id] = row.data
        }
        return Array(byId.values)
    }
}

/// Every synced record carries a client-set edit time; that's what makes
/// last-write-wins reconciliation possible without a server round-trip.
protocol Timestamped {
    var updatedAt: Double { get }
}

extension Person: Timestamped {}
extension Location: Timestamped {}
extension ShootDay: Timestamped {}
