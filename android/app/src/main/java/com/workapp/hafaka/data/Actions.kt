package com.workapp.hafaka.data

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import com.workapp.hafaka.model.*

/**
 * One-tap outbound actions: call, WhatsApp, SMS, navigate, share.
 *
 * Every hand-off can fail on a given device — no dialer on a tablet, no
 * WhatsApp installed, no maps app. Each one catches that and says so in
 * Hebrew rather than throwing.
 */
object Actions {

    private fun open(context: Context, intent: Intent, failure: String) {
        try {
            context.startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(context, failure, Toast.LENGTH_SHORT).show()
        }
    }

    fun call(context: Context, person: Person) {
        if (!Phone.hasPhone(person)) {
            Toast.makeText(context, "אין מספר טלפון לאיש הקשר הזה", Toast.LENGTH_SHORT).show()
            return
        }
        // ACTION_DIAL, not ACTION_CALL: it opens the dialer pre-filled and
        // needs no CALL_PHONE permission, so the user always sees what is
        // about to be dialled.
        open(context, Intent(Intent.ACTION_DIAL, Uri.parse("tel:${Phone.digits(person.phone)}")),
             "לא נמצאה אפליקציית חיוג")
    }

    fun sms(context: Context, person: Person, body: String = "") {
        if (!Phone.hasPhone(person)) return
        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${Phone.digits(person.phone)}"))
        if (body.isNotEmpty()) intent.putExtra("sms_body", body)
        open(context, intent, "לא נמצאה אפליקציית הודעות")
    }

    fun whatsapp(context: Context, person: Person, text: String = "") {
        if (!Phone.hasPhone(person)) {
            Toast.makeText(context, "אין מספר טלפון לאיש הקשר הזה", Toast.LENGTH_SHORT).show()
            return
        }
        val url = buildString {
            append("https://wa.me/").append(Phone.e164(person.phone))
            if (text.isNotEmpty()) append("?text=").append(Uri.encode(text))
        }
        open(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)), "לא נמצאה אפליקציית וואטסאפ")
    }

    fun navigate(context: Context, location: Location, app: NavApp) {
        val query = Uri.encode(location.address.ifBlank { location.name })
        val coords = if (location.hasCoords) "${location.lat},${location.lng}" else null
        if (coords == null && query.isBlank()) {
            Toast.makeText(context, "למיקום הזה אין כתובת", Toast.LENGTH_SHORT).show()
            return
        }
        val url = when (app) {
            NavApp.WAZE -> coords?.let { "https://waze.com/ul?ll=$it&navigate=yes" }
                ?: "https://waze.com/ul?q=$query&navigate=yes"
            NavApp.GOOGLE -> "https://www.google.com/maps/dir/?api=1&destination=" + (coords ?: query)
            // Apple Maps has no Android app; fall back to Google so the
            // setting is never a dead end for someone syncing with iPhone users.
            NavApp.APPLE -> "https://www.google.com/maps/dir/?api=1&destination=" + (coords ?: query)
        }
        open(context, Intent(Intent.ACTION_VIEW, Uri.parse(url)), "לא נמצאה אפליקציית ניווט")
    }

    fun share(context: Context, text: String, subject: String = "יומן הפקה") {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, subject)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        open(context, Intent.createChooser(intent, "שיתוף"), "אין אפליקציה לשיתוף")
    }

    // ---------------------------------------------------------------- copy

    /** What one crew member is told about their own call. */
    fun callMessage(day: ShootDay, person: Person, call: CallInfo, location: Location?): String {
        val lines = mutableListOf(
            "היי ${person.name},",
            HebDate.long(day.date) + if (day.title.isBlank()) "" else " — ${day.title}",
            "שעת קריאה: ${call.time.ifBlank { day.generalCall }}",
        )
        location?.let {
            lines += "מיקום: ${it.name}" + if (it.address.isBlank()) "" else " — ${it.address}"
            if (it.parking.isNotBlank()) lines += "חניה: ${it.parking}"
        }
        if (call.note.isNotBlank()) lines += "הערה: ${call.note}"
        lines += ""
        lines += "נא לאשר קבלה 🙏"
        return lines.joinToString("\n")
    }

    /** The whole day sheet, as WhatsApp-ready text. */
    fun daySheet(day: ShootDay, location: Location?, roster: List<RosterEntry>): String {
        val lines = mutableListOf("📋 " + HebDate.long(day.date))
        if (day.title.isNotBlank()) lines += day.title
        lines += ""
        lines += "קריאה כללית: ${day.generalCall}"
        lines += "תחילת צילום: ${day.shootingCall}"
        lines += "סיום משוער: ${day.wrap}"
        location?.let {
            lines += ""
            lines += "📍 ${it.name}" + if (it.address.isBlank()) "" else " — ${it.address}"
            if (it.parking.isNotBlank()) lines += "חניה: ${it.parking}"
        }
        if (roster.isNotEmpty()) {
            lines += ""
            lines += "👥 צוות:"
            roster.forEach { e ->
                val roles = e.roleLabels.joinToString("/")
                lines += "${e.call.time} — ${e.person.name}" + if (roles.isBlank()) "" else " ($roles)"
            }
        }
        if (day.notes.isNotBlank()) {
            lines += ""
            lines += "הערות: ${day.notes}"
        }
        return lines.joinToString("\n")
    }
}
