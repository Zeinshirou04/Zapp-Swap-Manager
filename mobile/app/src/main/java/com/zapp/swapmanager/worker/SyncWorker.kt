package com.zapp.swapmanager.worker

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.zapp.swapmanager.data.repository.ZappRepository

class SyncWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val repository = ZappRepository(applicationContext)
        val result = repository.sync()
        return if (result.isSuccess) {
            Result.success()
        } else {
            Result.retry()
        }
    }
}
