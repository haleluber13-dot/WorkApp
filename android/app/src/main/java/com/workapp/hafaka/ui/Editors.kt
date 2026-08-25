package com.workapp.hafaka.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.*

/** A dialog that fills most of the screen — the Android answer to a sheet. */
@Composable
private fun EditorDialog(
    title: String,
    onDismiss: () -> Unit,
    onSave: (() -> Unit)? = null,
    saveEnabled: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.9f),
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = {
            Column(
                Modifier.fillMaxWidth().verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
                content = content,
            )
        },
        confirmButton = {
            onSave?.let { TextButton(onClick = it, enabled = saveEnabled) { Text("שמירה") } }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("ביטול") } },
    )
}

@Composable
private fun Field(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    keyboard: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    supporting: String? = null,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = singleLine,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        supportingText = supporting?.let { { Text(it) } },
        modifier = Modifier.fillMaxWidth(),
    )
}

// ---------------------------------------------------------------- person

@Composable
fun PersonEditor(store: Store, person: Person?, onDismiss: () -> Unit, onSaved: (Person) -> Unit = {}) {
    val isNew = person == null
    var draft by remember { mutableStateOf(person ?: Person()) }
    var confirmDelete by remember { mutableStateOf(false) }

    EditorDialog(
        title = if (isNew) "איש קשר חדש" else "עריכת איש קשר",
        onDismiss = onDismiss,
        saveEnabled = draft.name.isNotBlank(),
        onSave = { store.upsertPerson(draft); onSaved(draft); onDismiss() },
    ) {
        Field("שם מלא", draft.name, { draft = draft.copy(name = it) })
        Field("טלפון", draft.phone, { draft = draft.copy(phone = it) }, KeyboardType.Phone)
        DropdownField("מחלקה", draft.dept.he, Dept.entries.map { it.he }) { i ->
            draft = draft.copy(dept = Dept.entries[i])
        }
        DropdownField(
            "תפקיד קבוע",
            Sheets.slot(draft.defaultSlot)?.short ?: "ללא",
            listOf("ללא") + Sheets.all.map { it.short },
        ) { i -> draft = draft.copy(defaultSlot = if (i == 0) "" else Sheets.all[i - 1].slot) }
        Field("אימייל", draft.email, { draft = draft.copy(email = it) }, KeyboardType.Email)
        Field("יוצא מ־", draft.homeBase, { draft = draft.copy(homeBase = it) },
              supporting = "עיר או אזור — עוזר לתכנן איסופים")
        Field("הערות", draft.notes, { draft = draft.copy(notes = it) }, singleLine = false)

        if (!isNew) {
            TextButton(onClick = { confirmDelete = true }) {
                Text("מחיקת איש קשר", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("מחיקת איש קשר") },
            text = { Text("למחוק את ${draft.name}? הוא יוסר מכל ימי הצילום.") },
            confirmButton = {
                TextButton(onClick = { store.deletePerson(draft.id); confirmDelete = false; onDismiss() }) {
                    Text("מחק", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("ביטול") } },
        )
    }
}

// ---------------------------------------------------------------- location

@Composable
fun LocationEditor(store: Store, location: Location?, onDismiss: () -> Unit, onSaved: (Location) -> Unit = {}) {
    val isNew = location == null
    var draft by remember { mutableStateOf(location ?: Location()) }
    var confirmDelete by remember { mutableStateOf(false) }

    EditorDialog(
        title = if (isNew) "מיקום חדש" else "עריכת מיקום",
        onDismiss = onDismiss,
        saveEnabled = draft.name.isNotBlank(),
        onSave = { store.upsertLocation(draft); onSaved(draft); onDismiss() },
    ) {
        Field("לוקיישן / סט", draft.name, { draft = draft.copy(name = it) })
        Field("כתובת", draft.address, { draft = draft.copy(address = it) })
        Field("חניה", draft.parking, { draft = draft.copy(parking = it) })
        // Coordinates stay text: an empty field must mean "not set", which a
        // numeric field would collapse to zero.
        Field("קו רוחב", draft.lat?.toString() ?: "",
              { draft = draft.copy(lat = it.replace(',', '.').toDoubleOrNull()) }, KeyboardType.Decimal,
              supporting = "לא חובה — בלי קואורדינטות הניווט מחפש לפי הכתובת")
        Field("קו אורך", draft.lng?.toString() ?: "",
              { draft = draft.copy(lng = it.replace(',', '.').toDoubleOrNull()) }, KeyboardType.Decimal)
        Field("הערות", draft.notes, { draft = draft.copy(notes = it) }, singleLine = false)

        if (!isNew) {
            TextButton(onClick = { confirmDelete = true }) {
                Text("מחיקת מיקום", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("מחיקת מיקום") },
            text = { Text("למחוק את המיקום \"${draft.name}\"?") },
            confirmButton = {
                TextButton(onClick = { store.deleteLocation(draft.id); confirmDelete = false; onDismiss() }) {
                    Text("מחק", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("ביטול") } },
        )
    }
}

// ---------------------------------------------------------------- day

@Composable
fun DayEditor(store: Store, day: ShootDay?, onDismiss: () -> Unit, onSaved: (ShootDay) -> Unit = {}) {
    val isNew = day == null
    var draft by remember { mutableStateOf(day ?: ShootDay(date = HebDate.todayIso())) }
    var confirmDelete by remember { mutableStateOf(false) }
    val locations = store.locations

    EditorDialog(
        title = if (isNew) "יום צילום חדש" else "הגדרות היום",
        onDismiss = onDismiss,
        onSave = { store.upsertDay(draft); onSaved(draft); onDismiss() },
    ) {
        Field("תאריך (yyyy-MM-dd)", draft.date, { draft = draft.copy(date = it) },
              supporting = HebDate.long(draft.date))
        Field("כותרת", draft.title, { draft = draft.copy(title = it) },
              supporting = "למשל: יום 4 — סצנות 12-18")
        DropdownField(
            "מיקום",
            store.location(draft.locationId)?.name ?: "לא נבחר",
            listOf("לא נבחר") + locations.map { it.name },
        ) { i -> draft = draft.copy(locationId = if (i == 0) "" else locations[i - 1].id) }

        Field("קריאה כללית", draft.generalCall, { draft = draft.copy(generalCall = it) }, KeyboardType.Number)
        Field("תחילת צילום", draft.shootingCall, { draft = draft.copy(shootingCall = it) }, KeyboardType.Number)
        Field("סיום משוער", draft.wrap, { draft = draft.copy(wrap = it) }, KeyboardType.Number)
        Field("הערות הפקה", draft.notes, { draft = draft.copy(notes = it) }, singleLine = false)

        if (!isNew) {
            TextButton(onClick = { confirmDelete = true }) {
                Text("מחיקת יום", color = MaterialTheme.colorScheme.error)
            }
        }
    }

    if (confirmDelete) {
        AlertDialog(
            onDismissRequest = { confirmDelete = false },
            title = { Text("מחיקת יום צילום") },
            text = { Text("למחוק את יום הצילום הזה על כל הנתונים שבו?") },
            confirmButton = {
                TextButton(onClick = { store.deleteDay(draft.id); confirmDelete = false; onDismiss() }) {
                    Text("מחק", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmDelete = false }) { Text("ביטול") } },
        )
    }
}

// ---------------------------------------------------------------- call

@Composable
fun CallEditor(store: Store, day: ShootDay, person: Person, onDismiss: () -> Unit) {
    var draft by remember { mutableStateOf(day.calls[person.id] ?: CallInfo()) }
    val locations = store.locations

    EditorDialog(
        title = person.name,
        onDismiss = onDismiss,
        onSave = { store.setCall(day.id, person.id, draft); onDismiss() },
    ) {
        Field("שעת קריאה", draft.time, { draft = draft.copy(time = it) }, KeyboardType.Number,
              supporting = "ריק = הקריאה הכללית (${day.generalCall})")
        DropdownField(
            "מיקום",
            store.location(draft.locationId)?.name ?: "כמו היום",
            listOf("כמו היום") + locations.map { it.name },
        ) { i -> draft = draft.copy(locationId = if (i == 0) "" else locations[i - 1].id) }

        Text("סטטוס", style = MaterialTheme.typography.labelLarge)
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            CallStatus.entries.forEachIndexed { i, s ->
                SegmentedButton(
                    selected = draft.status == s,
                    onClick = { draft = draft.copy(status = s) },
                    shape = SegmentedButtonDefaults.itemShape(i, CallStatus.entries.size),
                ) { Text(s.he, style = MaterialTheme.typography.labelMedium) }
            }
        }
        Field("הערה", draft.note, { draft = draft.copy(note = it) }, singleLine = false,
              supporting = "איסוף, ציוד מיוחד…")
    }
}

// ---------------------------------------------------------------- vehicle

@Composable
fun VehicleEditor(store: Store, day: ShootDay, vslot: String, onDismiss: () -> Unit) {
    var draft by remember { mutableStateOf(day.vehicles[vslot] ?: VehicleAssignment()) }
    var picking by remember { mutableStateOf(false) }
    val label = Sheets.vehicles.firstOrNull { it.first == vslot }?.second ?: "רכב"

    EditorDialog(
        title = label,
        onDismiss = onDismiss,
        onSave = {
            store.editDay(day.id) { d -> d.copy(vehicles = d.vehicles + (vslot to draft)) }
            onDismiss()
        },
    ) {
        val driver = store.person(draft.driverId)
        ListItem(
            headlineContent = { Text(driver?.name ?: "שיוך נהג") },
            supportingContent = {
                val phone = driver?.phone.orEmpty()
                if (phone.isNotBlank()) LtrText(Phone.pretty(phone))
            },
            leadingContent = {
                if (driver != null) Avatar(driver.name, 36, driver.dept.hex)
                else Avatar("+", 36, "#8E8E93")
            },
            modifier = Modifier.clickable { picking = true },
        )
        Field("מספר רכב", draft.plate, { draft = draft.copy(plate = it) })
        Field("הערה", draft.note, { draft = draft.copy(note = it) }, singleLine = false,
              supporting = "מה נוסע ברכב הזה")
    }

    if (picking) {
        PersonPicker(store, title = "נהג — $label", slot = null, selectedId = draft.driverId,
                     onDismiss = { picking = false }) { id -> draft = draft.copy(driverId = id) }
    }
}

// ---------------------------------------------------------------- picker

@Composable
fun PersonPicker(
    store: Store,
    title: String,
    slot: String?,
    selectedId: String? = null,
    allowNone: Boolean = true,
    onDismiss: () -> Unit,
    onPick: (String) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var creating by remember { mutableStateOf(false) }
    val dept = slot?.let { Sheets.slot(it)?.dept }

    // People whose default role matches this slot float to the top, then the
    // rest of the department, then everyone else.
    val ordered = remember(query, store.people, slot) {
        store.people
            .filter { query.isBlank() || "${it.name} ${it.phone} ${it.dept.he}".contains(query, true) }
            .sortedWith(compareBy(
                { p -> if (slot != null && p.defaultSlot == slot) 0 else if (dept != null && p.dept == dept) 1 else 2 },
                { it.name },
            ))
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier.fillMaxWidth(0.96f).fillMaxHeight(0.85f),
        title = { Text(title, style = MaterialTheme.typography.titleLarge) },
        text = {
            Column(Modifier.fillMaxSize()) {
                OutlinedTextField(
                    value = query, onValueChange = { query = it },
                    label = { Text("חיפוש") }, singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                LazyColumn(Modifier.weight(1f)) {
                    if (allowNone) {
                        item {
                            ListItem(
                                headlineContent = { Text("להשאיר ריק") },
                                modifier = Modifier.clickable { onPick(""); onDismiss() },
                            )
                        }
                    }
                    items(ordered, key = { it.id }) { p ->
                        ListItem(
                            headlineContent = { Text(p.name) },
                            supportingContent = {
                                Text(listOfNotNull(p.dept.he, Sheets.slot(p.defaultSlot)?.short)
                                    .joinToString(" · "))
                            },
                            leadingContent = { Avatar(p.name, 38, p.dept.hex) },
                            trailingContent = {
                                when {
                                    slot != null && p.defaultSlot == slot -> Pill("ברירת מחדל")
                                    selectedId == p.id -> Text("✓", color = Tint)
                                    else -> Unit
                                }
                            },
                            modifier = Modifier.clickable { onPick(p.id); onDismiss() },
                        )
                    }
                    item {
                        TextButton(onClick = { creating = true }, modifier = Modifier.padding(8.dp)) {
                            Text("+ איש קשר חדש")
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("סגור") } },
    )

    if (creating) {
        PersonEditor(
            store,
            person = Person(dept = dept ?: Dept.PRODUCTION, defaultSlot = slot.orEmpty()),
            onDismiss = { creating = false },
            onSaved = { p -> onPick(p.id); onDismiss() },
        )
    }
}

// ---------------------------------------------------------------- dropdown

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DropdownField(label: String, selected: String, options: List<String>, onSelect: (Int) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selected,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable),
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEachIndexed { i, option ->
                DropdownMenuItem(
                    text = { Text(option) },
                    onClick = { onSelect(i); expanded = false },
                )
            }
        }
    }
}
