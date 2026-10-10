package com.workapp.phoneguard.net

import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.DnsHandler
import com.workapp.phoneguard.core.FirewallPolicy
import com.workapp.phoneguard.core.Kind
import com.workapp.phoneguard.net.TestPackets.Seg
import com.workapp.phoneguard.net.TestPackets.assertChecksumsValid
import com.workapp.phoneguard.net.TestPackets.hex
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.CountDownLatch
import java.util.concurrent.LinkedBlockingDeque
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import kotlin.concurrent.thread
import kotlin.random.Random

/** An in-memory tun: the test plays the apps' side. */
class FakeTun : TunIo {
    val toEngine = LinkedBlockingDeque<ByteArray>()
    val fromEngine = LinkedBlockingQueue<ByteArray>()

    override fun read(buf: ByteArray): Int {
        val p = toEngine.pollFirst() ?: return 0
        val n = minOf(p.size, buf.size) // like the kernel: too-big packets get cut
        System.arraycopy(p, 0, buf, 0, n)
        return n
    }

    override fun await(timeoutMs: Int) {
        val p = toEngine.pollFirst(minOf(timeoutMs, 20).toLong(), TimeUnit.MILLISECONDS) ?: return
        toEngine.putFirst(p)
    }

    override fun wakeup() {}

    override fun write(buf: ByteArray, off: Int, len: Int): Boolean {
        fromEngine.put(buf.copyOfRange(off, off + len))
        return true
    }
}

/**
 * A tiny TCP stack for the app's side of one connection, strict about what the engine sends.
 * Reads the engine's packets from [inbox] (all of the tun's output unless a test demultiplexes).
 */
class AppTcp(
    private val tun: FakeTun,
    private val v6: Boolean,
    private val src: ByteArray,
    val srcPort: Int,
    private val dst: ByteArray,
    private val dstPort: Int,
    private val inbox: LinkedBlockingQueue<ByteArray> = tun.fromEngine,
) {
    private val w = PacketWriter()
    private val out = ByteArray(70_000)
    var sndNxt = Random.nextInt()
    var rcvNxt = 0
    var engUna = 0
    /** The engine's window in bytes (its window field scaled by [engShift]). */
    var engWnd = 0
    /** The window we advertise, in bytes. */
    var window = 65535
    /** The ACK number we sent last. */
    var lastAck = 0
    /** The right edge of the window we advertised last. */
    var lastEdge = 0
    var finReceived = false
    /** Smallest and largest window the engine advertised to us, in bytes. */
    var minEngWnd = Int.MAX_VALUE
    var maxEngWnd = 0
    /** Window scaling as negotiated: the engine's shift (for its windows) and ours. */
    var engShift = 0
    var myShift = 0
    /** The right edges the engine advertised (ack + scaled window), in order. */
    val engEdges = ArrayList<Int>()

    fun send(
        flags: Int, data: ByteArray = ByteArray(0), off: Int = 0, len: Int = data.size - off,
        seq: Int = sndNxt, ack: Int = rcvNxt, win: Int = window, mss: Int = 0, wscale: Int = -1,
    ) {
        val po = PacketWriter.ipHeaderLen(v6) + 20 + (if (mss > 0) 4 else 0) + (if (wscale >= 0) 4 else 0)
        System.arraycopy(data, off, out, po, len)
        // A SYN's window is never scaled; later ones are, by our shift.
        val field = if (flags and TCP_SYN != 0) minOf(win, 65535) else minOf(win ushr myShift, 65535)
        val n = w.tcp(out, v6, src, dst, srcPort, dstPort, seq, ack, flags, field, mss, len, wscale)
        if (flags and TCP_ACK != 0) {
            lastAck = ack
            lastEdge = ack + (field shl myShift)
        }
        tun.toEngine.put(out.copyOf(n))
    }

    /** Next packet of this connection (others are skipped), checksums verified. */
    fun next(timeoutMs: Long = 5000): Seg? {
        val end = System.currentTimeMillis() + timeoutMs
        while (true) {
            val left = end - System.currentTimeMillis()
            if (left <= 0) return null
            val raw = inbox.poll(left, TimeUnit.MILLISECONDS) ?: return null
            assertChecksumsValid(raw)
            val s = Seg(raw)
            if (s.proto == PROTO_TCP && s.srcPort == dstPort && s.dstPort == srcPort) return s
        }
    }

    fun expect(what: String, timeoutMs: Long = 5000, pred: (Seg) -> Boolean): Seg {
        val end = System.currentTimeMillis() + timeoutMs
        while (true) {
            val s = next(end - System.currentTimeMillis()) ?: die("timed out waiting for $what")
            if (pred(s)) return s
        }
    }

    /** Connects; [wscale] >= 0 offers window scaling with that shift (RFC 7323). */
    fun connect(win: Int = 65535, wscale: Int = -1, synWin: Int = win): Seg {
        window = win
        send(TCP_SYN, ack = 0, win = synWin, mss = 1460, wscale = wscale)
        val sa = expect("SYN-ACK") { it.has(TCP_SYN) || it.has(TCP_RST) }
        assertEquals("SYN-ACK flags in $sa", TCP_SYN or TCP_ACK, sa.flags)
        assertEquals(sndNxt + 1, sa.ack)
        if (wscale < 0) assertEquals("window scale offered back although we offered none", -1, sa.wscale)
        if (sa.wscale >= 0) {
            engShift = minOf(sa.wscale, 14)
            myShift = minOf(wscale, 14) // the engine counts shifts above 14 as 14 (RFC 7323)
        }
        finishHandshake(sa)
        return sa
    }

    /** Acknowledges the engine's SYN-ACK [sa] to our SYN (sent earlier, sequence [sndNxt]). */
    fun finishHandshake(sa: Seg) {
        sndNxt += 1
        rcvNxt = sa.seq + 1
        engUna = sa.ack
        engWnd = sa.window // never scaled in a SYN-ACK
        send(TCP_ACK)
    }

    /** Set when received data still needs an ACK (see [flushAck]). */
    private var needAck = false

    /**
     * Handles one packet: track the engine's ACK/window, take in-order data and FIN, and
     * acknowledge now or (with [ackNow] false) later in [flushAck]. Data must fit inside the
     * window we last advertised: callers that check a whole burst must not ACK in the middle of
     * it, or the right edge would move before the engine could have seen it.
     */
    fun handle(s: Seg, rx: ByteArrayOutputStream, ackNow: Boolean = true) {
        assertFalse("unexpected reset: $s", s.has(TCP_RST))
        if (s.has(TCP_ACK) && !seqLt(s.ack, engUna)) {
            engUna = s.ack
            engWnd = s.window shl engShift
            if (engWnd < minEngWnd) minEngWnd = engWnd
            if (engWnd > maxEngWnd) maxEngWnd = engWnd
            engEdges += s.ack + engWnd
        }
        if (s.payload.isNotEmpty()) {
            assertFalse(
                "engine overran our window: $s (right edge $lastEdge)",
                seqGt(s.seq + s.payload.size, lastEdge),
            )
            if (s.seq == rcvNxt) {
                rx.write(s.payload)
                rcvNxt += s.payload.size
            }
        }
        if (s.has(TCP_FIN) && s.seq + s.payload.size == rcvNxt && !finReceived) {
            rcvNxt += 1
            finReceived = true
        }
        if (s.payload.isNotEmpty() || s.has(TCP_FIN)) {
            if (ackNow) send(TCP_ACK) else needAck = true
        }
    }

    fun flushAck() {
        if (needAck) {
            needAck = false
            send(TCP_ACK)
        }
    }

    /** Takes whatever else the engine already sent (the rest of a burst) without acknowledging. */
    private fun drainBurst(rx: ByteArrayOutputStream) {
        while (true) handle(next(3) ?: return, rx, ackNow = false)
    }

    fun receive(n: Int, timeoutMs: Long = 10_000): ByteArray {
        val rx = ByteArrayOutputStream()
        val end = System.currentTimeMillis() + timeoutMs
        while (rx.size() < n) {
            val s = next(end - System.currentTimeMillis()) ?: die("timed out after ${rx.size()} of $n bytes")
            handle(s, rx, ackNow = false)
            drainBurst(rx)
            flushAck()
        }
        return rx.toByteArray()
    }

    fun sendData(text: String) {
        val b = text.toByteArray()
        send(TCP_ACK or TCP_PSH, b)
        sndNxt += b.size
    }

    /**
     * Sends [upload] and receives [downloadLen] bytes at the same time, resending if the engine
     * drops data. Sends at most [burst] segments before looking at what came back.
     */
    fun exchange(upload: ByteArray, downloadLen: Int, timeoutMs: Long = 90_000, burst: Int = 16): ByteArray {
        val rx = ByteArrayOutputStream()
        val base = sndNxt
        val end = System.currentTimeMillis() + timeoutMs
        var lastProgress = System.currentTimeMillis()
        while (rx.size() < downloadLen || seqLt(engUna, base + upload.size)) {
            check(System.currentTimeMillis() < end) {
                "transfer stuck: received ${rx.size()}/$downloadLen, acked ${engUna - base}/${upload.size}, engine window $engWnd"
            }
            var left = burst
            while (left-- > 0) {
                val off = sndNxt - base
                if (off >= upload.size) break
                val room = engUna + engWnd - sndNxt
                if (room <= 0) break
                val n = minOf(1400, upload.size - off, room)
                // Repeat the last ACK number: our window only moves when a whole burst is acknowledged.
                send(TCP_ACK or TCP_PSH, upload, off, n, ack = lastAck)
                sndNxt += n
            }
            val s = next(20)
            if (s == null) {
                if (seqLt(engUna, sndNxt) && System.currentTimeMillis() - lastProgress > 500) {
                    sndNxt = engUna // go back and resend what wasn't acknowledged
                    lastProgress = System.currentTimeMillis()
                }
                continue
            }
            val before = engUna
            handle(s, rx, ackNow = false)
            drainBurst(rx)
            flushAck()
            if (seqGt(engUna, before)) lastProgress = System.currentTimeMillis()
            if (seqLt(sndNxt, engUna)) sndNxt = engUna
        }
        return rx.toByteArray()
    }

    /** Sends our FIN and waits until it is acknowledged and the engine's FIN arrived. Returns data received meanwhile. */
    fun closeFromApp(timeoutMs: Long = 10_000): ByteArray {
        send(TCP_FIN or TCP_ACK)
        sndNxt += 1
        val rx = ByteArrayOutputStream()
        val end = System.currentTimeMillis() + timeoutMs
        while (seqLt(engUna, sndNxt) || !finReceived) {
            val s = next(end - System.currentTimeMillis())
                ?: die("close timed out: our FIN acked=${!seqLt(engUna, sndNxt)}, engine FIN=$finReceived")
            handle(s, rx)
        }
        return rx.toByteArray()
    }
}

