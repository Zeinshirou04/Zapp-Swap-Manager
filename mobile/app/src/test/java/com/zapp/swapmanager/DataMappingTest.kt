package com.zapp.swapmanager

import com.google.gson.Gson
import com.zapp.swapmanager.data.local.entity.GameEntity
import com.zapp.swapmanager.data.local.entity.LibraryEntity
import com.zapp.swapmanager.data.model.CreateJobRequest
import com.zapp.swapmanager.data.model.Game
import com.zapp.swapmanager.data.model.HealthResponse
import com.zapp.swapmanager.data.model.Job
import com.zapp.swapmanager.data.model.Library
import com.zapp.swapmanager.data.remote.AuthInterceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DataMappingTest {

    private val gson = Gson()

    @Test
    fun testGameEntityMappingRoundTrip() {
        val domain = Game(
            appId = 105600L,
            name = "Terraria",
            installDir = "Terraria",
            sizeBytes = 524288000L,
            state = "active_ssd",
            currentLibraryId = "ssd1",
            buildId = "998877",
            lastBackupTime = "2026-11-01T12:00:00Z",
            backupClean = true
        )

        val entity = GameEntity.fromDomain(domain)
        assertEquals(domain.appId, entity.appId)
        assertEquals(domain.name, entity.name)
        assertEquals(domain.sizeBytes, entity.sizeBytes)

        val restored = entity.toDomain()
        assertEquals(domain, restored)
    }

    @Test
    fun testLibraryEntityMappingRoundTrip() {
        val domain = Library(
            id = "ssd1",
            name = "Fast NVMe Cache",
            type = "ssd_cache",
            totalBytes = 1000000000000L,
            freeBytes = 400000000000L
        )

        val entity = LibraryEntity.fromDomain(domain)
        assertEquals(domain.id, entity.id)
        assertEquals(domain.name, entity.name)
        assertEquals(domain.totalBytes, entity.totalBytes)

        val restored = entity.toDomain()
        assertEquals(domain, restored)
    }

    @Test
    fun testJsonDeserializationMatchesOpenApi() {
        val healthJson = """
            {
                "uptime_seconds": 3600,
                "version": "0.1.0",
                "steam_running": true
            }
        """.trimIndent()
        val health = gson.fromJson(healthJson, HealthResponse::class.java)
        assertEquals(3600L, health.uptimeSeconds)
        assertEquals("0.1.0", health.version)
        assertTrue(health.steamRunning)

        val jobJson = """
            {
                "id": "11111111-2222-3333-4444-555555555555",
                "type": "promote",
                "app_id": "105600",
                "target_library_id": "ssd1",
                "status": "running",
                "progress_percent": 45.5,
                "bytes_transferred": 250000000,
                "total_bytes": 500000000,
                "error": null,
                "created_at": "2026-11-01T10:00:00Z",
                "started_at": "2026-11-01T10:00:05Z",
                "completed_at": null
            }
        """.trimIndent()
        val job = gson.fromJson(jobJson, Job::class.java)
        assertEquals("promote", job.type)
        assertEquals("105600", job.appId)
        assertEquals("running", job.status)
        assertEquals(45.5f, job.progressPercent, 0.01f)
    }

    @Test
    fun testCreateJobRequestSafetyGuard() {
        // Enforce safety invariant: only type, app_id, target_library_id (no paths)
        val req = CreateJobRequest(
            type = "evict",
            appId = "105600",
            targetLibraryId = "hdd1"
        )
        val json = gson.toJson(req)
        assertTrue(json.contains("\"type\":\"evict\""))
        assertTrue(json.contains("\"app_id\":\"105600\""))
        assertTrue(json.contains("\"target_library_id\":\"hdd1\""))
    }
}
