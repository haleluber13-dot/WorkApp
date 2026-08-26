import SwiftUI

/// Getting to the wave: the cheapest way, the fastest way, and the one that is
/// fast without costing much.
struct TripView: View {
    @EnvironmentObject private var store: AppStore
    let spot: Spot?

    @AppStorage("originIata") private var originIata = ""
    @AppStorage("priceWeight") private var priceWeight = 50.0

    @State private var originQuery = ""
    @State private var depart = Calendar.current.date(byAdding: .day, value: 30, to: .now)!
    @State private var ret: Date? = Calendar.current.date(byAdding: .day, value: 44, to: .now)!

    private var origin: Airport? { store.airports.first { $0.iata == originIata } }

    private var destination: Airport? {
        guard let spot else { return nil }
        for code in spot.access.airports {
            if let hit = store.airports.first(where: { $0.iata == code }) { return hit }
        }
        return nil
    }

    private var options: [FlightOption] {
        guard let origin, let destination else { return [] }
        return FlightEstimator.options(from: origin, to: destination, depart: depart, ret: ret)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if let spot {
                        Text("\(spot.name) · \(spot.country)")
                            .font(.system(size: 12)).foregroundStyle(Ocean.slate)
                    }

                    originField
                    dates
                    valueSlider

                    if origin == nil {
                        Text("Pick the airport you are flying from.")
                            .font(.system(size: 13)).foregroundStyle(Ocean.slate)
                    } else if let destination, !options.isEmpty {
                        picks(destination: destination)
                        allOptions(destination: destination)
                        bookingLinks(destination: destination)
                    }
                }
                .padding(16)
            }
            .background(Ocean.abyss)
            .navigationTitle("Get me there")
            .foregroundStyle(Ocean.foam)
        }
    }

    private var originField: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("FLYING FROM").font(.system(size: 10, weight: .black)).kerning(1)
                .foregroundStyle(Ocean.slate)
            TextField("City or airport code", text: $originQuery)
                .textFieldStyle(.plain)
                .padding(11)
                .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                .autocorrectionDisabled()

            let hits = matches(for: originQuery)
            ForEach(hits) { airport in
                Button {
                    originIata = airport.iata
                    originQuery = "\(airport.iata) — \(airport.city)"
                } label: {
                    HStack {
                        Text(airport.iata).font(.system(size: 13, weight: .black))
                            .foregroundStyle(Ocean.aqua).frame(width: 42, alignment: .leading)
                        VStack(alignment: .leading) {
                            Text("\(airport.city), \(airport.country)").font(.system(size: 13))
                            Text(airport.name).font(.system(size: 11)).foregroundStyle(Ocean.slate)
                        }
                        Spacer()
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .onAppear {
            if originQuery.isEmpty, let origin { originQuery = "\(origin.iata) — \(origin.city)" }
        }
    }

    private func matches(for query: String) -> [Airport] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard q.count >= 2, origin == nil || !originQuery.contains("—") else { return [] }
        return store.airports
            .filter { $0.iata.lowercased() == q || $0.city.lowercased().contains(q) || $0.name.lowercased().contains(q) }
            .sorted { ($0.iata.lowercased() == q ? 1 : 0, $0.size) > ($1.iata.lowercased() == q ? 1 : 0, $1.size) }
            .prefix(6)
            .map { $0 }
    }

    private var dates: some View {
        HStack(spacing: 8) {
            DatePicker("Depart", selection: $depart, in: Date()..., displayedComponents: .date)
                .datePickerStyle(.compact)
            Toggle("Return", isOn: Binding(
                get: { ret != nil },
                set: { ret = $0 ? Calendar.current.date(byAdding: .day, value: 14, to: depart) : nil }
            ))
            .labelsHidden()
        }
    }

    private var valueSlider: some View {
        VStack(spacing: 2) {
            HStack {
                Text("Save time").font(.system(size: 11, weight: .bold))
                Spacer()
                Text("Save money").font(.system(size: 11, weight: .bold))
            }
            .foregroundStyle(Ocean.slate)
            Slider(value: $priceWeight, in: 0 ... 100).tint(Ocean.aqua)
        }
    }

    private func picks(destination: Airport) -> some View {
        let cheapest = options.min { $0.price < $1.price }!
        let fastest = options.min { $0.minutes < $1.minutes }!
        let best = FlightEstimator.bestValue(options, priceWeight: priceWeight / 100)

        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                pick("CHEAPEST", cheapest, Ocean.aqua, "Lowest fare, however long it takes", destination)
                pick("FASTEST", fastest, Ocean.sunset, "Least time in the air and in terminals", destination)
                pick("BEST VALUE", best, Color(red: 0.42, green: 0.36, blue: 0.90),
                     "The fast way for the least money", destination)
            }
        }
    }

    private func pick(_ rank: String, _ option: FlightOption, _ colour: Color,
                      _ why: String, _ destination: Airport) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(rank).font(.system(size: 10, weight: .black)).kerning(1.2).foregroundStyle(colour)
            Text("$\(Int(option.price.rounded()))").font(.system(size: 26, weight: .black))
            Text("\(option.durationText) · \(option.stopsText)")
                .font(.system(size: 12)).foregroundStyle(Ocean.slate)
            Text(why).font(.system(size: 11)).foregroundStyle(Ocean.slate)
        }
        .padding(14)
        .frame(width: 210, alignment: .leading)
        .background(Ocean.deep.opacity(0.95), in: RoundedRectangle(cornerRadius: 18))
        .overlay(RoundedRectangle(cornerRadius: 18).strokeBorder(colour.opacity(0.4)))
        .onTapGesture { open(bookingURL(destination)) }
    }

    private func allOptions(destination: Airport) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("ALL OPTIONS").font(.system(size: 10, weight: .black)).kerning(1.6)
                .foregroundStyle(Ocean.aqua)
            ForEach(options.sorted { $0.price < $1.price }) { option in
                HStack {
                    VStack(alignment: .leading) {
                        Text("\(option.durationText) · \(option.stopsText)")
                            .font(.system(size: 14, weight: .bold))
                        Text("modelled").font(.system(size: 11)).foregroundStyle(Ocean.slate)
                    }
                    Spacer()
                    Text("$\(Int(option.price.rounded()))")
                        .font(.system(size: 17, weight: .black)).foregroundStyle(Ocean.aqua)
                }
                .padding(12)
                .background(Color.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                .onTapGesture { open(bookingURL(destination)) }
            }
            if let origin {
                Text("\(origin.iata) → \(destination.iata) · modelled fares — open a booking site for live prices.")
                    .font(.system(size: 11)).foregroundStyle(Ocean.slate)
            }
        }
    }

    private func bookingLinks(destination: Airport) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("CHECK THE REAL PRICE").font(.system(size: 10, weight: .black)).kerning(1.6)
                .foregroundStyle(Ocean.aqua)
            HStack(spacing: 8) {
                ForEach(FlightEstimator.searchLinks(
                    from: origin?.iata ?? "", to: destination.iata, depart: depart, ret: ret
                ), id: \.label) { link in
                    if let url = URL(string: link.url) {
                        Link(link.label, destination: url)
                            .font(.system(size: 12, weight: .semibold))
                            .padding(.horizontal, 11).padding(.vertical, 7)
                            .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                            .foregroundStyle(Ocean.aqua)
                    }
                }
            }
        }
    }

    private func bookingURL(_ destination: Airport) -> String {
        FlightEstimator.googleFlights(from: origin?.iata ?? "", to: destination.iata,
                                      depart: depart, ret: ret)
    }

    private func open(_ string: String) {
        guard let url = URL(string: string) else { return }
        UIApplication.shared.open(url)
    }
}
