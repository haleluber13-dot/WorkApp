package com.olakai.app.data.flights

import android.content.Context
import com.olakai.app.data.Http
import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.AirportIndex
import com.olakai.app.util.distanceKm
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The bundled airport index (OurAirports, public domain): every airport with an
 * IATA code and scheduled service. Used to turn "this reef in Bali" into "fly
 * into DPS" and to guess the user's home airport from their location.
 */
class AirportRepository(private val context: Context) {

    @Volatile private var cache: List<Airport>? = null
    @Volatile private var byIata: Map<String, Airport> = emptyMap()

    suspend fun all(): List<Airport> {
        cache?.let { return it }
        return withContext(Dispatchers.IO) {
            cache ?: run {
                val text = context.assets.open("airports.json")
                    .bufferedReader().use { it.readText() }
                val list = Http.json.decodeFromString<AirportIndex>(text).airports
                cache = list
                byIata = list.associateBy { it.iata }
                list
            }
        }
    }

    suspend fun byCode(iata: String): Airport? {
        all()
        return byIata[iata.uppercase()]
    }

    suspend fun codes(iatas: List<String>): List<Airport> {
        all()
        return iatas.mapNotNull { byIata[it.uppercase()] }
    }

    /**
     * Closest airport worth flying into. [minSize] 3 = major hub, 2 = regional --
     * we start at hubs so "nearest" doesn't hand back an airstrip with no fares.
     */
    suspend fun nearest(lat: Double, lon: Double, minSize: Int = 3): Airport? =
        all().filter { it.size >= minSize }
            .minByOrNull { distanceKm(lat, lon, it.lat, it.lon) }
            ?: if (minSize > 1) nearest(lat, lon, minSize - 1) else null

    suspend fun search(query: String, limit: Int = 12): List<Airport> {
        val q = query.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        return all().asSequence()
            .filter {
                it.iata.lowercase() == q ||
                    it.city.lowercase().startsWith(q) ||
                    it.name.lowercase().contains(q) ||
                    it.city.lowercase().contains(q)
            }
            .sortedWith(
                compareByDescending<Airport> { it.iata.lowercase() == q }
                    .thenByDescending { it.city.lowercase().startsWith(q) }
                    .thenByDescending { it.size },
            )
            .take(limit)
            .toList()
    }
}
