package com.olakai.app.ui.wall

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationManager
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.olakai.app.BuildConfig
import com.olakai.app.Graph
import com.olakai.app.data.model.Cam
import com.olakai.app.data.model.CamKind
import com.olakai.app.data.model.Conditions
import com.olakai.app.data.model.Spot
import com.olakai.app.util.distanceKm
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** One tile on the wall: a camera, the spot it points at, and its numbers. */
data class CamTile(
    val cam: Cam,
    val spot: Spot,
    val conditions: Conditions?,
) {
    /**
     * True for a cam we may link to but not embed -- MEO Beachcam answers 403
     * to anyone but their own player. These render as cards that open the
     * operator's page rather than tiles that would sit black forever.
     */
    val isOperatorLink: Boolean get() = cam.kind == CamKind.EXTERNAL
}

enum class WallSort(val label: String) {
    FIRING("Firing now"),
    NEAREST("Nearest"),
    NAME("A–Z"),
}

data class WallUiState(
    val loading: Boolean = true,
    val tiles: List<CamTile> = emptyList(),
    val spots: List<Spot> = emptyList(),
    val conditions: Map<String, Conditions> = emptyMap(),
    val query: String = "",
    val sort: WallSort = WallSort.FIRING,
    val favouritesOnly: Boolean = false,
    val favourites: Set<String> = emptySet(),
    val liveBudget: Int = 4,
    val useFeet: Boolean = false,
    val selectedSpotId: String? = null,
    val lastRefresh: Long = 0L,
    val refreshing: Boolean = false,
    val error: String? = null,
) {
    /**
     * Tiles allowed to hold a live decoder right now. Everything past the budget
     * shows a still card -- eight simultaneous video streams will stutter on
     * most phones, and a stuttering wall is worse than a paused one.
     */
    val liveTileIds: Set<String>
        get() = tiles.filterNot { it.isOperatorLink }
            .take(liveBudget)
            .map { it.cam.id }
            .toSet()

    val selectedSpot: Spot? get() = spots.firstOrNull { it.id == selectedSpotId }
}

class WallViewModel(context: Context) : ViewModel() {

    private val appContext = context.applicationContext
    private val _state = MutableStateFlow(WallUiState())
    val state: StateFlow<WallUiState> = _state.asStateFlow()

    private var here: Location? = null

    init {
        viewModelScope.launch {
            combine(
                Graph.prefs.liveBudget,
                Graph.prefs.useFeet,
                Graph.prefs.favourites,
            ) { budget, feet, favourites -> Triple(budget, feet, favourites) }
                .collect { (budget, feet, favourites) ->
                    _state.update {
                        it.copy(liveBudget = budget, useFeet = feet, favourites = favourites)
                    }
                    reproject()
                }
        }
        viewModelScope.launch { load() }
        viewModelScope.launch {
            // Marine models update hourly; a ten-minute poll keeps the wall fresh
            // without hammering a free API.
            while (true) {
                delay(REFRESH_INTERVAL_MS)
                refreshConditions()
            }
        }
    }

    private suspend fun load() {
        // A hosted catalog, when one is configured, wins over the bundled copy.
        // Failure here is silent by design: the bundled catalog still works.
        if (BuildConfig.CATALOG_URL.isNotBlank()) {
            Graph.spots.refreshFromRemote(BuildConfig.CATALOG_URL)
        }
        val spots = runCatching { Graph.spots.spots() }.getOrElse {
            _state.update { s -> s.copy(loading = false, error = "Could not read the spot catalog.") }
            return
        }
        readLastLocation()
        _state.update { it.copy(spots = spots, loading = false) }
        reproject()
        refreshConditions()
    }

    fun refreshConditions() {
        viewModelScope.launch {
            val spots = _state.value.spots
            if (spots.isEmpty()) return@launch
            _state.update { it.copy(refreshing = true) }
            val conditions = Graph.marine.load(spots)
            _state.update {
                it.copy(
                    conditions = if (conditions.isEmpty()) it.conditions else conditions,
                    refreshing = false,
                    lastRefresh = if (conditions.isEmpty()) it.lastRefresh else System.currentTimeMillis(),
                    error = if (conditions.isEmpty() && it.conditions.isEmpty()) {
                        "No connection — showing the catalog without live readings."
                    } else {
                        null
                    },
                )
            }
            reproject()
        }
    }

