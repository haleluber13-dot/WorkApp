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
import java.net.StandardProtocolFamily
import java.nio.ByteBuffer
import java.nio.channels.CancelledKeyException
import java.nio.channels.Channel
import java.nio.channels.DatagramChannel
import java.nio.channels.Selector
import java.nio.channels.SocketChannel
import java.security.SecureRandom
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.ConcurrentHashMap
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

/**
 * Finds the app (uid) that owns a connection; -1 if unknown. May block briefly.
 *
 * The engine asks before anything of a new flow is sent on, while the app is still waiting for
 * an answer, so a live socket is always found. -1 in practice means the socket is gone: the app
 * closed it at once (a one-off datagram, a connect given up straight away) or, rarely, the
 * lookup itself failed. A blocked app could close its socket on purpose to look unknown, so the
 * engine asks the [FirewallPolicy] about uid -1 like any other app (the service allows it only
 * while no app is blocked) and, when -1 is not allowed, never relays the flow to the internet:
 * TCP stays silent so a still-waiting app's next SYN asks again, UDP drops the datagrams and asks
 * again on the next one (at most every [EngineConfig.unknownRetryMs]). Datagrams that stay on the
 * local network (broadcast, multicast, local addresses; not DNS) still go: see [udpStaysLocal].
 */
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
    /**
     * Silence allowed once one side has finished sending: the other side may still be working on
     * its answer (a request ended with shutdownOutput, a long poll), so this is generous.
     */
    val halfClosedTimeoutMs: Long = 10 * 60_000L,
    /** Silence allowed once both sides have finished and only the last acknowledgements are missing. */
    val closingTimeoutMs: Long = 60_000,
    val udpTimeoutMs: Long = 60_000,
    /** UDP to port 53 of other DNS servers: one question, one answer, so close sooner. */
    val dnsUdpTimeoutMs: Long = 15_000,
    /** A UDP port whose owner couldn't be found is looked up again at most this often. */
    val unknownRetryMs: Long = 250,
    /** How often a UDP flow's owner is checked again (the app may have closed or handed on its port). */
    val ownerCheckMs: Long = 30_000,
    /** The same blocked attempt (app, destination, port) is logged once per this time; apps retry in tight loops. */
    val blockedLogGapMs: Long = 15_000,
    /** Retransmission timeout toward the app until a round trip has been measured. */
    val rtoMs: Long = 1_000,
    /** Lower bound once the round trip is known (an app on the same phone answers within milliseconds). */
    val rtoMinMs: Long = 200,
    val rtoMaxMs: Long = 30_000,
    val maxRetries: Int = 8,
    /** Closed connections are remembered this long to re-acknowledge a repeated FIN. */
    val lingerMs: Long = 5_000,
    val maxTcpFlows: Int = 4_000,
    val maxUdpFlows: Int = 2_000,
    /**
     * Use TCP window scaling (RFC 7323) with apps that offer it, so a busy connection isn't held
     * to 64 KB in flight. Without it both windows stay plain 16-bit values.
     */
    val windowScaling: Boolean = true,
    /** Most server data one connection holds for the app (unacknowledged or not yet sent). */
    val maxSendBuffer: Int = 1 shl 20,
    /** Most app data one connection holds for the server; also its largest receive window. */
    val maxRecvBuffer: Int = 512 * 1024,
    /** Memory all connections together may use beyond their first 64 KB per buffer. */
    val bufferBudget: Long = 32L shl 20,
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

    /**
     * A UDP flow's key: the app's address and port only, so one relay socket serves every
     * destination the app's socket talks to. [mapped] marks IPv6 packets to IPv4-mapped
     * addresses, which need an IPv4 relay socket of their own.
     */
    fun setEndpoint(v: PacketView, mapped: Boolean): FlowKey {
        v6 = v.v6
        val n = v.addrLen
        System.arraycopy(v.buf, v.srcOff, src, 0, n)
        dst.fill(0)
        if (mapped) {
            dst[10] = 0xFF.toByte()
            dst[11] = 0xFF.toByte()
        }
        srcPort = v.srcPort
        dstPort = 0
        var h = if (v6) 3 else 2
        h = h * 31 + srcPort
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
 * policy, open and protect the relay sockets, and answer DNS, so slow system calls never hold up
 * traffic.
 *
 * Per round the loop handles a batch of packets, then writes what apps sent to each socket once
 * and sends one ACK per connection, so a busy upload costs one socket write per round rather
 * than one per packet.
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
        /** Bytes of packets the reader may queue for the loop, and keep for reuse. */
        const val INBOUND_BYTES = 16_000_000
        const val SPARE_BYTES = 2_000_000
        const val MAX_BATCH = 512
        const val OUT_SIZE = 65_600
        const val BACKLOG_MAX = 4096
        const val BACKLOG_RETRY_MS = 5L
        const val MAX_WAIT_MS = 60_000L
        const val BYTES_EVERY_MS = 1_000L
        const val RING_SIZE = 65_536
        const val RING_POOL = 32
        /** Blocked attempts remembered for [EngineConfig.blockedLogGapMs]. */
        const val BLOCKED_SEEN_MAX = 4096
        /**
         * Owner lookups and socket setup are slow system calls that mostly wait (on the system
         * server, on netd), so a burst of new connections is worked on side by side.
         */
        const val LOOKUP_THREADS = 8

        fun clock(): Long = System.nanoTime() / 1_000_000
    }

    internal val selector: Selector = Selector.open()
    private val packetSize = config.mtu.coerceAtLeast(1280) + 128
    private val inbound = ArrayBlockingQueue<Packet>((INBOUND_BYTES / packetSize).coerceIn(256, 4096))
    private val spare = ArrayBlockingQueue<Packet>((SPARE_BYTES / packetSize).coerceIn(64, 1024))
    private val tasks = ConcurrentLinkedQueue<Runnable>()
    private val sleeping = AtomicBoolean(false)
    private val lookups = pool("pg-lookup", LOOKUP_THREADS, 1024)
    private val dnsPool = pool("pg-dns", 16, 512)
    /** Sockets opened off the loop and not yet handed to their flow; closed if the engine stops first. */
    private val pendingChannels: MutableSet<Channel> = ConcurrentHashMap.newKeySet()

    /** Size of a connection's buffers to start with (and of pooled ones). */
    internal val ringSize = RING_SIZE
    internal val maxSendBuffer = config.maxSendBuffer.coerceAtLeast(RING_SIZE)
    /** At most what a scaled 16-bit window field can offer. */
    internal val maxRecvBuffer = config.maxRecvBuffer.coerceIn(RING_SIZE, 65535 shl 14)
    /** Window scale shift we offer: the smallest that can express [maxRecvBuffer]. */
    internal val rcvShift: Int = run {
        var s = 0
        while ((65535L shl s) < maxRecvBuffer) s++
        s
    }
    @Volatile private var stopping = false
    /** Set when the loop thread has finished, for whatever reason. */
    @Volatile private var loopDone = false
    @Volatile private var readerError: Throwable? = null
    private var loopThread: Thread? = null
    private var readerThread: Thread? = null
    /** When each recent blocked attempt was logged (any thread; DNS answers come from the pool). */
    private val blockedSeen = object : LinkedHashMap<String, Long>(64, 0.75f, false) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Long>?) = size > BLOCKED_SEEN_MAX
    }

    // Everything below belongs to the loop thread.
    internal var now = clock()
        private set
    internal val writer = PacketWriter()
    internal val out = ByteArray(OUT_SIZE)
    internal val outBuffer: ByteBuffer = ByteBuffer.wrap(out)
    /** Initial sequence numbers. Tests may set another source before [start]. */
    internal var random: java.util.Random = SecureRandom()
    private val dnsAddr: ByteArray = config.dnsServer.address
    private val tcp = HashMap<FlowKey, TcpFlow>()
    private val udp = HashMap<FlowKey, UdpFlow>()
    private val probe = FlowKey()
    private val udpProbe = FlowKey()
    private val view = PacketView()
    private val backlog = ArrayDeque<ByteArray>()
    private val ackQueue = ArrayList<TcpFlow>()
    private val flushQueue = ArrayList<TcpFlow>()
    private val scratch = ArrayList<Flow>()
    private val rings = ArrayDeque<ByteRing>()
    /** Bytes that grown buffers hold beyond [RING_SIZE] each; kept within [EngineConfig.bufferBudget]. */
    private var grownBytes = 0L
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
                flushWrites()
                flushAcks()
                if (stopping) break
                waitForEvents()
                now = clock()
                handleKeys()
                flushWrites()
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
            // A new socket (maybe another app's) reuses the port: the old connection is over, and
            // the new one gets its own owner lookup and firewall check instead of inheriting them.
            try {
                f.replace()
            } catch (e: Exception) {
                kill(f)
            }
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
            startTcp(nf)
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
        // One flow per app socket (address and port), whatever the destination: see UdpFlow.
        val key = udpProbe.setEndpoint(v, v.v6 && Addr.isMapped(v.buf, v.dstOff))
        val existing = udp[key]
        val f: UdpFlow
        if (existing == null) {
            if (udp.size >= config.maxUdpFlows) evictOldest(udp.values)
            f = UdpFlow(this, key.copy(), now)
            udp[f.key] = f
            udpFlows = udp.size
            try {
                f.onDatagram(v, p) // held until the owner is known; starts the lookup
            } catch (_: Exception) {
                kill(f)
            }
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

    // ------------------------------------------------------------------ owner lookups, policy, sockets

    /**
     * A new TCP connection: finds its owner, asks the policy and opens the socket to the server,
     * all off the loop. Normally the socket is only opened once the policy said yes, so nothing of
     * a blocked app's attempt leaves the phone. While no app at all is blocked
     * ([FirewallPolicy.allowsEveryone]) the answer is yes whoever the owner is, so the server's
     * handshake is started first and the owner looked up meanwhile. Either way the app gets its
     * SYN-ACK only after the policy allowed it ([TcpFlow.onResolved]).
     */
    internal fun startTcp(f: TcpFlow) {
        val gen = policyGen
        val local = InetSocketAddress(f.key.srcInet, f.key.srcPort)
        val remote = InetSocketAddress(f.key.dstInet, f.key.dstPort)
        // Asked here, on the loop: the service updates its answer before it tells us rules changed.
        val early = allowsEveryone()
        try {
            if (early) connectTcp(f) // on a second pool thread, while this one looks up the owner
            lookups.execute {
                if (stopping) return@execute
                val uid = resolveUid(PROTO_TCP, local, remote)
                val allowed = isAllowed(uid)
                if (!early && allowed) deliverTcp(f, openTcp(remote))
                post { resolved(f, uid, allowed, gen) }
            }
        } catch (_: RejectedExecutionException) {
            f.onLookupFailed()
        }
    }

    /** Opens the socket of [f] on a pool thread; [TcpFlow.onChannel] gets it. */
    internal fun connectTcp(f: TcpFlow) {
        val remote = InetSocketAddress(f.key.dstInet, f.key.dstPort)
        f.socketOnTheWay()
        try {
            lookups.execute {
                if (!stopping) deliverTcp(f, openTcp(remote))
            }
        } catch (_: RejectedExecutionException) {
            f.onChannel(null, false)
        }
    }

    /** Looks up who owns a new UDP flow, which sent its first datagram to [remote]; opens its socket if allowed. */
    internal fun resolve(f: UdpFlow, remote: InetSocketAddress) {
        val gen = policyGen
        val local = InetSocketAddress(f.key.srcInet, f.key.srcPort)
        try {
            lookups.execute {
                if (stopping) return@execute
                val uid = resolveUid(PROTO_UDP, local, remote)
                val allowed = isAllowed(uid)
                if (allowed) deliverUdp(f, openUdp(f.ipv4Socket))
                post { resolved(f, uid, allowed, gen) }
            }
        } catch (_: RejectedExecutionException) {
            f.onLookupFailed()
        }
    }

    /** Opens the socket of a UDP flow that may send without one yet (see [UdpFlow.onChannel]). */
    internal fun openUdpFor(f: UdpFlow) {
        try {
            lookups.execute {
                if (!stopping) deliverUdp(f, openUdp(f.ipv4Socket))
            }
        } catch (_: RejectedExecutionException) {
            f.onChannel(null)
        }
    }

    /** The policy's answer for [uid], on the loop. Rules that changed meanwhile mean asking again. */
    private fun resolved(f: Flow, uid: Int, allowed: Boolean, gen: Int) {
        if (f.closed) return
        try {
            if (gen != policyGen) recheck(f, uid) else f.onResolved(uid, allowed)
        } catch (e: Exception) {
            kill(f)
        }
        if (!f.closed) armTimer(f.nextDeadline())
    }

    private fun recheck(f: Flow, uid: Int) {
        val gen = policyGen
        try {
            lookups.execute {
                if (stopping) return@execute
                val allowed = isAllowed(uid)
                post { resolved(f, uid, allowed, gen) }
            }
        } catch (_: RejectedExecutionException) {
            f.onLookupFailed()
        }
    }

    private class OpenedTcp(val ch: SocketChannel, val connected: Boolean)

    /** Opens, protects and starts connecting a socket to [remote] (lookup pool); null if that failed at once. */
    private fun openTcp(remote: InetSocketAddress): OpenedTcp? {
        val c = try {
            SocketChannel.open()
        } catch (_: Exception) {
            return null
        }
        return try {
            c.configureBlocking(false)
            protector.protect(c.socket())
            try {
                c.socket().tcpNoDelay = true // the app already decided how to pack its data
            } catch (_: Exception) {
            }
            OpenedTcp(c, c.connect(remote))
        } catch (_: Exception) {
            // No route, no network, refused straight away.
            closeQuietly(c)
            null
        }
    }

    /** Opens and protects an unconnected datagram socket (lookup pool); null if that failed. */
    private fun openUdp(v4: Boolean): DatagramChannel? {
        val c = try {
            DatagramChannel.open(if (v4) StandardProtocolFamily.INET else StandardProtocolFamily.INET6)
        } catch (_: Exception) {
            return null
        }
        return try {
            c.configureBlocking(false)
            protector.protect(c.socket())
            if (v4) {
                try {
                    c.socket().broadcast = true // lets apps reach broadcast addresses (e.g. wake-on-LAN)
                } catch (_: Exception) {
                }
            }
            c
        } catch (_: Exception) {
            closeQuietly(c)
            null
        }
    }

    /** Hands a socket opened on a pool thread to its flow on the loop (or closes it if too late). */
    private fun deliverTcp(f: TcpFlow, o: OpenedTcp?) {
        val c = o?.ch
        if (!adopt(c)) return
        post {
            if (c != null && !pendingChannels.remove(c)) return@post // the engine stopped meanwhile
            try {
                f.onChannel(c, o?.connected == true)
            } catch (e: Exception) {
                kill(f)
            }
            if (!f.closed) armTimer(f.nextDeadline())
        }
    }

    private fun deliverUdp(f: UdpFlow, c: DatagramChannel?) {
        if (!adopt(c)) return
        post {
            if (c != null && !pendingChannels.remove(c)) return@post
            try {
                f.onChannel(c)
            } catch (e: Exception) {
                kill(f)
            }
            if (!f.closed) armTimer(f.nextDeadline())
        }
    }

    /** Tracks [c] until its flow takes it, so a stopping engine closes it. False if already stopped. */
    private fun adopt(c: Channel?): Boolean {
        if (c == null) return true
        pendingChannels.add(c)
        if (loopDone || stopping) {
            if (pendingChannels.remove(c)) closeQuietly(c)
            return false
        }
        return true
    }

    private fun closeQuietly(c: Channel) {
        try {
            if (c is SocketChannel) abortChannel(c) else c.close()
        } catch (_: Exception) {
        }
    }

    private fun allowsEveryone(): Boolean = try {
        policy.allowsEveryone()
    } catch (_: Throwable) {
        false
    }

    /**
     * Asks again who owns a UDP flow's app port; [UdpFlow.onOwnerChecked] gets the answer on the
     * loop (null if it couldn't be asked). Nothing waits for it: the flow keeps working meanwhile.
     */
    internal fun checkOwner(f: UdpFlow, remote: InetSocketAddress) {
        val local = InetSocketAddress(f.key.srcInet, f.key.srcPort)
        try {
            lookups.execute {
                if (stopping) return@execute
                val uid = resolveUid(PROTO_UDP, local, remote)
                post {
                    if (f.closed) return@post
                    try {
                        f.onOwnerChecked(uid)
                    } catch (e: Exception) {
                        kill(f)
                    }
                    if (!f.closed) armTimer(f.nextDeadline())
                }
            }
        } catch (_: RejectedExecutionException) {
            f.onOwnerChecked(null)
        }
    }

    private fun resolveUid(proto: Int, k: FlowKey): Int =
        resolveUid(proto, InetSocketAddress(k.srcInet, k.srcPort), InetSocketAddress(k.dstInet, k.dstPort))

    private fun resolveUid(proto: Int, local: InetSocketAddress, remote: InetSocketAddress): Int = try {
        uids.uidOf(proto, local, remote).coerceAtLeast(-1)
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
            f as UdpFlow
            if (f.blocked || f.unknownOwner) f.close()
            else if (f.resolved) check += f.uid
        }
        scratch.clear()
        // Flows of unknown owners (-1) are checked too: they were let through only because no
        // app was blocked, and that may have just changed.
        for (f in tcp.values) if (f.resolved) check += f.uid
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

    /** Logs a TCP connection (UDP flows log each destination themselves). */
    internal fun report(f: Flow, blocked: Boolean, domain: String?) {
        val k = f.key
        val kind = when {
            k.dstPort == 53 -> Kind.DNS
            f is TcpFlow -> Kind.TCP
            else -> Kind.UDP
        }
        report(f.uid, kind, k.dstInet, k.dstPort, domain, blocked)
    }

    /** Logs a connection let through or blocked. Any thread. */
    internal fun report(uid: Int, kind: Kind, dst: InetAddress, port: Int, domain: String?, blocked: Boolean) {
        try {
            val host = dst.hostAddress ?: "?"
            if (blocked && loggedRecently(uid, kind, host, port, domain)) return
            val reason = if (blocked) blockReason() else null
            listener.onConnection(
                ConnEvent(System.currentTimeMillis(), uid, kind, host, port, domain ?: DomainMap.get(host), blocked, reason)
            )
        } catch (_: Exception) {
        }
    }

    /**
     * True if this blocked attempt (app, destination, port, and for DNS the name) was logged
     * less than [EngineConfig.blockedLogGapMs] ago. A blocked app usually retries at once, over
     * and over; one line per attempt would bury everything else in the activity log.
     */
    private fun loggedRecently(uid: Int, kind: Kind, host: String, port: Int, domain: String?): Boolean {
        val gap = config.blockedLogGapMs
        if (gap <= 0) return false
        val key = "$uid|$kind|$host|$port|${domain.orEmpty()}"
        val t = clock()
        synchronized(blockedSeen) {
            val last = blockedSeen[key]
            if (last != null && t - last < gap) return true
            blockedSeen.remove(key) // put it back at the young end
            blockedSeen[key] = t
        }
        return false
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

    /** A buffer of [ringSize] bytes, from the pool if one is free. */
    internal fun takeRing(): ByteRing {
        val r = rings.removeLastOrNull() ?: return ByteRing(RING_SIZE)
        r.clear()
        return r
    }

    internal fun giveRing(r: ByteRing) {
        if (r.capacity > RING_SIZE) {
            // A grown buffer isn't pooled; its memory goes back to the budget.
            grownBytes -= r.capacity - RING_SIZE
            return
        }
        // Never pool a buffer twice: two connections sharing one could mix up their data.
        if (rings.size < RING_POOL && rings.none { it === r }) rings.addLast(r)
    }

    /** Grows [r] to [newCapacity] if the memory budget allows. */
    internal fun growRing(r: ByteRing, newCapacity: Int): Boolean {
        val more = newCapacity - r.capacity
        if (more <= 0 || grownBytes + more > config.bufferBudget) return false
        try {
            r.grow(newCapacity)
        } catch (_: OutOfMemoryError) {
            return false
        }
        grownBytes += more
        return true
    }

    internal fun queueAck(f: TcpFlow) {
        ackQueue.add(f)
    }

    /** [f] has app data to write to its socket at the end of this round. */
    internal fun queueFlush(f: TcpFlow) {
        flushQueue.add(f)
    }

    /** Writes each connection's app data of this round to its socket in one go. */
    private fun flushWrites() {
        var i = 0
        while (i < flushQueue.size) {
            val f = flushQueue[i++]
            if (f.closed) continue
            try {
                f.flushUp()
            } catch (e: Exception) {
                kill(f)
            }
            if (!f.closed) armTimer(f.nextDeadline())
        }
        flushQueue.clear()
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
    internal fun sendTcp(
        k: FlowKey, seq: Int, ack: Int, flags: Int, window: Int, mss: Int = 0, payloadLen: Int = 0, wscale: Int = -1,
    ) {
        val n = writer.tcp(out, k.v6, k.dst, k.src, k.dstPort, k.srcPort, seq, ack, flags, window, mss, payloadLen, wscale)
        tunWrite(out, n)
    }

    /**
     * Sends a UDP datagram to the app's socket from [src]:[srcPort] (the remote that sent it;
     * [src] has the flow's address length). Payload already in place.
     */
    internal fun sendUdpReply(f: UdpFlow, src: ByteArray, srcPort: Int, payloadLen: Int) {
        val k = f.key
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
    private fun isUnicast(b: ByteArray, off: Int, v6: Boolean): Boolean = Addr.isUnicast(b, off, v6)

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
        // Sockets opened for flows that never got them.
        for (c in pendingChannels) {
            if (pendingChannels.remove(c)) closeQuietly(c)
        }
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
