package com.zapp.swapmanager.data.model

import com.google.gson.annotations.SerializedName

data class HealthResponse(
    @SerializedName("uptime_seconds") val uptimeSeconds: Long,
    val version: String,
    @SerializedName("steam_running") val steamRunning: Boolean
)

data class Library(
    val id: String,
    val name: String,
    val type: String, // "ssd_cache" | "hdd_master"
    @SerializedName("total_bytes") val totalBytes: Long,
    @SerializedName("free_bytes") val freeBytes: Long
)

data class Game(
    @SerializedName("app_id") val appId: Long,
    val name: String,
    @SerializedName("install_dir") val installDir: String,
    @SerializedName("size_bytes") val sizeBytes: Long,
    val state: String, // "active_ssd" | "storage_hdd"
    @SerializedName("current_library_id") val currentLibraryId: String,
    @SerializedName("build_id") val buildId: String,
    @SerializedName("last_backup_time") val lastBackupTime: String?,
    @SerializedName("backup_clean") val backupClean: Boolean
)

data class CreateJobRequest(
    val type: String, // "promote" | "evict" | "backup"
    @SerializedName("app_id") val appId: String,
    @SerializedName("target_library_id") val targetLibraryId: String
)

data class Job(
    val id: String,
    val type: String,
    @SerializedName("app_id") val appId: String,
    @SerializedName("target_library_id") val targetLibraryId: String,
    val status: String, // "queued" | "running" | "succeeded" | "failed" | "cancelled"
    @SerializedName("progress_percent") val progressPercent: Float,
    @SerializedName("bytes_transferred") val bytesTransferred: Long,
    @SerializedName("total_bytes") val totalBytes: Long,
    val error: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("started_at") val startedAt: String?,
    @SerializedName("completed_at") val completedAt: String?
)
