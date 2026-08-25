package com.workapp.hafaka.model

import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** Hebrew date formatting. The week starts on Sunday in Israel. */
object HebDate {

    val weekdays = listOf("ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת")

    private val iso: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")

    fun todayIso(date: LocalDate = LocalDate.now()): String = date.format(iso)

    fun parse(value: String): LocalDate? = runCatching { LocalDate.parse(value, iso) }.getOrNull()

    /** java.time weeks run Monday(1)..Sunday(7); ours run Sunday(0)..Saturday(6). */
    private fun weekdayIndex(d: LocalDate): Int = d.dayOfWeek.value % 7

    fun weekdayName(value: String): String =
        parse(value)?.let { weekdays[weekdayIndex(it)] } ?: ""

    /** "יום שלישי, 25.8.2026" */
    fun long(value: String): String {
        val d = parse(value) ?: return value
        return "יום ${weekdays[weekdayIndex(d)]}, ${d.dayOfMonth}.${d.monthValue}.${d.year}"
    }

    /** "25.8" */
    fun short(value: String): String {
        val d = parse(value) ?: return value
        return "${d.dayOfMonth}.${d.monthValue}"
    }
}
