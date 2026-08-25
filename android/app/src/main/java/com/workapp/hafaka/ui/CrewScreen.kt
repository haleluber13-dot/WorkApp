package com.workapp.hafaka.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.background
import com.workapp.hafaka.data.Actions
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.*

/** The contact book — grouped by department, searchable, one tap to anyone. */
@Composable
fun CrewScreen(store: Store, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    val context = LocalContext.current

    var query by rememberSaveable { mutableStateOf("") }
    var deptFilter by rememberSaveable { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<Person?>(null) }
    var creating by remember { mutableStateOf(false) }

    if (state.people.isEmpty()) {
        Column(modifier.fillMaxSize(), verticalArrangement = Arrangement.Center) {
            EmptyState(
                "אין עדיין אנשי קשר",
                "הוסיפו את הצוות פעם אחת — ומשם כל שיבוץ ליום צילום הוא בחירה מרשימה, לא הקלדה מחדש.",
                "איש קשר ראשון",
            ) { creating = true }
        }
        if (creating) PersonEditor(store, null, onDismiss = { creating = false })
        return
    }

    val filtered = state.people
        .filter { p ->
            (deptFilter == null || p.dept.name == deptFilter) &&
                (query.isBlank() ||
                    "${p.name} ${p.phone} ${p.homeBase} ${p.dept.he} ${Sheets.slot(p.defaultSlot)?.short.orEmpty()}"
                        .contains(query, ignoreCase = true))
        }
        .sortedBy { it.name }

    val usedDepts = Dept.entries.filter { d -> state.people.any { it.dept == d } }
    val grouped = Dept.entries.mapNotNull { d ->
        filtered.filter { it.dept == d }.takeIf { it.isNotEmpty() }?.let { d to it }
    }

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("חיפוש לפי שם, תפקיד או טלפון") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        if (usedDepts.size > 1) {
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    item {
                        FilterChipCompat("הכל · ${state.people.size}", deptFilter == null, null) {
                            deptFilter = null
                        }
                    }
                    items(usedDepts, key = { it.name }) { d ->
                        val n = state.people.count { it.dept == d }
                        FilterChipCompat("${d.he} · $n", deptFilter == d.name, d.hex) {
                            deptFilter = if (deptFilter == d.name) null else d.name
                        }
                    }
                }
            }
        }

        if (grouped.isEmpty()) {
            item { EmptyState("לא נמצאו תוצאות", "נסו חיפוש אחר.") }
        }

        grouped.forEach { (dept, people) ->
            item {
                Row(
                    Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = 18.dp, bottom = 7.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        Box(Modifier.size(8.dp).clip(CircleShape).background(colorOf(dept.hex)))
                        Text(dept.he, style = MaterialTheme.typography.labelLarge)
                    }
                    Text("${people.size}", style = MaterialTheme.typography.labelLarge,
                         color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            item {
                Card {
                    people.forEachIndexed { i, p ->
                        ListItem(
                            headlineContent = { Text(p.name) },
                            supportingContent = {
                                Column {
                                    val meta = listOfNotNull(Sheets.slot(p.defaultSlot)?.short,
                                                             p.homeBase.takeIf { it.isNotBlank() })
                                        .joinToString(" · ")
                                    if (meta.isNotBlank()) Text(meta)
                                    // Its own line: sharing one line with Hebrew
                                    // text, the number gets truncated from the
                                    // wrong end and becomes useless.
                                    if (p.phone.isNotBlank()) LtrText(Phone.pretty(p.phone))
                                }
                            },
                            leadingContent = { Avatar(p.name, 42, p.dept.hex) },
                            trailingContent = {
                                if (Phone.hasPhone(p)) {
                                    Row {
                                        IconButton(onClick = { Actions.call(context, p) }) {
                                            Icon(Icons.Filled.Phone, "חיוג ל${p.name}", tint = Tint)
                                        }
                                        IconButton(onClick = { Actions.whatsapp(context, p) }) {
                                            Icon(Icons.Filled.Chat, "וואטסאפ ל${p.name}", tint = Tint)
                                        }
                                    }
                                }
                            },
                            colors = ListItemDefaults.colors(
                                containerColor = MaterialTheme.colorScheme.surface),
                            modifier = Modifier.clickable { editing = p },
                        )
                        if (i < people.lastIndex) RowDivider()
                    }
                }
            }
        }

        item {
            Button(
                onClick = { creating = true },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 20.dp),
            ) { Icon(Icons.Filled.Add, null); Spacer(Modifier.width(6.dp)); Text("איש קשר חדש") }
        }
    }

    if (creating) PersonEditor(store, null, onDismiss = { creating = false })
    editing?.let { p -> PersonEditor(store, p, onDismiss = { editing = null }) }
}

@Composable
private fun FilterChipCompat(label: String, selected: Boolean, hex: String?, onClick: () -> Unit) {
    FilterChip(
        selected = selected,
        onClick = onClick,
        label = { Text(label, style = MaterialTheme.typography.labelMedium) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = colorOf(hex ?: "#F5A524"),
            selectedLabelColor = inkOn(hex ?: "#F5A524"),
        ),
    )
}
