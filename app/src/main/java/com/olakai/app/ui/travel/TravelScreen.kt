package com.olakai.app.ui.travel

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.olakai.app.data.model.Airport
import com.olakai.app.data.model.FlightOption
import com.olakai.app.data.model.TripRank
import com.olakai.app.ui.components.GlassPanel
import com.olakai.app.ui.components.SectionLabel
import com.olakai.app.ui.components.Tag
import com.olakai.app.ui.theme.Ocean
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import kotlin.math.roundToInt

private val DATE_FORMAT = DateTimeFormatter.ofPattern("d MMM yyyy")

/**
 * Getting to the wave: the cheapest way, the fastest way, and the one that is
 * fast without costing much -- which is the trade most people actually want.
 */
@Composable
fun TravelScreen(
    state: TravelUiState,
    onBack: () -> Unit,
    onOriginQuery: (String) -> Unit,
    onChooseOrigin: (Airport) -> Unit,
    onDepart: (LocalDate) -> Unit,
    onReturn: (LocalDate?) -> Unit,
    onAdults: (Int) -> Unit,
    onPriceWeight: (Int) -> Unit,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 32.dp),
    ) {
        item {
            Row(
                Modifier.fillMaxWidth().padding(6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Filled.ArrowBack, "Back", tint = Ocean.Foam)
                }
                Column(Modifier.weight(1f)) {
                    Text(
                        "Get me there",
                        color = Ocean.Foam,
                        fontWeight = FontWeight.Black,
                        fontSize = 20.sp,
                    )
                    Text(
                        state.spot?.let { "${it.name} · ${it.country}" } ?: "Pick a spot first",
                        color = Ocean.Slate,
                        fontSize = 12.sp,
                    )
                }
            }
        }

        item { SearchControls(state, onOriginQuery, onChooseOrigin, onDepart, onReturn, onAdults) }

        if (state.loading) {
            item {
                LinearProgressIndicator(
                    color = Ocean.Aqua,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp),
                )
            }
        }

        state.error?.let { message ->
            item {
                Text(
                    message,
                    color = Ocean.Coral,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(16.dp),
                )
            }
        }

        val board = state.board
        if (board != null && board.options.isNotEmpty()) {
            item {
                Column(Modifier.padding(horizontal = 16.dp)) {
                    Spacer(Modifier.height(8.dp))
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            "${board.origin?.iata} → ${board.destination?.iata}",
                            color = Ocean.Foam,
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                        )
                        Spacer(Modifier.width(10.dp))
                        Text(
                            "${board.distanceKm} km",
                            color = Ocean.Slate,
                            fontSize = 12.sp,
                        )
                        Spacer(Modifier.width(8.dp))
                        Tag(
                            if (board.usingLiveFares) "LIVE FARES" else "ESTIMATE",
                            color = if (board.usingLiveFares) Ocean.Aqua else Ocean.Sunset,
                        )
                    }
                    board.destination?.let {
                        Text(
                            "${it.name}, ${it.city} — ${state.spot?.access?.transfer.orEmpty()}",
                            color = Ocean.Slate,
                            fontSize = 12.sp,
                        )
                    }
                    Spacer(Modifier.height(12.dp))
                }
            }

            item {
                ValueSlider(state.priceWeight, onPriceWeight)
            }

            item {
                Row(
                    Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState())
                        .padding(horizontal = 16.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    board.cheapest?.let { PickCard(TripRank.CHEAPEST, it, onOpenUrl) }
                    board.fastest?.let { PickCard(TripRank.FASTEST, it, onOpenUrl) }
                    board.bestValue?.let { PickCard(TripRank.BEST_VALUE, it, onOpenUrl) }
                }
            }

            item {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    SectionLabel("All options")
                    Text(
                        board.note,
                        color = Ocean.Slate,
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            items(board.options, key = { it.id }) { option ->
                OptionRow(option, onOpenUrl, Modifier.padding(horizontal = 16.dp, vertical = 4.dp))
            }

            item {
                Column(Modifier.padding(16.dp)) {
                    SectionLabel("Check the real price")
                    Spacer(Modifier.height(8.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        board.searchLinks.forEach { link ->
                            Text(
                                link.label,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(Color(0x14FFFFFF))
                                    .clickable { onOpenUrl(link.url) }
                                    .padding(horizontal = 11.dp, vertical = 7.dp),
                                color = Ocean.Aqua,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchControls(
    state: TravelUiState,
    onOriginQuery: (String) -> Unit,
    onChooseOrigin: (Airport) -> Unit,
    onDepart: (LocalDate) -> Unit,
    onReturn: (LocalDate?) -> Unit,
    onAdults: (Int) -> Unit,
) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        TextField(
            value = state.originQuery,
            onValueChange = onOriginQuery,
            modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)),
            singleLine = true,
            label = { Text("Flying from", fontSize = 12.sp) },
            placeholder = { Text("City or airport code", fontSize = 13.sp) },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color(0x14FFFFFF),
                unfocusedContainerColor = Color(0x14FFFFFF),
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                focusedTextColor = Ocean.Foam,
                unfocusedTextColor = Ocean.Foam,
                focusedLabelColor = Ocean.Aqua,
                unfocusedLabelColor = Ocean.Slate,
            ),
        )

        state.originSuggestions.forEach { airport ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .clickable { onChooseOrigin(airport) }
                    .padding(vertical = 9.dp, horizontal = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    airport.iata,
                    color = Ocean.Aqua,
                    fontWeight = FontWeight.Black,
                    fontSize = 13.sp,
                    modifier = Modifier.width(42.dp),
                )
                Column {
                    Text("${airport.city}, ${airport.country}", color = Ocean.Foam, fontSize = 13.sp)
                    Text(airport.name, color = Ocean.Slate, fontSize = 11.sp)
                }
            }
        }

        Spacer(Modifier.height(10.dp))

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            DateStepper(
                label = "Depart",
                date = state.departDate,
                modifier = Modifier.weight(1f),
                onChange = onDepart,
            )
            DateStepper(
                label = "Return",
                date = state.returnDate,
                modifier = Modifier.weight(1f),
                onChange = { onReturn(it) },
                clearable = true,
                onClear = { onReturn(null) },
            )
        }

        Spacer(Modifier.height(8.dp))

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Travellers", color = Ocean.Slate, fontSize = 12.sp)
            Spacer(Modifier.width(10.dp))
            (1..4).forEach { count ->
                val selected = state.adults == count
                Text(
                    "$count",
                    modifier = Modifier
                        .padding(end = 6.dp)
                        .clip(RoundedCornerShape(9.dp))
                        .background(if (selected) Ocean.Aqua.copy(alpha = 0.22f) else Color(0x14FFFFFF))
                        .clickable { onAdults(count) }
                        .padding(horizontal = 12.dp, vertical = 6.dp),
                    color = if (selected) Ocean.Aqua else Ocean.Slate,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                )
            }
        }
    }
}

