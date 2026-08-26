package com.olakai.app.ui.focus

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FlightTakeoff
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.data.model.Cam
import com.olakai.app.data.model.CamKind
import com.olakai.app.data.model.Conditions
import com.olakai.app.data.model.Spot
import com.olakai.app.data.model.Tide
import com.olakai.app.data.model.toCompass
import com.olakai.app.ui.components.GlassPanel
import com.olakai.app.ui.components.HlsLive
import com.olakai.app.ui.components.LiveDot
import com.olakai.app.ui.components.Metric
import com.olakai.app.ui.components.ScoreBadge
import com.olakai.app.ui.components.SectionLabel
import com.olakai.app.ui.components.Tag
import com.olakai.app.ui.components.YouTubeLive
import com.olakai.app.ui.theme.Ocean
import kotlin.math.roundToInt

/**
 * One spot, full screen: the cam large, the numbers under it, and everything
 * worth knowing about the place beside it.
 */
@Composable
fun FocusScreen(
    spot: Spot,
    conditions: Conditions?,
    favourite: Boolean,
    useFeet: Boolean,
    wide: Boolean,
    onBack: () -> Unit,
    onToggleFavourite: () -> Unit,
    onPlanTrip: () -> Unit,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    var camIndex by rememberSaveable(spot.id) { mutableIntStateOf(0) }
    val cams = remember(spot.id) { spot.cams.filter { it.isLiveVideo } }
    val cam = cams.getOrNull(camIndex)

    val player: @Composable (Modifier) -> Unit = { m ->
        Box(m.background(Ocean.Ink)) {
            when {
                cam == null -> NoCamPanel(spot, onOpenUrl)
                cam.kind == CamKind.HLS -> HlsLive(cam, Modifier.fillMaxSize(), muted = false, showControls = true)
                else -> YouTubeLive(cam, Modifier.fillMaxSize(), muted = false, showControls = true)
            }
            if (cam != null) {
                LiveDot(Modifier.align(Alignment.TopStart).padding(10.dp))
            }
        }
    }

    Column(modifier.fillMaxSize()) {
        FocusHeader(spot, conditions, favourite, onBack, onToggleFavourite)

        if (wide) {
            Row(Modifier.fillMaxSize()) {
                Column(Modifier.weight(1.4f)) {
                    player(Modifier.fillMaxWidth().aspectRatio(16f / 9f))
                    CamSwitcher(cams, camIndex) { camIndex = it }
                    ConditionsStrip(conditions, useFeet, Modifier.padding(12.dp))
                }
                InfoPanel(
                    spot = spot,
                    onPlanTrip = onPlanTrip,
                    onOpenUrl = onOpenUrl,
                    modifier = Modifier.width(380.dp).fillMaxSize(),
                )
            }
        } else {
            LazyColumn(Modifier.fillMaxSize()) {
                item {
                    player(Modifier.fillMaxWidth().aspectRatio(16f / 9f))
                    CamSwitcher(cams, camIndex) { camIndex = it }
                    ConditionsStrip(conditions, useFeet, Modifier.padding(12.dp))
                }
                item {
                    InfoPanel(
                        spot = spot,
                        onPlanTrip = onPlanTrip,
                        onOpenUrl = onOpenUrl,
                        modifier = Modifier.fillMaxWidth(),
                        scrollable = false,
                    )
                }
            }
        }
    }
}

@Composable
private fun FocusHeader(
    spot: Spot,
    conditions: Conditions?,
    favourite: Boolean,
    onBack: () -> Unit,
    onToggleFavourite: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 6.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(onClick = onBack) {
            Icon(Icons.Filled.ArrowBack, "Back to the wall", tint = Ocean.Foam)
        }
        Column(Modifier.weight(1f)) {
            Text(spot.name, color = Ocean.Foam, fontWeight = FontWeight.Black, fontSize = 20.sp)
            Text(spot.subtitle, color = Ocean.Slate, fontSize = 12.sp)
        }
        ScoreBadge(conditions)
        IconButton(onClick = onToggleFavourite) {
            Icon(
                if (favourite) Icons.Filled.Star else Icons.Outlined.StarBorder,
                "Favourite",
                tint = if (favourite) Ocean.Sunset else Ocean.Slate,
            )
        }
    }
}

