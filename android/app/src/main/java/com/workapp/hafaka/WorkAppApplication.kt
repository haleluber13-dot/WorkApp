package com.workapp.hafaka

import android.app.Application
import com.workapp.hafaka.data.Store
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

/**
 * Holds the single Store for the process. The store owns unsaved edits, so it
 * has to outlive any one screen — an Activity-scoped instance would drop a
 * half-typed call time on rotation.
 */
class WorkAppApplication : Application() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    val store: Store by lazy { Store(this, scope) }
}
