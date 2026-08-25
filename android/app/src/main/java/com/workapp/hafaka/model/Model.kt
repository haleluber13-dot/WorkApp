package com.workapp.hafaka.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import java.util.UUID

/**
 * Domain model, mirroring the production workbook one-to-one.
 *
 * Field names and enum values are deliberately identical to the web client's
 * `model.js` and the iOS client's `Model.swift`: all three write the same JSON
 * into the same Supabase rows, so a shape change here has to be made in all
 * three or sync silently drifts.
 */

// ---------------------------------------------------------------- departments

@Serializable
enum class Dept(val he: String, val hex: String) {
    @SerialName("production") PRODUCTION("הפקה", "#F5A524"),
    @SerialName("camera")     CAMERA("מצלמה", "#0072E5"),
    @SerialName("sound")      SOUND("סאונד", "#B034EF"),
    @SerialName("lighting")   LIGHTING("תאורה", "#FFD60A"),
    @SerialName("catering")   CATERING("קיטרינג", "#30D158"),
    @SerialName("vehicles")   VEHICLES("רכבים", "#5E5CE6"),
    @SerialName("cleaning")   CLEANING("ניקיון", "#64D2FF"),
    @SerialName("security")   SECURITY("שמירה", "#EC0D00"),
    @SerialName("cast")       CAST("שחקנים", "#E9002F"),
}

// ---------------------------------------------------------------- sheet slots

data class CrewSlot(
    val slot: String,   // stable key, shared across all three clients
    val he: String,     // the exact spreadsheet column header
    val dept: Dept,
    val short: String,
)

object Sheets {

    /** Sheet "הפקה", in the workbook's column order. */
    val crew = listOf(
        CrewSlot("pa_snr_1",  "ע הפקה ג", Dept.PRODUCTION, "ע.הפקה ג"),
        CrewSlot("pa_snr_2",  "ע הפקה ג", Dept.PRODUCTION, "ע.הפקה ג"),
        CrewSlot("pa_1",      "ע הפקה",   Dept.PRODUCTION, "ע.הפקה"),
        CrewSlot("pa_2",      "ע הפקה",   Dept.PRODUCTION, "ע.הפקה"),
        CrewSlot("water",     "נערת מים", Dept.PRODUCTION, "מים"),
        CrewSlot("cam_1",     "צלם 1",    Dept.CAMERA,     "צלם 1"),
        CrewSlot("cam_2",     "צלם 2",    Dept.CAMERA,     "צלם 2"),
        CrewSlot("cam_3",     "צלם 3",    Dept.CAMERA,     "צלם 3"),
        CrewSlot("cam_ac_1",  "ע צלם",    Dept.CAMERA,     "ע.צלם"),
        CrewSlot("cam_ac_2",  "ע צלם 2",  Dept.CAMERA,     "ע.צלם 2"),
        CrewSlot("sound",     "מקליט",    Dept.SOUND,      "מקליט"),
        CrewSlot("boom",      "בום",      Dept.SOUND,      "בום"),
        CrewSlot("gaffer",    "תאורן",    Dept.LIGHTING,   "תאורן"),
        CrewSlot("gaffer_ac", "ע תאורן",  Dept.LIGHTING,   "ע.תאורן"),
        CrewSlot("grip",      "גריפ",     Dept.LIGHTING,   "גריפ"),
    )

    /** Sheet "ניקיון". */
    val cleaning = listOf(
        CrewSlot("cleaner_1", "מנקה", Dept.CLEANING, "מנקה 1"),
        CrewSlot("cleaner_2", "מנקה", Dept.CLEANING, "מנקה 2"),
    )

    /** Sheet "שמירה" — present but empty in the workbook; built out here. */
    val security = listOf(
        CrewSlot("guard_1", "שומר", Dept.SECURITY, "שומר 1"),
        CrewSlot("guard_2", "שומר", Dept.SECURITY, "שומר 2"),
    )

    val all: List<CrewSlot> = crew + cleaning + security

    fun slot(key: String): CrewSlot? = all.firstOrNull { it.slot == key }

    /** Sheet "רכבים". */
    val vehicles = listOf(
        "truck" to "משאית",
        "art" to "ארט",
        "prod_camera" to "הפקה - מצלמה",
        "lighting_grip" to "תאורה גריפ",
        "camp" to "מחנה",
        "production" to "הפקה",
        "props" to "פרופס",
        "scouter" to "סקאוטר",
    )

    /** Sheet "קיטריינג". */
    val cateringFields = listOf(
        "crew" to "צוות",
        "actors" to "שחקנים",
        "extras" to "ניצבים/ביטים",
        "orderedBreakfast" to "הוזמן בוקר",
        "orderedLunch" to "הוזמן צהריים",
        "ateBreakfast" to "אכלו בוקר",
        "ateLunch" to "אכלו צהריים",
    )

