package com.workapp.phoneguard.shield

import android.app.job.JobParameters
import android.app.job.JobService
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/** Periodic blocklist download, scheduled by Shield.scheduleUpdates. */
class ListUpdateJob : JobService() {
    // Per running job, so onStopJob can ask the download loop to give up.
    private val running = HashMap<Int, AtomicBoolean>()

    override fun onStartJob(params: JobParameters?): Boolean {
        if (params == null) return false
        val cancel = AtomicBoolean(false)
        synchronized(running) { running[params.jobId] = cancel }
        thread(name = "pg-list-update", isDaemon = true) {
            var retry = false
            try {
                val r = Shield.runUpdate(applicationContext, cancel)
                // Nothing came through because the network failed: let JobScheduler retry
                // with backoff instead of waiting a whole week.
                retry = r.updated == 0 && r.failed > 0
            } catch (_: Throwable) {
                retry = true
            } finally {
                synchronized(running) { running.remove(params.jobId) }
            }
            if (!cancel.get()) jobFinished(params, retry)
        }
        return true // work continues on the thread
    }

    override fun onStopJob(params: JobParameters?): Boolean {
        if (params != null) synchronized(running) { running[params.jobId]?.set(true) }
        return true // run again later
    }
}
