package com.olakai.app.ui.wall

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.data.model.Spot
import com.olakai.app.ui.components.CamTileView
import com.olakai.app.ui.components.SectionLabel
import com.olakai.app.ui.components.SettingsSheet
import com.olakai.app.ui.components.SpotRail
import com.olakai.app.ui.theme.Ocean

/**
 * The wall: every live cam we have, running side by side, with the places
 * listed down the side. Tap any tile to focus it.
 */
@Composable
fun WallScreen(
    state: WallUiState,
    wide: Boolean,
    onQuery: (String) -> Unit,
    onSort: (WallSort) -> Unit,
    onToggleFavourites: () -> Unit,
    onSelectSpot: (Spot) -> Unit,
    onFocusTile: (CamTile) -> Unit,
    onToggleFavourite: (Spot) -> Unit,
    onRefresh: () -> Unit,
    onBudget: (Int) -> Unit,
    onUseFeet: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    // On a phone the rail has nowhere to sit permanently, so it slides in over
    // the grid instead of being cut from the product.
    var railOpen by rememberSaveable { mutableStateOf(false) }
    var settingsOpen by rememberSaveable { mutableStateOf(false) }

    if (settingsOpen) {
        SettingsSheet(
            useFeet = state.useFeet,
            liveBudget = state.liveBudget,
            camCount = state.tiles.size,
            spotCount = state.spots.size,
            onUseFeet = onUseFeet,
            onLiveBudget = onBudget,
            onDismiss = { settingsOpen = false },
        )
    }

    Column(modifier.fillMaxSize()) {
        WallHeader(
            state = state,
            showRailToggle = !wide,
            railOpen = railOpen,
            onToggleRail = { railOpen = !railOpen },
            onQuery = onQuery,
            onSort = onSort,
            onToggleFavourites = onToggleFavourites,
            onRefresh = onRefresh,
            onSettings = { settingsOpen = true },
        )

        if (state.loading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = Ocean.Aqua)
            }
            return@Column
        }

        state.error?.let { message ->
            Text(
                message,
                color = Ocean.Sunset,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }

        Box(Modifier.fillMaxSize()) {
            Row(Modifier.fillMaxSize()) {
                CamGrid(
                    state = state,
                    columns = if (wide) 3 else 1,
                    onFocusTile = onFocusTile,
                    modifier = Modifier.weight(1f),
                )
                if (wide) {
                    SpotPanel(
                        state = state,
                        onSelectSpot = onSelectSpot,
                        onToggleFavourite = onToggleFavourite,
                        modifier = Modifier.width(320.dp).fillMaxSize(),
                    )
                }
            }

            if (!wide) {
                SpotDrawer(
                    open = railOpen,
                    state = state,
                    onSelectSpot = { spot ->
                        railOpen = false
                        onSelectSpot(spot)
                    },
                    onToggleFavourite = onToggleFavourite,
                    modifier = Modifier.align(Alignment.CenterEnd),
                )
            }
        }
    }
}

/**
 * Kept as its own composable so [AnimatedVisibility] resolves to the plain
 * overload rather than the ColumnScope one from the enclosing layout.
 */
@Composable
private fun SpotDrawer(
    open: Boolean,
    state: WallUiState,
    onSelectSpot: (Spot) -> Unit,
    onToggleFavourite: (Spot) -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedVisibility(
        visible = open,
        enter = slideInHorizontally { it },
        exit = slideOutHorizontally { it },
        modifier = modifier,
    ) {
        SpotPanel(
            state = state,
            onSelectSpot = onSelectSpot,
            onToggleFavourite = onToggleFavourite,
            modifier = Modifier
                .fillMaxWidth(0.82f)
                .fillMaxSize()
                .background(Ocean.Deep),
        )
    }
}

