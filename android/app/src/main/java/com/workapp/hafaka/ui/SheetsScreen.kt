package com.workapp.hafaka.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.workapp.hafaka.data.Actions
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.*

private enum class SheetTab(val he: String) {
    PRODUCTION("הפקה"), CATERING("קיטריינג"), VEHICLES("רכבים"),
    CLEANING("ניקיון"), SECURITY("שמירה")
}

/**
 * The five workbook sheets. Day mode fills in the current day one tappable
 * column at a time; grid mode shows the familiar table across all days in the
 * workbook's own column order.
 */
@Composable
fun SheetsScreen(store: Store, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    var tab by rememberSaveable { mutableStateOf(SheetTab.PRODUCTION) }
    var grid by rememberSaveable { mutableStateOf(false) }
    var creating by remember { mutableStateOf(false) }
    var pickingSlot by remember { mutableStateOf<String?>(null) }
    var editingVehicle by remember { mutableStateOf<String?>(null) }
    var editingDay by remember { mutableStateOf(false) }

    val day = store.currentDay
    if (day == null) {
        Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            EmptyState(
                "אין יום צילום פעיל",
                "הגיליונות ממלאים את עצמם לפי יום — צרו יום צילום כדי להתחיל.",
                "יום צילום חדש",
            ) { creating = true }
        }
        if (creating) DayEditor(store, null, onDismiss = { creating = false })
        return
    }

    Column(modifier.fillMaxSize()) {
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(SheetTab.entries.toList(), key = { it.name }) { t ->
                FilterChip(
                    selected = tab == t,
                    onClick = { tab = t },
                    label = { Text(t.he, style = MaterialTheme.typography.labelMedium) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = Tint, selectedLabelColor = TintInk),
                )
            }
        }

        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
            SegmentedButton(selected = !grid, onClick = { grid = false },
                            shape = SegmentedButtonDefaults.itemShape(0, 2)) { Text("היום") }
            SegmentedButton(selected = grid, onClick = { grid = true },
                            shape = SegmentedButtonDefaults.itemShape(1, 2)) { Text("טבלה מלאה") }
        }

        if (grid) {
            GridSheet(store, tab, Modifier.weight(1f))
        } else {
            LazyColumn(Modifier.weight(1f), contentPadding = PaddingValues(bottom = 24.dp)) {
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(HebDate.long(day.date), style = MaterialTheme.typography.bodySmall,
                             color = MaterialTheme.colorScheme.onSurfaceVariant)
                        TextButton(onClick = { editingDay = true }) { Text("שינוי יום") }
                    }
                }

                when (tab) {
                    SheetTab.PRODUCTION -> slotItems(this, store, day, Sheets.crew) { pickingSlot = it }
                    SheetTab.CLEANING -> slotItems(this, store, day, Sheets.cleaning) { pickingSlot = it }
                    SheetTab.SECURITY -> slotItems(this, store, day, Sheets.security) { pickingSlot = it }
                    SheetTab.VEHICLES -> item {
                        Card {
                            Sheets.vehicles.forEachIndexed { i, (slot, he) ->
                                val rec = day.vehicles[slot]
                                val driver = store.person(rec?.driverId)
                                ListItem(
                                    headlineContent = { Text(he) },
                                    supportingContent = {
                                        Text(listOfNotNull(
                                            driver?.name ?: "ללא נהג",
                                            rec?.plate?.takeIf { it.isNotBlank() },
                                            rec?.note?.takeIf { it.isNotBlank() },
                                        ).joinToString(" · "))
                                    },
                                    leadingContent = {
                                        Icon(Icons.Filled.LocalShipping, null,
                                             tint = if (driver != null) Tint
                                                    else MaterialTheme.colorScheme.onSurfaceVariant)
                                    },
                                    colors = ListItemDefaults.colors(
                                        containerColor = MaterialTheme.colorScheme.surface),
                                    modifier = Modifier.clickable { editingVehicle = slot },
                                )
                                if (i < Sheets.vehicles.lastIndex) RowDivider()
                            }
                        }
                    }
                    SheetTab.CATERING -> cateringItems(this, store, day)
                }
            }
        }
    }

    pickingSlot?.let { slot ->
        val labels = listOf(Sheets.crew, Sheets.cleaning, Sheets.security)
            .firstNotNullOfOrNull { group ->
                group.indexOfFirst { it.slot == slot }.takeIf { it >= 0 }
                    ?.let { Sheets.labels(group)[it] }
            } ?: ""
        PersonPicker(store, labels, slot, day.slots[slot], onDismiss = { pickingSlot = null }) { id ->
            store.assign(day.id, slot, id)
        }
    }

    editingVehicle?.let { slot ->
        VehicleEditor(store, day, slot, onDismiss = { editingVehicle = null })
    }

    if (editingDay) DayEditor(store, day, onDismiss = { editingDay = false })
    if (creating) DayEditor(store, null, onDismiss = { creating = false })
}

