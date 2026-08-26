package com.olakai.app.data.flights

import android.content.Context
import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.FlightOption
import com.olakai.app.data.model.SearchLink
import com.olakai.app.data.model.Spot
import com.olakai.app.data.model.TripBoard
import com.olakai.app.util.distanceKm
import com.olakai.app.util.normalize
import kotlin.math.roundToInt

/**
 * Builds the travel board for a spot: pick the destination airport, ask every
 * configured fare source, then rank for the three things a surfer actually
 * asks -- cheapest, fastest, and the fast one that still costs little.
 */
class FlightRepository(
    context: Context,
    private val airports: AirportRepository = AirportRepository(context),
    private val providers: List<FlightProvider> = listOf(
        AmadeusFlightProvider(),
        EstimateFlightProvider(),
    ),
) {

    suspend fun board(
        spot: Spot,
        originIata: String,
        departDate: String,
        returnDate: String?,
        adults: Int = 1,
        /** 0 = pure speed, 1 = pure price. Drives the "best value" pick. */
        priceWeight: Double = 0.6,
    ): TripBoard {
        val origin = airports.byCode(originIata)
        val destination = destinationFor(spot)

        if (origin == null || destination == null) {
            return TripBoard(
                origin = origin,
                destination = destination,
                departDate = departDate,
                returnDate = returnDate,
                note = "Pick a home airport to price this trip.",
            )
        }

        val live = providers.firstOrNull { it.name != "Estimate" && it.isAvailable() }
        val options = live
            ?.runCatching { search(origin, destination, departDate, returnDate, adults) }
            ?.getOrNull()
            ?.takeIf { it.isNotEmpty() }
            ?: EstimateFlightProvider().search(origin, destination, departDate, returnDate, adults)

        val ranked = options.sortedBy { it.priceMinor }
        val km = distanceKm(origin.lat, origin.lon, destination.lat, destination.lon).roundToInt()

        return TripBoard(
            origin = origin,
            destination = destination,
            departDate = departDate,
            returnDate = returnDate,
            options = ranked,
            cheapest = ranked.minByOrNull { it.priceMinor },
            fastest = ranked.minByOrNull { it.durationMinutes },
            bestValue = bestValue(ranked, priceWeight),
            searchLinks = links(origin.iata, destination.iata, departDate, returnDate),
            distanceKm = km,
            usingLiveFares = ranked.any { !it.isEstimate },
            note = if (ranked.any { it.isEstimate }) {
                "Modelled fares — open a booking site for live prices."
            } else {
                "Live fares from ${live?.name}."
            },
        )
    }

    /**
     * The airport the spot's own entry names, falling back to the nearest hub.
     * Some spots list two (a cheap hub plus a short-hop regional field).
     */
    private suspend fun destinationFor(spot: Spot): Airport? {
        val listed = airports.codes(spot.access.airports)
        return listed.firstOrNull() ?: airports.nearest(spot.lat, spot.lon)
    }

    /**
     * "Fast, for less money": normalise price and duration across the board,
     * then take the lowest weighted blend. With one option it just returns it.
     */
    fun bestValue(options: List<FlightOption>, priceWeight: Double): FlightOption? {
        if (options.size <= 1) return options.firstOrNull()
        val minPrice = options.minOf { it.price }
        val maxPrice = options.maxOf { it.price }
        val minTime = options.minOf { it.durationMinutes }.toDouble()
        val maxTime = options.maxOf { it.durationMinutes }.toDouble()
        val w = priceWeight.coerceIn(0.0, 1.0)
        return options.minByOrNull { option ->
            val p = normalize(option.price, minPrice, maxPrice)
            val t = normalize(option.durationMinutes.toDouble(), minTime, maxTime)
            p * w + t * (1 - w)
        }
    }

    private fun links(from: String, to: String, depart: String, ret: String?) = listOf(
        SearchLink("Google Flights", DeepLinks.googleFlights(from, to, depart, ret)),
        SearchLink("Skyscanner", DeepLinks.skyscanner(from, to, depart, ret)),
        SearchLink("Kiwi", DeepLinks.kiwi(from, to, depart, ret)),
        SearchLink("Kayak", DeepLinks.kayak(from, to, depart, ret)),
    )
}
