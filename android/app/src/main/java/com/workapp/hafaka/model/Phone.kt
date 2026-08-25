package com.workapp.hafaka.model

/**
 * Israeli phone-number handling.
 *
 * Numbers arrive in every shape a person might type: 050-123-4567,
 * +972 50 1234567, 0501234567. `tel:` tolerates all of them; WhatsApp needs
 * strict E.164. Pure functions so they can be unit-tested off-device.
 */
object Phone {

    private const val IL = "972"

    fun digits(phone: String): String = phone.filter { it.isDigit() || it == '+' }

    /** "0501234567" -> "972501234567" */
    fun e164(phone: String): String {
        val d = digits(phone)
        return when {
            d.isEmpty() -> ""
            d.startsWith("+") -> d.drop(1)
            d.startsWith("00") -> d.drop(2)
            d.startsWith(IL) -> d
            d.startsWith("0") -> IL + d.drop(1)
            else -> d
        }
    }

    /** 050-123-4567 for display. */
    fun pretty(phone: String): String {
        var d = digits(phone)
        if (d.startsWith("+972")) d = "0" + d.drop(4)
        else if (d.startsWith("972")) d = "0" + d.drop(3)
        return when {
            d.length == 10 && d.startsWith("0") -> "${d.take(3)}-${d.drop(3).take(3)}-${d.drop(6)}"
            d.length == 9 && d.startsWith("0")  -> "${d.take(2)}-${d.drop(2).take(3)}-${d.drop(5)}"
            else -> phone
        }
    }

    fun hasPhone(person: Person): Boolean = digits(person.phone).length >= 7
}
