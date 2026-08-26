package com.olakai.app.data.flights

import java.net.URLEncoder

/**
 * Hand-offs to real booking sites. These need no API key and no account, so
 * the "check the real price" path always works even when no fare provider is
 * configured.
 */
object DeepLinks {

    fun googleFlights(from: String, to: String, depart: String, ret: String?): String {
        val q = buildString {
            append("flights from $from to $to on $depart")
            if (ret != null) append(" returning $ret")
        }
        return "https://www.google.com/travel/flights?q=" + URLEncoder.encode(q, "UTF-8")
    }

    /** Skyscanner wants yymmdd path segments. */
    fun skyscanner(from: String, to: String, depart: String, ret: String?): String {
        val d = compact(depart)
        val r = ret?.let { compact(it) }
        return "https://www.skyscanner.net/transport/flights/$from/$to/$d/" +
            (r?.plus("/") ?: "") + "?adultsv2=1&cabinclass=economy"
    }

    fun kiwi(from: String, to: String, depart: String, ret: String?): String =
        "https://www.kiwi.com/en/search/results/$from/$to/$depart" + (ret?.let { "/$it" } ?: "")

    fun kayak(from: String, to: String, depart: String, ret: String?): String =
        "https://www.kayak.com/flights/$from-$to/$depart" + (ret?.let { "/$it" } ?: "") + "?sort=bestflight_a"

    /** yyyy-MM-dd -> yymmdd */
    private fun compact(iso: String): String =
        iso.replace("-", "").let { if (it.length == 8) it.substring(2) else it }
}
