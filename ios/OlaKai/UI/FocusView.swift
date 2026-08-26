import SwiftUI

/// One spot, full screen: the cam, its readings, and everything about the place.
struct FocusView: View {
    @EnvironmentObject private var store: AppStore
    @Environment(\.dismiss) private var dismiss

    let spot: Spot
    let onPlanTrip: (Spot) -> Void

    @State private var camIndex = 0

    private var cams: [Cam] { spot.cams.filter(\.isLiveVideo) }
    private var conditions: Conditions? { store.conditions(for: spot) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    player
                    if cams.count > 1 { camSwitcher }
                    metrics
                    details
                }
            }
            .background(Ocean.abyss)
            .navigationTitle(spot.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        store.toggleFavourite(spot)
                    } label: {
                        Image(systemName: store.favourites.contains(spot.id) ? "star.fill" : "star")
                    }
                }
            }
        }
        .task {
            if let cam = cams.first { await store.resolveLive(for: cam) }
        }
    }

    @ViewBuilder private var player: some View {
        if let cam = cams.indices.contains(camIndex) ? cams[camIndex] : cams.first {
            ZStack(alignment: .topTrailing) {
                YouTubePlayerView(
                    embedBase: cam.embedBase(resolved: store.resolved[cam.source]),
                    controls: true
                )
                .aspectRatio(16.0 / 9.0, contentMode: .fit)

                // Whatever the embed does, there is always a way to watch.
                if let url = URL(string: cam.watchURL) {
                    Link(destination: url) {
                        Label("YouTube", systemImage: "arrow.up.forward.square")
                            .font(.system(size: 11, weight: .semibold))
                            .padding(.horizontal, 9).padding(.vertical, 5)
                            .background(.black.opacity(0.7), in: RoundedRectangle(cornerRadius: 8))
                    }
                    .padding(10)
                }
            }
        } else {
            VStack(spacing: 8) {
                Text("No embeddable live cam here yet")
                    .font(.system(size: 15, weight: .bold))
                Text("The readings below are still live.")
                    .font(.system(size: 12)).foregroundStyle(Ocean.slate)
            }
            .frame(maxWidth: .infinity)
            .aspectRatio(16.0 / 9.0, contentMode: .fit)
            .background(LinearGradient(colors: [Ocean.deep, Ocean.mid], startPoint: .top, endPoint: .bottom))
        }
    }

    private var camSwitcher: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(Array(cams.enumerated()), id: \.element.id) { index, cam in
                    Text(cam.title)
                        .font(.system(size: 12, weight: .semibold))
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(
                            index == camIndex ? Ocean.aqua.opacity(0.22) : Color.white.opacity(0.08),
                            in: RoundedRectangle(cornerRadius: 10)
                        )
                        .foregroundStyle(index == camIndex ? Ocean.aqua : Ocean.slate)
                        .onTapGesture { camIndex = index }
                }
            }
            .padding(.horizontal, 14)
        }
        .padding(.vertical, 9)
    }

    private var metrics: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 20) {
                metric(waveText, "WAVE", Ocean.aqua)
                metric(conditions?.wavePeriodS.map { "\(Int($0.rounded())) s" } ?? "–", "PERIOD")
                metric(conditions?.swellDirectionDeg.map(compassPoint) ?? "–", "SWELL DIR")
                metric(conditions?.windSpeedKmh.map { "\(Int($0.rounded())) km/h" } ?? "–",
                       conditions?.windDirectionDeg.map { "WIND " + compassPoint($0) } ?? "WIND")
                metric(conditions?.windGustKmh.map { "\(Int($0.rounded()))" } ?? "–", "GUST KM/H")
                metric(tideText, "TIDE")
                metric(conditions?.waterTempC.map { "\(Int($0.rounded()))°C" } ?? "–", "WATER")
                metric(conditions?.airTempC.map { "\(Int($0.rounded()))°C" } ?? "–", "AIR")
            }
            .padding(14)
        }
        .background(Ocean.deep.opacity(0.95), in: RoundedRectangle(cornerRadius: 18))
        .padding(12)
    }

    private var waveText: String {
        guard let h = conditions?.waveHeightM else { return "–" }
        return store.useFeet ? String(format: "%.1f ft", h * 3.28084) : String(format: "%.1f m", h)
    }

    private var tideText: String {
        switch conditions?.tide {
        case .rising: return "Rising"
        case .falling: return "Falling"
        case .slack: return "Slack"
        default: return "–"
        }
    }

    private func metric(_ value: String, _ label: String, _ color: Color = Ocean.foam) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value).font(.system(size: 15, weight: .bold)).foregroundStyle(color)
            Text(label).font(.system(size: 9, weight: .black)).kerning(1)
                .foregroundStyle(Ocean.slate)
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 14) {
            if !spot.tags.isEmpty {
                HStack(spacing: 6) {
                    ForEach(spot.tags.prefix(4), id: \.self) { tag in
                        Text(tag.uppercased())
                            .font(.system(size: 9, weight: .black)).kerning(0.8)
                            .padding(.horizontal, 7).padding(.vertical, 3)
                            .background(Ocean.aqua.opacity(0.14), in: RoundedRectangle(cornerRadius: 6))
                            .foregroundStyle(Ocean.aqua)
                    }
                }
            }

            Text(spot.info.about).font(.system(size: 14)).lineSpacing(4)

            Button {
                onPlanTrip(spot)
            } label: {
                Label("Get me there", systemImage: "airplane.departure")
                    .font(.system(size: 15, weight: .black))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 13)
            }
            .background(Ocean.aqua, in: RoundedRectangle(cornerRadius: 14))
            .foregroundStyle(Ocean.abyss)

            section("THE WAVE")
            facts([("Break", spot.info.breakType), ("Bottom", spot.info.bottom),
                   ("Shape", spot.info.wave), ("Level", spot.info.level),
                   ("Crowd", spot.info.crowd)])

            section("WHEN IT WORKS")
            facts([("Swell", spot.info.bestSwell), ("Wind", spot.info.bestWind),
                   ("Tide", spot.info.bestTide), ("Season", spot.info.bestSeason),
                   ("Water", spot.info.waterTemp)])

            if !spot.info.hazards.isEmpty {
                section("HAZARDS")
                ForEach(spot.info.hazards, id: \.self) { hazard in
                    HStack(alignment: .top, spacing: 8) {
                        Text("•").foregroundStyle(Ocean.coral)
                        Text(hazard).font(.system(size: 13))
                    }
                }
            }

            if !spot.info.localTip.isEmpty {
                section("LOCAL KNOWLEDGE")
                Text(spot.info.localTip)
                    .font(.system(size: 13)).foregroundStyle(Ocean.sand)
                    .padding(12)
                    .background(Ocean.deep.opacity(0.95), in: RoundedRectangle(cornerRadius: 14))
            }

            section("GETTING THERE")
            facts([("Airports", spot.access.airports.joined(separator: " · ")),
                   ("Transfer", spot.access.transfer),
                   ("Entry", spot.access.visaNote.isEmpty
                        ? "Check entry rules for your passport" : spot.access.visaNote)])

            if !spot.externalCams.isEmpty {
                section("MORE CAMS")
                ForEach(spot.externalCams) { cam in
                    if let url = URL(string: cam.pageUrl.isEmpty ? cam.source : cam.pageUrl) {
                        Link(cam.title, destination: url)
                            .font(.system(size: 13))
                            .foregroundStyle(Ocean.aqua)
                    }
                }
            }
        }
        .padding(16)
        .foregroundStyle(Ocean.foam)
    }

    private func section(_ text: String) -> some View {
        Text(text).font(.system(size: 10, weight: .black)).kerning(1.6)
            .foregroundStyle(Ocean.aqua).padding(.top, 6)
    }

    private func facts(_ rows: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            ForEach(rows.filter { !$0.1.isEmpty }, id: \.0) { label, value in
                HStack(alignment: .top, spacing: 10) {
                    Text(label.uppercased())
                        .font(.system(size: 10, weight: .black)).kerning(0.8)
                        .foregroundStyle(Ocean.slate)
                        .frame(width: 74, alignment: .leading)
                    Text(value).font(.system(size: 13))
                }
            }
        }
    }
}