@Composable
private fun CamSwitcher(cams: List<Cam>, index: Int, onSelect: (Int) -> Unit) {
    if (cams.size <= 1) return
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        cams.forEachIndexed { i, cam ->
            val selected = i == index
            Text(
                cam.title,
                modifier = Modifier
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (selected) Ocean.Aqua.copy(alpha = 0.22f) else Color(0x14FFFFFF))
                    .clickable { onSelect(i) }
                    .padding(horizontal = 10.dp, vertical = 6.dp),
                color = if (selected) Ocean.Aqua else Ocean.Slate,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
            )
        }
    }
}

/** The readings that decide whether you go: size, period, wind, tide, water. */
@Composable
fun ConditionsStrip(conditions: Conditions?, useFeet: Boolean, modifier: Modifier = Modifier) {
    GlassPanel(modifier.fillMaxWidth()) {
        Row(
            Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(horizontal = 14.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(20.dp),
        ) {
            val height = conditions?.waveHeightM
            Metric(
                value = when {
                    height == null -> "–"
                    useFeet -> "${((height * 3.28084) * 10).roundToInt() / 10.0} ft"
                    else -> "${(height * 10).roundToInt() / 10.0} m"
                },
                label = "Wave",
                color = Ocean.Aqua,
            )
            Metric(
                value = conditions?.wavePeriodS?.let { "${it.roundToInt()} s" } ?: "–",
                label = "Period",
            )
            Metric(
                value = conditions?.swellDirectionDeg?.toCompass() ?: "–",
                label = "Swell dir",
            )
            Metric(
                value = conditions?.windSpeedKmh?.let { "${it.roundToInt()} km/h" } ?: "–",
                label = conditions?.windDirectionDeg?.toCompass()?.let { "Wind $it" } ?: "Wind",
                color = windColor(conditions?.windSpeedKmh),
            )
            Metric(
                value = conditions?.windGustKmh?.let { "${it.roundToInt()}" } ?: "–",
                label = "Gust km/h",
            )
            Metric(
                value = when (conditions?.tide) {
                    Tide.RISING -> "Rising"
                    Tide.FALLING -> "Falling"
                    Tide.SLACK -> "Slack"
                    else -> "–"
                },
                label = "Tide",
            )
            Metric(
                value = conditions?.waterTempC?.let { "${it.roundToInt()}°C" } ?: "–",
                label = "Water",
            )
            Metric(
                value = conditions?.airTempC?.let { "${it.roundToInt()}°C" } ?: "–",
                label = "Air",
            )
        }
    }
}

private fun windColor(kmh: Double?): Color = when {
    kmh == null -> Ocean.Foam
    kmh < 12 -> Ocean.Aqua
    kmh < 25 -> Ocean.Sunset
    else -> Ocean.Coral
}

/** Everything about the place: how it breaks, when to come, what can hurt you. */
@Composable
private fun InfoPanel(
    spot: Spot,
    onPlanTrip: () -> Unit,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
    scrollable: Boolean = true,
) {
    val content: @Composable () -> Unit = {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                spot.tags.take(4).forEach { Tag(it) }
            }

            Text(spot.info.about, color = Ocean.Foam, fontSize = 14.sp, lineHeight = 21.sp)

            Button(
                onClick = onPlanTrip,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Ocean.Aqua,
                    contentColor = Ocean.Ink,
                ),
            ) {
                Icon(Icons.Filled.FlightTakeoff, null, Modifier.size(18.dp))
                Spacer(Modifier.width(8.dp))
                Text("Get me there", fontWeight = FontWeight.Black)
            }

            SectionLabel("The wave")
            FactGrid(
                listOf(
                    "Break" to spot.info.breakType,
                    "Bottom" to spot.info.bottom,
                    "Shape" to spot.info.wave,
                    "Level" to spot.info.level,
                    "Crowd" to spot.info.crowd,
                ),
            )

            SectionLabel("When it works")
            FactGrid(
                listOf(
                    "Swell" to spot.info.bestSwell,
                    "Wind" to spot.info.bestWind,
                    "Tide" to spot.info.bestTide,
                    "Season" to spot.info.bestSeason,
                    "Water" to spot.info.waterTemp,
                ),
            )

            if (spot.info.hazards.isNotEmpty()) {
                SectionLabel("Hazards")
                spot.info.hazards.forEach { hazard ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("•", color = Ocean.Coral, fontSize = 14.sp)
                        Text(hazard, color = Ocean.Foam, fontSize = 13.sp, lineHeight = 19.sp)
                    }
                }
            }

            if (spot.info.localTip.isNotBlank()) {
                GlassPanel(Modifier.fillMaxWidth(), corner = 14) {
                    Column(Modifier.padding(12.dp)) {
                        SectionLabel("Local knowledge")
                        Spacer(Modifier.height(6.dp))
                        Text(
                            spot.info.localTip,
                            color = Ocean.Sand,
                            fontSize = 13.sp,
                            lineHeight = 19.sp,
                        )
                    }
                }
            }

            SectionLabel("Getting there")
            FactGrid(
                listOf(
                    "Airports" to spot.access.airports.joinToString(" · "),
                    "Transfer" to spot.access.transfer,
                    "Entry" to spot.access.visaNote.ifBlank { "Check entry rules for your passport" },
                ),
            )

            if (spot.externalCams.isNotEmpty()) {
                SectionLabel("More cams")
                spot.externalCams.forEach { cam ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(Color(0x14FFFFFF))
                            .clickable { onOpenUrl(cam.pageUrl.ifBlank { cam.source }) }
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(cam.title, color = Ocean.Foam, fontSize = 13.sp, modifier = Modifier.weight(1f))
                        Icon(Icons.Filled.OpenInNew, null, tint = Ocean.Aqua, modifier = Modifier.size(16.dp))
                    }
                }
            }

            spot.cams.firstOrNull()?.let { cam ->
                if (cam.attribution.isNotBlank()) {
                    Text(
                        "Cam by ${cam.attribution}",
                        color = Ocean.Slate,
                        fontSize = 11.sp,
                        modifier = Modifier.clickable {
                            if (cam.pageUrl.isNotBlank()) onOpenUrl(cam.pageUrl)
                        },
                    )
                }
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    Box(
        modifier.background(
            Brush.verticalGradient(listOf(Color(0x0DFFFFFF), Color(0x00FFFFFF))),
        ),
    ) {
        if (scrollable) {
            LazyColumn(contentPadding = PaddingValues(0.dp)) { item { content() } }
        } else {
            content()
        }
    }
}

