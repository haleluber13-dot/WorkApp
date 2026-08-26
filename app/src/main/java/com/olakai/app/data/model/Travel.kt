package com.olakai.app.data.model

import kotlinx.serialization.Serializable

@Serializable
data class Airport(
    val iata: String,
    val name: String,
    val city: String,
    val country: String,
    val countryCode: String,
    val lat: Double,
    val lon: Double,
    /** Rough yearly passenger scale, used to guess how well-connected it is. */
    val size: Int = 2,
)

@Serializable
data class AirportIndex(val airports: List<Airport> = emptyList())

data class FlightLeg(
    val from: String,
    val to: String,
    val departIso: String,
    val arriveIso: String,
    val carrier: String,
    val flightNumber: String = "",
    val durationMinutes: Int,
)

/** One bookable (or estimated) way of getting from A to B. */
data class FlightOption(
    val id: String,
    val from: String,
    val to: String,
    val priceMinor: Long,
    val currency: String,
    val durationMinutes: Int,
    val stops: Int,
    val carrier: String,
    val legs: List<FlightLeg> = emptyList(),
    val departDate: String = "",
    val bookingUrl: String = "",
    val source: String = "",
    /**
     * True when the number came from the offline model rather than a live fare
     * search. The UI never shows an estimate without saying so.
     */
    val isEstimate: Boolean = false,
) {
    val price: Double get() = priceMinor / 100.0
    val durationText: String
        get() = "${durationMinutes / 60}h ${(durationMinutes % 60).toString().padStart(2, '0')}m"
    val stopsText: String
        get() = when (stops) {
            0 -> "Direct"
            1 -> "1 stop"
            else -> "$stops stops"
        }
}

enum class TripRank(val label: String, val blurb: String) {
    CHEAPEST("Cheapest", "Lowest fare we can find, however long it takes"),
    FASTEST("Fastest", "Least time in the air and in terminals"),
    BEST_VALUE("Best value", "The fast way for the least money"),
}

/** A ranked board of options plus the pick for each ranking. */
data class TripBoard(
    val origin: Airport?,
    val destination: Airport?,
    val departDate: String,
    val returnDate: String?,
    val options: List<FlightOption> = emptyList(),
    val cheapest: FlightOption? = null,
    val fastest: FlightOption? = null,
    val bestValue: FlightOption? = null,
    val searchLinks: List<SearchLink> = emptyList(),
    val distanceKm: Int = 0,
    val usingLiveFares: Boolean = false,
    val note: String = "",
)

data class SearchLink(val label: String, val url: String)
