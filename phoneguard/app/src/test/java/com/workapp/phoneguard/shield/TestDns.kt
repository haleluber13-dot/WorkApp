package com.workapp.phoneguard.shield

import java.io.ByteArrayOutputStream

/** Hand-built DNS messages for tests, so the parser is checked against bytes we control. */
object TestDns {
    fun name(n: String): ByteArray {
        val out = ByteArrayOutputStream()
        if (n.isNotEmpty()) for (label in n.split('.')) {
            out.write(label.length)
            out.write(label.toByteArray(Charsets.ISO_8859_1))
        }
        out.write(0)
        return out.toByteArray()
    }

    fun ptr(offset: Int) = byteArrayOf((0xC0 or (offset ushr 8)).toByte(), offset.toByte())

    fun u16(v: Int) = byteArrayOf((v ushr 8).toByte(), v.toByte())
    fun u32(v: Long) = byteArrayOf((v ushr 24).toByte(), (v ushr 16).toByte(), (v ushr 8).toByte(), v.toByte())

    fun cat(vararg parts: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        for (p in parts) out.write(p)
        return out.toByteArray()
    }

    /** OPT pseudo-record advertising a 4096-byte UDP size. */
    val OPT: ByteArray = cat(byteArrayOf(0), u16(Dns.TYPE_OPT), u16(4096), u32(0x00008000), u16(0))

    fun query(id: Int, qname: String, type: Int = Dns.TYPE_A, rd: Boolean = true, edns: Boolean = false, qclass: Int = 1): ByteArray =
        cat(
            u16(id), u16(if (rd) 0x0100 else 0), u16(1), u16(0), u16(0), u16(if (edns) 1 else 0),
            name(qname), u16(type), u16(qclass),
            if (edns) OPT else ByteArray(0),
        )

    fun rr(owner: ByteArray, type: Int, ttl: Long, rdata: ByteArray, rclass: Int = 1): ByteArray =
        cat(owner, u16(type), u16(rclass), u32(ttl), u16(rdata.size), rdata)

    /** Owner pointer to the question name (always at offset 12). */
    val Q = ptr(12)

    fun a(vararg b: Int) = ByteArray(4) { b[it].toByte() }

    fun response(
        id: Int,
        qname: String,
        qtype: Int,
        answers: List<ByteArray> = emptyList(),
        authority: List<ByteArray> = emptyList(),
        additional: List<ByteArray> = emptyList(),
        rcode: Int = 0,
        flags: Int = 0x8180,
    ): ByteArray = cat(
        u16(id), u16(flags or rcode), u16(1), u16(answers.size), u16(authority.size), u16(additional.size),
        name(qname), u16(qtype), u16(1),
        *answers.toTypedArray(), *authority.toTypedArray(), *additional.toTypedArray(),
    )

    fun soa(owner: ByteArray, ttl: Long, minimum: Long): ByteArray {
        val rdata = cat(name("ns.example.com"), name("admin.example.com"), u32(1), u32(7200), u32(3600), u32(1209600), u32(minimum))
        return rr(owner, Dns.TYPE_SOA, ttl, rdata)
    }
}
