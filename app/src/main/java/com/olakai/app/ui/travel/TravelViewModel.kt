package com.olakai.app.ui.travel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.olakai.app.Graph
import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.Spot
import com.olakai.app.data.model.TripBoard
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate

data class TravelUiState(
    val spot: Spot? = null,
    val originQuery: String = "",
    val originSuggestions: List<Airport> = emptyList(),
    val origin: Airport? = null,
    val departDate: LocalDate = LocalDate.now().plusDays(30),
    val returnDate: LocalDate? = LocalDate.now().plusDays(44),
    val adults: Int = 1,
    /**
     * 0 = optimise purely for time, 100 = purely for price. Balanced by default
     * so "best value" picks the compromise rather than echoing "cheapest".
     */
    val priceWeight: Int = 50,
    val board: TripBoard? = null,
    val loading: Boolean = false,
    val error: String? = null,
)

class TravelViewModel : ViewModel() {

    private val _state = MutableStateFlow(TravelUiState())
    val state: StateFlow<TravelUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val saved = Graph.prefs.homeAirport.first()
            val weight = Graph.prefs.priceWeight.first()
            val airport = saved.takeIf { it.isNotBlank() }?.let { Graph.airports.byCode(it) }
            _state.update {
                it.copy(
                    origin = airport,
                    originQuery = airport?.let { a -> "${a.iata} — ${a.city}" } ?: "",
                    priceWeight = weight,
                )
            }
            if (airport != null) search()
        }
    }

    fun open(spot: Spot) {
        _state.update { it.copy(spot = spot, board = null) }
        search()
    }

    fun onOriginQuery(query: String) {
        _state.update { it.copy(originQuery = query) }
        viewModelScope.launch {
            val hits = if (query.length >= 2) Graph.airports.search(query) else emptyList()
            _state.update { it.copy(originSuggestions = hits) }
        }
    }

    fun chooseOrigin(airport: Airport) {
        _state.update {
            it.copy(
                origin = airport,
                originQuery = "${airport.iata} — ${airport.city}",
                originSuggestions = emptyList(),
            )
        }
        viewModelScope.launch { Graph.prefs.setHomeAirport(airport.iata) }
        search()
    }

    fun setDepart(date: LocalDate) {
        _state.update { s ->
            val ret = s.returnDate?.let { if (it.isBefore(date)) date.plusDays(14) else it }
            s.copy(departDate = date, returnDate = ret)
        }
        search()
    }

    fun setReturn(date: LocalDate?) {
        _state.update { it.copy(returnDate = date) }
        search()
    }

    fun setAdults(count: Int) {
        _state.update { it.copy(adults = count.coerceIn(1, 6)) }
        search()
    }

    /**
     * Re-rank without re-querying: the trade between money and time is a slider,
     * and moving it should feel instant.
     */
    fun setPriceWeight(weight: Int) {
        _state.update { s ->
            val board = s.board?.let { b ->
                b.copy(bestValue = Graph.flights.bestValue(b.options, weight / 100.0))
            }
            s.copy(priceWeight = weight, board = board)
        }
        viewModelScope.launch { Graph.prefs.setPriceWeight(weight) }
    }

    fun search() {
        val current = _state.value
        val spot = current.spot ?: return
        val origin = current.origin ?: run {
            _state.update { it.copy(error = "Pick the airport you are flying from.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            val board = runCatching {
                Graph.flights.board(
                    spot = spot,
                    originIata = origin.iata,
                    departDate = current.departDate.toString(),
                    returnDate = current.returnDate?.toString(),
                    adults = current.adults,
                    priceWeight = current.priceWeight / 100.0,
                )
            }.getOrNull()
            _state.update {
                it.copy(
                    loading = false,
                    board = board,
                    error = if (board == null) "Could not price that route." else null,
                )
            }
        }
    }
}
