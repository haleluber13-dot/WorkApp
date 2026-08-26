package com.olakai.app

import android.app.Application
import android.webkit.WebView
import com.olakai.app.data.catalog.SpotRepository
import com.olakai.app.data.flights.AirportRepository
import com.olakai.app.data.flights.FlightRepository
import com.olakai.app.data.marine.MarineRepository
import com.olakai.app.data.youtube.LiveStreamResolver
import com.olakai.app.util.Prefs

class OlaKaiApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Graph.init(this)
        // Lets chrome://inspect attach to the cam players on a real device.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
    }
}

/**
 * Manual dependency graph. The app has four repositories and no lifecycle
 * subtleties, so a DI framework would cost more than it saves here.
 */
object Graph {
    lateinit var spots: SpotRepository
        private set
    lateinit var marine: MarineRepository
        private set
    lateinit var airports: AirportRepository
        private set
    lateinit var flights: FlightRepository
        private set
    lateinit var prefs: Prefs
        private set
    lateinit var liveStreams: LiveStreamResolver
        private set

    fun init(app: Application) {
        spots = SpotRepository(app)
        marine = MarineRepository()
        airports = AirportRepository(app)
        flights = FlightRepository(app, airports)
        prefs = Prefs(app)
        liveStreams = LiveStreamResolver()
    }
}
