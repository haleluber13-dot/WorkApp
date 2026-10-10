package com.workapp.phoneguard.net

import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.FirewallPolicy
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.atomic.AtomicLong
import kotlin.concurrent.thread

/**
 * Throughput and connection-setup benchmarks for the engine on the plain JVM, against a real
 * local server and a simulated app TCP stack ([SimTcp]) that acknowledges promptly.
 *
 * Normal test runs use small sizes so they stay quick and still check that every byte arrives
 * intact. For real numbers, raise the sizes with environment variables (or -Dpg.bench.* system
 * properties of the test JVM), for example:
 *
 *     PG_BENCH_DOWN_MB=200 PG_BENCH_UP_MB=100 PG_BENCH_CONNS=200 \
 *       gradle testDebugUnitTest --tests '*EngineBenchmarkTest*'
 *
 * Other settings: PG_BENCH_MTU (tun MTU, default 1500), PG_BENCH_WSCALE (shift the app offers,
 * -1 for none, default 7), PG_BENCH_APP_WINDOW_KB (app receive window, default 2048 when scaling,
 * else 64), PG_BENCH_LOOKUP_MS / PG_BENCH_PROTECT_MS (simulated slow system calls), PG_BENCH_LOSS
 * (per-mille of engine data segments the app loses), PG_BENCH_DELAY_US (round trip between engine
 * and app, like a busy phone), PG_BENCH_EVERYONE (1: nothing blocked, so connections start while
 * the owner is looked up; 0: look up first). Results go to the test's standard output.
 */
class EngineBenchmarkTest {
    private object Cfg {
        fun int(name: String, def: Int): Int =
            (System.getProperty("pg.bench.$name") ?: System.getenv("PG_BENCH_" + name.uppercase()))?.toIntOrNull() ?: def

        val downMb = int("down_mb", 8)
        val upMb = int("up_mb", 4)
        val conns = int("conns", 40)
        val mtu = int("mtu", 1500)
        val wscale = int("wscale", 7)
        val appWindow = int("app_window_kb", if (wscale >= 0) 2048 else 64) * 1024
        val lookupMs = int("lookup_ms", 0)
        val protectMs = int("protect_ms", 0)
        val lossPerMille = int("loss", 0)
        val delayUs = int("delay_us", 0)
        val everyone = int("everyone", 1) == 1
    }

    /** Thread CPU time and allocations, through the JDK's management beans (not in android.jar). */
    private object Meter {
        private val bean: Any? = try {
            Class.forName("java.lang.management.ManagementFactory").getMethod("getThreadMXBean").invoke(null)
        } catch (_: Throwable) {
            null
        }
        private val cpu = try {
            Class.forName("java.lang.management.ThreadMXBean").getMethod("getThreadCpuTime", Long::class.javaPrimitiveType)
        } catch (_: Throwable) {
            null
        }
        private val alloc = try {
            Class.forName("com.sun.management.ThreadMXBean").getMethod("getThreadAllocatedBytes", Long::class.javaPrimitiveType)
        } catch (_: Throwable) {
            null
        }

        class Sample(val cpuNs: Long, val allocBytes: Long)

        /** Totals over the engine's threads (their names start with "pg-"). */
        fun engine(): Sample {
            var c = 0L
            var a = 0L
            for (t in Thread.getAllStackTraces().keys) {
                if (!t.name.startsWith("pg-")) continue
                try {
                    c += (cpu?.invoke(bean, t.id) as? Long ?: 0L).coerceAtLeast(0)
                    a += (alloc?.invoke(bean, t.id) as? Long ?: 0L).coerceAtLeast(0)
                } catch (_: Throwable) {
                }
            }
            return Sample(c, a)
        }
    }

    private val loop4: ByteArray = InetAddress.getByName("127.0.0.1").address
    private val tun = BenchTun(Cfg.mtu + 128)
    private val toClose = ConcurrentLinkedQueue<AutoCloseable>()
    private var engine: Engine? = null
    private var host: SimHost? = null
    private var nextPort = 20000
    private val events = AtomicLong()

    private val listener = object : EngineListener {
        override fun onConnection(event: ConnEvent) {
            events.incrementAndGet()
        }

        override fun onBytes(uid: Int, sent: Long, received: Long) {}
    }

