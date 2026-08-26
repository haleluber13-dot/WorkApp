package com.olakai.app.data.model

import kotlin.math.roundToInt

/** Live marine + wind readings for one spot, as served by Open-Meteo. */
data class Conditions(
    val spotId: String,
    val waveHeightM: Double?,
    val wavePeriodS: Double?,
    val waveDirectionDeg: Double?,
    val swellHeightM: Double?,
    val swellPeriodS: Double?,
    val swellDirectionDeg: Double?,
    val windSpeedKmh: Double?,
    val windGustKmh: Double?,
    val windDirectionDeg: Double?,
    val waterTempC: Double?,
    val airTempC: Double?,
    val seaLevelM: Double?,
    /** Sea level an hour from now -- the sign tells you push or drain. */
    val seaLevelNextM: Double? = null,
    val fetchedAtMillis: Long = 0L,
) {
    val waveHeightFt: Double? get() = waveHeightM?.times(3.28084)

    val tide: Tide
        get() {
            val now = seaLevelM ?: return Tide.UNKNOWN
            val next = seaLevelNextM ?: return Tide.UNKNOWN
            val delta = next - now
            return when {
                delta > 0.05 -> Tide.RISING
                delta < -0.05 -> Tide.FALLING
                else -> Tide.SLACK
            }
        }

    /**
     * A 0-100 "how good does it look right now" read.
     *
     * Size sets the ceiling and period and wind scale it down from there --
     * deliberately multiplicative, because a glassy flat ocean is still a flat
     * ocean, and an additive model would reward it for the lack of wind. It is a
     * glanceable sort key for the wall, not a forecast.
     */
    val score: Int
        get() {
            val h = waveHeightM ?: return 0
            val p = wavePeriodS ?: 8.0
            val wind = windSpeedKmh ?: 0.0

            // Size: rewards chest-to-double-overhead, tapers off either side.
            val size = when {
                h < 0.3 -> 5.0
                h < 0.8 -> 30.0 + (h - 0.3) * 80.0
                h <= 2.5 -> 70.0 + (h - 0.8) * 15.0
                h <= 4.0 -> 95.0 - (h - 2.5) * 8.0
                else -> 70.0
            }
            // Groundswell beats windswell.
            val periodQuality = ((p - 6.0) / 10.0).coerceIn(0.0, 1.0)
            // Past ~35 km/h it is chopped up whatever the direction.
            val windQuality = (1.0 - (wind / 35.0)).coerceIn(0.0, 1.0)

            // Worst case still keeps half the size score; best case keeps all.
            val quality = 0.5 + 0.3 * periodQuality + 0.2 * windQuality
            return (size * quality).coerceIn(0.0, 100.0).roundToInt()
        }

    val verdict: String
        get() = when (score) {
            in 85..100 -> "Firing"
            in 70..84 -> "Very good"
            in 55..69 -> "Fun"
            in 40..54 -> "Rideable"
            in 20..39 -> "Marginal"
            else -> "Flat / blown"
        }
}

enum class Tide { RISING, FALLING, SLACK, UNKNOWN }

/** Compass label for a bearing, e.g. 292 -> "WNW". */
fun Double.toCompass(): String {
    val points = listOf(
        "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
    )
    val idx = (((this % 360) + 360) % 360 / 22.5).roundToInt() % 16
    return points[idx]
}
