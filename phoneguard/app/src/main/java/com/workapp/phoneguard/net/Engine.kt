package com.workapp.phoneguard.net

import com.workapp.phoneguard.core.ConnEvent
import com.workapp.phoneguard.core.DnsHandler
import com.workapp.phoneguard.core.DomainMap
import com.workapp.phoneguard.core.FirewallPolicy
import com.workapp.phoneguard.core.Kind
import com.workapp.phoneguard.core.TrafficStore
import java.io.IOException
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.nio.channels.CancelledKeyException
import java.nio.channels.Selector
import java.security.SecureRandom
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentLinkedQueue
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ThreadPoolExecutor
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Moves raw IP packets to and from the VPN interface. */
interface TunIo {
    /** Reads one packet without blocking: its length, 0 if none is waiting, -1 if the interface is gone. */
    @Throws(IOException::class)
    fun read(buf: ByteArray): Int

    /** Waits up to [timeoutMs] for a packet to arrive (may return early). */
    @Throws(IOException::class)
    fun await(timeoutMs: Int)

    /** Makes a waiting [await] return now. Called when the engine stops. */
    fun wakeup()

    /** Writes one whole packet. False if the interface is busy right now (try again soon). */
    @Throws(IOException::class)
    fun write(buf: ByteArray, off: Int, len: Int): Boolean
}

/** Keeps the engine's own sockets out of the VPN (VpnService.protect on Android). */
interface Protector {
    fun protect(socket: Socket): Boolean
    fun protect(socket: DatagramSocket): Boolean
}

/** Finds the app (uid) that owns a connection; -1 if unknown. May block briefly. */
fun interface UidResolver {
    fun uidOf(protocol: Int, local: InetSocketAddress, remote: InetSocketAddress): Int
}

/** Where the engine reports what it sees. The defaults feed the shared TrafficStore. */
interface EngineListener {
    /** A new connection was let through or blocked. May be called from any engine thread. */
    fun onConnection(event: ConnEvent) = TrafficStore.onEvent(event)

    /** Bytes relayed for [uid] since the last call (batched about once a second). */
    fun onBytes(uid: Int, sent: Long, received: Long) = TrafficStore.onBytes(uid, sent, received)

    /** The engine stopped by itself because of [error]. Not called after [Engine.stop]. */
    fun onDied(error: Throwable) {}
}

/** Timeouts and limits. The defaults are for the phone; tests shorten them. */
class EngineConfig(
    val mtu: Int = 1500,
    /** The virtual DNS server handed to apps. Only UDP port 53 to it is answered. */
    val dnsServer: InetAddress = InetAddress.getByAddress(byteArrayOf(10, 215.toByte(), 173.toByte(), 53)),
    val connectTimeoutMs: Long = 20_000,
    /** How long the app or the policy check may take before a new flow is given up. */
    val resolveTimeoutMs: Long = 10_000,
    val idleTimeoutMs: Long = 2 * 60 * 60_000L,
    val halfClosedTimeoutMs: Long = 60_000,
    val udpTimeoutMs: Long = 60_000,
    /** UDP to port 53 of other DNS servers: one question, one answer, so close sooner. */
    val dnsUdpTimeoutMs: Long = 15_000,
    val rtoMs: Long = 1_000,
    val rtoMaxMs: Long = 30_000,
    val maxRetries: Int = 8,
    /** Closed connections are remembered this long to re-acknowledge a repeated FIN. */
    val lingerMs: Long = 5_000,
    val maxTcpFlows: Int = 4_000,
    val maxUdpFlows: Int = 2_000,
)

/** Identifies a flow; the app's side is the source. Stored keys are never modified. */
internal class FlowKey {
    var v6 = false
        private set
    val src = ByteArray(16)
    val dst = ByteArray(16)
    var srcPort = 0
        private set
    var dstPort = 0
        private set
    private var hash = 0

    /** Only set on stored keys (see [copy]). */
    lateinit var srcInet: InetAddress
        private set
    lateinit var dstInet: InetAddress
        private set