    private fun start(): Engine {
        val resolver = UidResolver { _, _, _ ->
            if (Cfg.lookupMs > 0) Thread.sleep(Cfg.lookupMs.toLong())
            10123
        }
        val protector = object : Protector {
            override fun protect(socket: Socket): Boolean {
                if (Cfg.protectMs > 0) Thread.sleep(Cfg.protectMs.toLong())
                return true
            }

            override fun protect(socket: DatagramSocket) = true
        }
        val policy = object : FirewallPolicy {
            override fun isAllowed(uid: Int) = true
            override fun allowsEveryone() = Cfg.everyone
        }
        val e = Engine(tun, protector, resolver, policy, null, listener, EngineConfig(mtu = Cfg.mtu))
        e.start()
        engine = e
        host = SimHost(tun, Cfg.delayUs * 1000L).also { toClose += it }
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

    private fun server(handler: (Socket) -> Unit): ServerSocket {
        val ss = ServerSocket(0, 200, InetAddress.getByName("127.0.0.1"))
        toClose += ss
        thread(isDaemon = true, name = "bench-server") {
            try {
                while (true) {
                    val s = ss.accept()
                    thread(isDaemon = true, name = "bench-conn") {
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

    private fun writePattern(s: Socket, total: Long) {
        val o = s.getOutputStream()
        var pos = 0L
        while (pos < total) {
            val n = minOf(65536L, total - pos).toInt()
            o.write(Pattern.bytes, Pattern.at(pos), n)
            pos += n
        }
        o.flush()
    }

    private fun conn(port: Int, upload: Long = 0, close: Boolean = false, scale: Int = Cfg.wscale) = SimTcp(
        tun, nextPort++, loop4, port, mss = Cfg.mtu - 40, offerScale = scale, rcvBuf = Cfg.appWindow,
        upload = upload, closeWhenDone = close, lossRate = Cfg.lossPerMille / 1000.0,
    )

    private fun waitFor(what: String, timeoutMs: Long, c: SimTcp?, cond: () -> Boolean) {
        val end = System.currentTimeMillis() + timeoutMs
        while (!cond()) {
            c?.error?.let { throw AssertionError("$what: $it") }
            if (System.currentTimeMillis() > end) throw AssertionError("timed out waiting for $what")
            Thread.sleep(1)
        }
    }

    private fun report(name: String, bytes: Long, ns: Long, before: Meter.Sample, after: Meter.Sample, extra: String = "") {
        val mb = bytes / 1e6
        val secs = ns / 1e9
        val cpuMs = (after.cpuNs - before.cpuNs) / 1e6
        val allocKb = (after.allocBytes - before.allocBytes) / 1024.0
        println(
            "BENCH %-9s %7.1f MB in %6.2f s = %7.1f MB/s | engine CPU %6.1f ms/MB | engine alloc %7.1f KB/MB | mtu %d wscale %d delay %d us loss %d/1000 %s".format(
                name, mb, secs, mb / secs, cpuMs / mb, allocKb / mb, Cfg.mtu, Cfg.wscale, Cfg.delayUs, Cfg.lossPerMille, extra,
            )
        )
    }

    @Test(timeout = 600_000)
    fun downloadThroughput() {
        val total = Cfg.downMb * 1_000_000L
        val ss = server { s -> writePattern(s, total) }
        start()
        val c = conn(ss.localPort)
        host!!.add(c)
        waitFor("handshake", 10_000, c) { c.synAckAt != 0L }
        val t0 = System.nanoTime()
        val m0 = Meter.engine()
        waitFor("download (${c.rcvd} of $total)", 590_000, c) { c.rcvd >= total }
        val ns = System.nanoTime() - t0
        val m1 = Meter.engine()
        assertNull(c.error)
        assertEquals(total, c.rcvd)
        report("download", total, ns, m0, m1, "| ${tun.written.get()} packets, largest segment ${c.maxSegment}, engine scale ${c.engineScale}")
        waitFor("engine FIN", 10_000, c) { c.finRcvd }
    }

    @Test(timeout = 600_000)
    fun uploadThroughput() {
        val total = Cfg.upMb * 1_000_000L
        val got = AtomicLong()
        val bad = AtomicLong(-1)
        val ss = server { s ->
            val i = s.getInputStream()
            val b = ByteArray(65536)
            var pos = 0L
            while (pos < total) {
                val n = i.read(b)
                if (n < 0) break
                if (bad.get() < 0 && !Pattern.matches(pos, b, 0, n)) bad.set(pos)
                pos += n
                got.set(pos)
            }
        }
        start()
        val c = conn(ss.localPort, upload = total)
        host!!.add(c)
        waitFor("handshake", 10_000, c) { c.synAckAt != 0L }
        val t0 = System.nanoTime()
        val m0 = Meter.engine()
        waitFor("upload (${got.get()} of $total)", 590_000, c) { got.get() >= total }
        val ns = System.nanoTime() - t0
        val m1 = Meter.engine()
        assertNull(c.error)
        assertEquals("corrupt upload at", -1L, bad.get())
        report("upload", total, ns, m0, m1, "| engine scale ${c.engineScale}")
    }

    /**
     * A download while new connections keep opening (a page loading during a big download). Slow
     * socket setup (protect) must not stall the traffic already flowing.
     */
    @Test(timeout = 600_000)
    fun downloadWhileConnecting() {
        val total = Cfg.downMb * 1_000_000L / 4
        val ss = server { s ->
            val req = s.getInputStream().readNBytes(100)
            if (req.size == 100) writePattern(s, 1000) else writePattern(s, total)
        }
        val big = server { s -> writePattern(s, total) }
        start()
        val c = conn(big.localPort)
        host!!.add(c)
        waitFor("handshake", 10_000, c) { c.synAckAt != 0L }
        val t0 = System.nanoTime()
        var opened = 0
        while (c.rcvd < total) {
            val k = conn(ss.localPort, upload = 100, close = true)
            host!!.add(k)
            waitFor("side connection", 10_000, k) { (k.finAcked && k.rcvd >= 1000) || c.error != null }
            host!!.remove(k)
            opened++
            c.error?.let { throw AssertionError(it) }
        }
        val ns = System.nanoTime() - t0
        println(
            "BENCH busy      %.1f MB in %.2f s = %.1f MB/s while %d connections opened | lookup %d ms protect %d ms".format(
                total / 1e6, ns / 1e9, total / 1e6 / (ns / 1e9), opened, Cfg.lookupMs, Cfg.protectMs,
            )
        )
        assertNull(c.error)
    }

    @Test(timeout = 600_000)
    fun sequentialConnectionSetup() {
        val n = Cfg.conns
        val ss = server { s ->
            val req = s.getInputStream().readNBytes(100)
            if (req.size == 100) writePattern(s, 1000)
        }
        start()
        val setup = LongArray(n)
        val total = LongArray(n)
        val m0 = Meter.engine()
        val t0 = System.nanoTime()
        for (i in 0 until n) {
            val c = conn(ss.localPort, upload = 100, close = true)
            host!!.add(c)
            waitFor("connection $i", 10_000, c) { c.finAcked && c.rcvd >= 1000 }
            assertNull(c.error)
            setup[i] = c.synAckAt - c.synSentAt
            total[i] = System.nanoTime() - c.synSentAt
            host!!.remove(c)
        }
        val ns = System.nanoTime() - t0
        val m1 = Meter.engine()
        setup.sort()
        total.sort()
        fun ms(v: Long) = v / 1e6
        println(
            "BENCH setup     %d connections in %.2f s | SYN->SYN-ACK p50 %.2f ms p95 %.2f ms max %.2f ms | whole exchange p50 %.2f ms p95 %.2f ms | engine CPU %.2f ms/conn | lookup %d ms protect %d ms".format(
                n, ns / 1e9, ms(setup[n / 2]), ms(setup[n * 95 / 100]), ms(setup[n - 1]),
                ms(total[n / 2]), ms(total[n * 95 / 100]), (m1.cpuNs - m0.cpuNs) / 1e6 / n, Cfg.lookupMs, Cfg.protectMs,
            )
        )
        assertTrue(events.get() >= n)
    }
}
