package com.workapp.phoneguard.net

import java.util.TreeMap
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong
import java.util.concurrent.locks.LockSupport
import kotlin.concurrent.thread
import kotlin.random.Random

/** A packet crossing the bench tun, from a pool so the engine's side allocates nothing per write. */
internal class BenchPacket(size: Int) {
    val buf = ByteArray(size)
    var len = 0
    /** When the engine wrote it (System.nanoTime). */
    var time = 0L
}

/**
 * A tun for throughput tests. Packets cross between threads the way they cross the kernel: each
 * write is copied, and the app side (a [SimHost]) works on its own thread.
 */
internal class BenchTun(maxPacket: Int) : TunIo {
    private val count = (48_000_000 / maxPacket).coerceIn(256, 4096)
    val toEngine = LinkedBlockingDeque<ByteArray>()
    val fromEngine = ArrayBlockingQueue<BenchPacket>(count)
    private val pool = ArrayBlockingQueue<BenchPacket>(count)
    val written = AtomicLong()

    init {
        repeat(count) { pool.add(BenchPacket(maxPacket)) }
    }

    override fun read(buf: ByteArray): Int {
        val p = toEngine.pollFirst() ?: return 0
        System.arraycopy(p, 0, buf, 0, p.size)
        return p.size
    }

    override fun await(timeoutMs: Int) {
        val p = toEngine.pollFirst(minOf(timeoutMs, 20).toLong(), TimeUnit.MILLISECONDS) ?: return
        toEngine.putFirst(p)
    }

    override fun wakeup() {}

    override fun write(buf: ByteArray, off: Int, len: Int): Boolean {
        written.incrementAndGet()
        val p = pool.take() // the app side hands every packet back once it is done with it
        System.arraycopy(buf, off, p.buf, 0, len)
        p.len = len
        p.time = System.nanoTime()
        fromEngine.put(p)
        return true
    }

    fun recycle(p: BenchPacket) {
        pool.put(p)
    }
}

/** Random test data with a long period, so every byte that arrives can be checked cheaply. */
internal object Pattern {
    private const val PERIOD = 1_000_003 // prime: a slip by any power of two shows up
    val bytes: ByteArray = ByteArray(PERIOD + 70_000).also {
        Random(42).nextBytes(it)
        System.arraycopy(it, 0, it, PERIOD, 70_000)
    }

    /** Offset in [bytes] of stream position [pos]; at least 70 000 bytes follow it. */
    fun at(pos: Long): Int = (pos % PERIOD).toInt()

    fun matches(pos: Long, b: ByteArray, off: Int, len: Int): Boolean {
        val p = at(pos)
        for (i in 0 until len) if (bytes[p + i] != b[off + i]) return false
        return true
    }
}

/**
 * Plays the app side of many connections on one thread, like the phone's kernel: packets from the
 * engine are handled in batches, and after each batch every connection acknowledges what arrived
 * and sends what its window allows. [delayNs] holds each packet back that long, like a busy phone
 * whose app answers late: the round trip between engine and app.
 */
internal class SimHost(private val tun: BenchTun, private val delayNs: Long = 0) : AutoCloseable {
    private val conns = ConcurrentHashMap<Int, SimTcp>()
    private val tasks = ConcurrentLinkedQueue<Runnable>()
    @Volatile private var running = true
    private val view = PacketView()
    private val worker = thread(name = "sim-app", isDaemon = true) { run() }

    fun add(c: SimTcp) {
        conns[c.srcPort] = c
        tasks.add(Runnable { c.start() })
    }

    fun remove(c: SimTcp) {
        conns.remove(c.srcPort)
    }

    private fun run() {
        while (running) {
            var p = tun.fromEngine.poll(1, TimeUnit.MILLISECONDS)
            while (p != null) {
                if (delayNs > 0) {
                    val wait = p.time + delayNs - System.nanoTime()
                    if (wait > 0) LockSupport.parkNanos(wait)
                }
                if (view.parse(p.buf, p.len) && view.proto == PROTO_TCP) conns[view.dstPort]?.onPacket(view, p.buf)
                tun.recycle(p)
                p = tun.fromEngine.poll()
            }
            while (true) (tasks.poll() ?: break).run()
            val now = System.nanoTime()
            for (c in conns.values) c.pump(now)
        }
    }

    override fun close() {
        running = false
        worker.join(2000)
    }
}

/**
 * A quick app-side TCP endpoint for throughput tests. Unlike [AppTcp] it never waits per packet
 * and keeps out-of-order data like a real stack, so the engine's speed is what gets measured.
 * It still checks what matters: every byte against [Pattern], and that the engine never sends
 * beyond the window we offered. Only touched from the [SimHost] thread (fields read after a
 * connection is done are volatile).
 */
