package com.workapp.phoneguard.net

import java.io.IOException
import java.nio.ByteBuffer
import java.nio.channels.ReadableByteChannel
import java.nio.channels.WritableByteChannel

/**
 * Circular byte buffer for one direction of a TCP connection. Reads from and writes to channels
 * go straight into/out of the backing array, so relayed data is copied as little as possible.
 * It can [grow] (keeping its contents) when a busy connection needs more room.
 */
internal class ByteRing(capacity: Int) {
    var capacity = capacity
        private set
    private var array = ByteArray(capacity)
    private var bb: ByteBuffer = ByteBuffer.wrap(array)
    private var head = 0

    var size = 0
        private set
    val free: Int get() = capacity - size

    fun clear() {
        head = 0
        size = 0
    }

    private fun tail(): Int {
        val t = head + size
        return if (t >= capacity) t - capacity else t
    }

    /** Makes the buffer [newCapacity] bytes big, keeping what it holds. */
    fun grow(newCapacity: Int) {
        require(newCapacity >= capacity)
        if (newCapacity == capacity) return
        val a = ByteArray(newCapacity)
        copyOut(0, a, 0, size)
        array = a
        bb = ByteBuffer.wrap(a)
        head = 0
        capacity = newCapacity
    }

    /** Appends len bytes; the caller makes sure they fit. */
    fun write(src: ByteArray, off: Int, len: Int) {
        require(len in 0..free)
        val t = tail()
        val first = minOf(len, capacity - t)
        System.arraycopy(src, off, array, t, first)
        if (len > first) System.arraycopy(src, off + first, array, 0, len - first)
        size += len
    }

    /** Copies len bytes starting [skip] bytes after the oldest byte, without removing them. */
    fun copyOut(skip: Int, dst: ByteArray, dstOff: Int, len: Int) {
        require(skip >= 0 && len >= 0 && skip + len <= size)
        var start = head + skip
        if (start >= capacity) start -= capacity
        val first = minOf(len, capacity - start)
        System.arraycopy(array, start, dst, dstOff, first)
        if (len > first) System.arraycopy(array, 0, dst, dstOff + first, len - first)
    }

    /** Drops the oldest n bytes. */
    fun consume(n: Int) {
        require(n in 0..size)
        size -= n
        head = if (size == 0) 0 else (head + n).let { if (it >= capacity) it - capacity else it }
    }

    /** Fills free space from [ch]. Returns bytes read, or -1 at end of stream when nothing was read. */
    @Throws(IOException::class)
    fun readFrom(ch: ReadableByteChannel): Int {
        var total = 0
        while (size < capacity) {
            val t = tail()
            val room = if (t >= head) capacity - t else head - t
            bb.window(t, t + room)
            val n = ch.read(bb)
            if (n < 0) return if (total > 0) total else -1
            if (n == 0) break
            size += n
            total += n
            if (n < room) break // the socket has nothing more right now
        }
        return total
    }

    /** Writes buffered bytes to [ch] until it would block. Returns bytes written. */
    @Throws(IOException::class)
    fun writeTo(ch: WritableByteChannel): Int {
        var total = 0
        while (size > 0) {
            val run = minOf(size, capacity - head)
            bb.window(head, head + run)
            val n = ch.write(bb)
            if (n <= 0) break
            consume(n)
            total += n
            if (n < run) break
        }
        return total
    }
}
