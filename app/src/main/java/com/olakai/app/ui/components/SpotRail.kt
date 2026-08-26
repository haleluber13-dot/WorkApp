package com.olakai.app.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.data.model.Conditions
import com.olakai.app.data.model.Spot
import com.olakai.app.data.model.toCompass
import com.olakai.app.ui.theme.Ocean
import com.olakai.app.ui.theme.scoreColor
import kotlin.math.roundToInt

/**
 * The list of places down the side: name, where it is, and how it is doing
 * right now. This is the app's index -- everything else is reached from here.
 */
@Composable
fun SpotRail(
    spots: List<Spot>,
    conditions: Map<String, Conditions>,
    favourites: Set<String>,
    selectedId: String?,
    useFeet: Boolean,
    onSelect: (Spot) -> Unit,
    onToggleFavourite: (Spot) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 12.dp, end = 12.dp, top = 8.dp, bottom = 24.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(spots, key = { it.id }) { spot ->
            SpotRow(
                spot = spot,
                conditions = conditions[spot.id],
                favourite = spot.id in favourites,
                selected = spot.id == selectedId,
                useFeet = useFeet,
                onClick = { onSelect(spot) },
                onToggleFavourite = { onToggleFavourite(spot) },
            )
        }
    }
}

@Composable
private fun SpotRow(
    spot: Spot,
    conditions: Conditions?,
    favourite: Boolean,
    selected: Boolean,
    useFeet: Boolean,
    onClick: () -> Unit,
    onToggleFavourite: () -> Unit,
) {
    val accent = scoreColor(conditions?.score ?: 0)
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(if (selected) Color(0x2426E0C8) else Color(0x14FFFFFF))
            .border(
                width = if (selected) 1.dp else 0.dp,
                color = if (selected) Ocean.Aqua.copy(alpha = 0.5f) else Color.Transparent,
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // A colour bar carries the score without costing a line of text.
        Box(
            Modifier
                .width(3.dp)
                .height(34.dp)
                .clip(RoundedCornerShape(2.dp))
                .background(accent),
        )
        Spacer(Modifier.width(10.dp))

        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    spot.name,
                    color = Ocean.Foam,
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (spot.hasLiveCam) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        Modifier
                            .size(6.dp)
                            .clip(RoundedCornerShape(3.dp))
                            .background(Ocean.Coral),
                    )
                }
            }
            Text(
                spot.subtitle,
                color = Ocean.Slate,
                fontSize = 11.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(3.dp))
            Text(
                conditions.summaryLine(useFeet),
                color = accent,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
            )
        }

        Icon(
            imageVector = if (favourite) Icons.Filled.Star else Icons.Outlined.StarBorder,
            contentDescription = if (favourite) "Remove from favourites" else "Add to favourites",
            tint = if (favourite) Ocean.Sunset else Ocean.Slate.copy(alpha = 0.6f),
            modifier = Modifier
                .size(20.dp)
                .clickable(onClick = onToggleFavourite),
        )
    }
}

/** e.g. "1.8 m · 12 s · 14 km/h ENE" -- the three numbers that decide a session. */
fun Conditions?.summaryLine(useFeet: Boolean): String {
    if (this == null) return "No reading yet"
    val height = waveHeightM ?: return "No reading yet"
    val size = if (useFeet) {
        "${((height * 3.28084) * 10).roundToInt() / 10.0} ft"
    } else {
        "${(height * 10).roundToInt() / 10.0} m"
    }
    val period = wavePeriodS?.let { " · ${it.roundToInt()} s" } ?: ""
    val wind = windSpeedKmh?.let { speed ->
        val dir = windDirectionDeg?.toCompass()?.let { " $it" } ?: ""
        " · ${speed.roundToInt()} km/h$dir"
    } ?: ""
    return size + period + wind
}