internal class SimTcp(
    private val tun: BenchTun,
    val srcPort: Int,
    private val dst: ByteArray,
    private val dstPort: Int,
    /** MSS we announce. */
    private val mss: Int,
    /** Window scale shift we offer in the SYN, or -1 to offer none. */
    private val offerScale: Int,
    /** The receive window we keep open, in bytes (this app reads at once). */
    private val rcvBuf: Int,
    /** Bytes of [Pattern] to send after the handshake. */
    private val upload: Long = 0,
    /** Send our FIN once [upload] is acknowledged and the engine's FIN arrived. */
    private val closeWhenDone: Boolean = false,
    private val iss: Int = Random.nextInt(),
    /** Every how many full segments an ACK goes out at once (the rest at the end of a batch). */
    private val ackEvery: Int = 2,
    /** Also offer SACK and timestamps in the SYN, like Android does (the engine must not take them). */
    private val fullSynOptions: Boolean = true,
    /** Drops this fraction of the engine's data segments, as if lost on the way. */
    private val lossRate: Double = 0.0,
) {
    private val src = byteArrayOf(10, 215.toByte(), 173.toByte(), 1)
    private val w = PacketWriter()
    private val out = ByteArray(70_000)
    private val rnd = Random(srcPort)

    @Volatile var error: String? = null
    @Volatile var synSentAt = 0L
    @Volatile var synAckAt = 0L
    @Volatile var finRcvd = false
    @Volatile var finAcked = false
    /** In-order bytes received. */
    @Volatile var rcvd = 0L
    /** Our bytes the engine acknowledged. */
    @Volatile var acked = 0L
    @Volatile var engineScale = -1
    @Volatile var engineMss = 0
    @Volatile var segmentsIn = 0L
    @Volatile var maxSegment = 0

    private var established = false
    private var myShift = 0
    private var engShift = 0
    // Receive side.
    private var rcvNxt = 0
    private val ooo = TreeMap<Long, Long>()
    private var unackedSegs = 0
    private var ackPending = false
    private var maxEdge = 0
    // Send side.
    private var sndUna = iss
    private var sent = 0L
    private var engWnd = 0
    private var lastProgress = 0L
    private var finSent = false

    fun start() {
        synSentAt = System.nanoTime()
        sendSyn()
    }

    private fun sendSyn() {
        val ip = 20
        var o = ip + 20
        out[o++] = 2; out[o++] = 4; put16(out, o, mss); o += 2
        if (fullSynOptions) {
            out[o++] = 4; out[o++] = 2 // SACK permitted
            out[o++] = 8; out[o++] = 10; put32(out, o, 12345); put32(out, o + 4, 0); o += 8 // timestamps
        }
        if (offerScale >= 0) {
            out[o++] = 1; out[o++] = 3; out[o++] = 3; out[o++] = offerScale.toByte()
        }
        while ((o - ip) % 4 != 0) out[o++] = 0
        val hl = o - ip
        // Build a plain SYN, then patch in the options and fix the lengths and checksums.
        val opts = out.copyOfRange(ip + 20, o)
        w.tcp(out, false, src, dst, srcPort, dstPort, iss, 0, TCP_SYN, minOf(rcvBuf, 65535), 0, 0)
        System.arraycopy(opts, 0, out, ip + 20, opts.size)
        out[ip + 12] = ((hl / 4) shl 4).toByte()
        put16(out, 2, ip + hl)
        put16(out, 10, 0)
        put16(out, 10, Checksum.of(out, 0, 20))
        put16(out, ip + 16, 0)
        val pseudo = Checksum.add(0, out, 12, 8) + PROTO_TCP + hl
        put16(out, ip + 16, Checksum.finish(Checksum.add(pseudo, out, ip, hl)))
        tun.toEngine.put(out.copyOf(ip + hl))
    }

    private fun send(flags: Int, seq: Int, payloadPos: Long = 0, len: Int = 0) {
        if (len > 0) System.arraycopy(Pattern.bytes, Pattern.at(payloadPos), out, 40, len)
        val wnd = minOf(65535, rcvBuf ushr myShift)
        val edge = rcvNxt + (wnd shl myShift)
        if (seqGt(edge, maxEdge)) maxEdge = edge
        val n = w.tcp(out, false, src, dst, srcPort, dstPort, seq, rcvNxt, flags, wnd, 0, len)
        tun.toEngine.put(out.copyOf(n))
    }

    private fun ack() {
        send(TCP_ACK, sndUna + (sent - acked).toInt() + if (finSent) 1 else 0)
        ackPending = false
        unackedSegs = 0
    }

    fun onPacket(v: PacketView, raw: ByteArray) {
        if (error != null) return
        val f = v.flags
        if (f and TCP_RST != 0) {
            if (!finAcked) error = "reset by the engine (rcvd $rcvd, acked $acked)"
            return
        }
        if (!established) {
            if (f and (TCP_SYN or TCP_ACK) != (TCP_SYN or TCP_ACK)) return
            if (v.ack != iss + 1) {
                error = "SYN-ACK acknowledges ${v.ack}, expected ${iss + 1}"
                return
            }
            synAckAt = System.nanoTime()
            val ws = TestPackets.windowScale(raw, v)
            if (ws >= 0 && offerScale < 0) {
                error = "window scale in the SYN-ACK although we offered none"
                return
            }
            if (TestPackets.hasOption(raw, v, 4) || TestPackets.hasOption(raw, v, 8)) {
                error = "the engine took SACK or timestamps"
                return
            }
            engineScale = ws
            engineMss = v.mss
            if (ws >= 0) {
                engShift = minOf(ws, 14)
                myShift = offerScale
            }
            rcvNxt = v.seq + 1
            maxEdge = rcvNxt
            sndUna = iss + 1
            engWnd = v.window // never scaled in a SYN
            established = true
            lastProgress = System.nanoTime()
            ack()
            return
        }
        if (f and TCP_SYN != 0) return // a repeated SYN-ACK; our ACK goes out with the next one
        if (f and TCP_ACK != 0) {
            val nxt = sndUna + (sent - acked).toInt()
            val adv = v.ack - sndUna
            if (adv > 0 && seqLe(v.ack, nxt + if (finSent) 1 else 0)) {
                var n = adv.toLong()
                if (finSent && v.ack == nxt + 1) {
                    finAcked = true
                    n--
                }
                acked += n
                sndUna = v.ack - if (finAcked) 1 else 0
                lastProgress = System.nanoTime()
            }
            engWnd = v.window shl engShift
        }
        val len = v.payloadLen
        if (len > 0) {
            segmentsIn++
            if (len > maxSegment) maxSegment = len
            if (lossRate > 0 && rnd.nextDouble() < lossRate) return
            if (seqGt(v.seq + len, maxEdge)) {
                error = "the engine sent beyond our window: seq ${v.seq} len $len, right edge $maxEdge"
                return
            }
            val pos = rcvd + (v.seq - rcvNxt)
            if (pos < 0 || !Pattern.matches(pos, raw, v.payloadOff, len)) {
                if (pos >= 0) error = "corrupt data at stream position $pos"
                ack() // old data again: say what we have
                return
            }
            val end = pos + len
            if (pos > rcvd) {
                // A gap: keep it and ask for the missing part with a duplicate ACK.
                val cur = ooo[pos]
                if (cur == null || cur < end) ooo[pos] = end
                ack()
                return
            }
            if (end > rcvd) {
                rcvNxt += (end - rcvd).toInt()
                rcvd = end
                var hadGap = false
                while (true) {
                    val e = ooo.firstEntry() ?: break
                    if (e.key > rcvd) break
                    ooo.pollFirstEntry()
                    hadGap = true
                    if (e.value > rcvd) {
                        rcvNxt += (e.value - rcvd).toInt()
                        rcvd = e.value
                    }
                }
                if (hadGap) {
                    ack()
                } else if (++unackedSegs >= ackEvery || f and TCP_PSH != 0) {
                    ack()
                } else {
                    ackPending = true
                }
            } else {
                ack() // all of it arrived before
            }
        }
        if (f and TCP_FIN != 0 && v.seq + len == rcvNxt && !finRcvd) {
            rcvNxt += 1
            finRcvd = true
            ack()
        }
    }

    /** End of a batch: flush the delayed ACK, send what the engine's window allows, resend after a stall. */
    fun pump(now: Long) {
        if (!established || error != null) return
        if (ackPending) ack()
        if (upload > 0 && acked < upload && sent > acked && now - lastProgress > 200_000_000L) {
            sent = acked // go back and send again what wasn't acknowledged
            lastProgress = now
        }
        val engMss = if (engineMss > 0) engineMss else 536
        while (sent < upload) {
            val inFlight = (sent - acked).toInt()
            val room = engWnd - inFlight
            val left = upload - sent
            val n = minOf(engMss.toLong(), left, room.toLong()).toInt()
            if (n <= 0 || (n < engMss && n < left)) break
            send(TCP_ACK or if (sent + n == upload) TCP_PSH else 0, sndUna + inFlight, sent, n)
            sent += n
        }
        if (closeWhenDone && !finSent && acked == upload && finRcvd) {
            finSent = true
            send(TCP_FIN or TCP_ACK, sndUna)
        }
    }

    private fun seqLe(a: Int, b: Int) = a - b <= 0
}
