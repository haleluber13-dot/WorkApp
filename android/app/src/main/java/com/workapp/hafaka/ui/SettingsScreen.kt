package com.workapp.hafaka.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material.icons.filled.Place
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import com.workapp.hafaka.data.Actions
import com.workapp.hafaka.data.Demo
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.model.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SettingsScreen(store: Store, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    val syncStatus by store.syncStatus.collectAsState()
    val context = LocalContext.current

    var addingLocation by remember { mutableStateOf(false) }
    var editingLocation by remember { mutableStateOf<Location?>(null) }
    var configuringSync by remember { mutableStateOf(false) }
    var confirmDemo by remember { mutableStateOf(false) }
    var confirmWipe by remember { mutableStateOf(false) }

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 32.dp)) {
        item { SectionTitle("מיקומים") }
        item {
            Card {
                state.locations.forEachIndexed { i, loc ->
                    ListItem(
                        headlineContent = { Text(loc.name) },
                        supportingContent = {
                            val sub = listOfNotNull(
                                loc.address.takeIf { it.isNotBlank() },
                                loc.parking.takeIf { it.isNotBlank() }?.let { "חניה: $it" },
                            ).joinToString(" · ")
                            Text(sub.ifBlank { "ללא כתובת" })
                        },
                        leadingContent = { Icon(Icons.Filled.Place, null, tint = Tint) },
                        trailingContent = {
                            IconButton(onClick = {
                                Actions.navigate(context, loc, state.settings.navApp)
                            }) { Icon(Icons.Filled.Navigation, "ניווט אל ${loc.name}", tint = Tint) }
                        },
                        colors = ListItemDefaults.colors(
                            containerColor = MaterialTheme.colorScheme.surface),
                        modifier = Modifier.clickable { editingLocation = loc },
                    )
                    if (i < state.locations.lastIndex) RowDivider()
                }
                if (state.locations.isNotEmpty()) RowDivider()
                ListItem(
                    headlineContent = { Text("מיקום חדש") },
                    leadingContent = { Icon(Icons.Filled.Add, null, tint = Tint) },
                    colors = ListItemDefaults.colors(
                        containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.clickable { addingLocation = true },
                )
            }
        }
        item {
            Text("מיקום שמור נותן ניווט בלחיצה אחת מכל מסך באפליקציה.",
                 Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                 style = MaterialTheme.typography.bodySmall,
                 color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        item { SectionTitle("אפליקציית ניווט") }
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                NavApp.entries.forEachIndexed { i, app ->
                    SegmentedButton(
                        selected = state.settings.navApp == app,
                        onClick = { store.updateSettings { it.copy(navApp = app) } },
                        shape = SegmentedButtonDefaults.itemShape(i, NavApp.entries.size),
                    ) { Text(app.he, style = MaterialTheme.typography.labelMedium) }
                }
            }
        }
        item {
            Text("מפות אפל אינן קיימות באנדרואיד — הבחירה בהן תיפתח בגוגל מפות.",
                 Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                 style = MaterialTheme.typography.bodySmall,
                 color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        item { SectionTitle("מראה") }
        item {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                ThemeChoice.entries.forEachIndexed { i, choice ->
                    SegmentedButton(
                        selected = state.settings.theme == choice,
                        onClick = { store.updateSettings { it.copy(theme = choice) } },
                        shape = SegmentedButtonDefaults.itemShape(i, ThemeChoice.entries.size),
                    ) { Text(choice.he, style = MaterialTheme.typography.labelMedium) }
                }
            }
        }

        item { SectionTitle("ההפקה") }
        item {
            Card {
                OutlinedTextField(
                    value = state.settings.productionName,
                    onValueChange = { v -> store.updateSettings { it.copy(productionName = v) } },
                    label = { Text("שם ההפקה") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(12.dp),
                )
            }
        }

        item {
            SectionTitle("סנכרון צוות", when (val s = syncStatus) {
                is Store.SyncStatus.Off -> "כבוי"
                is Store.SyncStatus.Syncing -> "מסנכרן…"
                is Store.SyncStatus.Offline -> "לא מקוון"
                is Store.SyncStatus.Error -> "שגיאה"
                is Store.SyncStatus.Ok ->
                    "מסונכרן " + SimpleDateFormat("HH:mm", Locale("he")).format(Date(s.at))
            })
        }
        item {
            Card {
                ListItem(
                    headlineContent = {
                        Text(if (state.settings.sync.enabled) "סנכרון פעיל" else "הפעלת סנכרון")
                    },
                    supportingContent = {
                        Text(if (state.settings.sync.enabled)
                                 "פרויקט: ${state.settings.sync.projectId}"
                             else "שיתוף הנתונים עם הצוות בין מכשירים")
                    },
                    leadingContent = { Icon(Icons.Filled.CloudSync, null, tint = Tint) },
                    colors = ListItemDefaults.colors(
                        containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.clickable { configuringSync = true },
                )
                if (state.settings.sync.enabled) {
                    RowDivider()
                    ListItem(
                        headlineContent = { Text("סנכרון עכשיו") },
                        colors = ListItemDefaults.colors(
                            containerColor = MaterialTheme.colorScheme.surface),
                        modifier = Modifier.clickable { store.syncNow() },
                    )
                }
            }
        }
        item {
            Text("בלי סנכרון האפליקציה עובדת במלואה על המכשיר. עם סנכרון, כל מי שמזין את אותם פרטי חיבור רואה את אותם ימים, אנשי קשר ומיקומים.",
                 Modifier.padding(horizontal = 20.dp, vertical = 8.dp),
                 style = MaterialTheme.typography.bodySmall,
                 color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        item { SectionTitle("נתונים") }
        item {
            Card {
                ListItem(
                    headlineContent = { Text("שיתוף גיבוי") },
                    supportingContent = { Text("שולח את כל הנתונים כטקסט — לשמירה או להעברה למכשיר אחר") },
                    colors = ListItemDefaults.colors(
                        containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.clickable {
                        Actions.share(context, store.exportBackup(), "גיבוי יומן הפקה")
                    },
                )
                RowDivider()
                ListItem(
                    headlineContent = { Text("טעינת נתוני דוגמה") },
                    supportingContent = { Text("הפקה לדוגמה כדי להתרשם מהאפליקציה") },
                    colors = ListItemDefaults.colors(
                        containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.clickable { confirmDemo = true },
                )
                RowDivider()
                ListItem(
                    headlineContent = {
                        Text("מחיקת כל הנתונים", color = MaterialTheme.colorScheme.error)
                    },
                    colors = ListItemDefaults.colors(
                        containerColor = MaterialTheme.colorScheme.surface),
                    modifier = Modifier.clickable { confirmWipe = true },
                )
            }
        }

        item {
            Text("יומן הפקה · גרסה 1.0",
                 Modifier.fillMaxWidth().padding(24.dp),
                 style = MaterialTheme.typography.bodySmall,
                 color = MaterialTheme.colorScheme.onSurfaceVariant,
                 textAlign = TextAlign.Center)
        }
    }

    if (addingLocation) LocationEditor(store, null, onDismiss = { addingLocation = false })
    editingLocation?.let { l -> LocationEditor(store, l, onDismiss = { editingLocation = null }) }
    if (configuringSync) SyncSetupDialog(store, onDismiss = { configuringSync = false })

    if (confirmDemo) {
        AlertDialog(
            onDismissRequest = { confirmDemo = false },
            title = { Text("נתוני דוגמה") },
            text = { Text("פעולה זו תחליף את כל הנתונים הקיימים בנתוני דוגמה. להמשיך?") },
            confirmButton = {
                TextButton(onClick = { store.replace(Demo.state()); confirmDemo = false }) {
                    Text("טען דוגמה")
                }
            },
            dismissButton = { TextButton(onClick = { confirmDemo = false }) { Text("ביטול") } },
        )
    }

    if (confirmWipe) {
        AlertDialog(
            onDismissRequest = { confirmWipe = false },
            title = { Text("מחיקת כל הנתונים") },
            text = { Text("למחוק את כל הנתונים מהמכשיר הזה? הפעולה אינה הפיכה.") },
            confirmButton = {
                TextButton(onClick = { store.replace(AppState()); confirmWipe = false }) {
                    Text("מחק הכל", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = { TextButton(onClick = { confirmWipe = false }) { Text("ביטול") } },
        )
    }
}

@Composable
private fun SyncSetupDialog(store: Store, onDismiss: () -> Unit) {
    var draft by remember {
        mutableStateOf(store.settings.sync.let {
            if (it.projectId.isBlank()) it.copy(projectId = "default") else it
        })
    }
    var message by remember { mutableStateOf<String?>(null) }
    var isError by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun check(thenEnable: Boolean) {
        busy = true
        scope.launch {
            val result = store.testSync(draft)
            busy = false
            result.fold(
                onSuccess = {
                    if (thenEnable) {
                        store.updateSettings { it.copy(sync = draft.copy(enabled = true)) }
                        store.syncNow()
                        onDismiss()
                    } else {
                        message = "✅ החיבור תקין"; isError = false
                    }
                },
                onFailure = { e -> message = "❌ ${e.message}"; isError = true },
            )
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(usePlatformDefaultWidth = false),
        modifier = Modifier.fillMaxWidth(0.96f),
        title = { Text("סנכרון צוות") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("הסנכרון עובד מול פרויקט Supabase חינמי משלכם. צרו פרויקט, הריצו את supabase/schema.sql, והדביקו כאן את הכתובת והמפתח הציבורי.",
                     style = MaterialTheme.typography.bodySmall,
                     color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(draft.url, { draft = draft.copy(url = it.trim()) },
                                  label = { Text("כתובת") }, singleLine = true,
                                  modifier = Modifier.fillMaxWidth())
                OutlinedTextField(draft.anonKey, { draft = draft.copy(anonKey = it.trim()) },
                                  label = { Text("מפתח anon") }, singleLine = true,
                                  modifier = Modifier.fillMaxWidth())
                OutlinedTextField(draft.projectId, { draft = draft.copy(projectId = it.trim()) },
                                  label = { Text("מזהה פרויקט") }, singleLine = true,
                                  modifier = Modifier.fillMaxWidth())
                message?.let {
                    Text(it, color = if (isError) MaterialTheme.colorScheme.error else Tint,
                         style = MaterialTheme.typography.bodySmall)
                }
                if (busy) LinearProgressIndicator(Modifier.fillMaxWidth())
                TextButton(onClick = { check(false) },
                           enabled = !busy && draft.url.isNotBlank() && draft.anonKey.isNotBlank()) {
                    Text("בדיקת חיבור")
                }
                if (store.settings.sync.enabled) {
                    TextButton(onClick = {
                        store.updateSettings { it.copy(sync = draft.copy(enabled = false)) }
                        onDismiss()
                    }) { Text("כיבוי סנכרון", color = MaterialTheme.colorScheme.error) }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { check(true) },
                       enabled = !busy && draft.url.isNotBlank() && draft.anonKey.isNotBlank()) {
                Text("הפעלה")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("ביטול") } },
    )
}