class EngineTest {
    private val loop4: ByteArray = InetAddress.getByName("127.0.0.1").address
    private val app4: ByteArray = InetAddress.getByName("10.215.173.1").address
    private val dns4: ByteArray = InetAddress.getByName("10.215.173.53").address
    private val app6: ByteArray = InetAddress.getByName("fd00:2bd:5a7::1").address

    private val tun = FakeTun()
    private val events = ConcurrentLinkedQueue<ConnEvent>()
    private val bytes = HashMap<Int, LongArray>()
    private val blocked: MutableSet<Int> = ConcurrentHashMap.newKeySet()
    private val dnsCalls = ConcurrentLinkedQueue<Pair<Int, ByteArray>>()
    private val toClose = ConcurrentLinkedQueue<AutoCloseable>()
    @Volatile private var uid = 10123
    @Volatile private var died: Throwable? = null
    private var engine: Engine? = null
    private var nextPort = 30000 + Random.nextInt(20000)

    /** When set, connection events block on it: a way to hang the engine's loop thread. */
    @Volatile private var hold: CountDownLatch? = null

    private val listener = object : EngineListener {
        override fun onConnection(event: ConnEvent) {
            events.add(event)
            hold?.await(10, TimeUnit.SECONDS)
        }

        override fun onBytes(uid: Int, sent: Long, received: Long) {
            synchronized(bytes) {
                val a = bytes.getOrPut(uid) { LongArray(2) }
                a[0] += sent
                a[1] += received
            }
        }

        override fun onDied(error: Throwable) {
            died = error
        }
    }

    /** What the policy says to "is nothing blocked at all?" (lets connections start before the lookup). */
    @Volatile private var everyone = false

    private val policy = object : FirewallPolicy {
        // Like the service: an unknown owner (-1) may connect only while no app is blocked.
        override fun isAllowed(uid: Int) = if (uid < 0) blocked.isEmpty() else uid !in blocked
        override fun allowsEveryone() = everyone
    }

    /** Answers for the next owner lookups, in order; once used up, [uid]. */
    private val answers = ConcurrentLinkedQueue<Int>()
    private val lookupCount = AtomicInteger()

    private val dnsHandler = object : DnsHandler {
        override fun handle(uid: Int, query: ByteArray): ByteArray {
            dnsCalls.add(uid to query)
            return query.copyOf().also {
                it[2] = 0x81.toByte()
                it[3] = 0x80.toByte()
            }
        }
    }

    /** If set, relay TCP sockets get this send buffer (protect() runs before connect, like on the phone). */
    @Volatile private var relaySendBuffer = 0

    /** Runs inside every protect() call (on the phone that is a slow call into the system). */
    @Volatile private var protectHook: (() -> Unit)? = null

    private val protector = object : Protector {
        override fun protect(socket: Socket): Boolean {
            protectHook?.invoke()
            if (relaySendBuffer > 0) socket.sendBufferSize = relaySendBuffer
            return true
        }

        override fun protect(socket: DatagramSocket): Boolean {
            protectHook?.invoke()
            return true
        }
    }

    // A DNS query for example.com, type A.
    private val query = hex("12340100000100000000000007" + "6578616d706c65" + "03" + "636f6d" + "00" + "00010001")

    /** When set, owner lookups wait on it: a slow system. */
    @Volatile private var slowLookup: CountDownLatch? = null

    private fun start(
        config: EngineConfig = EngineConfig(rtoMs = 200, rtoMaxMs = 800, lingerMs = 200),
        io: TunIo = tun,
        setup: (Engine) -> Unit = {},
    ): Engine {
        val resolver = UidResolver { _, _, _ ->
            slowLookup?.await(10, TimeUnit.SECONDS)
            lookupCount.incrementAndGet()
            answers.poll() ?: uid
        }
        val e = Engine(io, protector, resolver, policy, dnsHandler, listener, config)
        setup(e)
        e.start()
        engine = e
        return e
    }

    @After
    fun tearDown() {
        engine?.stop()
        for (c in toClose) {
            try {
                c.close()
            } catch (_: Exception) {
            }
        }
    }

    private fun pattern(n: Int) = ByteArray(n) { ((it * 31) xor (it ushr 9)).toByte() }

    private fun server(handler: (Socket) -> Unit): ServerSocket {
        val ss = ServerSocket(0, 50, InetAddress.getByName("127.0.0.1"))
        toClose += ss
        thread(isDaemon = true) {
            try {
                while (true) {
                    val s = ss.accept()
                    toClose += s
                    thread(isDaemon = true) {
                        try {
                            s.use(handler)
                        } catch (_: Exception) {
                        }
                    }
                }
            } catch (_: Exception) {
            }
        }
        return ss
    }

    private fun echo(s: Socket) {
        val i = s.getInputStream()
        val o = s.getOutputStream()
        val b = ByteArray(32768)
        while (true) {
            val n = i.read(b)
            if (n < 0) break
            o.write(b, 0, n)
        }
    }

    private fun udpEchoServer(addr: InetAddress = InetAddress.getByName("127.0.0.1")): DatagramSocket {
        val ds = DatagramSocket(0, addr)
        toClose += ds
        thread(isDaemon = true) {
            val buf = ByteArray(65535)
            try {
                while (true) {
                    val p = DatagramPacket(buf, buf.size)
                    ds.receive(p)
                    ds.send(DatagramPacket(p.data, p.offset, p.length, p.socketAddress))
                }
            } catch (_: Exception) {
            }
        }
        return ds
    }

    private fun app(dstPort: Int, dst: ByteArray = loop4) = AppTcp(tun, false, app4, nextPort++, dst, dstPort)

    private fun sendUdp(src: ByteArray, srcPort: Int, dst: ByteArray, dstPort: Int, payload: ByteArray, v6: Boolean = false) {
        val out = ByteArray(70_000)
        System.arraycopy(payload, 0, out, PacketWriter.udpPayloadOffset(v6), payload.size)
        val n = PacketWriter().udp(out, v6, src, dst, srcPort, dstPort, payload.size)
        tun.toEngine.put(out.copyOf(n))
    }

    private fun nextUdp(timeoutMs: Long = 5000): Seg? {
        val end = System.currentTimeMillis() + timeoutMs
        while (true) {
            val left = end - System.currentTimeMillis()
            if (left <= 0) return null
            val raw = tun.fromEngine.poll(left, TimeUnit.MILLISECONDS) ?: return null
            assertChecksumsValid(raw)
            val s = Seg(raw)
            if (s.proto == PROTO_UDP) return s
        }
    }

    private fun waitUntil(what: String, timeoutMs: Long = 5000, cond: () -> Boolean) {
        val end = System.currentTimeMillis() + timeoutMs
        while (!cond()) {
            if (System.currentTimeMillis() > end) fail("timed out waiting for $what")
            Thread.sleep(10)
        }
    }

    // ------------------------------------------------------------------ TCP

    @Test(timeout = 20_000)
    fun handshakeThenRequestAndEchoedResponse() {
        val ss = server(::echo)
        start()
        val a = app(ss.localPort)
        val sa = a.connect()
        // SYN-ACK: MSS only (no window scale, SACK or timestamps), MSS fits the MTU.
        assertEquals(24, sa.tcpHeaderLen)
        assertEquals(1460, sa.mss)
        assertTrue(sa.window in 1..65535)

        val request = "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n"
        a.sendData(request)
        assertEquals(request, String(a.receive(request.length)))

        waitUntil("connection event") { events.isNotEmpty() }
        val ev = events.single()
        assertEquals(uid, ev.uid)
        assertEquals(Kind.TCP, ev.kind)
        assertEquals("127.0.0.1", ev.host)
        assertEquals(ss.localPort, ev.port)
        assertFalse(ev.blocked)
        assertNull(ev.reason)
        assertEquals(1, engine!!.tcpFlows)
    }