    fun setQuery(query: String) {
        _state.update { it.copy(query = query) }
        reproject()
    }

    fun setSort(sort: WallSort) {
        _state.update { it.copy(sort = sort) }
        reproject()
    }

    fun toggleFavouritesOnly() {
        _state.update { it.copy(favouritesOnly = !it.favouritesOnly) }
        reproject()
    }

    fun select(spotId: String?) {
        _state.update { it.copy(selectedSpotId = spotId) }
    }

    fun toggleFavourite(spotId: String) {
        viewModelScope.launch { Graph.prefs.toggleFavourite(spotId) }
    }

    fun setLiveBudget(value: Int) {
        viewModelScope.launch { Graph.prefs.setLiveBudget(value) }
    }

    fun setUseFeet(value: Boolean) {
        viewModelScope.launch { Graph.prefs.setUseFeet(value) }
    }

    /** Rebuild the visible tile list from the current spots, filters and sort. */
    private fun reproject() {
        _state.update { s ->
            val q = s.query.trim().lowercase()
            val matching = s.spots.filter { spot ->
                val matchesQuery = q.isEmpty() ||
                    spot.name.lowercase().contains(q) ||
                    spot.region.lowercase().contains(q) ||
                    spot.country.lowercase().contains(q) ||
                    spot.tags.any { it.lowercase().contains(q) }
                val matchesFavourite = !s.favouritesOnly || spot.id in s.favourites
                matchesQuery && matchesFavourite
            }

            val ordered = when (s.sort) {
                WallSort.FIRING -> matching.sortedByDescending { s.conditions[it.id]?.score ?: -1 }
                WallSort.NAME -> matching.sortedBy { it.name }
                WallSort.NEAREST -> here?.let { loc ->
                    matching.sortedBy { distanceKm(loc.latitude, loc.longitude, it.lat, it.lon) }
                } ?: matching.sortedByDescending { s.conditions[it.id]?.score ?: -1 }
            }

            // Round-robin across spots rather than grouping each spot's cams
            // together: three Waikiki angles in a row buries everything else at
            // the top of the wall. Every spot shows its best cam first, then
            // second cams follow, and so on.
            val camsBySpot = ordered.map { spot -> spot to spot.cams.filter { it.isLiveVideo } }
            val depth = camsBySpot.maxOfOrNull { it.second.size } ?: 0
            val playable = (0 until depth).flatMap { round ->
                camsBySpot.mapNotNull { (spot, cams) ->
                    cams.getOrNull(round)?.let { cam ->
                        CamTile(cam = cam, spot = spot, conditions = s.conditions[spot.id])
                    }
                }
            }

            // Operator cams last: a spot whose only live view is MEO's own page
            // is otherwise invisible unless you happen to open it from the list.
            val operatorBySpot = ordered.map { spot ->
                spot to spot.externalCams.filter { it.provider == OPERATOR_PROVIDER }
            }
            val operatorDepth = operatorBySpot.maxOfOrNull { it.second.size } ?: 0
            val operatorTiles = (0 until operatorDepth).flatMap { round ->
                operatorBySpot.mapNotNull { (spot, cams) ->
                    cams.getOrNull(round)?.let { cam ->
                        CamTile(cam = cam, spot = spot, conditions = s.conditions[spot.id])
                    }
                }
            }
            val tiles = playable + operatorTiles
            s.copy(tiles = tiles)
        }
    }

    /**
     * Last known location only -- no active fix. It is used to sort the rail and
     * to guess a home airport, neither of which is worth a GPS wake-up.
     */
    @SuppressLint("MissingPermission")
    private fun readLastLocation() {
        val granted = androidx.core.content.ContextCompat.checkSelfPermission(
            appContext, android.Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        if (!granted) return
        val manager = appContext.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return
        here = runCatching {
            manager.getProviders(true).asSequence()
                .mapNotNull { manager.getLastKnownLocation(it) }
                .maxByOrNull { it.time }
        }.getOrNull()
    }

    fun onLocationGranted() {
        readLastLocation()
        reproject()
    }

    private companion object {
        const val REFRESH_INTERVAL_MS = 10 * 60 * 1000L

        /** Operators whose cams get a wall card even though they cannot embed. */
        const val OPERATOR_PROVIDER = "MEO Beachcam"
    }
}
