package com.olakai.app.util

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val EARTH_RADIUS_KM = 6371.0

/** Great-circle distance in kilometres. */
fun distanceKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2) * sin(dLat / 2) +
        cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
        sin(dLon / 2) * sin(dLon / 2)
    return 2 * EARTH_RADIUS_KM * asin(min(1.0, sqrt(a)))
}

/** Normalise a value into 0..1 against a range; returns 0 when the range is flat. */
fun normalize(value: Double, min: Double, max: Double): Double =
    if (max - min < 1e-9) 0.0 else ((value - min) / (max - min)).coerceIn(0.0, 1.0)
