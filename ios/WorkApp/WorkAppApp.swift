import SwiftUI

@main
struct WorkAppApp: App {
    @StateObject private var store = Store()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environment(\.locale, Locale(identifier: "he_IL"))
                .task { store.startSync() }
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .background, .inactive:
                // Never lose an edit to a task switch.
                store.saveNow()
            case .active:
                if store.settings.sync.isUsable { store.syncNow() }
            default:
                break
            }
        }
    }
}
