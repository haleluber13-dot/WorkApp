package com.workapp.phoneguard.net

import android.net.ConnectivityManager
import android.net.VpnService
import android.os.Build
import android.system.ErrnoException
import android.system.Os
import android.system.OsConstants
import android.system.StructPollfd
import java.io.FileDescriptor
import java.io.IOException
import java.io.InterruptedIOException
import java.net.DatagramSocket
import java.net.InetSocketAddress
import java.net.Socket

// The only Android-specific part of the engine: the tun file descriptor, protect() and uid lookup.

/**
 * The VPN interface's file descriptor (non-blocking). Waiting also watches a pipe, so stopping
 * the engine wakes the reader at once instead of after the poll timeout.
 * Call [close] only after the engine has stopped.
 */
class AndroidTun(private val fd: FileDescriptor) : TunIo {
    private val pipe: Array<FileDescriptor> = Os.pipe()
    private val polls: Array<StructPollfd>
    private val one = ByteArray(1)
    private val drain = ByteArray(64)
    /** False on Android 10, where the pipe stays blocking: it is then read only when poll says it has data. */
    private val pipeNonBlocking: Boolean

    init {
        // Os.fcntlInt is public only from Android 11; on Android 10 it is a hidden API, so it is
        // not used there. The VPN interface is non-blocking anyway, because the service asks for
        // that (Builder.setBlocking(false)), and the pipe is handled without it (see await).
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                Os.fcntlInt(pipe[0], OsConstants.F_SETFL, OsConstants.O_NONBLOCK)
                Os.fcntlInt(pipe[1], OsConstants.F_SETFL, OsConstants.O_NONBLOCK)
                // The VPN builder is asked for a non-blocking fd; make sure, or a read could hang stop().
                val flags = Os.fcntlInt(fd, OsConstants.F_GETFL, 0)
                if (flags and OsConstants.O_NONBLOCK == 0) {
                    Os.fcntlInt(fd, OsConstants.F_SETFL, flags or OsConstants.O_NONBLOCK)
                }
            } catch (e: ErrnoException) {
                closePipe()
                throw IOException(e)
            }
            pipeNonBlocking = true
        } else {
            pipeNonBlocking = false
        }
        polls = arrayOf(
            StructPollfd().apply {
                this.fd = this@AndroidTun.fd
                events = OsConstants.POLLIN.toShort()
            },
            StructPollfd().apply {
                this.fd = pipe[0]
                events = OsConstants.POLLIN.toShort()
            },
        )
    }

    override fun read(buf: ByteArray): Int {
        while (true) {
            try {
                val n = Os.read(fd, buf, 0, buf.size)
                return if (n == 0) -1 else n
            } catch (e: ErrnoException) {
                when (e.errno) {
                    OsConstants.EAGAIN -> return 0
                    OsConstants.EINTR -> continue
                    else -> throw IOException(e)
                }
            } catch (e: InterruptedIOException) {
                continue
            }
        }
    }

    override fun await(timeoutMs: Int) {
        try {
            Os.poll(polls, timeoutMs)
        } catch (e: ErrnoException) {
            if (e.errno != OsConstants.EINTR) throw IOException(e)
        }
        if (polls[1].revents.toInt() != 0) {
            try {
                if (pipeNonBlocking) {
                    while (Os.read(pipe[0], drain, 0, drain.size) > 0) Unit
                } else {
                    // Blocking pipe: poll just said it is readable (data, or closed), so one read
                    // returns at once. Anything left over wakes the next poll straight away.
                    Os.read(pipe[0], drain, 0, drain.size)
                }
            } catch (_: Exception) {
            }
        }
    }

    override fun wakeup() {
        try {
            Os.write(pipe[1], one, 0, 1)
        } catch (_: Exception) {
        }
    }

    override fun write(buf: ByteArray, off: Int, len: Int): Boolean {
        while (true) {
            try {
                Os.write(fd, buf, off, len)
                return true
            } catch (e: ErrnoException) {
                when (e.errno) {
                    OsConstants.EAGAIN -> return false
                    OsConstants.EINTR -> continue
                    // Out of kernel memory for a moment: drop this packet, TCP sends it again.
                    OsConstants.ENOBUFS, OsConstants.ENOMEM -> return true
                    else -> throw IOException(e)
                }
            } catch (e: InterruptedIOException) {
                continue
            }
        }
    }

    /** Closes the wake-up pipe (not the tun itself, which the service owns). */
    fun close() = closePipe()

    private fun closePipe() {
        for (p in pipe) {
            try {
                Os.close(p)
            } catch (_: Exception) {
            }
        }
    }
}

/** Keeps relay sockets out of our own VPN. */
class VpnProtector(private val vpn: VpnService) : Protector {
    override fun protect(socket: Socket) = vpn.protect(socket)
    override fun protect(socket: DatagramSocket) = vpn.protect(socket)
}

/** Asks Android which app owns a connection (allowed for the active VPN app, Android 10+). */
class ConnectivityUidResolver(private val cm: ConnectivityManager) : UidResolver {
    override fun uidOf(protocol: Int, local: InetSocketAddress, remote: InetSocketAddress): Int = try {
        cm.getConnectionOwnerUid(protocol, local, remote)
    } catch (_: Exception) {
        -1
    }
}