/** One tappable row per spreadsheet column. */
private fun slotItems(
    scope: androidx.compose.foundation.lazy.LazyListScope,
    store: Store,
    day: ShootDay,
    slots: List<CrewSlot>,
    onPick: (String) -> Unit,
) {
    val labels = Sheets.labels(slots)
    scope.item {
        Card {
            slots.forEachIndexed { i, slot ->
                val person = store.person(day.slots[slot.slot])
                SlotRow(store, day, labels[i], person) { onPick(slot.slot) }
                if (i < slots.lastIndex) RowDivider()
            }
        }
    }
}

@Composable
private fun SlotRow(store: Store, day: ShootDay, label: String, person: Person?, onClick: () -> Unit) {
    val context = LocalContext.current
    ListItem(
        headlineContent = {
            Text(person?.name ?: "לא שובץ",
                 color = if (person == null) MaterialTheme.colorScheme.onSurfaceVariant
                         else MaterialTheme.colorScheme.onSurface)
        },
        supportingContent = { Text(label) },
        leadingContent = {
            if (person != null) Avatar(person.name, 38, person.dept.hex)
            else Avatar("+", 38, "#8E8E93")
        },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val time = person?.let { day.calls[it.id]?.time }.orEmpty()
                if (time.isNotBlank()) LtrText(time)
                if (person != null && Phone.hasPhone(person)) {
                    IconButton(onClick = { Actions.call(context, person) }) {
                        Icon(Icons.Filled.Phone, "חיוג ל${person.name}", tint = Tint)
                    }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.clickable(onClick = onClick),
    )
}

/** The seven headcount fields, plus the totals they imply. */
private fun cateringItems(
    scope: androidx.compose.foundation.lazy.LazyListScope,
    store: Store,
    day: ShootDay,
) {
    scope.item {
        Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Stat(Modifier.weight(1f), Roster.cateringTotal(day).takeIf { it > 0 }?.toString() ?: "—", "סה״כ נפשות")
            Stat(Modifier.weight(1f), day.count("orderedLunch")?.toString() ?: "—", "הוזמן צהריים")
            Stat(Modifier.weight(1f), day.count("ateLunch")?.toString() ?: "—", "אכלו צהריים")
        }
    }
    val groups = listOf(
        "ספירת נפשות" to listOf("crew", "actors", "extras"),
        "הוזמן" to listOf("orderedBreakfast", "orderedLunch"),
        "אכלו בפועל" to listOf("ateBreakfast", "ateLunch"),
    )
    groups.forEach { (title, keys) ->
        scope.item { SectionTitle(title) }
        scope.item {
            Card {
                keys.forEachIndexed { i, key ->
                    val he = Sheets.cateringFields.first { it.first == key }.second
                    CountRow(store, day, key, he)
                    if (i < keys.lastIndex) RowDivider()
                }
            }
        }
    }
}

