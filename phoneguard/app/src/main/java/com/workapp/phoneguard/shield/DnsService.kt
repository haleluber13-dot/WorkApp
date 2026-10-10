package com.workapp.phoneguard.shield

import android.content.Context
import com.workapp.phoneguard.core.DnsHandler

// STUB — owned by the Web Shield agent. Keep public signatures; replace bodies.

enum class DnsProvider(val title: String, val description: String, val dohUrl: String?) {
    QUAD9("Quad9 (recommended)", "Encrypted. Also blocks malware sites. Swiss non-profit, no logging of your IP.", "https://dns.quad9.net/dns-query"),
    CLOUDFLARE("Cloudflare Security", "Encrypted. Fast. Also blocks malware sites.", "https://security.cloudflare-dns.com/dns-query"),
    GOOGLE("Google", "Encrypted. No extra blocking.", "https://dns.google/dns-query"),
    NETWORK("Your network's DNS", "Not encrypted: the Wi-Fi or mobile network can see and change your lookups.", null),
}

object DnsSettings {
    fun provider(context: Context): DnsProvider = DnsProvider.QUAD9
    fun setProvider(context: Context, p: DnsProvider) {}
}

/** Live status of the DNS path, for the UI. */
object DnsStatus {
    /** True while lookups are going out encrypted to the chosen provider. */
    @Volatile var encrypted: Boolean = false
    /** Plain-words problem, e.g. "Quad9 unreachable, using network DNS". Null when fine. */
    @Volatile var problem: String? = null
    @Volatile var queries: Long = 0
    @Volatile var blocked: Long = 0
}

/**
 * Answers DNS for all apps: blocks domains on enabled lists (answers 0.0.0.0 / ::),
 * forwards the rest over DNS-over-HTTPS to the chosen provider, falling back to the
 * network's own DNS so the internet keeps working. Records answers in DomainMap and
 * lookups in TrafficStore.
 */
class DnsService(context: Context) : DnsHandler {
    override fun handle(uid: Int, query: ByteArray): ByteArray? = null
    /** Release sockets/threads. */
    fun close() {}
}