    val addrLen: Int get() = if (v6) 16 else 4

    fun set(v: PacketView): FlowKey {
        v6 = v.v6
        val n = v.addrLen
        System.arraycopy(v.buf, v.srcOff, src, 0, n)
        System.arraycopy(v.buf, v.dstOff, dst, 0, n)
        srcPort = v.srcPort
        dstPort = v.dstPort
        var h = if (v6) 1 else 0
        h = h * 31 + srcPort
        h = h * 31 + dstPort
        for (i in 0 until n) h = h * 31 + src[i] * 17 + dst[i]
        hash = h
        return this
    }

    fun copy(): FlowKey {
        val k = FlowKey()
        k.v6 = v6
        System.arraycopy(src, 0, k.src, 0, 16)
        System.arraycopy(dst, 0, k.dst, 0, 16)
        k.srcPort = srcPort
        k.dstPort = dstPort
        k.hash = hash
        k.srcInet = InetAddress.getByAddress(src.copyOf(addrLen))
        k.dstInet = InetAddress.getByAddress(dst.copyOf(addrLen))
        return k
    }

    override fun hashCode() = hash

    override fun equals(other: Any?): Boolean {
        if (other !is FlowKey) return false
        if (other.hash != hash || other.v6 != v6 || other.srcPort != srcPort || other.dstPort != dstPort) return false
        for (i in 0 until addrLen) if (src[i] != other.src[i] || dst[i] != other.dst[i]) return false
        return true
    }
}

/** State shared by TCP and UDP flows. Owned by the engine's loop thread. */
internal abstract class Flow(val key: FlowKey, now: Long) {
    var uid = -1
    /** True once the owner is known and the policy has been asked. */
    var resolved = false
    var closed = false
    var lastActive = now
    // Bytes not yet reported to the listener.
    var pendingSent = 0L
    var pendingRecv = 0L

    abstract fun onResolved(uid: Int, allowed: Boolean)
    abstract fun onLookupFailed()
    abstract fun onTimer()
    /** The earliest time [onTimer] has something to do. */
    abstract fun nextDeadline(): Long
    /** Close right away (TCP: reset both sides). */
    abstract fun kill()
}

/** One packet read from the tun, from a pool. */
internal class Packet(size: Int) {
    val buf = ByteArray(size)
    val bb: ByteBuffer = ByteBuffer.wrap(buf)
    var len = 0
}

/**
 * The userspace packet engine for Full protection. Every TCP connection and UDP flow an app
 * opens arrives here as raw packets; the engine asks the firewall policy, then relays allowed
 * flows over real sockets and answers the app with packets it builds itself. DNS to the virtual
 * DNS server goes to the [DnsHandler] (the Web Shield).
 *
 * Threads: a reader thread moves packets from the tun into a queue; one loop thread (a
 * java.nio Selector) owns all flow state and does all tun writes; small pools look up uids and
 * policy, and answer DNS, so slow system calls never hold up traffic.
 *
 * A problem in one flow closes only that flow. If the loop itself fails, the engine closes
 * everything and calls [EngineListener.onDied].
 */