    @Test(timeout = 120_000)
    fun largeTransferBothWaysRespectsSmallAppWindow() {
        val total = 1_500_000
        val upload = pattern(total)
        val ss = server(::echo)
        start()
        val a = app(ss.localPort)
        a.connect(win = 3000) // smaller than three segments: the engine must keep stopping and resuming
        val down = a.exchange(upload, total)
        assertArrayEquals(upload, down)

        // Clean close: our FIN reaches the server as end-of-stream; its close comes back as a FIN.
        a.closeFromApp()
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
        engine!!.stop()
        synchronized(bytes) {
            val b = bytes[uid] ?: die("no byte counts")
            assertEquals("bytes sent", total.toLong(), b[0])
            assertEquals("bytes received", total.toLong(), b[1])
        }
        assertEquals(1, events.size)
    }

    @Test(timeout = 120_000)
    fun manyConnectionsAtOnceStaySeparate() {
        val ss = server(::echo)
        val ds = udpEchoServer()
        start()
        // 20 apps each open 4 connections one after another, so buffers get reused while other
        // transfers are running: data must never cross from one connection into another.
        val ports = List(20) { List(4) { nextPort++ } }
        val inboxes = ports.flatten().associateWith { LinkedBlockingQueue<ByteArray>() }
        val udpInbox = LinkedBlockingQueue<ByteArray>()
        // One reader hands each connection its own packets.
        val demux = thread(isDaemon = true) {
            try {
                while (true) {
                    val raw = tun.fromEngine.take()
                    val s = Seg(raw)
                    if (s.proto == PROTO_UDP) udpInbox.put(raw) else inboxes[s.dstPort]?.put(raw)
                }
            } catch (_: InterruptedException) {
            }
        }
        val failures = ConcurrentLinkedQueue<Throwable>()
        val workers = ports.mapIndexed { i, mine ->
            thread {
                try {
                    for (port in mine) {
                        val a = AppTcp(tun, false, app4, port, loop4, ss.localPort, inboxes.getValue(port))
                        a.connect(win = if ((i + port) % 3 == 0) 4000 else 65535)
                        val data = Random.nextBytes(5_000 + Random.nextInt(120_000))
                        assertArrayEquals("connection on port $port", data, a.exchange(data, data.size, timeoutMs = 60_000))
                        a.closeFromApp()
                    }
                } catch (t: Throwable) {
                    failures.add(t)
                }
            }
        }
        repeat(20) { k -> sendUdp(app4, 41000 + k, loop4, ds.localPort, "u$k".toByteArray()) }
        val udpSeen = HashSet<String>()
        val udpEnd = System.currentTimeMillis() + 10_000
        while (udpSeen.size < 20 && System.currentTimeMillis() < udpEnd) {
            val s = Seg(udpInbox.poll(100, TimeUnit.MILLISECONDS) ?: continue)
            assertEquals("u${s.dstPort - 41000}", String(s.payload))
            udpSeen += String(s.payload)
        }
        workers.forEach { it.join(90_000) }
        demux.interrupt()
        failures.firstOrNull()?.let { throw it }
        assertEquals(20, udpSeen.size)
        waitUntil("all connections closed", 10_000) { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 60_000)
    fun windowSmallerThanOneSegment() {
        val total = 200_000
        val data = pattern(total)
        val ss = server { s ->
            s.getOutputStream().write(data)
            s.getOutputStream().flush()
            Thread.sleep(5_000)
        }
        start()
        val a = app(ss.localPort)
        a.connect(win = 1000)
        assertArrayEquals(data, a.receive(total, 50_000))
    }

    @Test(timeout = 60_000)
    fun uploadToSlowServerClosesOurWindowThenReopensIt() {
        val total = 1_000_000
        val data = pattern(total)
        val ss = ServerSocket()
        ss.receiveBufferSize = 8192 // small, so the engine's socket fills up quickly
        ss.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
        toClose += ss
        thread(isDaemon = true) {
            try {
                ss.accept().use { s ->
                    Thread.sleep(1000) // not reading yet: the engine must stop taking data from the app
                    val got = s.getInputStream().readNBytes(total)
                    s.getOutputStream().write((if (got.contentEquals(data)) "ok" else "bad").toByteArray())
                }
            } catch (_: Exception) {
            }
        }
        relaySendBuffer = 8192 // and no big kernel buffer on the engine's side either
        start()
        val a = app(ss.localPort)
        a.connect()
        // The app (our test client) never probes, so this only finishes if the engine announces
        // on its own that its window opened again.
        val answer = a.exchange(data, 2, timeoutMs = 20_000)
        assertEquals("ok", String(answer))
        assertTrue("the engine's window should have closed (min ${a.minEngWnd})", a.minEngWnd < 1460)
    }

    @Test(timeout = 30_000)
    fun zeroWindowStopsDataAndIsProbed() {
        val total = 200_000
        val data = pattern(total)
        val ss = server { s ->
            s.getOutputStream().write(data)
            s.getOutputStream().flush()
            Thread.sleep(15_000)
        }
        start(EngineConfig(rtoMs = 100, rtoMaxMs = 400, lingerMs = 200))
        val a = app(ss.localPort)
        a.connect()
        val start = a.rcvNxt
        val rx = ByteArrayOutputStream()
        // Like an app that stopped reading: each ACK shrinks the window so the right edge stays put.
        while (a.rcvNxt - start < 65535) {
            val s = a.next(5000) ?: die("only got ${a.rcvNxt - start} bytes")
            if (s.payload.isEmpty()) continue
            assertFalse("beyond our window: $s", seqGt(s.seq + s.payload.size, start + 65535))
            if (s.seq == a.rcvNxt) {
                rx.write(s.payload)
                a.rcvNxt += s.payload.size
            }
            a.window = 65535 - (a.rcvNxt - start)
            a.send(TCP_ACK)
        }
        assertEquals(0, a.window)

        // Window closed: no data may come, only probes asking for our window.
        var probes = 0
        val until = System.currentTimeMillis() + 1500
        while (System.currentTimeMillis() < until) {
            val s = a.next(until - System.currentTimeMillis()) ?: break
            assertEquals("data sent into a closed window: $s", 0, s.payload.size)
            if (s.seq == a.rcvNxt - 1) {
                probes++
                a.send(TCP_ACK)
            }
        }
        assertTrue("expected window probes, got $probes", probes >= 2)

        a.window = 65535
        a.send(TCP_ACK) // window update: the rest must arrive intact
        rx.write(a.receive(total - rx.size()))
        assertArrayEquals(data, rx.toByteArray())
    }

    @Test(timeout = 20_000)
    fun appRetransmissionIsAcknowledgedButNotSentTwice() {
        val ss = server(::echo)
        start()
        val a = app(ss.localPort)
        a.connect()
        val seq = a.sndNxt
        a.sendData("hello")
        a.expect("ACK of hello") { it.has(TCP_ACK) && it.ack == seq + 5 }
        // The same segment again, as if our first copy was lost.
        a.send(TCP_ACK or TCP_PSH, "hello".toByteArray(), seq = seq)
        a.expect("duplicate re-acknowledged") { it.has(TCP_ACK) && it.ack == seq + 5 && it.payload.isEmpty() }
        a.sendData(" world")
        val rx = ByteArrayOutputStream()
        val end = System.currentTimeMillis() + 5000
        while (rx.size() < 11 && System.currentTimeMillis() < end) a.next(500)?.let { a.handle(it, rx) }
        assertEquals("hello world", rx.toString())
        // Nothing more may follow: the server saw "hello" once.
        val extra = ByteArrayOutputStream()
        val quiet = System.currentTimeMillis() + 500
        while (System.currentTimeMillis() < quiet) a.next(100)?.let { a.handle(it, extra) }
        assertEquals(0, extra.size())
    }

    @Test(timeout = 20_000)
    fun outOfOrderSegmentIsDroppedWithDuplicateAck() {
        val ss = server(::echo)
        start()
        val a = app(ss.localPort)
        a.connect()
        val seq = a.sndNxt
        a.send(TCP_ACK or TCP_PSH, " world".toByteArray(), seq = seq + 5) // arrives before "hello"
        a.expect("duplicate ACK") { it.has(TCP_ACK) && it.ack == seq && it.payload.isEmpty() }
        a.sendData("hello")
        a.expect("ACK of hello") { it.has(TCP_ACK) && it.ack == seq + 5 }
        a.sendData(" world")
        assertEquals("hello world", String(a.receive(11)))
    }

    @Test(timeout = 20_000)
    fun appClosesFirstServerAnswersThenCloses() {
        // Like HTTP/1.0: request, half-close, then the server sends its answer and closes.
        val ss = server { s ->
            val req = s.getInputStream().readBytes() // until our FIN
            s.getOutputStream().write("got ${req.size} bytes".toByteArray())
        }
        start()
        val a = app(ss.localPort)
        a.connect()
        a.sendData("0123456789")
        val answer = a.closeFromApp()
        assertEquals("got 10 bytes", String(answer))
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun serverClosesFirst() {
        val ss = server { s -> s.getOutputStream().write("bye".toByteArray()) }
        start()
        val a = app(ss.localPort)
        a.connect()
        val rx = ByteArrayOutputStream()
        while (!a.finReceived) a.handle(a.next() ?: die("no FIN from the engine"), rx)
        assertEquals("bye", rx.toString())
        a.send(TCP_FIN or TCP_ACK)
        a.sndNxt += 1
        a.expect("ACK of our FIN") { it.has(TCP_ACK) && it.ack == a.sndNxt }
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun blockedAppGetsResetAndIsLogged() {
        val accepted = CountDownLatch(1)
        val ss = server { accepted.countDown() }
        blocked += uid
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        val rst = a.expect("reset") { true }
        assertEquals(TCP_RST or TCP_ACK, rst.flags)
        assertEquals(a.sndNxt + 1, rst.ack)
        waitUntil("event") { events.isNotEmpty() }
        val ev = events.single()
        assertTrue(ev.blocked)
        assertEquals(uid, ev.uid)
        assertEquals(Kind.TCP, ev.kind)
        assertEquals(ss.localPort, ev.port)
        assertEquals("Blocked by firewall", ev.reason)
        assertFalse("a blocked app must not reach the server", accepted.await(300, TimeUnit.MILLISECONDS))
        assertEquals(0, engine!!.tcpFlows)
    }

    @Test(timeout = 20_000)
    fun newlyBlockedAppLosesOpenConnections() {
        val serverSaw = LinkedBlockingQueue<String>()
        val ss = server { s ->
            val i = s.getInputStream()
            val b = ByteArray(100)
            val n = i.read(b)
            s.getOutputStream().write(b, 0, n)
            try {
                serverSaw.add(if (i.read() < 0) "eof" else "data")
            } catch (e: IOException) {
                serverSaw.add("reset")
            }
        }
        start()
        val a = app(ss.localPort)
        a.connect()
        a.sendData("hi")
        assertEquals("hi", String(a.receive(2)))

        blocked += uid
        engine!!.onPolicyChanged()
        val rst = a.expect("reset after blocking") { it.has(TCP_RST) }
        assertEquals("reset at exactly the byte the app expects next", a.rcvNxt, rst.seq)
        assertEquals("reset", serverSaw.poll(5, TimeUnit.SECONDS))
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 30_000)
    fun retransmitsUnacknowledgedDataThenGivesUp() {
        val second = CountDownLatch(1)
        val serverSaw = LinkedBlockingQueue<String>()
        val ss = server { s ->
            s.getOutputStream().write("hello".toByteArray())
            second.await(10, TimeUnit.SECONDS)
            s.getOutputStream().write("again".toByteArray())
            try {
                serverSaw.add(if (s.getInputStream().read() < 0) "eof" else "data")
            } catch (e: IOException) {
                serverSaw.add("reset")
            }
        }
        start(EngineConfig(rtoMs = 100, rtoMaxMs = 400, maxRetries = 3, lingerMs = 200))
        val a = app(ss.localPort)
        a.connect()
        val first = a.expect("data") { it.payload.isNotEmpty() }
        assertEquals("hello", String(first.payload))
        val again = a.expect("retransmission") { it.payload.isNotEmpty() }
        assertEquals(first.seq, again.seq)
        assertEquals("hello", String(again.payload))

        a.rcvNxt = first.seq + 5
        a.send(TCP_ACK)
        val quiet = System.currentTimeMillis() + 700
        while (System.currentTimeMillis() < quiet) {
            val s = a.next(100) ?: continue
            assertTrue("no retransmission after the ACK: $s", s.payload.isEmpty())
        }

        second.countDown()
        val d = a.expect("second data") { it.payload.isNotEmpty() }
        assertEquals("again", String(d.payload))
        // Never acknowledged: a few retries, then both sides are reset.
        val rst = a.expect("reset", 10_000) { it.has(TCP_RST) }
        assertEquals(d.seq + 5, rst.seq)
        assertEquals("reset", serverSaw.poll(5, TimeUnit.SECONDS))
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun serverResetIsPassedOn() {
        val ss = server { s ->
            s.getOutputStream().write("partial".toByteArray())
            s.getOutputStream().flush()
            Thread.sleep(200)
            s.setSoLinger(true, 0) // close with a reset
        }
        start()
        val a = app(ss.localPort)
        a.connect()
        assertEquals("partial", String(a.receive(7)))
        val rst = a.expect("reset passed on") { it.has(TCP_RST) }
        assertEquals(a.rcvNxt, rst.seq)
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun slowOwnerLookupGivesUpInsteadOfHanging() {
        val ss = server(::echo)
        val latch = CountDownLatch(1)
        slowLookup = latch
        start(EngineConfig(resolveTimeoutMs = 300))
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        val rst = a.expect("reset after the lookup took too long") { true }
        assertEquals(TCP_RST or TCP_ACK, rst.flags)
        assertEquals(a.sndNxt + 1, rst.ack)
        latch.countDown() // the late answer must be ignored
        Thread.sleep(200)
        assertEquals(0, engine!!.tcpFlows)
        assertTrue("no connection was let through", events.isEmpty())
    }

    @Test(timeout = 20_000)
    fun refusedConnectionGetsReset() {
        val port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
        start()
        val a = app(port)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        val rst = a.expect("reset") { true }
        assertEquals(TCP_RST or TCP_ACK, rst.flags)
        assertEquals(a.sndNxt + 1, rst.ack)
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun packetOfUnknownConnectionGetsReset() {
        start()
        val a = app(9)
        a.send(TCP_ACK or TCP_PSH, "late".toByteArray(), seq = 1000, ack = 5000)
        val rst = a.expect("reset") { true }
        assertEquals(TCP_RST, rst.flags)
        assertEquals(5000, rst.seq)
        assertEquals(0, engine!!.tcpFlows)
    }

    @Test(timeout = 20_000)
    fun tcpToVirtualDnsIsRefused() {
        start()
        val a = app(53, dst = dns4)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        val rst = a.expect("reset") { true }
        assertEquals(TCP_RST or TCP_ACK, rst.flags)
        assertEquals(a.sndNxt + 1, rst.ack)
        assertTrue(events.isEmpty())
    }

    @Test(timeout = 20_000)
    fun stoppingResetsOpenConnections() {
        val ss = server(::echo)
        val e = start()
        val a = app(ss.localPort)
        a.connect()
        e.stop()
        val rst = a.expect("reset on stop") { it.has(TCP_RST) }
        assertEquals(a.rcvNxt, rst.seq)
        assertNull("stop() is not a failure", died)
        assertFalse(e.died)
    }

    @Test(timeout = 20_000)
    fun idleConnectionIsClosed() {
        val ss = server(::echo)
        start(EngineConfig(idleTimeoutMs = 300, lingerMs = 100))
        val a = app(ss.localPort)
        a.connect()
        a.expect("reset after idle time") { it.has(TCP_RST) }
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun hungLoopIsReportedAsStuck() {
        val ss = server(::echo)
        val e = start()
        assertFalse("an idle engine is not stuck", e.isStuck(0))
        val latch = CountDownLatch(1)
        hold = latch
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460) // its connection event hangs the loop
        waitUntil("loop to hang") { events.isNotEmpty() }
        a.send(TCP_ACK, seq = a.sndNxt + 1, ack = 1) // work that now waits
        waitUntil("stuck to be noticed") { e.isStuck(300) }
        latch.countDown()
        waitUntil("loop to recover") { !e.isStuck(300) }
        assertFalse(e.died)
    }

    @Test(timeout = 20_000)
    fun tunFailureStopsEngineAndReports() {
        val broken = object : TunIo {
            override fun read(buf: ByteArray): Int = throw IOException("interface gone")
            override fun await(timeoutMs: Int) {}
            override fun wakeup() {}
            override fun write(buf: ByteArray, off: Int, len: Int) = true
        }
        val e = start(io = broken)
        waitUntil("engine to report its death") { died != null }
        assertTrue(e.died)
    }

    // ------------------------------------------------------------------ UDP and DNS

    @Test(timeout = 20_000)
    fun udpEchoRoundTrip() {
        val ds = udpEchoServer()
        start()
        for (payload in listOf("ping".toByteArray(), ByteArray(1472) { it.toByte() }, "x".toByteArray())) {
            sendUdp(app4, 40001, loop4, ds.localPort, payload)
            val r = nextUdp() ?: die("no UDP reply")
            assertArrayEquals(loop4, r.src)
            assertEquals(ds.localPort, r.srcPort)
            assertArrayEquals(app4, r.dst)
            assertEquals(40001, r.dstPort)
            assertArrayEquals(payload, r.payload)
        }
        waitUntil("event") { events.isNotEmpty() }
        val ev = events.single()
        assertEquals(Kind.UDP, ev.kind)
        assertEquals(uid, ev.uid)
        assertFalse(ev.blocked)
        assertEquals(1, engine!!.udpFlows)
    }

    @Test(timeout = 20_000)
    fun blockedUdpIsDroppedAndLoggedOnce() {
        val ds = udpEchoServer()
        blocked += uid
        start()
        repeat(3) { sendUdp(app4, 40003, loop4, ds.localPort, "leak".toByteArray()) }
        assertNull(nextUdp(500))
        waitUntil("event") { events.isNotEmpty() }
        Thread.sleep(200)
        assertEquals(1, events.size)
        assertTrue(events.single().blocked)
        // Unblocked later: the next packet is let through.
        blocked.clear()
        engine!!.onPolicyChanged()
        Thread.sleep(100)
        sendUdp(app4, 40003, loop4, ds.localPort, "ok".toByteArray())
        assertEquals("ok", String((nextUdp() ?: die("no reply after unblocking")).payload))
    }

    @Test(timeout = 20_000)
    fun dnsToVirtualServerGoesToHandler() {
        start()
        sendUdp(app4, 33333, dns4, 53, query)
        val r = nextUdp() ?: die("no DNS answer")
        assertArrayEquals(dns4, r.src)
        assertEquals(53, r.srcPort)
        assertArrayEquals(app4, r.dst)
        assertEquals(33333, r.dstPort)
        assertEquals(0x81, r.payload[2].toInt() and 0xFF)
        val (callUid, callQuery) = dnsCalls.single()
        assertEquals(uid, callUid)
        assertArrayEquals(query, callQuery)
        assertEquals("DNS is not a relayed flow", 0, engine!!.udpFlows)
    }

    @Test(timeout = 20_000)
    fun dnsFromBlockedAppIsRefused() {
        blocked += uid
        start()
        sendUdp(app4, 33334, dns4, 53, query)
        val r = nextUdp() ?: die("no DNS answer")
        assertEquals(0x12, r.payload[0].toInt() and 0xFF)
        assertEquals(0x34, r.payload[1].toInt() and 0xFF)
        assertEquals("REFUSED", 5, r.payload[3].toInt() and 0x0F)
        assertTrue("the handler must not see a blocked app's lookups", dnsCalls.isEmpty())
        waitUntil("event") { events.isNotEmpty() }
        val ev = events.single()
        assertEquals(Kind.DNS, ev.kind)
        assertTrue(ev.blocked)
        assertEquals("example.com", ev.domain)
    }

    @Test(timeout = 20_000)
    fun ipv6TcpAndUdp() {
        // With IPv6 on this machine, use ::1. Without it, send the app's IPv6 packets to the
        // IPv4-mapped address ::ffff:127.0.0.1: the relay socket is IPv4 but every packet the
        // engine parses and builds is still IPv6.
        val lo6 = InetAddress.getByName("::1")
        var ss: ServerSocket? = try {
            ServerSocket(0, 50, lo6)
        } catch (e: Exception) {
            null
        }
        val serverAddr: InetAddress
        val dst: ByteArray
        if (ss != null) {
            serverAddr = lo6
            dst = lo6.address
        } else {
            serverAddr = InetAddress.getByName("127.0.0.1")
            ss = ServerSocket(0, 50, serverAddr)
            dst = ByteArray(16).also {
                it[10] = 0xFF.toByte()
                it[11] = 0xFF.toByte()
                it[12] = 127
                it[15] = 1
            }
        }
        toClose += ss
        thread(isDaemon = true) {
            try {
                ss.accept().use { echo(it) }
            } catch (_: Exception) {
            }
        }
        start()
        val a = AppTcp(tun, true, app6, nextPort++, dst, ss.localPort)
        val sa = a.connect()
        assertTrue(sa.v6)
        assertEquals(1440, sa.mss) // 1500 - 40 (IPv6) - 20 (TCP)
        a.sendData("six")
        assertEquals("six", String(a.receive(3)))
        val big = pattern(100_000)
        assertArrayEquals(big, a.exchange(big, big.size))

        val ds = udpEchoServer(serverAddr)
        sendUdp(app6, 40002, dst, ds.localPort, "udp6".toByteArray(), v6 = true)
        val r = nextUdp() ?: die("no UDP reply")
        assertTrue(r.v6)
        assertArrayEquals(dst, r.src)
        assertArrayEquals(app6, r.dst)
        assertEquals("udp6", String(r.payload))
    }

    // ------------------------------------------------------------------ owners that can't be found

    /** A UDP socket that records what it gets (text and sender) and can echo it back. */
    private class UdpPeer(addr: InetAddress, echo: Boolean) : AutoCloseable {
        val socket = DatagramSocket(0, addr)
        val got = LinkedBlockingQueue<Pair<String, InetSocketAddress>>()
        val port: Int get() = socket.localPort

        init {
            thread(isDaemon = true) {
                val buf = ByteArray(65535)
                try {
                    while (true) {
                        val p = DatagramPacket(buf, buf.size)
                        socket.receive(p)
                        got.add(String(p.data, p.offset, p.length) to (p.socketAddress as InetSocketAddress))
                        if (echo) socket.send(DatagramPacket(p.data, p.offset, p.length, p.socketAddress))
                    }
                } catch (_: Exception) {
                }
            }
        }

        fun sendTo(to: InetSocketAddress, text: String) {
            val b = text.toByteArray()
            socket.send(DatagramPacket(b, b.size, to))
        }

        override fun close() = socket.close()
    }

    private fun udpPeer(echo: Boolean, addr: InetAddress = InetAddress.getByName("127.0.0.1")) =
        UdpPeer(addr, echo).also { toClose += it }

    @Test(timeout = 20_000)
    fun udpUnknownOwnerIsNeverRelayedWhileAnAppIsBlocked() {
        // The way around the firewall: send, close the socket before the owner lookup (so the
        // owner comes back unknown), then keep using the same port from a new socket.
        val peer = udpPeer(echo = true)
        blocked += uid
        answers += -1
        start(EngineConfig(unknownRetryMs = 50))
        sendUdp(app4, 40100, loop4, peer.port, "first".toByteArray())
        assertNull("an unknown owner must not be relayed", nextUdp(400))
        sendUdp(app4, 40100, loop4, peer.port, "second".toByteArray())
        assertNull("the port's real owner is blocked", nextUdp(400))
        assertTrue("the next datagram must be looked up again", lookupCount.get() >= 2)
        // A rule change must not open it up either.
        engine!!.onPolicyChanged()
        Thread.sleep(100)
        sendUdp(app4, 40100, loop4, peer.port, "third".toByteArray())
        assertNull(nextUdp(400))
        assertTrue("nothing may reach the server: ${peer.got}", peer.got.isEmpty())
        waitUntil("events") { events.any { it.uid == uid } }
        assertTrue("every event is a block: $events", events.all { it.blocked })
        assertTrue("the unknown owner is logged as blocked: $events", events.any { it.uid == -1 })
    }

    @Test(timeout = 20_000)
    fun udpUnknownOwnerIsAskedAgainOnTheNextDatagram() {
        // A lookup that failed once while the app's socket is still open: only that datagram is lost.
        val ds = udpEchoServer()
        blocked += 999 // some other app is blocked, so unknown owners are blocked too
        answers += -1
        start(EngineConfig(unknownRetryMs = 50))
        sendUdp(app4, 40101, loop4, ds.localPort, "lost".toByteArray())
        assertNull(nextUdp(300))
        sendUdp(app4, 40101, loop4, ds.localPort, "ok".toByteArray())
        assertEquals("ok", String((nextUdp() ?: die("no reply once the owner was found")).payload))
        assertNull("the unknown owner's datagram was dropped, not sent late", nextUdp(300))
        assertEquals(2, lookupCount.get())
    }

    @Test(timeout = 20_000)
    fun unknownOwnerIsLetThroughOnlyWhileNothingIsBlocked() {
        val ds = udpEchoServer()
        answers += -1
        start()
        sendUdp(app4, 40102, loop4, ds.localPort, "a".toByteArray())
        assertEquals("a", String((nextUdp() ?: die("with nothing blocked, an unknown owner passes")).payload))
        waitUntil("event") { events.isNotEmpty() }
        assertEquals(-1, events.first().uid)
        assertFalse(events.first().blocked)
        // Now an app gets blocked: the unknown owner's flow is closed, the next datagram looked up.
        blocked += 999
        engine!!.onPolicyChanged()
        waitUntil("unknown owner's flow closed") { engine!!.udpFlows == 0 }
        sendUdp(app4, 40102, loop4, ds.localPort, "b".toByteArray())
        assertEquals("b", String((nextUdp() ?: die("no reply for the real, allowed owner")).payload))
        assertEquals(2, lookupCount.get())
    }

    @Test(timeout = 20_000)
    fun tcpUnknownOwnerGetsNoAnswerAndItsNextSynIsLookedUpAgain() {
        val accepted = CountDownLatch(1)
        val ss = server {
            accepted.countDown()
            echo(it)
        }
        blocked += 999
        answers += -1
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        assertNull("no SYN-ACK and no reset for an unknown owner", a.next(500))
        assertFalse("an unknown owner must not reach the server", accepted.await(100, TimeUnit.MILLISECONDS))
        waitUntil("flow forgotten") { engine!!.tcpFlows == 0 }
        // The app is still waiting and sends its SYN again (same sequence number): now it's found.
        a.connect()
        a.sendData("hi")
        assertEquals("hi", String(a.receive(2)))
        assertEquals(2, lookupCount.get())
        assertEquals(listOf(-1 to true, uid to false), events.map { it.uid to it.blocked })
    }

    @Test(timeout = 20_000)
    fun newSocketOnTheSamePortGetsItsOwnLookup() {
        val ss = server(::echo)
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        a.expect("SYN-ACK") { it.has(TCP_SYN) && it.has(TCP_ACK) }
        // Before the handshake ends, another socket (here: of a blocked app) sends a SYN from the
        // same port. It must not take over the connection that was let through for the first one.
        uid = 20000
        blocked += 20000
        val otherIsn = a.sndNxt + 100_000
        a.send(TCP_SYN, seq = otherIsn, ack = 0, mss = 1460)
        val rst = a.expect("an answer to the new SYN") { it.has(TCP_RST) || it.ack == otherIsn + 1 }
        assertEquals("expected a reset, got $rst", TCP_RST or TCP_ACK, rst.flags)
        assertEquals(otherIsn + 1, rst.ack)
        assertEquals(2, lookupCount.get())
        waitUntil("blocked event") { events.any { it.uid == 20000 && it.blocked } }
    }

    @Test(timeout = 20_000)
    fun dnsFromUnknownOwnerIsRefusedWhileAnAppIsBlocked() {
        blocked += 999
        answers += -1
        start()
        sendUdp(app4, 33335, dns4, 53, query)
        val r = nextUdp() ?: die("no DNS answer")
        assertEquals("REFUSED", 5, r.payload[3].toInt() and 0x0F)
        assertTrue("the handler must not see it", dnsCalls.isEmpty())
        // With nothing blocked, an unknown owner's lookup is answered as before.
        blocked.clear()
        answers += -1
        sendUdp(app4, 33336, dns4, 53, query)
        val ok = nextUdp() ?: die("no DNS answer")
        assertEquals(0x81, ok.payload[2].toInt() and 0xFF)
        assertEquals(-1, dnsCalls.single().first)
    }

    @Test(timeout = 20_000)
    fun udpPortTakenOverByAnotherAppStartsOver() {
        val s1 = udpEchoServer()
        val s2 = udpEchoServer()
        start(EngineConfig(ownerCheckMs = 50))
        sendUdp(app4, 40103, loop4, s1.localPort, "mine".toByteArray())
        assertEquals("mine", String((nextUdp() ?: die("no reply")).payload))
        // The app closes its socket and a blocked app binds the same port, talking somewhere new.
        uid = 20000
        blocked += 20000
        Thread.sleep(80) // past the shortest gap between owner checks
        sendUdp(app4, 40103, loop4, s2.localPort, "theirs".toByteArray())
        waitUntil("the old owner's flow to close") { engine!!.udpFlows == 0 }
        nextUdp(200) // the datagram that set off the check may have gone out meanwhile
        sendUdp(app4, 40103, loop4, s2.localPort, "again".toByteArray())
        assertNull("the new owner is blocked", nextUdp(500))
        waitUntil("blocked event") { events.any { it.uid == 20000 && it.blocked } }
    }

    @Test(timeout = 20_000)
    fun udpPortTakenOverAfterAPauseToTheSameDestinationStartsOver() {
        val ds = udpEchoServer()
        start(EngineConfig(ownerCheckMs = 300))
        sendUdp(app4, 40109, loop4, ds.localPort, "mine".toByteArray())
        assertEquals("mine", String((nextUdp() ?: die("no reply")).payload))
        // A while later another socket, of a blocked app, sends from the same port to the same place.
        uid = 20000
        blocked += 20000
        Thread.sleep(400)
        sendUdp(app4, 40109, loop4, ds.localPort, "theirs".toByteArray())
        waitUntil("the old owner's flow to close") { engine!!.udpFlows == 0 }
        nextUdp(200) // the datagram that set off the check may have gone out meanwhile
        sendUdp(app4, 40109, loop4, ds.localPort, "again".toByteArray())
        assertNull("the new owner is blocked", nextUdp(500))
    }

    @Test(timeout = 20_000)
    fun udpFlowLetsGoOnceTheAppSocketIsGone() {
        val peer = udpPeer(echo = true)
        start(EngineConfig(ownerCheckMs = 50))
        sendUdp(app4, 40104, loop4, peer.port, "hello".toByteArray())
        assertEquals("hello", String((nextUdp() ?: die("no reply")).payload))
        val relay = peer.got.take().second
        // The app closed its socket (nobody owns the port now) but the server keeps sending.
        uid = -1
        thread(isDaemon = true) {
            try {
                repeat(100) {
                    peer.sendTo(relay, "still here")
                    Thread.sleep(30)
                }
            } catch (_: Exception) {
            }
        }
        waitUntil("flow closed", 5000) { engine!!.udpFlows == 0 }
    }

    // ------------------------------------------------------------------ UDP mapping and filtering

    @Test(timeout = 20_000)
    fun udpUsesOnePublicPortForEveryDestination() {
        val s1 = udpPeer(echo = true)
        val s2 = udpPeer(echo = true)
        start()
        sendUdp(app4, 40107, loop4, s1.port, "one".toByteArray())
        sendUdp(app4, 40107, loop4, s2.port, "two".toByteArray())
        val seen1 = s1.got.poll(5, TimeUnit.SECONDS) ?: die("first server got nothing")
        val seen2 = s2.got.poll(5, TimeUnit.SECONDS) ?: die("second server got nothing")
        // What a STUN server sees is what a call partner can reach: one port for every destination.
        assertEquals(seen1.second, seen2.second)
        val replies = listOf(nextUdp() ?: die("no reply"), nextUdp() ?: die("no second reply"))
        assertEquals(setOf(s1.port to "one", s2.port to "two"), replies.map { it.srcPort to String(it.payload) }.toSet())
        assertTrue(replies.all { it.dstPort == 40107 && it.src.contentEquals(loop4) })
        assertEquals(1, engine!!.udpFlows)
        waitUntil("events") { events.size >= 2 }
        Thread.sleep(100)
        assertEquals("one line per destination", listOf(s1.port, s2.port).sorted(), events.map { it.port }.sorted())
    }

    @Test(timeout = 20_000)
    fun udpReplyFromAnotherPortOfTheSameAddressReachesTheApp() {
        val first = udpPeer(echo = false)
        val other = udpPeer(echo = false)
        start()
        sendUdp(app4, 40105, loop4, first.port, "where am I?".toByteArray())
        val relay = (first.got.poll(5, TimeUnit.SECONDS) ?: die("server got nothing")).second
        other.sendTo(relay, "from another port")
        val r = nextUdp() ?: die("a reply from another port of the same address was dropped")
        assertArrayEquals(loop4, r.src)
        assertEquals(other.port, r.srcPort)
        assertArrayEquals(app4, r.dst)
        assertEquals(40105, r.dstPort)
        assertEquals("from another port", String(r.payload))
    }

    @Test(timeout = 20_000)
    fun udpFromAnAddressTheAppNeverSentToIsDroppedUntilItDoes() {
        val lo2 = InetAddress.getByName("127.0.0.2")
        val stranger = try {
            udpPeer(echo = false, addr = lo2)
        } catch (e: Exception) {
            null
        }
        assumeTrue("needs 127.0.0.2 on this machine", stranger != null)
        stranger!!
        val first = udpPeer(echo = false)
        start()
        sendUdp(app4, 40106, loop4, first.port, "hi".toByteArray())
        val relay = (first.got.poll(5, TimeUnit.SECONDS) ?: die("server got nothing")).second
        stranger.sendTo(relay, "unasked")
        assertNull("from an address the app never sent to: dropped", nextUdp(400))
        // Once the app sends there (from the same public port), that address may answer.
        sendUdp(app4, 40106, lo2.address, stranger.port, "now asked".toByteArray())
        val seen = stranger.got.poll(5, TimeUnit.SECONDS) ?: die("stranger got nothing")
        assertEquals("now asked", seen.first)
        assertEquals(relay, seen.second)
        stranger.sendTo(relay, "answer")
        val r = nextUdp() ?: die("the answer was dropped")
        assertArrayEquals(lo2.address, r.src)
        assertEquals(stranger.port, r.srcPort)
        assertEquals("answer", String(r.payload))
    }

    @Test(timeout = 20_000)
    fun udpAnswersToABroadcastMayComeFromAnyDevice() {
        val lo2 = InetAddress.getByName("127.0.0.2")
        val device = try {
            udpPeer(echo = false, addr = lo2)
        } catch (e: Exception) {
            null
        }
        assumeTrue("needs 127.0.0.2 on this machine", device != null)
        device!!
        val first = udpPeer(echo = false)
        start()
        sendUdp(app4, 40108, loop4, first.port, "hello".toByteArray())
        val relay = (first.got.poll(5, TimeUnit.SECONDS) ?: die("server got nothing")).second
        // Like a printer or TV finder: ask everyone on the network (to the discard port) ...
        sendUdp(app4, 40108, InetAddress.getByName("255.255.255.255").address, 9, "anyone there?".toByteArray())
        Thread.sleep(100)
        // ... and devices answer from their own addresses, which the app never sent to.
        device.sendTo(relay, "me")
        val r = nextUdp() ?: die("an answer to a broadcast was dropped")
        assertArrayEquals(lo2.address, r.src)
        assertEquals(device.port, r.srcPort)
        assertEquals("me", String(r.payload))
    }

    // ------------------------------------------------------------------ logging and timeouts

    @Test(timeout = 20_000)
    fun blockedRetriesAreLoggedOnceInAWhile() {
        val ss = server { }
        blocked += uid
        start(EngineConfig(rtoMs = 200, rtoMaxMs = 800, lingerMs = 200, blockedLogGapMs = 1_000))
        repeat(5) {
            val a = app(ss.localPort) // a new port each time, like an app retrying with new sockets
            a.send(TCP_SYN, ack = 0, mss = 1460)
            a.expect("reset") { it.has(TCP_RST) }
        }
        assertEquals("one line for the same blocked attempt: $events", 1, events.size)
        Thread.sleep(1_100)
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        a.expect("reset") { it.has(TCP_RST) }
        assertEquals("logged again after a while", 2, events.size)
        assertTrue(events.all { it.blocked && it.uid == uid })
    }

    @Test(timeout = 30_000)
    fun halfClosedConnectionWaitsForASlowServer() {
        // The app ends its request with shutdownOutput; the server takes its time to answer.
        val ss = server { s ->
            val req = s.getInputStream().readBytes() // until the app's FIN
            Thread.sleep(800)
            s.getOutputStream().write("done: ${req.size}".toByteArray())
        }
        start(EngineConfig(rtoMs = 200, rtoMaxMs = 800, lingerMs = 200, closingTimeoutMs = 200, halfClosedTimeoutMs = 5_000))
        val a = app(ss.localPort)
        a.connect()
        a.sendData("job")
        assertEquals("done: 3", String(a.closeFromApp(10_000)))
    }

    @Test(timeout = 20_000)
    fun deadHalfClosedConnectionIsStillCleanedUp() {
        val ss = server { s ->
            s.getInputStream().readBytes()
            Thread.sleep(10_000) // never answers
        }
        start(EngineConfig(rtoMs = 200, rtoMaxMs = 800, lingerMs = 200, halfClosedTimeoutMs = 400))
        val a = app(ss.localPort)
        a.connect()
        a.send(TCP_FIN or TCP_ACK)
        a.sndNxt += 1
        a.expect("reset after the half-closed time", 5_000) { it.has(TCP_RST) }
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
        assertEquals("a server may think for minutes", 10 * 60_000L, EngineConfig().halfClosedTimeoutMs)
    }

    // ------------------------------------------------------------------ window scaling (RFC 7323)

    /** Takes the engine's segments for [ms] without acknowledging any; returns the bytes in flight. */
    private fun inFlight(a: AppTcp, ms: Long): Int {
        var maxEnd = a.rcvNxt
        val end = System.currentTimeMillis() + ms
        while (true) {
            val left = end - System.currentTimeMillis()
            if (left <= 0) break
            val s = a.next(left) ?: break
            assertFalse("unexpected reset: $s", s.has(TCP_RST))
            if (s.payload.isNotEmpty() && seqGt(s.seq + s.payload.size, maxEnd)) maxEnd = s.seq + s.payload.size
        }
        return maxEnd - a.rcvNxt
    }

    /** The engine's right edge may move back only by rounding to its window unit, never by more. */
    private fun assertEdgesNeverRetract(a: AppTcp, unit: Int) {
        var max = a.engEdges.firstOrNull() ?: return
        for (edge in a.engEdges) {
            assertFalse("right edge moved back from $max to $edge", seqLt(edge, max - (unit - 1)))
            if (seqGt(edge, max)) max = edge
        }
    }

    @Test(timeout = 20_000)
    fun windowScaleIsOfferedBackOnlyWhenTheAppOffersIt() {
        val ss = server(::echo)
        val e = start()
        val a = app(ss.localPort)
        val sa = a.connect(win = 1 shl 20, wscale = 7)
        assertEquals("our shift", e.rcvShift, sa.wscale)
        assertTrue("the shift can offer our biggest buffer", (65535L shl e.rcvShift) >= e.maxRecvBuffer)
        assertEquals("MSS and window scale only, no SACK or timestamps", 28, sa.tcpHeaderLen)
        assertEquals(1460, sa.mss)
        assertTrue("a SYN-ACK's window is never scaled", sa.window in 1..65535)
        a.sendData("scaled")
        assertEquals("scaled", String(a.receive(6)))

        // An app that offers no scaling gets none: both windows stay plain 16-bit values.
        val b = app(ss.localPort)
        val sb = b.connect()
        assertEquals(-1, sb.wscale)
        assertEquals(24, sb.tcpHeaderLen)
        b.sendData("plain")
        assertEquals("plain", String(b.receive(5)))
        assertTrue(b.maxEngWnd <= 65535)
    }

    @Test(timeout = 20_000)
    fun windowScalingCanBeTurnedOff() {
        val ss = server(::echo)
        start(EngineConfig(rtoMs = 200, rtoMaxMs = 800, lingerMs = 200, windowScaling = false))
        val a = app(ss.localPort)
        val sa = a.connect(wscale = 7)
        assertEquals(-1, sa.wscale)
        a.sendData("plain")
        assertEquals("plain", String(a.receive(5)))
    }

    @Test(timeout = 60_000)
    fun theAppsWindowIsScaledByItsShift() {
        val data = pattern(200_000)
        val ss = server { s ->
            s.getOutputStream().write(data)
            s.getOutputStream().flush()
            Thread.sleep(10_000)
        }
        start()
        // 15 is out of range: RFC 7323 says to use 14.
        for (shift in listOf(0, 1, 3, 7, 13, 14, 15)) {
            val eff = minOf(shift, 14)
            val field = maxOf(1, 30_000 ushr eff)
            val wnd = field shl eff
            val a = app(ss.localPort)
            val sa = a.connect(win = wnd, wscale = shift, synWin = 65535)
            assertTrue("shift $shift: window scale offered back", sa.wscale >= 0)
            val n = inFlight(a, 400)
            // Whole segments up to the window (a runt waits for the next ACK), never beyond it.
            assertEquals("shift $shift: bytes in flight for a window of $wnd", wnd / 1460 * 1460, n)
            a.send(TCP_RST or TCP_ACK)
        }
    }

    @Test(timeout = 60_000)
    fun scaledTransferSurvivesSequenceWraparound() {
        val total = 1_500_000
        val upload = pattern(total)
        val ss = server(::echo)
        // Both sides start just below 2^32, so both directions wrap early on.
        val e = start(setup = {
            it.random = object : java.util.Random() {
                override fun nextInt() = 0xFFFF_F000.toInt()
            }
        })
        val a = app(ss.localPort)
        a.sndNxt = 0xFFFF_F800.toInt()
        val sa = a.connect(win = 1 shl 20, wscale = 7)
        assertEquals(0xFFFF_F000.toInt(), sa.seq)
        assertArrayEquals(upload, a.exchange(upload, total))
        assertEdgesNeverRetract(a, 1 shl e.rcvShift)
        a.closeFromApp()
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 60_000)
    fun scaledDownloadKeepsMoreThan64KBInFlight() {
        val total = 3_000_000
        val data = pattern(total)
        val ss = server { s ->
            s.getOutputStream().write(data)
            s.getOutputStream().flush()
            Thread.sleep(20_000)
        }
        start()
        val a = app(ss.localPort)
        a.connect(win = 4 shl 20, wscale = 7)
        // The app doesn't acknowledge: the engine fills its window, growing its buffer to do so.
        val n = inFlight(a, 1_000)
        assertTrue("more than 64 KB in flight: $n", n > 512 * 1024)
        assertTrue("no more than the send buffer: $n", n <= EngineConfig().maxSendBuffer)
        // This app dropped everything it got (it keeps nothing out of order). The engine must
        // recover segment by segment and still deliver it all intact.
        assertArrayEquals(data, a.receive(total, 50_000))
    }

    @Test(timeout = 30_000)
    fun buffersStayAtTheBaseSizeWhenTheBudgetIsUsedUp() {
        val ss = server { s ->
            s.getOutputStream().write(pattern(1_000_000))
            s.getOutputStream().flush()
            Thread.sleep(10_000)
        }
        start(EngineConfig(rtoMs = 200, rtoMaxMs = 800, lingerMs = 200, bufferBudget = 0))
        val a = app(ss.localPort)
        a.connect(win = 4 shl 20, wscale = 7)
        val n = inFlight(a, 600)
        assertTrue("no more than one base buffer in flight: $n", n in 60_000..65_536)
    }

    @Test(timeout = 60_000)
    fun scaledUploadWindowGrowsBeyond64KB() {
        val total = 4_000_000
        val data = pattern(total)
        val ss = server { s ->
            val got = s.getInputStream().readNBytes(total)
            s.getOutputStream().write((if (got.contentEquals(data)) "ok" else "bad").toByteArray())
        }
        val e = start()
        val a = app(ss.localPort)
        a.connect(win = 1 shl 20, wscale = 7)
        // Like a busy app: always fill whatever window the engine offers before waiting.
        assertEquals("ok", String(a.exchange(data, 2, burst = 1000)))
        assertTrue("the window grew past 64 KB (max ${a.maxEngWnd})", a.maxEngWnd > 65535)
        assertTrue("within the receive buffer (max ${a.maxEngWnd})", a.maxEngWnd <= e.maxRecvBuffer)
        assertEdgesNeverRetract(a, 1 shl e.rcvShift)
    }

    @Test(timeout = 60_000)
    fun scaledUploadToSlowServerClosesTheWindowThenReopensIt() {
        val total = 1_000_000
        val data = pattern(total)
        val ss = ServerSocket()
        ss.receiveBufferSize = 8192
        ss.bind(InetSocketAddress(InetAddress.getByName("127.0.0.1"), 0))
        toClose += ss
        thread(isDaemon = true) {
            try {
                ss.accept().use { s ->
                    Thread.sleep(1000) // not reading yet: the engine must stop taking data from the app
                    val got = s.getInputStream().readNBytes(total)
                    s.getOutputStream().write((if (got.contentEquals(data)) "ok" else "bad").toByteArray())
                }
            } catch (_: Exception) {
            }
        }
        relaySendBuffer = 8192
        val e = start()
        val a = app(ss.localPort)
        a.connect(win = 1 shl 20, wscale = 7)
        assertEquals("ok", String(a.exchange(data, 2, timeoutMs = 30_000)))
        assertTrue("the engine's window should have closed (min ${a.minEngWnd})", a.minEngWnd < 1460)
        assertEdgesNeverRetract(a, 1 shl e.rcvShift)
    }

    // ------------------------------------------------------------------ setting up connections

    @Test(timeout = 20_000)
    fun withNothingBlockedTheServerIsReachedWhileTheOwnerIsLookedUp() {
        val accepted = CountDownLatch(1)
        val ss = server {
            accepted.countDown()
            echo(it)
        }
        everyone = true
        val latch = CountDownLatch(1)
        slowLookup = latch
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        assertTrue("the server's handshake starts at once", accepted.await(5, TimeUnit.SECONDS))
        assertNull("but the app hears nothing until the owner is known and allowed", a.next(300))
        latch.countDown()
        a.finishHandshake(a.expect("SYN-ACK") { it.has(TCP_SYN) })
        a.sendData("hi")
        assertEquals("hi", String(a.receive(2)))
        assertEquals(1, lookupCount.get())
        waitUntil("event") { events.isNotEmpty() }
        assertEquals(listOf(uid to false), events.map { it.uid to it.blocked })
    }

    @Test(timeout = 20_000)
    fun earlyConnectionIsResetWhenTheOwnerTurnsOutBlocked() {
        // The rules changed between "nothing is blocked" and the answer for this connection.
        val accepted = CountDownLatch(1)
        val serverSaw = LinkedBlockingQueue<String>()
        val ss = server { s ->
            accepted.countDown()
            try {
                serverSaw.add(if (s.getInputStream().read() < 0) "eof" else "data")
            } catch (e: IOException) {
                serverSaw.add("reset")
            }
        }
        everyone = true
        blocked += uid
        val latch = CountDownLatch(1)
        slowLookup = latch
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        assertTrue(accepted.await(5, TimeUnit.SECONDS))
        latch.countDown()
        val rst = a.expect("reset") { true }
        assertEquals(TCP_RST or TCP_ACK, rst.flags)
        assertEquals(a.sndNxt + 1, rst.ack)
        assertEquals("the server's side is reset, nothing was sent", "reset", serverSaw.poll(5, TimeUnit.SECONDS))
        waitUntil("event") { events.isNotEmpty() }
        assertTrue(events.single().blocked)
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun earlyConnectionOfAnUnknownOwnerGetsNoAnswer() {
        val accepted = CountDownLatch(1)
        val serverSaw = LinkedBlockingQueue<String>()
        val ss = server { s ->
            accepted.countDown()
            try {
                serverSaw.add(if (s.getInputStream().read() < 0) "eof" else "data")
            } catch (e: IOException) {
                serverSaw.add("reset")
            }
        }
        everyone = true
        blocked += 999 // the rules changed meanwhile: now unknown owners are blocked
        answers += -1
        val latch = CountDownLatch(1)
        slowLookup = latch
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        assertTrue(accepted.await(5, TimeUnit.SECONDS))
        latch.countDown()
        assertEquals("reset", serverSaw.poll(5, TimeUnit.SECONDS))
        assertNull("no SYN-ACK and no reset for an unknown owner", a.next(300))
        waitUntil("flow forgotten") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun refusedEarlyConnectionIsAnsweredOnlyOnceTheOwnerIsKnown() {
        val port = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1")).use { it.localPort }
        everyone = true
        val latch = CountDownLatch(1)
        slowLookup = latch
        start()
        val a = app(port)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        assertNull("nothing before the owner is known", a.next(400))
        latch.countDown()
        val rst = a.expect("reset") { true }
        assertEquals(TCP_RST or TCP_ACK, rst.flags)
        assertEquals(a.sndNxt + 1, rst.ack)
        waitUntil("connection removed") { engine!!.tcpFlows == 0 }
    }

    @Test(timeout = 20_000)
    fun whileAnAppIsBlockedNothingLeavesBeforeTheFirewallSaysYes() {
        val accepted = CountDownLatch(1)
        val ss = server {
            accepted.countDown()
            echo(it)
        }
        blocked += 999
        val latch = CountDownLatch(1)
        slowLookup = latch
        start()
        val a = app(ss.localPort)
        a.send(TCP_SYN, ack = 0, mss = 1460)
        assertFalse("no connection before the firewall said yes", accepted.await(400, TimeUnit.MILLISECONDS))
        latch.countDown()
        a.finishHandshake(a.expect("SYN-ACK") { it.has(TCP_SYN) })
        a.sendData("ok")
        assertEquals("ok", String(a.receive(2)))
    }

    @Test(timeout = 20_000)
    fun relaySocketsAreProtectedOffTheLoopThread() {
        val ss = server(::echo)
        val ds = udpEchoServer()
        val threads = ConcurrentLinkedQueue<String>()
        protectHook = { threads.add(Thread.currentThread().name) }
        start()
        val a = app(ss.localPort)
        a.connect()
        a.sendData("x")
        assertEquals("x", String(a.receive(1)))
        sendUdp(app4, 40130, loop4, ds.localPort, "u".toByteArray())
        assertEquals("u", String((nextUdp() ?: die("no UDP reply")).payload))
        assertEquals("one TCP and one UDP socket: $threads", 2, threads.size)
        assertTrue("protect() ran on $threads", threads.none { it == "pg-engine" })
    }

    @Test(timeout = 20_000)
    fun slowSocketSetupDoesNotHoldUpOtherTraffic() {
        val ss = server(::echo)
        start()
        val a = app(ss.localPort)
        a.connect()
        // The next connection's protect() takes ages (a busy system).
        val stuck = CountDownLatch(1)
        protectHook = { stuck.await(10, TimeUnit.SECONDS) }
        val b = app(ss.localPort)
        b.send(TCP_SYN, ack = 0, mss = 1460)
        Thread.sleep(100)
        val t0 = System.currentTimeMillis()
        a.sendData("still flowing")
        assertEquals("still flowing", String(a.receive(13)))
        assertTrue("the open connection waited for the other's setup", System.currentTimeMillis() - t0 < 2_000)
        protectHook = null
        stuck.countDown()
        b.expect("SYN-ACK once its socket is ready") { it.has(TCP_SYN) && it.has(TCP_ACK) }
    }

    // ------------------------------------------------------------------ unknown owners on the local network

    @Test(timeout = 20_000)
    fun unknownOwnerMayStillReachTheLocalNetworkButNotTheInternet() {
        // Wake-on-LAN and one-shot discovery: sent, then the socket is closed at once, so the
        // owner comes back unknown. Some app is blocked, so unknown owners are blocked too.
        blocked += 999
        answers += -1
        answers += -1
        start(EngineConfig(unknownRetryMs = 50))
        val bcast = InetAddress.getByName("255.255.255.255").address
        sendUdp(app4, 40140, bcast, 9, "wake up".toByteArray())
        waitUntil("broadcast event") { events.any { it.host == "255.255.255.255" } }
        val ev = events.first { it.host == "255.255.255.255" }
        assertEquals(-1, ev.uid)
        assertFalse("a broadcast can't reach the internet: let through", ev.blocked)
        sendUdp(app4, 40141, loop4, 9, "leak".toByteArray())
        waitUntil("internet event") { events.any { it.host == "127.0.0.1" } }
        assertTrue("an unknown owner can't reach the internet", events.first { it.host == "127.0.0.1" }.blocked)
    }

    @Test(timeout = 20_000)
    fun unknownOwnersBroadcastIsDelivered() {
        val rx = DatagramSocket(0)
        toClose += rx
        rx.soTimeout = 1000
        // Only where this machine hears its own broadcasts.
        val heard = try {
            DatagramSocket().use { probe ->
                probe.broadcast = true
                probe.send(DatagramPacket(byteArrayOf(1), 1, InetSocketAddress("255.255.255.255", rx.localPort)))
            }
            rx.receive(DatagramPacket(ByteArray(10), 10))
            true
        } catch (e: IOException) {
            false
        }
        assumeTrue("needs local delivery of broadcasts", heard)
        blocked += 999
        answers += -1
        start()
        sendUdp(app4, 40142, InetAddress.getByName("255.255.255.255").address, rx.localPort, "magic packet".toByteArray())
        val p = DatagramPacket(ByteArray(100), 100)
        rx.soTimeout = 5000
        rx.receive(p)
        assertEquals("magic packet", String(p.data, 0, p.length))
    }

    @Test(timeout = 20_000)
    fun unknownOwnersDnsToTheRouterStaysBlocked() {
        // A resolver on the router passes questions on: a way to the internet.
        blocked += 999
        answers += -1
        start()
        sendUdp(app4, 40143, InetAddress.getByName("192.168.1.1").address, 53, query)
        waitUntil("event") { events.isNotEmpty() }
        val ev = events.single()
        assertEquals(Kind.DNS, ev.kind)
        assertTrue(ev.blocked)
        assertEquals(-1, ev.uid)
    }
}