    /** Numbered when a header repeats, so "ע הפקה ג" ×2 reads unambiguously. */
    fun labels(slots: List<CrewSlot>): List<String> {
        val totals = slots.groupingBy { it.he }.eachCount()
        val seen = mutableMapOf<String, Int>()
        return slots.map { s ->
            val n = seen.getOrDefault(s.he, 0) + 1
            seen[s.he] = n
            if ((totals[s.he] ?: 0) > 1) "${s.he} $n" else s.he
        }
    }
}

// ---------------------------------------------------------------- call status

@Serializable
enum class CallStatus(val he: String, val hex: String) {
    @SerialName("pending")   PENDING("ממתין", "#FF9F0A"),
    @SerialName("confirmed") CONFIRMED("אושר", "#30D158"),
    @SerialName("onset")     ONSET("בסט", "#0A84FF"),
    @SerialName("out")       OUT("לא מגיע", "#FF453A"),
}

// ---------------------------------------------------------------- records

private fun uid(prefix: String) =
    prefix + "_" + UUID.randomUUID().toString().replace("-", "").take(12)

@Serializable
data class Person(
    val id: String = uid("per"),
    val name: String = "",
    val phone: String = "",
    val email: String = "",
    val dept: Dept = Dept.PRODUCTION,
    val defaultSlot: String = "",
    val homeBase: String = "",     // where they travel from — drives pickups
    val notes: String = "",
    val updatedAt: Double = 0.0,
)

@Serializable
data class Location(
    val id: String = uid("loc"),
    val name: String = "",
    val address: String = "",
    val lat: Double? = null,
    val lng: Double? = null,
    val parking: String = "",
    val notes: String = "",
    val updatedAt: Double = 0.0,
) {
    val hasCoords: Boolean get() = lat != null && lng != null
}

@Serializable
data class CallInfo(
    val time: String = "",
    val status: CallStatus = CallStatus.PENDING,
    val locationId: String = "",
    val note: String = "",
)

@Serializable
data class VehicleAssignment(
    val driverId: String = "",
    val plate: String = "",
    val note: String = "",
)

@Serializable
data class ShootDay(
    val id: String = uid("day"),
    val date: String = "",                 // yyyy-MM-dd
    val title: String = "",
    val locationId: String = "",
    val generalCall: String = "07:00",     // קריאה כללית
    val shootingCall: String = "08:00",    // תחילת צילום
    val wrap: String = "19:00",            // סיום
    val slots: Map<String, String> = emptyMap(),
    val calls: Map<String, CallInfo> = emptyMap(),
    // Nullable values: the web client writes null for a cleared count.
    val catering: Map<String, Int?> = emptyMap(),
    val vehicles: Map<String, VehicleAssignment> = emptyMap(),
    val notes: String = "",
    val updatedAt: Double = 0.0,
) {
    fun count(key: String): Int? = catering[key]
}

/** One person's place on a day, with their call resolved against the day. */
data class RosterEntry(
    val person: Person,
    val slots: List<String>,
    val vehicles: List<String>,
    val call: CallInfo,
    val isOverride: Boolean,
) {
    val roleLabels: List<String>
        get() = slots.mapNotNull { Sheets.slot(it)?.short } + if (vehicles.isNotEmpty()) listOf("נהג") else emptyList()
}

// ---------------------------------------------------------------- settings

@Serializable
enum class NavApp(val he: String) {
    @SerialName("waze")   WAZE("ווייז"),
    @SerialName("google") GOOGLE("גוגל מפות"),
    @SerialName("apple")  APPLE("מפות אפל"),
}

@Serializable
enum class ThemeChoice(val he: String) {
    @SerialName("auto")  AUTO("אוטומטי"),
    @SerialName("light") LIGHT("בהיר"),
    @SerialName("dark")  DARK("כהה"),
}

@Serializable
data class SyncConfig(
    val url: String = "",
    val anonKey: String = "",
    val projectId: String = "default",
    val enabled: Boolean = false,
) {
    val isUsable: Boolean get() = enabled && url.isNotBlank() && anonKey.isNotBlank()
}

@Serializable
data class AppSettings(
    val productionName: String = "ההפקה שלי",
    val theme: ThemeChoice = ThemeChoice.AUTO,
    val navApp: NavApp = NavApp.WAZE,
    val sync: SyncConfig = SyncConfig(),
)

@Serializable
data class AppState(
    val people: List<Person> = emptyList(),
    val locations: List<Location> = emptyList(),
    val days: List<ShootDay> = emptyList(),
    val settings: AppSettings = AppSettings(),
    val deleted: Map<String, Double> = emptyMap(),   // tombstones for sync
)
