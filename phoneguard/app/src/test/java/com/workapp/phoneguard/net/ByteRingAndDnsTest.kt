package com.workapp.phoneguard.net

import com.workapp.phoneguard.net.TestPackets.hex
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.channels.Channels
import java.nio.channels.ReadableByteChannel
import java.nio.channels.WritableByteChannel

class ByteRingAndDnsTest {

    /** A channel that hands out at most [chunk] bytes per read, like a socket. */
    private class Trickle(private val data: ByteArray, private val chunk: Int) : ReadableByteChannel {
        var pos = 0
        override fun read(dst: ByteBuffer): Int {
            if (pos >= data.size) return -1
            val n = minOf(chunk, dst.remaining(), data.size - pos)
            dst.put(data, pos, n)
            pos += n
            return n
        }
        override fun isOpen() = true
        override fun close() {}
    }

    /** A channel that accepts at most [limit] bytes per write. */
    private class Slow(private val limit: Int) : WritableByteChannel {
        val got = ByteArrayOutputStream()
        override fun write(src: ByteBuffer): Int {
            val n = minOf(limit, src.remaining())
            val b = ByteArray(n)
            src.get(b)
            got.write(b)
            return n
        }
        override fun isOpen() = true
        override fun close() {}
    }

    @Test
    fun ringKeepsOrderAcrossWrapAround() {
        val ring = ByteRing(1000)
        val src = ByteArray(10_000) { (it * 7 + 3).toByte() }
        val out = ByteArrayOutputStream()
        var written = 0
        var step = 1
        while (out.size() < src.size) {
            val n = minOf(ring.free, src.size - written, 1 + (step * 37) % 400)
            ring.write(src, written, n)
            written += n
            val take = minOf(ring.size, 1 + (step * 53) % 333)
            val tmp = ByteArray(take)
            ring.copyOut(0, tmp, 0, take)
            ring.consume(take)
            out.write(tmp)
            step++
        }
        assertArrayEquals(src, out.toByteArray())
    }

    @Test
    fun ringCopyOutWithOffsetAcrossTheEnd() {
        val ring = ByteRing(8)
        ring.write(byteArrayOf(1, 2, 3, 4, 5, 6), 0, 6)
        ring.consume(5)
        ring.write(byteArrayOf(7, 8, 9, 10, 11), 0, 5) // wraps
        val tmp = ByteArray(4)
        ring.copyOut(1, tmp, 0, 4)
        assertArrayEquals(byteArrayOf(7, 8, 9, 10), tmp)
        assertEquals(6, ring.size)
    }

    @Test
    fun ringReadsAndWritesChannels() {
        val data = ByteArray(5000) { (it % 251).toByte() }
        val ring = ByteRing(1024)
        val input = Trickle(data, 100)
        val output = Slow(70)
        var eof = false
        while (!eof || ring.size > 0) {
            if (!eof && ring.free > 0) {
                if (ring.readFrom(input) < 0) eof = true
            }
            ring.writeTo(output)
        }
        assertArrayEquals(data, output.got.toByteArray())
    }

    @Test
    fun ringReadFromReportsEndOfStream() {
        val ring = ByteRing(16)
        assertEquals(3, ring.readFrom(Channels.newChannel(byteArrayOf(1, 2, 3).inputStream())))
        assertEquals(-1, ring.readFrom(Channels.newChannel(ByteArray(0).inputStream())))
    }

    // A query for "Example.COM" type A, with an EDNS OPT record in the additional section.
    private val query = hex(
        "abcd0120000100000000000107" + "4578616d706c65" + "03" + "434f4d" + "00" + "00010001" +
            "0000291000000000000000"
    )

    @Test
    fun questionNameIsLowercase() {
        assertEquals("example.com", DnsBits.questionName(query, 0, query.size))
    }

    @Test
    fun refusedAnswerKeepsIdAndQuestion() {
        val r = DnsBits.refused(query)!!
        val qEnd = 12 + 1 + 7 + 1 + 3 + 1 + 4
        assertEquals(qEnd, r.size) // the OPT record is not echoed
        assertEquals(0xab, r[0].toInt() and 0xFF)
        assertEquals(0xcd, r[1].toInt() and 0xFF)
        assertEquals(0x81, r[2].toInt() and 0xFF) // response, RD kept
        assertEquals(0x85, r[3].toInt() and 0xFF) // RA, REFUSED
        assertEquals(1, u16(r, 4))
        assertEquals(0, u16(r, 6))
        assertEquals(0, u16(r, 10))
        assertArrayEquals(query.copyOfRange(12, qEnd), r.copyOfRange(12, qEnd))
    }

    @Test
    fun badMessagesAreRejected() {
        assertNull(DnsBits.questionName(ByteArray(5), 0, 5))
        assertNull(DnsBits.refused(query.copyOf(20))) // question cut short
        val response = query.copyOf().also { it[2] = 0x81.toByte() }
        assertNull(DnsBits.refused(response))
        val pointer = query.copyOf().also { it[12] = 0xC0.toByte() }
        assertNull(DnsBits.questionName(pointer, 0, pointer.size))
    }
}
