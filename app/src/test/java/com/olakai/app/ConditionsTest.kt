package com.olakai.app

import com.olakai.app.data.model.Conditions
import com.olakai.app.data.model.Tide
import com.olakai.app.data.model.toCompass
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ConditionsTest {

    private fun conditions(
        wave: Double? = 1.5,
        period: Double? = 12.0,
        wind: Double? = 8.0,
        seaLevel: Double? = null,
        seaLevelNext: Double? = null,
    ) = Conditions(
        spotId = "test",
        waveHeightM = wave,
        wavePeriodS = period,
        waveDirectionDeg = 270.0,
        swellHeightM = wave,
        swellPeriodS = period,
        swellDirectionDeg = 270.0,
        windSpeedKmh = wind,
        windGustKmh = wind?.times(1.4),
        windDirectionDeg = 90.0,
        waterTempC = 20.0,
        airTempC = 22.0,
        seaLevelM = seaLevel,
        seaLevelNextM = seaLevelNext,
    )

    @Test
    fun `clean groundswell scores well above blown-out slop`() {
        val clean = conditions(wave = 1.8, period = 14.0, wind = 5.0).score
        val blown = conditions(wave = 1.8, period = 6.0, wind = 40.0).score
        assertTrue("clean=$clean blown=$blown", clean > blown + 30)
    }

    @Test
    fun `flat water scores near zero`() {
        assertTrue(conditions(wave = 0.1, period = 5.0, wind = 5.0).score < 20)
    }

    @Test
    fun `missing wave height yields no score rather than a guess`() {
        assertEquals(0, conditions(wave = null).score)
    }

    @Test
    fun `score stays inside the published range for extreme input`() {
        val huge = conditions(wave = 12.0, period = 20.0, wind = 0.0).score
        assertTrue(huge in 0..100)
    }

    @Test
    fun `tide direction comes from the sign of the next reading`() {
        assertEquals(Tide.RISING, conditions(seaLevel = 0.2, seaLevelNext = 0.6).tide)
        assertEquals(Tide.FALLING, conditions(seaLevel = 0.6, seaLevelNext = 0.2).tide)
        assertEquals(Tide.SLACK, conditions(seaLevel = 0.4, seaLevelNext = 0.41).tide)
        assertEquals(Tide.UNKNOWN, conditions().tide)
    }

    @Test
    fun `bearings map onto compass points`() {
        assertEquals("N", 0.0.toCompass())
        assertEquals("E", 90.0.toCompass())
        assertEquals("SW", 225.0.toCompass())
        assertEquals("WNW", 292.5.toCompass())
        // Wrap-around and negatives must not throw or index out of range.
        assertEquals("N", 360.0.toCompass())
        assertEquals("N", (-0.5).toCompass())
    }
}
