package com.workapp.hafaka

import com.workapp.hafaka.data.AppJson
import com.workapp.hafaka.model.*
import kotlinx.serialization.encodeToString
import org.junit.Assert.*
import org.junit.Test

class PhoneTest {

    @Test fun `normalises every shape an Israeli number is typed in`() {
        assertEquals("972501234567", Phone.e164("0501234567"))
        assertEquals("972501234567", Phone.e164("050-123-4567"))
        assertEquals("972501234567", Phone.e164("+972501234567"))
        assertEquals("972501234567", Phone.e164("00972501234567"))
        assertEquals("972501234567", Phone.e164("050 123 4567"))
        assertEquals("", Phone.e164(""))
    }

    @Test fun `formats mobile and landline for display`() {
        assertEquals("050-123-4567", Phone.pretty("0501234567"))
        assertEquals("050-123-4567", Phone.pretty("+972501234567"))
        assertEquals("02-123-4567", Phone.pretty("021234567"))
    }

    @Test fun `leaves anything it does not recognise alone`() {
        assertEquals("not a number", Phone.pretty("not a number"))
    }

    @Test fun `hasPhone rejects fragments`() {
        assertTrue(Phone.hasPhone(Person(phone = "0501234567")))
        assertFalse(Phone.hasPhone(Person(phone = "050")))
        assertFalse(Phone.hasPhone(Person(phone = "")))
    }
}

class SheetsTest {

    @Test fun `production sheet keeps the workbook column order`() {
        assertEquals(
            listOf("ע הפקה ג 1", "ע הפקה ג 2", "ע הפקה 1", "ע הפקה 2", "נערת מים",
                   "צלם 1", "צלם 2", "צלם 3", "ע צלם", "ע צלם 2",
                   "מקליט", "בום", "תאורן", "ע תאורן", "גריפ"),
            Sheets.labels(Sheets.crew))
    }

    @Test fun `repeated headers are numbered, unique ones are not`() {
        val labels = Sheets.labels(Sheets.cleaning)
        assertEquals(listOf("מנקה 1", "מנקה 2"), labels)
        assertTrue(Sheets.labels(Sheets.crew).contains("נערת מים"))  // unique, unnumbered
    }

    @Test fun `every slot key is unique across all sheets`() {
        val keys = Sheets.all.map { it.slot }
        assertEquals(keys.size, keys.toSet().size)
    }

    @Test fun `all five workbook sheets are represented`() {
        assertEquals(15, Sheets.crew.size)
        assertEquals(2, Sheets.cleaning.size)
        assertEquals(2, Sheets.security.size)
        assertEquals(8, Sheets.vehicles.size)
        assertEquals(7, Sheets.cateringFields.size)
    }
}

class RosterTest {

    private val alice = Person(id = "p1", name = "אורי", phone = "0501234567", dept = Dept.CAMERA)
    private val bob   = Person(id = "p2", name = "דנה", phone = "0509998888", dept = Dept.PRODUCTION)
    private val carl  = Person(id = "p3", name = "אבי", phone = "0521112222", dept = Dept.VEHICLES)
    private val people = listOf(alice, bob, carl)

    private val day = ShootDay(
        id = "d1", date = "2026-08-25", generalCall = "06:30", shootingCall = "08:00", wrap = "19:00",
        locationId = "loc1",
        slots = mapOf("cam_1" to "p1", "pa_snr_1" to "p2"),
        calls = mapOf("p1" to CallInfo(time = "05:45", status = CallStatus.CONFIRMED)),
        vehicles = mapOf("truck" to VehicleAssignment(driverId = "p3", plate = "12-345-67")),
    )

    @Test fun `people with no override inherit the general call`() {
        val roster = Roster.of(day, people)
        assertEquals("06:30", roster.first { it.person.id == "p2" }.call.time)
        assertFalse(roster.first { it.person.id == "p2" }.isOverride)
    }

    @Test fun `an override wins over the general call`() {
        val entry = Roster.of(day, people).first { it.person.id == "p1" }
        assertEquals("05:45", entry.call.time)
        assertEquals(CallStatus.CONFIRMED, entry.call.status)
        assertTrue(entry.isOverride)
    }

    @Test fun `a driver on the vehicles sheet counts as on the day`() {
        val entry = Roster.of(day, people).first { it.person.id == "p3" }
        assertEquals(listOf("truck"), entry.vehicles)
        assertTrue(entry.roleLabels.contains("נהג"))
    }

    @Test fun `roster is ordered by call time so waves read top to bottom`() {
        assertEquals(listOf("05:45", "06:30", "06:30"), Roster.of(day, people).map { it.call.time })
    }

    @Test fun `an unassigned call location falls back to the day location`() {
        assertTrue(Roster.of(day, people).all { it.call.locationId == "loc1" })
    }

    @Test fun `a slot pointing at a deleted person is dropped, not crashed on`() {
        val ghost = day.copy(slots = day.slots + ("cam_2" to "gone"))
        assertEquals(3, Roster.of(ghost, people).size)
    }

