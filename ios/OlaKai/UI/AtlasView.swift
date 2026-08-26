import SwiftUI

/// Every spot on one map, coloured by how it is doing right now. Drawn with
/// Canvas from the bundled coastline file: no map SDK, no key, no tiles.
struct AtlasView: View {
    @EnvironmentObject private var store: AppStore
    @Binding var focused: Spot?

    @State private var land: [[[Double]]] = []
    @State private var scale: CGFloat = 1
    @State private var offset: CGSize = .zero

    var body: some View {
        GeometryReader { geo in
            Canvas { context, size in
                context.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Ocean.abyss))

                for ring in land {
                    var path = Path()
                    for (index, point) in ring.enumerated() {
                        let p = project(lon: point[0], lat: point[1], size: size)
                        index == 0 ? path.move(to: p) : path.addLine(to: p)
                    }
                    path.closeSubpath()
                    context.fill(path, with: .color(Color(red: 0.055, green: 0.169, blue: 0.255)))
                    context.stroke(path, with: .color(Ocean.aqua.opacity(0.33)), lineWidth: 1)
                }

                for spot in store.spots {
                    let p = project(lon: spot.lon, lat: spot.lat, size: size)
                    let score = store.score(spot)
                    let r = (3.5 + CGFloat(score) / 22) * min(scale, 2.2)
                    context.fill(Path(ellipseIn: CGRect(x: p.x - r * 2.4, y: p.y - r * 2.4,
                                                        width: r * 4.8, height: r * 4.8)),
                                 with: .color(scoreColor(score).opacity(0.22)))
                    context.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)),
                                 with: .color(scoreColor(score)))
                    if spot.hasLiveCam {
                        let dot = r * 0.36
                        context.fill(Path(ellipseIn: CGRect(x: p.x - dot, y: p.y - dot,
                                                            width: dot * 2, height: dot * 2)),
                                     with: .color(Ocean.foam))
                    }
                }
            }
            .gesture(
                SimultaneousGesture(
                    MagnificationGesture().onChanged { scale = min(max($0, 1), 8) },
                    DragGesture().onChanged { offset = $0.translation }
                )
            )
            .onTapGesture { location in
                let size = geo.size
                let hit = store.spots.min {
                    distance(project(lon: $0.lon, lat: $0.lat, size: size), location)
                        < distance(project(lon: $1.lon, lat: $1.lat, size: size), location)
                }
                if let hit, distance(project(lon: hit.lon, lat: hit.lat, size: size), location) < 40 {
                    focused = hit
                }
            }
        }
        .ignoresSafeArea(edges: .bottom)
        .overlay(alignment: .topLeading) {
            Text("Pinch to zoom · tap a pin to open the spot")
                .font(.system(size: 11)).foregroundStyle(Ocean.slate).padding(16)
        }
        .task { if land.isEmpty { land = Catalog.loadLand() } }
    }

    /// Equirectangular: lon -180…180 across the width, lat 90…-90 down.
    private func project(lon: Double, lat: Double, size: CGSize) -> CGPoint {
        let x = CGFloat((lon + 180) / 360) * size.width
        let y = CGFloat((90 - lat) / 180) * size.height
        return CGPoint(
            x: (x - size.width / 2) * scale + size.width / 2 + offset.width,
            y: (y - size.height / 2) * scale + size.height / 2 + offset.height
        )
    }

    private func distance(_ a: CGPoint, _ b: CGPoint) -> CGFloat {
        abs(a.x - b.x) + abs(a.y - b.y)
    }
}
