package com.olakai.app.data.flights

import android.util.Log
import com.olakai.app.BuildConfig
import com.olakai.app.data.Http
import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.FlightLeg
import com.olakai.app.data.model.FlightOption
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.FormBody
import java.time.Duration
import kotlin.math.roundToLong

/**
 * Live fares from Amadeus Self-Service. Optional: without credentials
 * [isAvailable] is false and the repository falls back to the estimator.
 *
 * Add to local.properties (git-ignored):
 *   amadeus.clientId=...
 *   amadeus.clientSecret=...
 */
class AmadeusFlightProvider(
    private val host: String = "https://test.api.amadeus.com",
) : FlightProvider {

    override val name = "Amadeus"

    private val clientId get() = BuildConfig.AMADEUS_CLIENT_ID
    private val clientSecret get() = BuildConfig.AMADEUS_CLIENT_SECRET

    private var token: String? = null
    private var tokenExpiresAt = 0L

    override suspend fun isAvailable(): Boolean =
        clientId.isNotBlank() && clientSecret.isNotBlank()

    private suspend fun token(): String? {
        val cached = token
        if (cached != null && System.currentTimeMillis() < tokenExpiresAt) return cached
        return runCatching {
            val body = FormBody.Builder()
                .add("grant_type", "client_credentials")
                .add("client_id", clientId)
                .add("client_secret", clientSecret)
                .build()
            val json = Http.postString(
                "$host/v1/security/oauth2/token",
                body,
                mapOf("Content-Type" to "application/x-www-form-urlencoded"),
            )
            val obj = Http.json.parseToJsonElement(json).jsonObject
            val access = obj["access_token"]?.jsonPrimitive?.contentOrNull
            val ttl = obj["expires_in"]?.jsonPrimitive?.intOrNull ?: 1500
            token = access
            tokenExpiresAt = System.currentTimeMillis() + (ttl - 60) * 1000L
            access
        }.onFailure { Log.w(TAG, "auth failed: ${it.message}") }.getOrNull()
    }

    override suspend fun search(
        origin: Airport,
        destination: Airport,
        departDate: String,
        returnDate: String?,
        adults: Int,
    ): List<FlightOption> {
        val bearer = token() ?: return emptyList()
        val url = buildString {
            append("$host/v2/shopping/flight-offers")
            append("?originLocationCode=${origin.iata}")
            append("&destinationLocationCode=${destination.iata}")
            append("&departureDate=$departDate")
            if (returnDate != null) append("&returnDate=$returnDate")
            append("&adults=$adults&currencyCode=USD&max=25")
        }

        return runCatching {
            parse(Http.getStringAuthorized(url, bearer), origin, destination, departDate, returnDate)
        }.onFailure { Log.w(TAG, "search failed: ${it.message}") }.getOrDefault(emptyList())
    }

    private fun parse(
        body: String,
        origin: Airport,
        destination: Airport,
        departDate: String,
        returnDate: String?,
    ): List<FlightOption> {
        val data = Http.json.parseToJsonElement(body).jsonObject["data"]?.jsonArray
            ?: return emptyList()
        return data.mapIndexedNotNull { index, element ->
            runCatching {
                val offer = element.jsonObject
                val price = offer["price"]?.jsonObject?.get("grandTotal")
                    ?.jsonPrimitive?.contentOrNull?.toDoubleOrNull() ?: return@mapIndexedNotNull null
                val itineraries = offer["itineraries"]?.jsonArray ?: return@mapIndexedNotNull null

                val legs = mutableListOf<FlightLeg>()
                var totalMinutes = 0
                var stops = 0
                itineraries.forEachIndexed { itIndex, itinerary ->
                    val it0 = itinerary.jsonObject
                    totalMinutes += isoMinutes(it0["duration"]?.jsonPrimitive?.contentOrNull)
                    val segments = it0["segments"]?.jsonArray ?: return@forEachIndexed
                    if (itIndex == 0) stops = (segments.size - 1).coerceAtLeast(0)
                    segments.forEach { segElement ->
                        val seg = segElement.jsonObject
                        legs += FlightLeg(
                            from = seg["departure"]?.jsonObject?.get("iataCode")
                                ?.jsonPrimitive?.contentOrNull.orEmpty(),
                            to = seg["arrival"]?.jsonObject?.get("iataCode")
                                ?.jsonPrimitive?.contentOrNull.orEmpty(),
                            departIso = seg["departure"]?.jsonObject?.get("at")
                                ?.jsonPrimitive?.contentOrNull.orEmpty(),
                            arriveIso = seg["arrival"]?.jsonObject?.get("at")
                                ?.jsonPrimitive?.contentOrNull.orEmpty(),
                            carrier = seg["carrierCode"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                            flightNumber = seg["number"]?.jsonPrimitive?.contentOrNull.orEmpty(),
                            durationMinutes = isoMinutes(seg["duration"]?.jsonPrimitive?.contentOrNull),
                        )
                    }
                }

                FlightOption(
                    id = "amadeus-$index",
                    from = origin.iata,
                    to = destination.iata,
                    priceMinor = (price * 100).roundToLong(),
                    currency = offer["price"]?.jsonObject?.get("currency")
                        ?.jsonPrimitive?.contentOrNull ?: "USD",
                    durationMinutes = totalMinutes,
                    stops = stops,
                    carrier = legs.firstOrNull()?.carrier.orEmpty(),
                    legs = legs,
                    departDate = departDate,
                    bookingUrl = DeepLinks.googleFlights(
                        origin.iata, destination.iata, departDate, returnDate,
                    ),
                    source = name,
                    isEstimate = false,
                )
            }.getOrNull()
        }
    }

    /** "PT12H30M" -> 750 */
    private fun isoMinutes(iso: String?): Int = runCatching {
        Duration.parse(iso ?: return 0).toMinutes().toInt()
    }.getOrDefault(0)

    private companion object {
        const val TAG = "AmadeusProvider"
    }
}
