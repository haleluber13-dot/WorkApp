package com.olakai.app.data.marine

import android.util.Log
import com.olakai.app.data.Http
import com.olakai.app.data.model.Conditions
import com.olakai.app.data.model.Spot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/**
 * Live conditions from Open-Meteo's free marine + forecast endpoints.
 *
 * Both endpoints accept comma-separated coordinate lists and answer in request
 * order, so the whole wall refreshes in two calls instead of two per spot. No
 * API key, no account -- which is why the app has live data out of the box.
 */
class MarineRepository {

    private val marineFields = listOf(
        "wave_height", "wave_direction", "wave_period",
        "swell_wave_height", "swell_wave_period", "swell_wave_direction",
        "sea_level_height_msl", "sea_surface_temperature",
    ).joinToString(",")

    private val windFields = listOf(
        "wind_speed_10m", "wind_direction_10m", "wind_gusts_10m", "temperature_2m",
    ).joinToString(",")

    suspend fun load(spots: List<Spot>): Map<String, Conditions> {
        if (spots.isEmpty()) return emptyMap()
        return withContext(Dispatchers.IO) {
            // Open-Meteo caps URL length; chunk so very large catalogs still work.
            spots.chunked(CHUNK).map { chunk ->
                async { loadChunk(chunk) }
            }.awaitAll()
        }.reduceOrNull { a, b -> a + b } ?: emptyMap()
    }

    private suspend fun loadChunk(spots: List<Spot>): Map<String, Conditions> = coroutineScope {
        val lats = spots.joinToString(",") { trim(it.lat) }
        val lons = spots.joinToString(",") { trim(it.lon) }

        val marineUrl = "https://marine-api.open-meteo.com/v1/marine" +
            "?latitude=$lats&longitude=$lons" +
            "&current=$marineFields" +
            "&hourly=sea_level_height_msl&forecast_days=1&timeformat=unixtime"
        val windUrl = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=$lats&longitude=$lons" +
            "&current=$windFields&timeformat=unixtime"

        val marineJob = async { runCatching { normalize(Http.getString(marineUrl)) }.getOrNull() }
        val windJob = async { runCatching { normalize(Http.getString(windUrl)) }.getOrNull() }
        val marine = marineJob.await()
        val wind = windJob.await()

        if (marine == null && wind == null) {
            Log.w(TAG, "conditions refresh failed for ${spots.size} spots")
            return@coroutineScope emptyMap()
        }

        val now = System.currentTimeMillis()
        spots.mapIndexed { index, spot ->
            val m = marine?.getOrNull(index)?.jsonObject
            val w = wind?.getOrNull(index)?.jsonObject
            val mc = m?.get("current")?.jsonObject
            val wc = w?.get("current")?.jsonObject
            spot.id to Conditions(
                spotId = spot.id,
                waveHeightM = mc.num("wave_height"),
                wavePeriodS = mc.num("wave_period"),
                waveDirectionDeg = mc.num("wave_direction"),
                swellHeightM = mc.num("swell_wave_height"),
                swellPeriodS = mc.num("swell_wave_period"),
                swellDirectionDeg = mc.num("swell_wave_direction"),
                windSpeedKmh = wc.num("wind_speed_10m"),
                windGustKmh = wc.num("wind_gusts_10m"),
                windDirectionDeg = wc.num("wind_direction_10m"),
                waterTempC = mc.num("sea_surface_temperature"),
                airTempC = wc.num("temperature_2m"),
                seaLevelM = mc.num("sea_level_height_msl"),
                seaLevelNextM = nextHourSeaLevel(m, mc?.get("time")?.jsonPrimitive?.long),
                fetchedAtMillis = now,
            )
        }.toMap()
    }

    /** Sea level roughly an hour out -- the delta is what tells us push vs. drain. */
    private fun nextHourSeaLevel(root: JsonObject?, nowUnix: Long?): Double? {
        val hourly = root?.get("hourly")?.jsonObject ?: return null
        val times = hourly["time"]?.jsonArray ?: return null
        val values = hourly["sea_level_height_msl"]?.jsonArray ?: return null
        val target = (nowUnix ?: (System.currentTimeMillis() / 1000)) + 3600
        var best: Int? = null
        var bestDelta = Long.MAX_VALUE
        for (i in 0 until times.size) {
            val t = times[i].jsonPrimitive.long
            val d = kotlin.math.abs(t - target)
            if (d < bestDelta) {
                bestDelta = d
                best = i
            }
        }
        return best?.let { values.getOrNull(it)?.jsonPrimitive?.doubleOrNull }
    }

    /** Open-Meteo answers with an object for one coordinate, an array for many. */
    private fun normalize(body: String): List<JsonElement> {
        val element = Http.json.parseToJsonElement(body)
        return if (element is JsonArray) element.toList() else listOf(element)
    }

    private fun JsonObject?.num(key: String): Double? =
        this?.get(key)?.jsonPrimitive?.doubleOrNull

    private fun trim(v: Double) = String.format(java.util.Locale.US, "%.4f", v)

    private companion object {
        const val TAG = "MarineRepository"
        const val CHUNK = 40
    }
}
