package com.workapp.hafaka.model

/**
 * Derivations over a shoot day. Pure, so the rules that decide who is on a
 * day and when they are called can be tested without a device.
 */
object Roster {

    /**
     * Everyone on a day — from the crew sheets and from the vehicles sheet —
     * with each call time resolved against the day's general call and sorted
     * into arrival waves.
     */
    fun of(day: ShootDay, people: List<Person>): List<RosterEntry> {
        val byId = people.associateBy { it.id }
        val slotsFor = mutableMapOf<String, MutableList<String>>()
        val vehiclesFor = mutableMapOf<String, MutableList<String>>()

        for ((slot, personId) in day.slots) {
            slotsFor.getOrPut(personId) { mutableListOf() }.add(slot)
        }
        for ((vslot, v) in day.vehicles) {
            if (v.driverId.isNotBlank()) {
                vehiclesFor.getOrPut(v.driverId) { mutableListOf() }.add(vslot)
            }
        }

        val ids = slotsFor.keys + vehiclesFor.keys
        val order = Sheets.all.map { it.slot }

        return ids.mapNotNull { id ->
            val person = byId[id] ?: return@mapNotNull null
            val override = day.calls[id]
            val call = CallInfo(
                time = override?.time?.takeIf { it.isNotBlank() } ?: day.generalCall,
                status = override?.status ?: CallStatus.PENDING,
                locationId = override?.locationId?.takeIf { it.isNotBlank() } ?: day.locationId,
                note = override?.note.orEmpty(),
            )
            RosterEntry(
                person = person,
                // Keep the workbook's column order, not map order.
                slots = (slotsFor[id] ?: mutableListOf()).sortedBy { order.indexOf(it) },
                vehicles = (vehiclesFor[id] ?: mutableListOf()).sorted(),
                call = call,
                isOverride = !override?.time.isNullOrBlank(),
            )
        }.sortedWith(compareBy({ it.call.time }, { it.person.name }))
    }

    /** Total heads to feed: crew + actors + extras. */
    fun cateringTotal(day: ShootDay): Int =
        listOf("crew", "actors", "extras").sumOf { day.count(it) ?: 0 }

    /**
     * The next milestone still ahead of us, as an index into
     * [generalCall, shootingCall, wrap], or null when the day is done or
     * isn't today.
     */
    fun activeMark(day: ShootDay, todayIso: String, nowMinutes: Int): Int? {
        if (day.date != todayIso) return null
        val marks = listOf(day.generalCall, day.shootingCall, day.wrap)
        return marks.indexOfFirst { toMinutes(it)?.let { m -> m >= nowMinutes } == true }
            .takeIf { it >= 0 }
    }

    fun toMinutes(time: String): Int? {
        val m = Regex("""^(\d{1,2}):(\d{2})$""").find(time.trim()) ?: return null
        val (h, min) = m.destructured
        return h.toInt() * 60 + min.toInt()
    }
}
