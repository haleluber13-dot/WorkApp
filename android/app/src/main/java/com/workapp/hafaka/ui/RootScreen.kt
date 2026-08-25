package com.workapp.hafaka.ui

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.TableChart
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import com.workapp.hafaka.data.Store

private enum class Tab(val he: String, val icon: ImageVector) {
    TODAY("היום", Icons.Filled.Today),
    CREW("אנשי קשר", Icons.Filled.Groups),
    DAYS("ימים", Icons.Filled.CalendarMonth),
    SHEETS("גיליונות", Icons.Filled.TableChart),
    SETTINGS("הגדרות", Icons.Filled.Settings),
}

@Composable
fun RootScreen(store: Store) {
    var tab by rememberSaveable { mutableStateOf(Tab.TODAY) }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                Tab.entries.forEach { t ->
                    NavigationBarItem(
                        selected = tab == t,
                        onClick = { tab = t },
                        icon = { Icon(t.icon, contentDescription = null) },
                        label = { Text(t.he, style = MaterialTheme.typography.labelSmall) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = TintInk,
                            indicatorColor = Tint,
                            selectedTextColor = MaterialTheme.colorScheme.onBackground,
                        ),
                    )
                }
            }
        },
    ) { inner ->
        val modifier = Modifier.padding(inner)
        when (tab) {
            Tab.TODAY -> TodayScreen(store, modifier)
            Tab.CREW -> CrewScreen(store, modifier)
            Tab.DAYS -> DaysScreen(store, modifier)
            Tab.SHEETS -> SheetsScreen(store, modifier)
            Tab.SETTINGS -> SettingsScreen(store, modifier)
        }
    }
}
