package com.workapp.hafaka.data

import com.workapp.hafaka.model.*
import java.time.LocalDate

/**
 * Sample production, offered from settings.
 *
 * Real-shaped data — crew across every department, two locations, vehicles and
 * catering counts — so the app can be understood at a glance before anyone
 * types anything. Mirrors the web client's demo so screenshots match.
 */
object Demo {

    fun state(): AppState {
        fun p(name: String, phone: String, dept: Dept, slot: String, base: String) =
            Person(name = name, phone = phone, dept = dept, defaultSlot = slot, homeBase = base,
                   updatedAt = System.currentTimeMillis().toDouble())

        val people = listOf(
            p("דנה אבירם", "0501112233", Dept.PRODUCTION, "pa_snr_1", "תל אביב"),
            p("יונתן ברק", "0502223344", Dept.PRODUCTION, "pa_1", "ראשון לציון"),
            p("שירה נחום", "0503334455", Dept.PRODUCTION, "water", "בת ים"),
            p("אורי גלעד", "0504445566", Dept.CAMERA, "cam_1", "תל אביב"),
            p("מאיה רון", "0505556677", Dept.CAMERA, "cam_2", "הרצליה"),
            p("עידו שרון", "0506667788", Dept.CAMERA, "cam_ac_1", "רמת גן"),
            p("נועם קפלן", "0507778899", Dept.SOUND, "sound", "ירושלים"),
            p("תמר אלון", "0508889900", Dept.SOUND, "boom", "מודיעין"),
            p("רועי מזרחי", "0509990011", Dept.LIGHTING, "gaffer", "נתניה"),
            p("ליאור בן דוד", "0521112233", Dept.LIGHTING, "grip", "אשדוד"),
            p("אבי כהן", "0522223344", Dept.VEHICLES, "", "לוד"),
            p("סיגלית פרץ", "0523334455", Dept.CLEANING, "cleaner_1", "רמלה"),
            p("משה לוי", "0524445566", Dept.SECURITY, "guard_1", "חולון"),
        )
        fun id(name: String) = people.first { it.name == name }.id

        val locations = listOf(
            Location(
                name = "סטודיו הרצליה", address = "הצורן 12, הרצליה",
                parking = "חניון עירוני ממול, חינם עד 18:00",
                lat = 32.1624, lng = 34.8447,
                notes = "הכניסה מהחניה האחורית. קוד שער 1408.",
                updatedAt = System.currentTimeMillis().toDouble(),
            ),
            Location(
                name = "חוף פולג", address = "חוף פולג, נתניה",
                parking = "חניית החוף — להגיע לפני 07:00",
                lat = 32.2789, lng = 34.8391,
                notes = "אין חשמל בשטח. גנרטור מגיע עם המשאית.",
                updatedAt = System.currentTimeMillis().toDouble(),
            ),
        )

        val today = ShootDay(
            date = HebDate.todayIso(),
            title = "יום 4 — סצנות 12-18",
            locationId = locations[0].id,
            generalCall = "06:30", shootingCall = "08:00", wrap = "19:00",
            slots = mapOf(
                "pa_snr_1" to id("דנה אבירם"),
                "pa_1" to id("יונתן ברק"),
                "water" to id("שירה נחום"),
                "cam_1" to id("אורי גלעד"),
                "cam_2" to id("מאיה רון"),
                "cam_ac_1" to id("עידו שרון"),
                "sound" to id("נועם קפלן"),
                "boom" to id("תמר אלון"),
                "gaffer" to id("רועי מזרחי"),
                "grip" to id("ליאור בן דוד"),
                "cleaner_1" to id("סיגלית פרץ"),
                "guard_1" to id("משה לוי"),
            ),
            calls = mapOf(
                id("אורי גלעד") to CallInfo("05:45", CallStatus.CONFIRMED, "", "איסוף מהבית"),
                id("רועי מזרחי") to CallInfo("06:00", CallStatus.CONFIRMED, "", "פריקת תאורה"),
                id("דנה אבירם") to CallInfo("06:00", CallStatus.ONSET, "", ""),
                id("מאיה רון") to CallInfo("", CallStatus.CONFIRMED, "", ""),
                id("תמר אלון") to CallInfo("", CallStatus.OUT, "", "מחלה — מחפשים מחליף"),
            ),
            catering = mapOf(
                "crew" to 24, "actors" to 6, "extras" to 30,
                "orderedBreakfast" to 40, "orderedLunch" to 62,
                "ateBreakfast" to 38, "ateLunch" to 58,
            ),
            vehicles = mapOf(
                "truck" to VehicleAssignment(id("אבי כהן"), "12-345-67", "תאורה + גריפ"),
                "prod_camera" to VehicleAssignment(id("עידו שרון"), "88-221-04", "ציוד מצלמה"),
            ),
            notes = "מזג אוויר: 31° בהיר. לוודא מים קרים לכל הצוות לאורך היום.",
            updatedAt = System.currentTimeMillis().toDouble(),
        )

        val upcoming = ShootDay(
            date = HebDate.todayIso(LocalDate.now().plusDays(2)),
            title = "יום 5 — חוץ, זריחה",
            locationId = locations[1].id,
            generalCall = "05:00", shootingCall = "06:15", wrap = "17:00",
            slots = mapOf(
                "pa_snr_1" to id("דנה אבירם"),
                "cam_1" to id("אורי גלעד"),
                "sound" to id("נועם קפלן"),
                "gaffer" to id("רועי מזרחי"),
            ),
            notes = "זריחה ב־06:12. אין מרווח לאיחור.",
            updatedAt = System.currentTimeMillis().toDouble(),
        )

        return AppState(
            people = people,
            locations = locations,
            days = listOf(today, upcoming),
            settings = AppSettings(productionName = "סדרת דרמה — עונה 2"),
        )
    }
}
