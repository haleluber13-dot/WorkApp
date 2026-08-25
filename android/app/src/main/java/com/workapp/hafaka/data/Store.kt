package com.workapp.hafaka.data

import android.content.Context
import com.workapp.hafaka.model.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import java.io.File

/**
 * Local-first state.
 *
 * Everything lives in memory and is written to a JSON file in the app's
 * private storage. The app is fully usable with no signal, which is the
 * normal condition on location; sync is a background reconciliation on top
 * and never a precondition.
 */
class Store(
    context: Context,
    private val scope: CoroutineScope,
    filename: String = "workapp-state.json",
) {

    private val file = File(context.filesDir, filename)

    private val _state = MutableStateFlow(load())
    val state: StateFlow<AppState> = _state.asStateFlow()

    private val _syncStatus = MutableStateFlow<SyncStatus>(SyncStatus.Off)
    val syncStatus: StateFlow<SyncStatus> = _syncStatus.asStateFlow()

    private val sync = Sync(this)
    private var saveJob: Job? = null

    sealed interface SyncStatus {
        data object Off : SyncStatus
        data object Syncing : SyncStatus
        data object Offline : SyncStatus
        data class Ok(val at: Long) : SyncStatus
        data class Error(val message: String) : SyncStatus
    }

    // ------------------------------------------------------------ persistence

    private fun load(): AppState = runCatching {
        if (!file.exists()) AppState()
        else AppJson.decodeFromString<AppState>(file.readText())
    }.getOrElse { AppState() }

    /** Debounced: typing into a field shouldn't hit the disk on every keystroke. */
    private fun scheduleSave() {
        saveJob?.cancel()
        saveJob = scope.launch {
            delay(400)
            saveNow()
        }
    }

    suspend fun saveNow() = withContext(Dispatchers.IO) {
        runCatching {
            // Write-then-rename: a crash mid-write can't leave a truncated file.
            val tmp = File(file.parentFile, file.name + ".tmp")
            tmp.writeText(AppJson.encodeToString(_state.value))
            tmp.renameTo(file)
        }
    }

    private fun now() = System.currentTimeMillis().toDouble()

    private fun mutate(pushes: Boolean = true, block: (AppState) -> AppState) {
        _state.value = block(_state.value)
        scheduleSave()
        if (pushes && _state.value.settings.sync.isUsable) {
            scope.launch { sync.push() }
        }
    }

    /** Replace wholesale — sync pull and backup restore only. */
    fun replace(next: AppState) {
        _state.value = next
        scope.launch { saveNow() }
    }

    internal fun setSyncStatus(status: SyncStatus) { _syncStatus.value = status }

    // ------------------------------------------------------------ people

    val people: List<Person> get() = _state.value.people
    fun person(id: String?): Person? = id?.let { pid -> _state.value.people.firstOrNull { it.id == pid } }

    fun upsertPerson(person: Person) = mutate { s ->
        val p = person.copy(updatedAt = now())
        val i = s.people.indexOfFirst { it.id == p.id }
        s.copy(people = if (i >= 0) s.people.toMutableList().also { it[i] = p } else s.people + p)
    }

    fun deletePerson(id: String) = mutate { s ->
        s.copy(
            people = s.people.filterNot { it.id == id },
            deleted = s.deleted + (id to now()),
            // Unassign everywhere so no sheet points at a ghost.
            days = s.days.map { d ->
                d.copy(
                    slots = d.slots.filterValues { it != id },
                    calls = d.calls - id,
                    vehicles = d.vehicles.mapValues { (_, v) ->
                        if (v.driverId == id) v.copy(driverId = "") else v
                    },
                    updatedAt = now(),
                )
            },
        )
    }

    // ------------------------------------------------------------ locations

    val locations: List<Location> get() = _state.value.locations
    fun location(id: String?): Location? = id?.let { lid -> _state.value.locations.firstOrNull { it.id == lid } }

    fun upsertLocation(location: Location) = mutate { s ->
        val l = location.copy(updatedAt = now())
        val i = s.locations.indexOfFirst { it.id == l.id }
        s.copy(locations = if (i >= 0) s.locations.toMutableList().also { it[i] = l } else s.locations + l)
    }

    fun deleteLocation(id: String) = mutate { s ->
        s.copy(
            locations = s.locations.filterNot { it.id == id },
            deleted = s.deleted + (id to now()),
            days = s.days.map { if (it.locationId == id) it.copy(locationId = "") else it },
        )
    }

    // ------------------------------------------------------------ days

    val days: List<ShootDay> get() = _state.value.days.sortedBy { it.date }
    fun day(id: String?): ShootDay? = id?.let { did -> _state.value.days.firstOrNull { it.id == did } }

    /** Today if it exists, else the next upcoming, else the most recent. */
    val currentDay: ShootDay?
        get() {
            val today = HebDate.todayIso()
            val all = days
            return all.firstOrNull { it.date == today }
                ?: all.firstOrNull { it.date > today }
                ?: all.lastOrNull()
        }

    fun upsertDay(day: ShootDay) = mutate { s ->
        val d = day.copy(updatedAt = now())
        val i = s.days.indexOfFirst { it.id == d.id }
        s.copy(days = if (i >= 0) s.days.toMutableList().also { it[i] = d } else s.days + d)
    }

    fun deleteDay(id: String) = mutate { s ->
        s.copy(days = s.days.filterNot { it.id == id }, deleted = s.deleted + (id to now()))
    }

    fun editDay(id: String, block: (ShootDay) -> ShootDay) = mutate { s ->
        s.copy(days = s.days.map { if (it.id == id) block(it).copy(updatedAt = now()) else it })
    }

    fun assign(dayId: String, slot: String, personId: String?) = editDay(dayId) { d ->
        d.copy(slots = if (personId.isNullOrBlank()) d.slots - slot else d.slots + (slot to personId))
    }

    fun setCall(dayId: String, personId: String, call: CallInfo) = editDay(dayId) { d ->
        d.copy(calls = d.calls + (personId to call))
    }

    fun setCount(dayId: String, key: String, value: Int?) = editDay(dayId) { d ->
        d.copy(catering = if (value == null) d.catering - key else d.catering + (key to value))
    }

    fun roster(day: ShootDay): List<RosterEntry> = Roster.of(day, people)

    // ------------------------------------------------------------ settings

    val settings: AppSettings get() = _state.value.settings

    fun updateSettings(block: (AppSettings) -> AppSettings) =
        mutate(pushes = false) { it.copy(settings = block(it.settings)) }

    /** The whole dataset as JSON, for sharing to another device. */
    fun exportBackup(): String = AppJson.encodeToString(_state.value)

    // ------------------------------------------------------------ sync

    fun startSync() = scope.launch { sync.start() }
    fun syncNow() = scope.launch { sync.pull(); sync.push() }
    suspend fun testSync(cfg: SyncConfig): Result<Unit> = sync.test(cfg)
}
