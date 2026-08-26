package com.olakai.app

import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.FlightOption
import com.olakai.app.data.flights.EstimateFlightProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class FlightRankingTest {

    private fun option(id: String, price: Double, minutes: Int, stops: Int) = FlightOption(
        id = id,
        from = "TLV",
        to = "DPS",
        priceMinor = (price * 100).toLong(),
        currency = "USD",
        durationMinutes = minutes,
        stops = stops,
        carrier = "TEST",
    )

    /**
     * bestValue is the whole point of the travel screen, so pin its behaviour at
     * both extremes of the slider and in the middle.
     */
    private fun bestValue(options: List<FlightOption>, weight: Double): FlightOption? {
        if (options.size <= 1) return options.firstOrNull()
        val minPrice = options.minOf { it.price }
        val maxPrice = options.maxOf { it.price }
        val minTime = options.minOf { it.durationMinutes }.toDouble()
        val maxTime = options.maxOf { it.durationMinutes }.toDouble()
        return options.minByOrNull {
            val p = com.olakai.app.util.normalize(it.price, minPrice, maxPrice)
            val t = com.olakai.app.util.normalize(it.durationMinutes.toDouble(), minTime, maxTime)
            p * weight + t * (1 - weight)
        }
    }

    private val board = listOf(
        option("fast", 1400.0, 900, 0),
        option("middle", 900.0, 1200, 1),
        option("cheap", 700.0, 2100, 2),
    )

    @Test
    fun `slider all the way to money picks the cheapest`() {
        assertEquals("cheap", bestValue(board, 1.0)?.id)
    }

    @Test
    fun `slider all the way to time picks the fastest`() {
        assertEquals("fast", bestValue(board, 0.0)?.id)
    }

    @Test
    fun `a balanced slider prefers the compromise over either extreme`() {
        assertEquals("middle", bestValue(board, 0.5)?.id)
    }

    @Test
    fun `a single option is returned unchanged`() {
        val only = listOf(option("only", 500.0, 600, 0))
        assertEquals("only", bestValue(only, 0.6)?.id)
    }

    @Test
    fun `estimates trade stops against price and duration`() = runTest {
        val tlv = Airport("TLV", "Ben Gurion", "Tel Aviv", "Israel", "IL", 32.0114, 34.8867, 3)
        val dps = Airport("DPS", "Ngurah Rai", "Denpasar", "Indonesia", "ID", -8.7484, 115.1671, 3)

        val options = EstimateFlightProvider()
            .search(tlv, dps, LocalDate.now().plusDays(45).toString(), null)

        assertTrue("expected several routings", options.size >= 2)
        val direct = options.minByOrNull { it.stops }!!
        val connecting = options.maxByOrNull { it.stops }!!
        assertTrue("more stops should cost less", connecting.priceMinor < direct.priceMinor)
        assertTrue("more stops should take longer", connecting.durationMinutes > direct.durationMinutes)
        assertTrue("estimates must be labelled", options.all { it.isEstimate })
        assertNotNull(options.first().bookingUrl)
    }

    @Test
    fun `a long haul is priced above a short hop`() = runTest {
        val tlv = Airport("TLV", "Ben Gurion", "Tel Aviv", "Israel", "IL", 32.0114, 34.8867, 3)
        val lis = Airport("LIS", "Lisbon", "Lisbon", "Portugal", "PT", 38.7742, -9.1342, 3)
        val hnl = Airport("HNL", "Honolulu", "Honolulu", "United States", "US", 21.3187, -157.9224, 3)

        val date = LocalDate.now().plusDays(45).toString()
        val short = EstimateFlightProvider().search(tlv, lis, date, null).minOf { it.priceMinor }
        val long = EstimateFlightProvider().search(tlv, hnl, date, null).minOf { it.priceMinor }
        assertTrue("Honolulu should out-price Lisbon", long > short)
    }
}