    @Test fun `catering total sums only the head counts`() {
        val d = day.copy(catering = mapOf("crew" to 24, "actors" to 6, "extras" to 30, "orderedLunch" to 62))
        assertEquals(60, Roster.cateringTotal(d))
    }

    @Test fun `catering total tolerates missing and null counts`() {
        assertEquals(0, Roster.cateringTotal(day))
        assertEquals(24, Roster.cateringTotal(day.copy(catering = mapOf("crew" to 24, "actors" to null))))
    }

    @Test fun `active mark is the next milestone still ahead`() {
        // 07:00 -> general call passed, shooting call is next
        assertEquals(1, Roster.activeMark(day, "2026-08-25", 7 * 60))
        // 05:00 -> nothing has happened yet
        assertEquals(0, Roster.activeMark(day, "2026-08-25", 5 * 60))
        // 20:00 -> the day is done
        assertNull(Roster.activeMark(day, "2026-08-25", 20 * 60))
        // a different day is never live
        assertNull(Roster.activeMark(day, "2026-08-26", 7 * 60))
    }
}

class HebDateTest {

    @Test fun `formats a date the way the sheets do`() {
        assertEquals("יום שלישי, 25.8.2026", HebDate.long("2026-08-25"))
        assertEquals("25.8", HebDate.short("2026-08-25"))
    }

    @Test fun `weekday names start the week on Sunday`() {
        assertEquals("שלישי", HebDate.weekdayName("2026-08-25"))  // Tuesday
        assertEquals("ראשון", HebDate.weekdayName("2026-08-23"))  // Sunday
        assertEquals("שבת",   HebDate.weekdayName("2026-08-22"))  // Saturday
    }

    @Test fun `a malformed date is passed through rather than throwing`() {
        assertEquals("nonsense", HebDate.long("nonsense"))
    }
}

/**
 * The three clients (web, iOS, Android) write the same rows into the same
 * Supabase project. This decodes JSON produced by the *web* client verbatim.
 * If it fails, sync between platforms is broken.
 */
class CrossClientJsonTest {

    private fun fixture(): String =
        javaClass.classLoader!!.getResourceAsStream("web-state.json")!!
            .bufferedReader().readText()

    @Test fun `decodes a state file written by the web client`() {
        val state = AppJson.decodeFromString<AppState>(fixture())
        assertEquals(13, state.people.size)
        assertEquals(2, state.locations.size)
        assertEquals(2, state.days.size)
    }

    @Test fun `department and status enums match across clients`() {
        val state = AppJson.decodeFromString<AppState>(fixture())
        assertTrue(state.people.any { it.dept == Dept.PRODUCTION })
        assertTrue(state.people.any { it.dept == Dept.CAMERA })
        assertTrue(state.people.any { it.dept == Dept.LIGHTING })
        val statuses = state.days.flatMap { it.calls.values }.map { it.status }.toSet()
        assertTrue(statuses.contains(CallStatus.CONFIRMED))
        assertTrue(statuses.contains(CallStatus.OUT))
    }

    @Test fun `sheet slots resolve against the shared slot keys`() {
        val day = AppJson.decodeFromString<AppState>(fixture()).days.first()
        assertTrue(day.slots.isNotEmpty())
        day.slots.keys.forEach { key ->
            assertNotNull("unknown slot key from the web client: $key", Sheets.slot(key))
        }
    }

    @Test fun `catering counts survive the round trip`() {
        val day = AppJson.decodeFromString<AppState>(fixture()).days.first()
        assertEquals(24, day.count("crew"))
        assertEquals(62, day.count("orderedLunch"))
        assertEquals(60, Roster.cateringTotal(day))
    }

    @Test fun `the roster derives identically from web-written data`() {
        val state = AppJson.decodeFromString<AppState>(fixture())
        val roster = Roster.of(state.days.first(), state.people)
        assertEquals(13, roster.size)
        // The web fixture gives the DoP an 05:45 override; it must lead the list.
        assertEquals("05:45", roster.first().call.time)
        assertTrue(roster.any { it.roleLabels.contains("נהג") })
    }

    @Test fun `re-encoding stays readable by the other clients`() {
        val state = AppJson.decodeFromString<AppState>(fixture())
        val round = AppJson.decodeFromString<AppState>(AppJson.encodeToString(state))
        assertEquals(state.people.map { it.id }.toSet(), round.people.map { it.id }.toSet())
        assertEquals(state.days.first().slots, round.days.first().slots)
        assertEquals(state.days.first().catering, round.days.first().catering)
    }

    @Test fun `a cleared catering count decodes even when written as null`() {
        val json = """{"days":[{"id":"d","date":"2026-01-01","catering":{"crew":null,"actors":4}}]}"""
        val state = AppJson.decodeFromString<AppState>(json)
        assertNull(state.days.first().count("crew"))
        assertEquals(4, state.days.first().count("actors"))
    }
}
