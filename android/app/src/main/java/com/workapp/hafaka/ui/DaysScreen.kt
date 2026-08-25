package com.workapp.hafaka.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.HebDate
import com.workapp.hafaka.model.ShootDay

/** The shoot calendar — upcoming first, then what has already wrapped. */
@Composable
fun DaysScreen(store: Store, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    var creating by remember { mutableStateOf(false) }
    var editing by remember { mutableStateOf<ShootDay?>(null) }

    if (state.days.isEmpty()) {
        Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            EmptyState(
                "לוח הצילומים ריק",
                "כל יום צילום מרכז את הצוות, השעות והלוקיישן שלו — בדיוק כמו שורה בגיליון, רק שאפשר להתקשר ממנה.",
                "יום צילום חדש",
            ) { creating = true }
        }
        if (creating) DayEditor(store, null, onDismiss = { creating = false })
        return
    }

    val today = HebDate.todayIso()
    val upcoming = store.days.filter { it.date >= today }
    val past = store.days.filter { it.date < today }.reversed()

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        if (upcoming.isNotEmpty()) {
            item { SectionTitle("קרובים", "${upcoming.size}") }
            item { Card { upcoming.forEachIndexed { i, d ->
                DayRow(store, d, today) { editing = d }
                if (i < upcoming.lastIndex) RowDivider()
            } } }
        }
        if (past.isNotEmpty()) {
            item { SectionTitle("עברו", "${past.size}") }
            item { Card { past.forEachIndexed { i, d ->
                DayRow(store, d, today) { editing = d }
                if (i < past.lastIndex) RowDivider()
            } } }
        }
        item {
            Button(
                onClick = { creating = true },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 20.dp),
            ) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("יום צילום חדש") }
        }
    }

    if (creating) DayEditor(store, null, onDismiss = { creating = false })
    editing?.let { d -> DayEditor(store, d, onDismiss = { editing = null }) }
}

@Composable
private fun DayRow(store: Store, day: ShootDay, today: String, onClick: () -> Unit) {
    val location = store.location(day.locationId)
    val count = store.roster(day).size
    val isToday = day.date == today

    ListItem(
        headlineContent = { Text(day.title.ifBlank { "יום צילום" }) },
        supportingContent = {
            Text(listOfNotNull(location?.name, "$count אנשי צוות", "קריאה ${day.generalCall}")
                .joinToString(" · "))
        },
        leadingContent = {
            Column(Modifier.width(48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(HebDate.weekdayName(day.date), fontSize = 11.sp,
                     fontWeight = FontWeight.SemiBold,
                     color = MaterialTheme.colorScheme.onSurfaceVariant)
                LtrText(HebDate.short(day.date), MaterialTheme.typography.titleMedium,
                        if (isToday) Tint else MaterialTheme.colorScheme.onSurface)
            }
        },
        trailingContent = { if (isToday) Pill("היום", "#F5A524") },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.clickable(onClick = onClick),
    )
}
