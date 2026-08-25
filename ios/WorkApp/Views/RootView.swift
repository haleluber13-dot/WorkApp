import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label("היום", systemImage: "calendar.day.timeline.leading") }
            CrewView()
                .tabItem { Label("אנשי קשר", systemImage: "person.2.fill") }
            DaysView()
                .tabItem { Label("ימים", systemImage: "calendar") }
            SheetsView()
                .tabItem { Label("גיליונות", systemImage: "tablecells") }
            SettingsView()
                .tabItem { Label("הגדרות", systemImage: "gearshape.fill") }
        }
        .tint(Color(hex: "#F5A524"))
        .preferredColorScheme(colorScheme)
        // The app is Hebrew-only, so pin the layout rather than leaving it to
        // the device language — a crew member with an English phone should
        // still get the right-to-left layout the sheets were designed for.
        .environment(\.layoutDirection, .rightToLeft)
    }

    private var colorScheme: ColorScheme? {
        switch store.settings.theme {
        case .auto:  return nil
        case .light: return .light
        case .dark:  return .dark
        }
    }
}