@Composable
private fun SpotPanel(
    state: WallUiState,
    onSelectSpot: (Spot) -> Unit,
    onToggleFavourite: (Spot) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.background(Color(0x0DFFFFFF))) {
        SectionLabel(
            "Spots · ${state.spots.size}",
            Modifier.padding(start = 16.dp, top = 14.dp, bottom = 6.dp),
        )
        SpotRail(
            spots = state.spots,
            conditions = state.conditions,
            favourites = state.favourites,
            selectedId = state.selectedSpotId,
            useFeet = state.useFeet,
            onSelect = onSelectSpot,
            onToggleFavourite = onToggleFavourite,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun CamGrid(
    state: WallUiState,
    columns: Int,
    onFocusTile: (CamTile) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (state.tiles.isEmpty()) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text(
                "No cams match that search.",
                color = Ocean.Slate,
                fontSize = 14.sp,
            )
        }
        return
    }

    val liveIds = state.liveTileIds
    LazyVerticalGrid(
        columns = GridCells.Fixed(columns),
        modifier = modifier,
        contentPadding = PaddingValues(12.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(state.tiles, key = { it.cam.id }) { tile ->
            CamTileView(
                tile = tile,
                live = tile.cam.id in liveIds,
                selected = tile.spot.id == state.selectedSpotId,
                useFeet = state.useFeet,
                onClick = { onFocusTile(tile) },
            )
        }
    }
}

@Composable
private fun WallHeader(
    state: WallUiState,
    showRailToggle: Boolean,
    railOpen: Boolean,
    onToggleRail: () -> Unit,
    onQuery: (String) -> Unit,
    onSort: (WallSort) -> Unit,
    onToggleFavourites: () -> Unit,
    onRefresh: () -> Unit,
    onSettings: () -> Unit,
) {
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(
                    "OlaKai",
                    color = Ocean.Foam,
                    fontWeight = FontWeight.Black,
                    fontSize = 24.sp,
                    style = MaterialTheme.typography.headlineSmall,
                )
                Text(
                    "${state.tiles.size} cams live · ${state.liveBudget} playing",
                    color = Ocean.Slate,
                    fontSize = 11.sp,
                )
            }
            if (showRailToggle) {
                IconButton(onClick = onToggleRail) {
                    Icon(
                        Icons.AutoMirrored.Filled.List,
                        if (railOpen) "Hide the spot list" else "Show the spot list",
                        tint = if (railOpen) Ocean.Aqua else Ocean.Slate,
                    )
                }
            }
            IconButton(onClick = onRefresh) {
                if (state.refreshing) {
                    CircularProgressIndicator(
                        color = Ocean.Aqua,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(18.dp),
                    )
                } else {
                    Icon(Icons.Filled.Refresh, "Refresh conditions", tint = Ocean.Aqua)
                }
            }
        }

        Spacer(Modifier.height(6.dp))

        TextField(
            value = state.query,
            onValueChange = onQuery,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(12.dp)),
            singleLine = true,
            placeholder = { Text("Search a spot, country or tag", fontSize = 13.sp) },
            leadingIcon = { Icon(Icons.Filled.Search, null, tint = Ocean.Slate) },
            trailingIcon = {
                if (state.query.isNotEmpty()) {
                    IconButton(onClick = { onQuery("") }) {
                        Icon(Icons.Filled.Close, "Clear", tint = Ocean.Slate)
                    }
                }
            },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color(0x14FFFFFF),
                unfocusedContainerColor = Color(0x14FFFFFF),
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                focusedTextColor = Ocean.Foam,
                unfocusedTextColor = Ocean.Foam,
            ),
        )

        Spacer(Modifier.height(8.dp))

        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            WallSort.entries.forEach { sort ->
                FilterChip(
                    selected = state.sort == sort,
                    onClick = { onSort(sort) },
                    label = { Text(sort.label, fontSize = 12.sp) },
                    colors = chipColors(),
                )
            }
            FilterChip(
                selected = state.favouritesOnly,
                onClick = onToggleFavourites,
                label = { Text("Favourites", fontSize = 12.sp) },
                leadingIcon = { Icon(Icons.Filled.Star, null, Modifier.size(14.dp)) },
                colors = chipColors(),
            )
            // How many tiles may hold a decoder at once -- the single biggest
            // lever on how the wall performs, so it belongs in reach.
            FilterChip(
                selected = false,
                onClick = onSettings,
                label = { Text("${state.liveBudget} live", fontSize = 12.sp) },
                leadingIcon = { Icon(Icons.Filled.GridView, null, Modifier.size(14.dp)) },
                colors = chipColors(),
            )
        }
    }
}

@Composable
private fun chipColors() = FilterChipDefaults.filterChipColors(
    containerColor = Color(0x14FFFFFF),
    labelColor = Ocean.Slate,
    iconColor = Ocean.Slate,
    selectedContainerColor = Ocean.Aqua.copy(alpha = 0.22f),
    selectedLabelColor = Ocean.Aqua,
    selectedLeadingIconColor = Ocean.Aqua,
)
