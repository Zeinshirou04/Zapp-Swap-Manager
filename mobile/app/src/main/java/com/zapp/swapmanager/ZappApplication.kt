package com.zapp.swapmanager

import android.app.Application
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.zapp.swapmanager.worker.SyncWorker
import java.util.concurrent.TimeUnit

class ZappApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        setupHourlySync()
    }

    private fun setupHourlySync() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        // Hourly sync per docs/plans/010-mobile-remote-app.md and AGENTS.md
        val syncRequest = PeriodicWorkRequestBuilder<SyncWorker>(1, TimeUnit.HOURS)
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(this).enqueueUniquePeriodicWork(
            "ZappHourlySyncWork",
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest
        )
    }
}
