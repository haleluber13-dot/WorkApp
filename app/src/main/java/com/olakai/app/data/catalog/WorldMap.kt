package com.olakai.app.data.catalog

import android.content.Context
import com.olakai.app.data.Http
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable

/** Simplified world coastlines (Natural Earth 110m, public domain) as lon/lat rings. */
@Serializable
data class LandOutline(val polygons: List<List<List<Double>>> = emptyList())

class WorldMapRepository(private val context: Context) {

    @Volatile private var cache: LandOutline? = null

    suspend fun land(): LandOutline {
        cache?.let { return it }
        return withContext(Dispatchers.IO) {
            cache ?: runCatching {
                val text = context.assets.open("world_land.json")
                    .bufferedReader().use { it.readText() }
                Http.json.decodeFromString<LandOutline>(text)
            }.getOrDefault(LandOutline()).also { cache = it }
        }
    }
}