@Composable
private fun Stat(modifier: Modifier, value: String, label: String) {
    Column(
        modifier
            .background(MaterialTheme.colorScheme.surface,
                        androidx.compose.foundation.shape.RoundedCornerShape(14.dp))
            .padding(vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(value, style = MaterialTheme.typography.headlineMedium)
        Text(label, style = MaterialTheme.typography.labelSmall,
             color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }
}

/**
 * Bound through a String rather than a number: an empty field has to mean
 * "not filled in yet", which is different from zero.
 */
@Composable
private fun CountRow(store: Store, day: ShootDay, key: String, label: String) {
    val current = store.day(day.id)?.count(key)
    var text by remember(day.id, key, current) { mutableStateOf(current?.toString() ?: "") }

    ListItem(
        headlineContent = { Text(label) },
        trailingContent = {
            OutlinedTextField(
                value = text,
                onValueChange = { raw ->
                    val cleaned = raw.filter { it.isDigit() }
                    text = cleaned
                    store.setCount(day.id, key, cleaned.toIntOrNull())
                },
                placeholder = { Text("—") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                modifier = Modifier.width(110.dp),
            )
        },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
    )
}

/** Grid mode — the original spreadsheet layout, all days at once. */
@Composable
private fun GridSheet(store: Store, tab: SheetTab, modifier: Modifier = Modifier) {
    val days = store.days
    if (days.isEmpty()) {
        EmptyState("אין ימים להצגה", "צרו יום צילום כדי לראות את הטבלה.")
        return
    }

    val headers: List<String> = when (tab) {
        SheetTab.CATERING -> listOf("תאריך") + Sheets.cateringFields.map { it.second }
        SheetTab.VEHICLES -> listOf("תאריך") + Sheets.vehicles.map { it.second }
        SheetTab.PRODUCTION -> listOf("תאריך") + Sheets.labels(Sheets.crew)
        SheetTab.CLEANING -> listOf("תאריך") + Sheets.labels(Sheets.cleaning)
        SheetTab.SECURITY -> listOf("תאריך") + Sheets.labels(Sheets.security)
    }

    fun name(id: String?): String = store.person(id?.takeIf { it.isNotBlank() })?.name.orEmpty()

    fun cells(day: ShootDay): List<String> = when (tab) {
        SheetTab.CATERING ->
            listOf(HebDate.short(day.date)) + Sheets.cateringFields.map { day.count(it.first)?.toString().orEmpty() }
        SheetTab.VEHICLES ->
            listOf(HebDate.short(day.date)) + Sheets.vehicles.map { (slot, _) ->
                val r = day.vehicles[slot]
                listOfNotNull(name(r?.driverId).takeIf { it.isNotBlank() },
                              r?.plate?.takeIf { it.isNotBlank() }).joinToString(" · ")
            }
        SheetTab.PRODUCTION -> listOf(HebDate.short(day.date)) + Sheets.crew.map { name(day.slots[it.slot]) }
        SheetTab.CLEANING -> listOf(HebDate.short(day.date)) + Sheets.cleaning.map { name(day.slots[it.slot]) }
        SheetTab.SECURITY -> listOf(HebDate.short(day.date)) + Sheets.security.map { name(day.slots[it.slot]) }
    }

    // The table is wider than any phone; it scrolls sideways inside its own box
    // so the screen itself never does.
    val hScroll = rememberScrollState()
    Column(modifier.fillMaxSize().padding(top = 12.dp)) {
        Row(Modifier.horizontalScroll(hScroll)
            .background(MaterialTheme.colorScheme.surfaceVariant)) {
            headers.forEach { h ->
                Text(h, Modifier.width(112.dp).padding(11.dp),
                     style = MaterialTheme.typography.labelMedium,
                     color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        LazyColumn(Modifier.weight(1f)) {
            items(days, key = { it.id }) { day ->
                Row(Modifier.horizontalScroll(hScroll)
                    .background(MaterialTheme.colorScheme.surface)) {
                    cells(day).forEach { cell ->
                        Text(
                            cell.ifBlank { "—" },
                            Modifier.width(112.dp).padding(11.dp),
                            style = MaterialTheme.typography.bodySmall,
                            color = if (cell.isBlank()) MaterialTheme.colorScheme.onSurfaceVariant
                                    else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
                HorizontalDivider(thickness = 0.5.dp,
                                  color = MaterialTheme.colorScheme.outlineVariant)
            }
        }
    }
}