@Composable
private fun FactGrid(facts: List<Pair<String, String>>) {
    Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
        facts.filter { it.second.isNotBlank() }.forEach { (label, value) ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    label.uppercase(),
                    color = Ocean.Slate,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 0.8.sp,
                    modifier = Modifier.width(74.dp),
                )
                Text(
                    value,
                    color = Ocean.Foam,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** Shown when a spot has no embeddable stream -- with real routes to one. */
@Composable
private fun NoCamPanel(spot: Spot, onOpenUrl: (String) -> Unit) {
    Column(
        Modifier
            .fillMaxSize()
            .background(Brush.linearGradient(listOf(Ocean.Deep, Ocean.Mid)))
            .padding(20.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "No embeddable live cam here yet",
            color = Ocean.Foam,
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            "Live conditions below are still live. These operators may have a cam:",
            color = Ocean.Slate,
            fontSize = 12.sp,
        )
        Spacer(Modifier.height(12.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            spot.externalCams.forEach { cam ->
                Text(
                    cam.provider.ifBlank { "Open" },
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(Ocean.Aqua.copy(alpha = 0.2f))
                        .clickable { onOpenUrl(cam.pageUrl.ifBlank { cam.source }) }
                        .padding(horizontal = 12.dp, vertical = 7.dp),
                    color = Ocean.Aqua,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                )
            }
        }
    }
}