/** Dates without a picker dialog: nudge by a day or a week, which is how trips actually move. */
@Composable
private fun DateStepper(
    label: String,
    date: LocalDate?,
    modifier: Modifier = Modifier,
    onChange: (LocalDate) -> Unit,
    clearable: Boolean = false,
    onClear: () -> Unit = {},
) {
    GlassPanel(modifier, corner = 12) {
        Column(Modifier.padding(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    label.uppercase(),
                    color = Ocean.Slate,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    letterSpacing = 1.sp,
                    modifier = Modifier.weight(1f),
                )
                if (clearable && date != null) {
                    Text(
                        "one way",
                        color = Ocean.Slate,
                        fontSize = 10.sp,
                        modifier = Modifier.clickable { onClear() },
                    )
                }
            }
            Spacer(Modifier.height(4.dp))
            Text(
                date?.format(DATE_FORMAT) ?: "—",
                color = Ocean.Foam,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(-7 to "-7", -1 to "-1", 1 to "+1", 7 to "+7").forEach { (delta, text) ->
                    Text(
                        text,
                        modifier = Modifier
                            .clip(RoundedCornerShape(7.dp))
                            .background(Color(0x18FFFFFF))
                            .clickable {
                                val base = date ?: LocalDate.now().plusDays(30)
                                val next = base.plusDays(delta.toLong())
                                onChange(if (next.isBefore(LocalDate.now())) LocalDate.now() else next)
                            }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        color = Ocean.Aqua,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
    }
}

/** The money-versus-time dial that drives the "best value" pick. */
@Composable
private fun ValueSlider(weight: Int, onChange: (Int) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp)) {
        Row {
            Text("Save time", color = Ocean.Slate, fontSize = 11.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            Text("Save money", color = Ocean.Slate, fontSize = 11.sp, fontWeight = FontWeight.Bold)
        }
        Slider(
            value = weight.toFloat(),
            onValueChange = { onChange(it.roundToInt()) },
            valueRange = 0f..100f,
            colors = SliderDefaults.colors(
                thumbColor = Ocean.Aqua,
                activeTrackColor = Ocean.Aqua,
                inactiveTrackColor = Color(0x33FFFFFF),
            ),
        )
    }
}

@Composable
private fun PickCard(rank: TripRank, option: FlightOption, onOpenUrl: (String) -> Unit) {
    val accent = when (rank) {
        TripRank.CHEAPEST -> Ocean.Aqua
        TripRank.FASTEST -> Ocean.Sunset
        TripRank.BEST_VALUE -> Ocean.Dusk
    }
    GlassPanel(
        Modifier
            .width(210.dp)
            .clickable { if (option.bookingUrl.isNotBlank()) onOpenUrl(option.bookingUrl) },
    ) {
        Column(
            Modifier
                .border(1.dp, accent.copy(alpha = 0.4f), RoundedCornerShape(20.dp))
                .padding(14.dp),
        ) {
            Text(
                rank.label.uppercase(),
                color = accent,
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
                letterSpacing = 1.2.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "$${option.price.roundToInt()}",
                color = Ocean.Foam,
                fontWeight = FontWeight.Black,
                fontSize = 26.sp,
            )
            Text(
                "${option.durationText} · ${option.stopsText}",
                color = Ocean.Slate,
                fontSize = 12.sp,
            )
            Spacer(Modifier.height(8.dp))
            Text(rank.blurb, color = Ocean.Slate, fontSize = 11.sp, lineHeight = 15.sp)
            Spacer(Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Open", color = accent, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.width(4.dp))
                Icon(Icons.Filled.OpenInNew, null, tint = accent, modifier = Modifier.size(13.dp))
            }
        }
    }
}

@Composable
private fun OptionRow(
    option: FlightOption,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(Color(0x12FFFFFF))
            .clickable { if (option.bookingUrl.isNotBlank()) onOpenUrl(option.bookingUrl) }
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                "${option.durationText} · ${option.stopsText}",
                color = Ocean.Foam,
                fontWeight = FontWeight.Bold,
                fontSize = 14.sp,
            )
            Text(
                buildString {
                    append(option.carrier.ifBlank { "—" })
                    if (option.isEstimate) append(" · modelled")
                },
                color = Ocean.Slate,
                fontSize = 11.sp,
            )
        }
        Text(
            "$${option.price.roundToInt()}",
            color = Ocean.Aqua,
            fontWeight = FontWeight.Black,
            fontSize = 17.sp,
        )
    }
}