class Engine(
    private val tun: TunIo,
    internal val protector: Protector,
    private val uids: UidResolver,
    private val policy: FirewallPolicy,
    private val dns: DnsHandler?,
    private val listener: EngineListener = object : EngineListener {},
    val config: EngineConfig = EngineConfig(),
    /** Plain-words reason shown for blocked connections. */
    private val blockReason: () -> String = { "Blocked by firewall" },
) {
    private companion object {
        const val INBOUND_MAX = 4096
        const val SPARE_MAX = 1024
        const val MAX_BATCH = 512
        const val OUT_SIZE = 65_600
        const val BACKLOG_MAX = 4096
        const val BACKLOG_RETRY_MS = 5L
        const val MAX_WAIT_MS = 60_000L
        const val BYTES_EVERY_MS = 1_000L
        const val RING_SIZE = 65_536
        const val RING_POOL = 32
        /** Pass as knownUid to look the owner up. */
        const val RESOLVE = Int.MIN_VALUE

        fun clock(): Long = System.nanoTime() / 1_000_000
    }

    internal val selector: Selector = Selector.open()
    private val packetSize = config.mtu.coerceAtLeast(1280) + 128
    private val inbound = ArrayBlockingQueue<Packet>(INBOUND_MAX)
    private val spare = ArrayBlockingQueue<Packet>(SPARE_MAX)
    private val tasks = ConcurrentLinkedQueue<Runnable>()
    private val sleeping = AtomicBoolean(false)
    private val lookups = pool("pg-lookup", 4, 1024)
    private val dnsPool = pool("pg-dns", 16, 512)
    @Volatile private var stopping = false
    /** Set when the loop thread has finished, for whatever reason. */
    @Volatile private var loopDone = false
    @Volatile private var readerError: Throwable? = null
    private var loopThread: Thread? = null
    private var readerThread: Thread? = null

    // Everything below belongs to the loop thread.
    internal var now = clock()
        private set
    internal val writer = PacketWriter()
    internal val out = ByteArray(OUT_SIZE)
    internal val outBuffer: ByteBuffer = ByteBuffer.wrap(out)
    internal val random = SecureRandom()
    private val dnsAddr: ByteArray = config.dnsServer.address
    private val tcp = HashMap<FlowKey, TcpFlow>()
    private val udp = HashMap<FlowKey, UdpFlow>()
    private val probe = FlowKey()
    private val view = PacketView()
    private val backlog = ArrayDeque<ByteArray>()
    private val ackQueue = ArrayList<TcpFlow>()
    private val scratch = ArrayList<Flow>()
    private val rings = ArrayDeque<ByteRing>()
    private val doneBytes = HashMap<Int, LongArray>()
    private var bytesDueAt = 0L
    private var nextTimerAt = Long.MAX_VALUE
    private var tunError: IOException? = null
    internal var policyGen = 0
        private set

    /** Open TCP connections, for the UI. */
    @Volatile var tcpFlows = 0
        private set
    /** Open UDP flows, for the UI. */
    @Volatile var udpFlows = 0
        private set
    val activeFlows: Int get() = tcpFlows + udpFlows
    /** True if the engine stopped by itself because of an error. */
    @Volatile var died = false
        private set
    /** Packets dropped because the engine fell behind (diagnostics). */
    @Volatile var droppedPackets = 0L
        private set
    /** When the loop last started a round; see [isStuck]. */
    @Volatile private var loopBeat = clock()

    /**
     * True if work is waiting but the loop hasn't come round for [maxMs]: it is stuck (a bug),
     * not idle. The service then falls back to basic mode so the phone stays online.
     */
    fun isStuck(maxMs: Long = 10_000): Boolean =
        loopThread != null && !loopDone && !stopping &&
            (!inbound.isEmpty() || !tasks.isEmpty()) && clock() - loopBeat > maxMs

    private fun pool(name: String, threads: Int, queue: Int): ThreadPoolExecutor {
        val n = AtomicInteger()
        return ThreadPoolExecutor(threads, threads, 30, TimeUnit.SECONDS, LinkedBlockingQueue(queue)) { r ->
            Thread(r, "$name-${n.incrementAndGet()}").apply { isDaemon = true }
        }.apply { allowCoreThreadTimeOut(true) }
    }

    fun start() {
        check(loopThread == null) { "already started" }
        loopThread = Thread(::runLoop, "pg-engine").apply {
            isDaemon = true
            priority = Thread.MAX_PRIORITY - 2 // all of the phone's traffic waits on this thread
            start()
        }
        readerThread = Thread(::runReader, "pg-tun").apply {
            isDaemon = true
            priority = Thread.MAX_PRIORITY - 2
            start()
        }
    }

    /** Stops both threads and closes every relayed connection. Blocks up to a few seconds. */
    fun stop() {
        stopping = true
        tun.wakeup()
        wakeSelector()
        val loop = loopThread
        if (loop == null) {
            // Never started: nothing else would release these.
            lookups.shutdownNow()
            dnsPool.shutdownNow()
            try {
                selector.close()
            } catch (_: Throwable) {
            }
            return
        }
        val me = Thread.currentThread()
        if (loop !== me) loop.join(3000)
        readerThread?.let { if (it !== me) it.join(3000) }
    }

    /** Firewall rules or the network changed: re-check every open flow and close the ones now blocked. */
    fun onPolicyChanged() = post { recheckPolicy() }

    private fun post(task: Runnable) {
        tasks.offer(task)
        wake()
    }

    private fun wake() {
        if (sleeping.compareAndSet(true, false)) wakeSelector()
    }

    private fun wakeSelector() {
        try {
            selector.wakeup()
        } catch (_: Throwable) {
            // Already closed: the loop has finished.
        }
    }

    // ------------------------------------------------------------------ reader thread

    private fun runReader() {
        var batch = 0
        try {
            while (!stopping && !loopDone) {
                val p = spare.poll() ?: Packet(packetSize)
                val n = tun.read(p.buf)
                if (n > 0) {
                    p.len = n
                    if (inbound.offer(p)) {
                        // Wake the loop every so often during a burst so it never sits on a full queue.
                        if (++batch >= 64) {
                            wake()
                            batch = 0
                        }
                    } else {
                        droppedPackets++ // TCP resends it; better than growing without bound
                        spare.offer(p)
                    }
                    continue
                }
                spare.offer(p)
                if (n < 0) throw IOException("VPN interface closed")
                if (batch > 0) {
                    wake()
                    batch = 0
                }
                // Long wait: stop() wakes us at once, and an idle phone shouldn't wake every second.
                tun.await(30_000)
            }
        } catch (t: Throwable) {
            if (!stopping) {
                readerError = t
                wakeSelector()
            }
        }
    }

    // ------------------------------------------------------------------ loop thread

    private fun runLoop() {
        var error: Throwable? = null
        try {
            now = clock()
            while (!stopping) {
                loopBeat = now
                readerError?.let { throw IOException("Reading from the VPN interface failed", it) }
                tunError?.let { throw IOException("Writing to the VPN interface failed", it) }
                drainInbound()
                runTasks()
                now = clock()
                if (now >= nextTimerAt) runTimers()
                flushBacklog()
                flushAcks()
                if (stopping) break
                waitForEvents()
                now = clock()
                handleKeys()
                flushAcks()
            }
        } catch (t: Throwable) {
            error = t
        }
        loopDone = true
        tun.wakeup() // the reader stops too
        try {
            shutdown()
        } catch (_: Throwable) {
            // Even if cleanup fails (e.g. out of memory), the service must still hear about it.
        }
        if (error != null && !stopping) {
            died = true
            try {
                listener.onDied(error)
            } catch (_: Throwable) {
            }
        }
    }

    private fun waitForEvents() {
        var timeout = if (nextTimerAt == Long.MAX_VALUE) MAX_WAIT_MS else nextTimerAt - now
        if (backlog.isNotEmpty()) timeout = minOf(timeout, BACKLOG_RETRY_MS)
        sleeping.set(true)
        try {
            // Re-check after announcing we sleep, so a packet queued just now isn't left waiting.
            if (timeout <= 0 || !inbound.isEmpty() || !tasks.isEmpty() || stopping) selector.selectNow()
            else selector.select(minOf(timeout, MAX_WAIT_MS))
        } finally {
            sleeping.set(false)
        }
    }

    private fun drainInbound() {
        var n = 0
        while (n < MAX_BATCH) {
            val p = inbound.poll() ?: break
            try {
                onTunPacket(p)
            } catch (e: Exception) {
                // A packet we couldn't handle outside any flow: drop it.
            }
            spare.offer(p)
            n++
        }
    }

    private fun runTasks() {
        while (true) {
            val t = tasks.poll() ?: break
            try {
                t.run()
            } catch (e: Exception) {
            }
        }
    }

    private fun handleKeys() {
        val keys = selector.selectedKeys()
        if (keys.isEmpty()) return
        val it = keys.iterator()
        while (it.hasNext()) {
            val k = it.next()
            it.remove()
            val f = k.attachment() as? Flow ?: continue
            try {
                if (!k.isValid || f.closed) continue
                val ready = k.readyOps()
                when (f) {
                    is TcpFlow -> f.onReady(ready)
                    is UdpFlow -> f.onReadable()
                }
            } catch (e: CancelledKeyException) {
            } catch (e: Exception) {
                kill(f)
            }
            if (!f.closed) armTimer(f.nextDeadline())
        }
    }

    private fun onTunPacket(p: Packet) {
        val v = view
        if (!v.parse(p.buf, p.len)) return // ICMP, fragments and anything malformed are dropped
        when (v.proto) {
            PROTO_TCP -> onTcp(v, p)
            PROTO_UDP -> onUdp(v, p)
        }
    }

    private fun onTcp(v: PacketView, p: Packet) {
        val key = probe.set(v)
        var f = tcp[key]
        val isSyn = v.flags and (TCP_SYN or TCP_ACK or TCP_RST) == TCP_SYN
        if (f != null && isSyn && f.replacedBy(v.seq)) {
            // The app reuses the port for a new connection; the old one is over.
            kill(f)
            f = null
        }
        if (f == null) {
            if (v.flags and TCP_RST != 0) return
            if (!isSyn) {
                resetUnknown(v)
                return
            }
            if (isDnsServer(v) || !isUnicast(v.buf, v.dstOff, v.v6)) {
                // DNS over TCP/TLS to the virtual server, or no real destination: fail fast.
                sendTcp(probe, 0, v.seq + 1, TCP_RST or TCP_ACK, 0)
                return
            }
            if (tcp.size >= config.maxTcpFlows) evictOldest(tcp.values)
            val nf = TcpFlow(this, key.copy(), now)
            tcp[nf.key] = nf
            tcpFlows = tcp.size
            nf.onSyn(v)
            lookup(nf, RESOLVE)
            armTimer(nf.nextDeadline())
            return
        }
        try {
            f.onPacket(v, p)
        } catch (e: Exception) {
            kill(f)
        }
        if (!f.closed) armTimer(f.nextDeadline())
    }

    /** RST for a packet that belongs to no connection we know, e.g. after a restart, so the app gives up at once. */
    private fun resetUnknown(v: PacketView) {
        if (v.flags and TCP_ACK != 0) {
            sendTcp(probe, v.ack, 0, TCP_RST, 0)
        } else {
            var segLen = v.payloadLen
            if (v.flags and TCP_SYN != 0) segLen++
            if (v.flags and TCP_FIN != 0) segLen++
            sendTcp(probe, 0, v.seq + segLen, TCP_RST or TCP_ACK, 0)
        }
    }

    private fun onUdp(v: PacketView, p: Packet) {
        if (isDnsServer(v)) {
            if (v.dstPort == 53) onDnsQuery(v)
            return
        }
        if (isZero(v.buf, v.dstOff, v.addrLen) || v.dstPort == 0) return
        val key = probe.set(v)
        val existing = udp[key]
        val f: UdpFlow
        if (existing == null) {
            if (udp.size >= config.maxUdpFlows) evictOldest(udp.values)
            f = UdpFlow(this, key.copy(), now, isUnicast(v.buf, v.dstOff, v.v6))
            udp[f.key] = f
            udpFlows = udp.size
            try {
                f.onDatagram(v, p) // queued until the owner is known
            } catch (_: Exception) {
            }
            lookup(f, RESOLVE)
        } else {
            f = existing
            try {
                f.onDatagram(v, p)
            } catch (e: Exception) {
                kill(f)
            }
        }
        if (!f.closed) armTimer(f.nextDeadline())
    }

    private fun onDnsQuery(v: PacketView) {
        val handler = dns ?: return
        if (v.payloadLen == 0) return
        val query = v.buf.copyOfRange(v.payloadOff, v.payloadOff + v.payloadLen)
        val app = probe.set(v).copy()
        try {
            dnsPool.execute {
                if (stopping) return@execute
                val uid = resolveUid(PROTO_UDP, app)
                val answer = if (isAllowed(uid)) {
                    try {
                        handler.handle(uid, query)
                    } catch (_: Throwable) {
                        null
                    }
                } else {
                    // A blocked app gets no lookups either: DNS queries can carry data out.
                    report(uid, Kind.DNS, app.dstInet, 53, DnsBits.questionName(query, 0, query.size), true)
                    DnsBits.refused(query)
                }
                if (answer != null && !stopping) post { sendDnsAnswer(app, uid, query.size, answer) }
            }
        } catch (_: RejectedExecutionException) {
            // Far too many lookups waiting; drop this one and the app's resolver will retry.
        }
    }

    private fun sendDnsAnswer(app: FlowKey, uid: Int, querySize: Int, answer: ByteArray) {
        if (answer.size > PacketWriter.maxUdpPayload(app.v6)) return
        System.arraycopy(answer, 0, out, PacketWriter.udpPayloadOffset(app.v6), answer.size)
        val n = writer.udp(out, app.v6, app.dst, app.src, app.dstPort, app.srcPort, answer.size)
        tunWrite(out, n)
        addDone(uid, querySize.toLong(), answer.size.toLong())
        bytesPending()
    }

    // ------------------------------------------------------------------ owner lookups and policy

    internal fun lookup(f: Flow, knownUid: Int) {
        val gen = policyGen
        val proto = if (f is TcpFlow) PROTO_TCP else PROTO_UDP
        try {
            lookups.execute {
                if (stopping) return@execute
                val uid = if (knownUid != RESOLVE) knownUid else resolveUid(proto, f.key)
                val allowed = isAllowed(uid)
                post {
                    if (f.closed) return@post
                    try {
                        // Rules changed while we were asking: ask again with the new rules.
                        if (gen != policyGen) lookup(f, uid) else f.onResolved(uid, allowed)
                    } catch (e: Exception) {
                        kill(f)
                    }
                    if (!f.closed) armTimer(f.nextDeadline())
                }
            }
        } catch (_: RejectedExecutionException) {
            f.onLookupFailed()
        }
    }

    private fun resolveUid(proto: Int, k: FlowKey): Int = try {
        uids.uidOf(proto, InetSocketAddress(k.srcInet, k.srcPort), InetSocketAddress(k.dstInet, k.dstPort))
    } catch (_: Throwable) {
        -1
    }

    private fun isAllowed(uid: Int): Boolean = try {
        policy.isAllowed(uid)
    } catch (_: Throwable) {
        true // an unknown owner is allowed too; never cut the phone off because of a bug here
    }

    private fun recheckPolicy() {
        policyGen++
        val gen = policyGen
        val check = HashSet<Int>()
        scratch.clear()
        scratch.addAll(udp.values)
        for (f in scratch) {
            // Blocked UDP flows only drop packets: forget them so the next packet asks again.
            if ((f as UdpFlow).blocked) f.close()
            else if (f.resolved && f.uid >= 0) check += f.uid
        }
        scratch.clear()
        for (f in tcp.values) if (f.resolved && f.uid >= 0) check += f.uid
        if (check.isEmpty()) return
        try {
            lookups.execute {
                val blocked = check.filterTo(HashSet()) { !isAllowed(it) }
                if (blocked.isNotEmpty()) post { if (gen == policyGen) closeUids(blocked) }
            }
        } catch (_: RejectedExecutionException) {
        }
    }

    private fun closeUids(blocked: Set<Int>) {
        scratch.clear()
        scratch.addAll(tcp.values)
        scratch.addAll(udp.values)
        for (f in scratch) if (!f.closed && f.resolved && f.uid in blocked) kill(f)
        scratch.clear()
    }

    internal fun report(f: Flow, blocked: Boolean, domain: String?) {
        val k = f.key
        val kind = when {
            k.dstPort == 53 -> Kind.DNS
            f is TcpFlow -> Kind.TCP
            else -> Kind.UDP
        }
        report(f.uid, kind, k.dstInet, k.dstPort, domain, blocked)
    }

    private fun report(uid: Int, kind: Kind, dst: InetAddress, port: Int, domain: String?, blocked: Boolean) {
        try {
            val host = dst.hostAddress ?: "?"
            val reason = if (blocked) blockReason() else null
            listener.onConnection(
                ConnEvent(System.currentTimeMillis(), uid, kind, host, port, domain ?: DomainMap.get(host), blocked, reason)
            )
        } catch (_: Exception) {
        }
    }

    // ------------------------------------------------------------------ timers and bookkeeping

    internal fun armTimer(at: Long) {
        if (at < nextTimerAt) nextTimerAt = at
    }

    private fun runTimers() {
        var next = Long.MAX_VALUE
        scratch.clear()
        scratch.addAll(tcp.values)
        scratch.addAll(udp.values)
        for (f in scratch) {
            if (f.closed) continue
            if (f.nextDeadline() <= now) {
                try {
                    f.onTimer()
                } catch (e: Exception) {
                    kill(f)
                }
                // A flow whose timer didn't move on would make the loop spin: close it.
                if (!f.closed && f.nextDeadline() <= now) kill(f)
            }
            if (!f.closed) next = minOf(next, f.nextDeadline())
        }
        scratch.clear()
        if (bytesDueAt != 0L) {
            if (now >= bytesDueAt) flushBytes() else next = minOf(next, bytesDueAt)
        }
        nextTimerAt = next
    }

    /** A flow has unreported bytes: report them within about a second. */
    internal fun bytesPending() {
        if (bytesDueAt == 0L) {
            bytesDueAt = now + BYTES_EVERY_MS
            armTimer(bytesDueAt)
        }
    }

    private fun addDone(uid: Int, sent: Long, received: Long) {
        val a = doneBytes.getOrPut(uid) { LongArray(2) }
        a[0] += sent
        a[1] += received
    }

    /** Moves a flow's unreported bytes into [doneBytes]; true if there were any. */
    private fun takeBytes(f: Flow): Boolean {
        if (f.pendingSent == 0L && f.pendingRecv == 0L) return false
        addDone(f.uid, f.pendingSent, f.pendingRecv)
        f.pendingSent = 0
        f.pendingRecv = 0
        return true
    }

    private fun flushBytes() {
        for (f in tcp.values) takeBytes(f)
        for (f in udp.values) takeBytes(f)
        bytesDueAt = 0L
        for ((uid, a) in doneBytes) {
            try {
                listener.onBytes(uid, a[0], a[1])
            } catch (_: Exception) {
            }
        }
        doneBytes.clear()
    }

    internal fun removeTcp(f: TcpFlow) {
        if (tcp[f.key] === f) tcp.remove(f.key)
        tcpFlows = tcp.size
        if (takeBytes(f)) bytesPending()
    }

    internal fun removeUdp(f: UdpFlow) {
        if (udp[f.key] === f) udp.remove(f.key)
        udpFlows = udp.size
        if (takeBytes(f)) bytesPending()
    }

    private fun kill(f: Flow) {
        try {
            f.kill()
        } catch (_: Exception) {
            f.closed = true
            if (f is TcpFlow) removeTcp(f) else if (f is UdpFlow) removeUdp(f)
        }
    }

    /** At the flow limit: drop the one idle the longest so new connections still work. */
    private fun evictOldest(flows: Collection<Flow>) {
        var oldest: Flow? = null
        for (f in flows) if (oldest == null || f.lastActive < oldest.lastActive) oldest = f
        oldest?.let { kill(it) }
    }

    internal fun takeRing(): ByteRing {
        val r = rings.removeLastOrNull() ?: return ByteRing(RING_SIZE)
        r.clear()
        return r
    }

    internal fun giveRing(r: ByteRing) {
        // Never pool a buffer twice: two connections sharing one could mix up their data.
        if (rings.size < RING_POOL && rings.none { it === r }) rings.addLast(r)
    }

    internal fun queueAck(f: TcpFlow) {
        ackQueue.add(f)
    }

    /** ACKs for data received in this round go out together, one per connection. */
    private fun flushAcks() {
        if (ackQueue.isEmpty()) return
        for (i in ackQueue.indices) {
            val f = ackQueue[i]
            if (f.ackPending && !f.closed) {
                try {
                    f.sendAck()
                } catch (e: Exception) {
                    kill(f)
                }
            }
        }
        ackQueue.clear()
    }

    // ------------------------------------------------------------------ writing to the tun

    /** Sends a TCP segment from the flow's server side to the app; payload already at tcpPayloadOffset. */
    internal fun sendTcp(k: FlowKey, seq: Int, ack: Int, flags: Int, window: Int, mss: Int = 0, payloadLen: Int = 0) {
        val n = writer.tcp(out, k.v6, k.dst, k.src, k.dstPort, k.srcPort, seq, ack, flags, window, mss, payloadLen)
        tunWrite(out, n)
    }

    /** Sends a UDP reply to the app; [from] is null for the flow's own destination. Payload already in place. */
    internal fun sendUdpReply(f: UdpFlow, from: InetSocketAddress?, payloadLen: Int) {
        val k = f.key
        var src = k.dst
        var srcPort = k.dstPort
        if (from != null) {
            val a = from.address?.address ?: return
            if (a.size != k.addrLen) return
            src = a
            srcPort = from.port
        }
        tunWrite(out, writer.udp(out, k.v6, src, k.src, srcPort, k.srcPort, payloadLen))
    }

    internal fun tunWrite(buf: ByteArray, len: Int) {
        if (tunError != null) return
        if (backlog.isEmpty()) {
            try {
                if (tun.write(buf, 0, len)) return
            } catch (e: IOException) {
                tunError = e
                return
            }
        }
        // The interface is busy: keep the packet and retry shortly (dropped if far behind; TCP resends).
        if (backlog.size < BACKLOG_MAX) backlog.addLast(buf.copyOf(len))
    }

    private fun flushBacklog() {
        while (backlog.isNotEmpty() && tunError == null) {
            val b = backlog.first()
            val ok = try {
                tun.write(b, 0, b.size)
            } catch (e: IOException) {
                tunError = e
                return
            }
            if (!ok) return
            backlog.removeFirst()
        }
    }

    // ------------------------------------------------------------------ helpers and shutdown

    private fun isDnsServer(v: PacketView): Boolean {
        if (v.addrLen != dnsAddr.size) return false
        for (i in dnsAddr.indices) if (v.buf[v.dstOff + i] != dnsAddr[i]) return false
        return true
    }

    private fun isZero(b: ByteArray, off: Int, n: Int): Boolean {
        for (i in 0 until n) if (b[off + i].toInt() != 0) return false
        return true
    }

    /** False for multicast, broadcast and unspecified destinations. */
    private fun isUnicast(b: ByteArray, off: Int, v6: Boolean): Boolean {
        if (v6) return u8(b, off) != 0xFF && !isZero(b, off, 16)
        val first = u8(b, off)
        return first in 1..223
    }

    private fun shutdown() {
        scratch.clear()
        scratch.addAll(tcp.values)
        scratch.addAll(udp.values)
        // Reset the apps' connections so they reconnect at once instead of hanging.
        for (f in scratch) {
            try {
                kill(f)
            } catch (_: Throwable) {
            }
        }
        scratch.clear()
        tcp.clear()
        udp.clear()
        tcpFlows = 0
        udpFlows = 0
        try {
            flushBacklog()
        } catch (_: Throwable) {
        }
        try {
            flushBytes()
        } catch (_: Throwable) {
        }
        lookups.shutdownNow()
        dnsPool.shutdownNow()
        try {
            selector.close()
        } catch (_: Throwable) {
        }
    }
}
