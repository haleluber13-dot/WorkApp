package com.olakai.app.util

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore by preferencesDataStore("olakai")

/** Small user settings: home airport, how many cams may run at once, units. */
class Prefs(private val context: Context) {

    val homeAirport: Flow<String> = context.dataStore.data.map { it[HOME] ?: "" }
    val liveBudget: Flow<Int> = context.dataStore.data.map { it[BUDGET] ?: DEFAULT_BUDGET }
    val useFeet: Flow<Boolean> = context.dataStore.data.map { it[FEET] ?: false }
    val priceWeight: Flow<Int> = context.dataStore.data.map { it[PRICE_WEIGHT] ?: 60 }
    val favourites: Flow<Set<String>> = context.dataStore.data.map { prefs ->
        prefs[FAVOURITES]?.split('|')?.filter { it.isNotBlank() }?.toSet() ?: emptySet()
    }

    suspend fun setHomeAirport(iata: String) = put(HOME, iata.uppercase())
    suspend fun setLiveBudget(value: Int) = put(BUDGET, value.coerceIn(1, 12))
    suspend fun setUseFeet(value: Boolean) = put(FEET, value)
    suspend fun setPriceWeight(value: Int) = put(PRICE_WEIGHT, value.coerceIn(0, 100))

    suspend fun toggleFavourite(spotId: String) {
        context.dataStore.edit { prefs ->
            val current = prefs[FAVOURITES]?.split('|')?.filter { it.isNotBlank() }?.toMutableSet()
                ?: mutableSetOf()
            if (!current.add(spotId)) current.remove(spotId)
            prefs[FAVOURITES] = current.joinToString("|")
        }
    }

    private suspend fun <T> put(key: Preferences.Key<T>, value: T) {
        context.dataStore.edit { it[key] = value }
    }

    companion object {
        /**
         * Four simultaneous streams is what a mid-range phone handles without
         * dropping frames; the wall lets people raise it if their device copes.
         */
        const val DEFAULT_BUDGET = 4

        private val HOME = stringPreferencesKey("home_airport")
        private val BUDGET = intPreferencesKey("live_budget")
        private val FEET = booleanPreferencesKey("use_feet")
        private val PRICE_WEIGHT = intPreferencesKey("price_weight")
        private val FAVOURITES = stringPreferencesKey("favourites")
    }
}
