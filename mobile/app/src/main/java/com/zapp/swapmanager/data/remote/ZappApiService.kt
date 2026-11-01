package com.zapp.swapmanager.data.remote

import com.zapp.swapmanager.data.model.CreateJobRequest
import com.zapp.swapmanager.data.model.Game
import com.zapp.swapmanager.data.model.HealthResponse
import com.zapp.swapmanager.data.model.Job
import com.zapp.swapmanager.data.model.Library
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ZappApiService {
    @GET("health")
    suspend fun getHealth(): HealthResponse

    @GET("libraries")
    suspend fun listLibraries(): List<Library>

    @GET("games")
    suspend fun listGames(
        @Query("state") state: String? = null,
        @Query("library_id") libraryId: String? = null
    ): List<Game>

    @GET("games/{app_id}")
    suspend fun getGame(@Path("app_id") appId: Long): Game

    @GET("jobs")
    suspend fun listJobs(@Query("status") status: String? = null): List<Job>

    @POST("jobs")
    suspend fun createJob(@Body request: CreateJobRequest): Job

    @GET("jobs/{job_id}")
    suspend fun getJob(@Path("job_id") jobId: String): Job

    @POST("jobs/{job_id}/cancel")
    suspend fun cancelJob(@Path("job_id") jobId: String): Job
}
