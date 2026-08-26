package com.olakai.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.sp
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.olakai.app.data.model.Spot
import com.olakai.app.ui.atlas.AtlasScreen
import com.olakai.app.ui.focus.FocusScreen
import com.olakai.app.ui.theme.Ocean
import com.olakai.app.ui.theme.OlaKaiTheme
import com.olakai.app.ui.travel.TravelScreen
import com.olakai.app.ui.travel.TravelViewModel
import com.olakai.app.ui.wall.WallScreen
import com.olakai.app.ui.wall.WallViewModel

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val wallViewModel = ViewModelProvider(
            this,
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : androidx.lifecycle.ViewModel> create(modelClass: Class<T>): T =
                    WallViewModel(applicationContext) as T
            },
        )[WallViewModel::class.java]

        val locationRequest = registerForActivityResult(
            ActivityResultContracts.RequestPermission(),
        ) { granted -> if (granted) wallViewModel.onLocationGranted() }

        setContent {
            OlaKaiTheme {
                OlaKaiRoot(
                    wallViewModel = wallViewModel,
                    onRequestLocation = {
                        locationRequest.launch(android.Manifest.permission.ACCESS_COARSE_LOCATION)
                    },
                )
            }
        }
    }
}

private enum class Tab(val label: String) { WALL("Wall"), ATLAS("Atlas"), TRIP("Trip") }

@Composable
private fun OlaKaiRoot(
    wallViewModel: WallViewModel,
    onRequestLocation: () -> Unit,
) {
    val context = LocalContext.current
    val travelViewModel: TravelViewModel = viewModel()
    val wall by wallViewModel.state.collectAsStateWithLifecycle()
    val travel by travelViewModel.state.collectAsStateWithLifecycle()

    var tab by remember { mutableStateOf(Tab.WALL) }
    var focused by remember { mutableStateOf<Spot?>(null) }

    val openUrl: (String) -> Unit = { url ->
        runCatching {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        }
    }
    val wide = LocalConfiguration.current.screenWidthDp >= 720

    Column(
        Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(listOf(Ocean.Abyss, Ocean.Deep, Ocean.Abyss)),
            )
            .statusBarsPadding(),
    ) {
        Box(Modifier.weight(1f)) {
            val spot = focused
            when {
                spot != null && tab == Tab.WALL -> FocusScreen(
                    spot = spot,
                    conditions = wall.conditions[spot.id],
                    favourite = spot.id in wall.favourites,
                    useFeet = wall.useFeet,
                    wide = wide,
                    onBack = { focused = null },
                    onToggleFavourite = { wallViewModel.toggleFavourite(spot.id) },
                    onPlanTrip = {
                        travelViewModel.open(spot)
                        tab = Tab.TRIP
                    },
                    onOpenUrl = openUrl,
                )

                tab == Tab.WALL -> WallScreen(
                    state = wall,
                    wide = wide,
                    onQuery = wallViewModel::setQuery,
                    onSort = { sort ->
                        if (sort == com.olakai.app.ui.wall.WallSort.NEAREST) onRequestLocation()
                        wallViewModel.setSort(sort)
                    },
                    onToggleFavourites = wallViewModel::toggleFavouritesOnly,
                    onSelectSpot = { selected ->
                        wallViewModel.select(selected.id)
                        focused = selected
                    },
                    onFocusTile = { tile ->
                        wallViewModel.select(tile.spot.id)
                        focused = tile.spot
                    },
                    onToggleFavourite = { wallViewModel.toggleFavourite(it.id) },
                    onRefresh = wallViewModel::refreshConditions,
                    onBudget = wallViewModel::setLiveBudget,
                    onUseFeet = wallViewModel::setUseFeet,
                )

                tab == Tab.ATLAS -> AtlasScreen(
                    spots = wall.spots,
                    conditions = wall.conditions,
                    onSelect = { selected ->
                        wallViewModel.select(selected.id)
                        focused = selected
                        tab = Tab.WALL
                    },
                )

                else -> TravelScreen(
                    state = travel,
                    onBack = { tab = Tab.WALL },
                    onOriginQuery = travelViewModel::onOriginQuery,
                    onChooseOrigin = travelViewModel::chooseOrigin,
                    onDepart = travelViewModel::setDepart,
                    onReturn = travelViewModel::setReturn,
                    onAdults = travelViewModel::setAdults,
                    onPriceWeight = travelViewModel::setPriceWeight,
                    onOpenUrl = openUrl,
                )
            }
        }

        NavigationBar(
            containerColor = Ocean.Ink.copy(alpha = 0.92f),
            modifier = Modifier.navigationBarsPadding(),
        ) {
            Tab.entries.forEach { entry ->
                NavigationBarItem(
                    selected = tab == entry && (entry != Tab.WALL || focused == null),
                    onClick = {
                        if (entry == Tab.TRIP) {
                            focused?.let { travelViewModel.open(it) }
                        }
                        // Focus is a wall detail view; any other tab replaces it.
                        if (entry != Tab.TRIP) focused = null
                        tab = entry
                    },
                    icon = {
                        Icon(
                            when (entry) {
                                Tab.WALL -> Icons.Filled.Videocam
                                Tab.ATLAS -> Icons.Filled.Public
                                Tab.TRIP -> Icons.Filled.FlightTakeoff
                            },
                            contentDescription = entry.label,
                        )
                    },
                    label = { Text(entry.label, fontSize = 11.sp) },
                    colors = NavigationBarItemDefaults.colors(
                        selectedIconColor = Ocean.Ink,
                        selectedTextColor = Ocean.Aqua,
                        indicatorColor = Ocean.Aqua,
                        unselectedIconColor = Ocean.Slate,
                        unselectedTextColor = Ocean.Slate,
                    ),
                )
            }
        }
    }
}
