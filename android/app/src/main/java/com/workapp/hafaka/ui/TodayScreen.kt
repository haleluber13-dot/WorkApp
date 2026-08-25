package com.workapp.hafaka.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material.icons.filled.Place
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.workapp.hafaka.data.Actions
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.*
import java.time.LocalTime

/**
 * The screen that replaces the daily spreadsheet row: times, location with
 * one-tap navigation, the quick-dial contact bar, and the roster grouped into
 * arrival waves.
 */
@Composable
fun TodayScreen(store: Store, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    val context = LocalContext.current
    val day = store.currentDay

    var editingDay by remember { mutableStateOf(false) }
    var addingCrew by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<RosterEntry?>(null) }

    if (day == null) {
        Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            EmptyState(
                "אין עדיין ימי צילום",
                "צרו את יום הצילום הראשון — ומשם תוכלו לשבץ צוות, לקבוע שעות קריאה ולנווט ללוקיישן בלחיצה אחת.",
                "יום צילום חדש",
            ) { editingDay = true }
        }
        if (editingDay) DayEditor(store, null, onDismiss = { editingDay = false })
        return
    }

    val roster = store.roster(day)
    val location = store.location(day.locationId)
    val waves = roster.groupBy { it.call.time }.toSortedMap()

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            Hero(store, day, location, roster,
                 onEdit = { editingDay = true },
                 onShare = {
                     Actions.share(context, Actions.daySheet(day, location, roster))
                 })
        }

        item { SectionTitle("אנשי קשר ליום הזה", "${roster.size}") }
        item {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                items(roster, key = { it.person.id }) { entry ->
                    ContactChip(entry) { selected = entry }
                }
                item {
                    Column(
                        Modifier.width(68.dp).clickable { addingCrew = true },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(
                            Modifier.size(54.dp).clip(CircleShape)
                                .background(MaterialTheme.colorScheme.surfaceVariant),
                            contentAlignment = Alignment.Center,
                        ) { Icon(Icons.Filled.Add, null, tint = Tint) }
                        Text("הוספה", fontSize = 11.sp, fontWeight = FontWeight.SemiBold,
                             textAlign = TextAlign.Center)
                    }
                }
            }
        }

        if (roster.isEmpty()) {
            item {
                EmptyState("אין עדיין צוות ליום הזה",
                           "שבצו אנשי צוות מגיליון ההפקה, או הוסיפו ישירות מהסרגל למעלה.")
            }
        } else {
            item { SectionTitle("לוח קריאות") }
            waves.forEach { (time, entries) ->
                item {
                    Row(
                        Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 6.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        LtrText(time, MaterialTheme.typography.titleSmall,
                                MaterialTheme.colorScheme.onBackground)
                        Text("${entries.size} אנשים", style = MaterialTheme.typography.bodySmall,
                             color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                item {
                    Card {
                        entries.forEachIndexed { i, entry ->
                            RosterRow(store, day, entry) { selected = entry }
                            if (i < entries.lastIndex) RowDivider()
                        }
                    }
                }
            }
        }

        if (day.notes.isNotBlank()) {
            item { SectionTitle("הערות הפקה") }
            item {
                Card {
                    Text(day.notes, Modifier.padding(16.dp),
                         style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }

    if (editingDay) DayEditor(store, day, onDismiss = { editingDay = false })

    if (addingCrew) {
        PersonPicker(store, "הוספה ליום", slot = null, allowNone = false,
                     onDismiss = { addingCrew = false }) { id ->
            assignToBestFreeSlot(store, day, id)
        }
    }

    selected?.let { entry ->
        CrewActionSheet(store, day, entry, onDismiss = { selected = null })
    }
}

/** Put a newly added person into the slot that fits them best. */
private fun assignToBestFreeSlot(store: Store, day: ShootDay, personId: String) {
    if (personId.isBlank()) return
    val person = store.person(personId) ?: return
    val current = store.day(day.id) ?: day
    val free = Sheets.crew.firstOrNull { current.slots[it.slot] == null && person.defaultSlot == it.slot }
        ?: Sheets.crew.firstOrNull { current.slots[it.slot] == null && it.dept == person.dept }
        ?: Sheets.crew.firstOrNull { current.slots[it.slot] == null }
        ?: return
    store.assign(current.id, free.slot, personId)
}

@Composable
private fun Hero(
    store: Store,
    day: ShootDay,
    location: Location?,
    roster: List<RosterEntry>,
    onEdit: () -> Unit,
    onShare: () -> Unit,
) {
    val context = LocalContext.current
    val isToday = day.date == HebDate.todayIso()
    val nowMinutes = LocalTime.now().let { it.hour * 60 + it.minute }
    val marks = listOf("קריאה כללית" to day.generalCall,
                       "תחילת צילום" to day.shootingCall,
                       "סיום" to day.wrap)
    val active = Roster.activeMark(day, HebDate.todayIso(), nowMinutes)
    val confirmed = roster.count { it.call.status == CallStatus.CONFIRMED || it.call.status == CallStatus.ONSET }

    Column(
        Modifier
            .padding(16.dp)
            .clip(RoundedCornerShape(20.dp))
            .background(Brush.linearGradient(listOf(Color(0xFF2B2118), Color(0xFF141414))))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(HebDate.long(day.date) + if (isToday) " · היום" else "",
             fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color.White.copy(0.78f))
        Text(day.title.ifBlank { "יום צילום" },
             style = MaterialTheme.typography.headlineSmall, color = Color.White,
             fontWeight = FontWeight.ExtraBold)

        location?.let { loc ->
            Row(
                Modifier.clickable { Actions.navigate(context, loc, store.settings.navApp) },
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Icon(Icons.Filled.Place, null, tint = Color.White.copy(0.86f),
                     modifier = Modifier.size(16.dp))
                Text(if (loc.address.isBlank()) loc.name else "${loc.name} — ${loc.address}",
                     fontSize = 14.sp, color = Color.White.copy(0.86f))
            }
        }

        Row(Modifier.fillMaxWidth().padding(top = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            marks.forEachIndexed { i, (label, value) ->
                val live = i == active
                Column(
                    Modifier.weight(1f).clip(RoundedCornerShape(12.dp))
                        .background(if (live) Tint else Color.White.copy(0.10f))
                        .padding(vertical = 9.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(label, fontSize = 10.sp, fontWeight = FontWeight.SemiBold,
                         color = if (live) TintInk else Color.White.copy(0.75f))
                    LtrText(value, MaterialTheme.typography.titleLarge,
                            if (live) TintInk else Color.White)
                }
            }
        }

        Text("${roster.size} אנשי צוות · $confirmed אישרו",
             fontSize = 13.sp, fontWeight = FontWeight.SemiBold, color = Color.White.copy(0.9f))

        Row(Modifier.fillMaxWidth().padding(top = 4.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            location?.let { loc ->
                Button(
                    onClick = { Actions.navigate(context, loc, store.settings.navApp) },
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = Tint, contentColor = TintInk),
                ) { Icon(Icons.Filled.Navigation, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("ניווט") }
            }
            OutlinedButton(onClick = onEdit, modifier = Modifier.weight(1f)) {
                Icon(Icons.Filled.Edit, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                Text("עריכה", color = Color.White)
            }
            OutlinedButton(onClick = onShare, modifier = Modifier.weight(1f)) {
                Icon(Icons.Filled.Share, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp))
                Text("שיתוף", color = Color.White)
            }
        }
    }
}

@Composable
private fun RosterRow(store: Store, day: ShootDay, entry: RosterEntry, onOpen: () -> Unit) {
    val context = LocalContext.current
    ListItem(
        headlineContent = { Text(entry.person.name) },
        supportingContent = {
            Text(entry.roleLabels.joinToString(" · ").ifBlank { entry.person.dept.he })
        },
        leadingContent = { Avatar(entry.person.name, 40, entry.person.dept.hex) },
        trailingContent = {
            Row(verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Box(Modifier.size(8.dp).clip(CircleShape).background(colorOf(entry.call.status.hex)))
                if (Phone.hasPhone(entry.person)) {
                    IconButton(onClick = { Actions.call(context, entry.person) }) {
                        Icon(Icons.Filled.Phone, "חיוג ל${entry.person.name}", tint = Tint)
                    }
                    IconButton(onClick = {
                        Actions.whatsapp(context, entry.person, Actions.callMessage(
                            day, entry.person, entry.call, store.location(entry.call.locationId)))
                    }) {
                        Icon(Icons.Filled.Chat, "וואטסאפ ל${entry.person.name}", tint = Tint)
                    }
                }
            }
        },
        colors = ListItemDefaults.colors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.clickable(onClick = onOpen),
    )
}

/** The action sheet behind every contact chip. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CrewActionSheet(store: Store, day: ShootDay, entry: RosterEntry, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var editingCall by remember { mutableStateOf(false) }
    val location = store.location(entry.call.locationId)

    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(bottom = 28.dp)) {
            ListItem(
                headlineContent = { Text(entry.person.name, style = MaterialTheme.typography.titleMedium) },
                supportingContent = {
                    Text(listOf(entry.person.dept.he, entry.roleLabels.joinToString(" · "))
                        .filter { it.isNotBlank() }.joinToString(" — "))
                },
                leadingContent = { Avatar(entry.person.name, 46, entry.person.dept.hex) },
                trailingContent = { Pill(entry.call.status.he, entry.call.status.hex) },
            )

            ListItem(
                headlineContent = { Text("שעת קריאה") },
                supportingContent = { if (entry.call.note.isNotBlank()) Text(entry.call.note) },
                trailingContent = { LtrText(entry.call.time) },
                modifier = Modifier.clickable { editingCall = true },
            )

            if (entry.person.homeBase.isNotBlank()) {
                ListItem(
                    headlineContent = { Text("יוצא מ־") },
                    trailingContent = { Text(entry.person.homeBase) },
                )
            }

            location?.let { loc ->
                ListItem(
                    headlineContent = { Text("מיקום") },
                    supportingContent = { if (loc.address.isNotBlank()) Text(loc.address) },
                    trailingContent = { Text(loc.name) },
                    modifier = Modifier.clickable {
                        Actions.navigate(context, loc, store.settings.navApp)
                    },
                )
            }

            Row(Modifier.fillMaxWidth().padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { Actions.call(context, entry.person) }, modifier = Modifier.weight(1f)) {
                    Icon(Icons.Filled.Phone, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("חיוג")
                }
                OutlinedButton(
                    onClick = {
                        Actions.whatsapp(context, entry.person, Actions.callMessage(
                            day, entry.person, entry.call, location))
                    },
                    modifier = Modifier.weight(1f),
                ) {
                    Icon(Icons.Filled.Chat, null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("וואטסאפ")
                }
            }

            TextButton(
                onClick = {
                    store.editDay(day.id) { d ->
                        d.copy(
                            slots = d.slots.filterValues { it != entry.person.id },
                            vehicles = d.vehicles.mapValues { (_, v) ->
                                if (v.driverId == entry.person.id) v.copy(driverId = "") else v
                            },
                        )
                    }
                    onDismiss()
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("הסרה מהיום הזה", color = MaterialTheme.colorScheme.error) }
        }
    }

    if (editingCall) {
        CallEditor(store, day, entry.person, onDismiss = { editingCall = false })
    }
}
