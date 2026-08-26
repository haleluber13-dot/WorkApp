import SwiftUI

struct RootView: View {
    @EnvironmentObject private var store: AppStore
    @State private var tab = Tab.wall
    @State private var focused: Spot?
    @State private var tripSpot: Spot?

    enum Tab: String { case wall, atlas, trip }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Ocean.abyss, Ocean.deep, Ocean.abyss],
                startPoint: .top, endPoint: .bottom
            )
            .ignoresSafeArea()

            TabView(selection: $tab) {
                WallView(focused: $focused, tripSpot: $tripSpot)
                    .tabItem { Label("Wall", systemImage: "video.fill") }
                    .tag(Tab.wall)

                AtlasView(focused: $focused)
                    .tabItem { Label("Atlas", systemImage: "globe") }
                    .tag(Tab.atlas)

                TripView(spot: tripSpot ?? store.visibleSpots.first)
                    .tabItem { Label("Trip", systemImage: "airplane") }
                    .tag(Tab.trip)
            }
            .tint(Ocean.aqua)
        }
        .sheet(item: $focused) { spot in
            FocusView(spot: spot) { chosen in
                focused = nil
                tripSpot = chosen
                tab = .trip
            }
            .environmentObject(store)
        }
    }
}

struct WallView: View {
    @EnvironmentObject private var store: AppStore
    @Binding var focused: Spot?
    @Binding var tripSpot: Spot?

    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: 320), spacing: 10)]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 10) {
                    ForEach(Array(store.tiles.enumerated()), id: \.element.id) { index, tile in
                        CamTileView(
                            tile: tile,
                            live: index < store.liveBudget,
                            reading: store.summaryLine(store.conditions(for: tile.spot)),
                            score: store.score(tile.spot)
                        )
                        .onTapGesture { focused = tile.spot }
                        .task { await store.resolveLive(for: tile.cam) }
                    }
                }
                .padding(.horizontal, 14)

                SpotList(focused: $focused)
            }
            .background(Color.clear)
            .searchable(text: $store.query, prompt: "Search a spot, country or tag")
            .navigationTitle("OlaKai")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Sort", selection: $store.sort) {
                            ForEach(AppStore.Sort.allCases, id: \.self) { Text($0.rawValue).tag($0) }
                        }
                        Toggle("Favourites only", isOn: $store.favouritesOnly)
                        Toggle("Feet", isOn: Binding(
                            get: { store.useFeet },
                            set: { store.setUseFeet($0) }
                        ))
                        Stepper("Playing at once: \(store.liveBudget)", value: Binding(
                            get: { store.liveBudget },
                            set: { store.setLiveBudget($0) }
                        ), in: 1 ... 8)
                    } label: {
                        Image(systemName: "slider.horizontal.3")
                    }
                }
            }
        }
    }
}

private struct SpotList: View {
    @EnvironmentObject private var store: AppStore
    @Binding var focused: Spot?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("SPOTS · \(store.spots.count)")
                .font(.caption2.weight(.black))
                .kerning(1.4)
                .foregroundStyle(Ocean.aqua)
                .padding(.top, 18)

            ForEach(store.visibleSpots) { spot in
                let score = store.score(spot)
                HStack(spacing: 10) {
                    RoundedRectangle(cornerRadius: 2)
                        .fill(scoreColor(score))
                        .frame(width: 3, height: 34)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(spot.name).font(.system(size: 14, weight: .bold))
                        Text("\(spot.region), \(spot.country)")
                            .font(.system(size: 11)).foregroundStyle(Ocean.slate)
                        Text(store.summaryLine(store.conditions(for: spot)))
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(scoreColor(score))
                    }
                    Spacer()
                    Image(systemName: store.favourites.contains(spot.id) ? "star.fill" : "star")
                        .foregroundStyle(store.favourites.contains(spot.id) ? Ocean.sunset : Ocean.slate)
                        .onTapGesture { store.toggleFavourite(spot) }
                }
                .padding(10)
                .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
                .contentShape(Rectangle())
                .onTapGesture { focused = spot }
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 24)
        .foregroundStyle(Ocean.foam)
    }
}

struct CamTileView: View {
    @EnvironmentObject private var store: AppStore
    let tile: AppStore.Tile
    let live: Bool
    let reading: String
    let score: Int

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            Color.black
            if live {
                YouTubePlayerView(
                    embedBase: tile.cam.embedBase(resolved: store.resolved[tile.cam.source])
                )
                // A playing web view would otherwise swallow the tap and the
                // tile could not be opened.
                .allowsHitTesting(false)
            } else if let thumb = tile.cam.thumbnailURL {
                AsyncImage(url: thumb) { image in
                    image.resizable().aspectRatio(contentMode: .fill)
                } placeholder: {
                    LinearGradient(colors: [Ocean.deep, Ocean.mid], startPoint: .top, endPoint: .bottom)
                }
            } else {
                LinearGradient(colors: [Ocean.deep, Ocean.mid], startPoint: .top, endPoint: .bottom)
            }

            LinearGradient(
                stops: [
                    .init(color: .black.opacity(0.35), location: 0),
                    .init(color: .clear, location: 0.28),
                    .init(color: .black.opacity(0.25), location: 0.72),
                    .init(color: .black.opacity(0.72), location: 1),
                ],
                startPoint: .top, endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 1) {
                Text(tile.spot.name).font(.system(size: 15, weight: .black))
                Text("\(tile.spot.region), \(tile.spot.country)")
                    .font(.system(size: 11)).foregroundStyle(Ocean.slate)
                Text(reading).font(.system(size: 11, weight: .semibold)).foregroundStyle(Ocean.aqua)
            }
            .padding(11)

            VStack {
                HStack(spacing: 6) {
                    Label(live ? "LIVE" : "PAUSED", systemImage: live ? "dot.radiowaves.left.and.right" : "pause.fill")
                        .font(.system(size: 9, weight: .black))
                        .padding(.horizontal, 7).padding(.vertical, 3)
                        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 6))
                        .foregroundStyle(live ? Ocean.coral : Ocean.slate)
                    Text("\(score)")
                        .font(.system(size: 13, weight: .black))
                        .foregroundStyle(scoreColor(score))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(.black.opacity(0.55), in: RoundedRectangle(cornerRadius: 8))
                    Spacer()
                }
                Spacer()
            }
            .padding(9)
        }
        .aspectRatio(16.0 / 10.0, contentMode: .fit)
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .foregroundStyle(Ocean.foam)
    }
}
