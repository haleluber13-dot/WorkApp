package com.olakai.app.data.flights

import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.FlightOption

/** A source of fares. Swap in a real one by dropping credentials into local.properties. */
interface FlightProvider {
    val name: String

    /** True when this provider is actually configured and worth calling. */
    suspend fun isAvailable(): Boolean

    suspend fun search(
        origin: Airport,
        destination: Airport,
        departDate: String,
        returnDate: String?,
        adults: Int = 1,
    ): List<FlightOption>
}
