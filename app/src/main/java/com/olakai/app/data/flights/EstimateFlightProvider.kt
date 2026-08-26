package com.olakai.app.data.flights

import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.FlightLeg
import com.olakai.app.data.model.FlightOption
import com.olakai.app.util.distanceKm
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Month
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/**
 * Offline fare model. Runs with no credentials, so the travel screen is useful
 * on a fresh install, and every number it produces is flagged `isEstimate` so
 * the UI can label it rather than pass it off as a real quote.
 *
 * It models the trade the user actually cares about: fewer stops costs more and
 * saves hours; more stops saves money and burns a day.
 */
class EstimateFlightProvider : FlightProvider {

    override val name = "Estimate"

    override suspend fun isAvailable() = true

    override suspend fun search(
        origin: Airport,
        destination: Airport,
        departDate: String,
        returnDate: String?,
        adults: Int,
    ): List<FlightOption> {
        val km = distanceKm(origin.lat, origin.lon, destination.lat, destination.lon)
        if (km < 1.0) return emptyList()

        val date = runCatching { LocalDate.parse(departDate) }.getOrDefault(LocalDate.now())
        val season = seasonMultiplier(date, destination)
        val lead = leadTimeMultiplier(date)
        val connectivity = connectivityMultiplier(origin, destination)

        val minStops = minimumStops(km, origin, destination)
        val shapes = (minStops..minStops + 2).take(3)

        return shapes.mapIndexed { index, stops ->
            val air = airMinutes(km, stops)
            val ground = stops * layoverMinutes(km)
            val duration = air + ground

            // Each extra connection knocks roughly 14% off the fare.
            val base = baseFare(km) * connectivity * season * lead
            val price = base * StrictMath.pow(0.86, (stops - minStops).toDouble()) * adults
            val roundTrip = if (returnDate != null) price * 1.85 else price

            val depart = LocalDateTime.of(date, java.time.LocalTime.of(7 + index * 4, 25))
            val arrive = depart.plusMinutes(duration.toLong())

            FlightOption(
                id = "est-${origin.iata}-${destination.iata}-$stops",
                from = origin.iata,
                to = destination.iata,
                priceMinor = (roundTrip * 100).roundToLong(),
                currency = "USD",
                durationMinutes = duration,
                stops = stops,
                carrier = if (stops == minStops) "Fastest routing" else "Connecting routing",
                legs = listOf(
                    FlightLeg(
                        from = origin.iata,
                        to = destination.iata,
                        departIso = depart.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                        arriveIso = arrive.format(DateTimeFormatter.ISO_LOCAL_DATE_TIME),
                        carrier = "—",
                        durationMinutes = duration,
                    ),
                ),
                departDate = departDate,
                bookingUrl = DeepLinks.googleFlights(origin.iata, destination.iata, departDate, returnDate),
                source = name,
                isEstimate = true,
            )
        }
    }

    /** Typical economy one-way fare, USD, by distance band. */
    private fun baseFare(km: Double): Double = when {
        km < 800 -> 70 + km * 0.075
        km < 2500 -> 95 + km * 0.052
        km < 6000 -> 150 + km * 0.038
        km < 11000 -> 260 + km * 0.030
        else -> 420 + km * 0.024
    }

    /** Block time: ~820 km/h door-to-door, plus taxi and a detour penalty per stop. */
    private fun airMinutes(km: Double, stops: Int): Int {
        val detour = 1.0 + stops * 0.07
        return (35 + (km * detour) / 13.7).roundToInt()
    }

    private fun layoverMinutes(km: Double): Int = if (km > 6000) 150 else 95

    private fun minimumStops(km: Double, origin: Airport, destination: Airport): Int {
        val hubbiness = origin.size + destination.size // 2..6
        return when {
            km < 3500 && hubbiness >= 5 -> 0
            km < 3500 -> 1
            km < 9000 && hubbiness == 6 -> 0
            km < 9000 -> 1
            hubbiness == 6 -> 1
            else -> 2
        }
    }

    /** Thin routes out of small airports carry a premium. */
    private fun connectivityMultiplier(origin: Airport, destination: Airport): Double {
        val penalty = (6 - (origin.size + destination.size)) * 0.06
        return 1.0 + penalty
    }

    /** Peak surf season is also peak fare season at the destination's latitude. */
    private fun seasonMultiplier(date: LocalDate, destination: Airport): Double {
        val northern = destination.lat >= 0
        val peak = if (northern) {
            date.month in listOf(Month.JUNE, Month.JULY, Month.AUGUST, Month.DECEMBER)
        } else {
            date.month in listOf(Month.DECEMBER, Month.JANUARY, Month.FEBRUARY, Month.JULY)
        }
        return if (peak) 1.22 else 0.97
    }

    /** Booking three weeks to three months out is the cheap window. */
    private fun leadTimeMultiplier(date: LocalDate): Double {
        val days = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), date)
        return when {
            days < 0 -> 1.0
            days < 7 -> 1.55
            days < 21 -> 1.18
            days <= 90 -> 0.95
            days <= 200 -> 1.02
            else -> 1.10
        }
    }
}
