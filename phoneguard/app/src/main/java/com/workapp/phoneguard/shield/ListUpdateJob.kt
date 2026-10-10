package com.workapp.phoneguard.shield

import android.app.job.JobParameters
import android.app.job.JobService

// STUB — owned by the Web Shield agent.
/** Periodic blocklist download, scheduled by Shield.scheduleUpdates. */
class ListUpdateJob : JobService() {
    override fun onStartJob(params: JobParameters?): Boolean = false
    override fun onStopJob(params: JobParameters?): Boolean = false
}
