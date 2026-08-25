package com.workapp.hafaka

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.lifecycleScope
import com.workapp.hafaka.data.Store
import com.workapp.hafaka.ui.RootScreen
import com.workapp.hafaka.ui.WorkAppTheme
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private lateinit var store: Store

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        store = (application as WorkAppApplication).store
        store.startSync()

        setContent {
            val state by store.state.collectAsState()
            WorkAppTheme(state.settings.theme) {
                RootScreen(store)
            }
        }
    }

    override fun onStop() {
        super.onStop()
        // Never lose an edit to a task switch: the debounced save may still be
        // pending when the app leaves the foreground.
        lifecycleScope.launch { store.saveNow() }
    }

    override fun onResume() {
        super.onResume()
        if (store.settings.sync.isUsable) store.syncNow()
    }
}
