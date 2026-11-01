package com.zapp.swapmanager.data.repository

import android.content.Context
import android.content.SharedPreferences
import com.zapp.swapmanager.data.local.ZappDatabase
import com.zapp.swapmanager.data.local.entity.GameEntity
import com.zapp.swapmanager.data.local.entity.LibraryEntity
import com.zapp.swapmanager.data.model.CreateJobRequest
import com.zapp.swapmanager.data.model.Game
import com.zapp.swapmanager.data.model.HealthResponse
import com.zapp.swapmanager.data.model.Job
import com.zapp.swapmanager.data.model.Library
import com.zapp.swapmanager.data.remote.AuthInterceptor
import com.zapp.swapmanager.data.remote.ZappApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

class ZappRepository(
    private val context: Context,
    private val database: ZappDatabase = ZappDatabase.getDatabase(context)
) {
    private val prefs: SharedPreferences =
        context.getSharedPreferences("zapp_remote_prefs", Context.MODE_PRIVATE)

    var tunnelUrl: String
        get() = prefs.getString("tunnel_url", "https://swap-manager.example.com") ?: "https://swap-manager.example.com"
        set(value) = prefs.edit().putString("tunnel_url", value).apply()

    var cfAccessJwt: String
        get() = prefs.getString("cf_access_jwt", "") ?: ""
        set(value) = prefs.edit().putString("cf_access_jwt", value).apply()

    var bearerToken: String
        get() = prefs.getString("bearer_token", "") ?: ""
        set(value) = prefs.edit().putString("bearer_token", value).apply()

    private var cachedApiService: ZappApiService? = null

    private fun getApiService(): ZappApiService {
        cachedApiService?.let { return it }

        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BASIC
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor({ cfAccessJwt }, { bearerToken }))
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()

        var baseUrl = tunnelUrl.trim()
        if (!baseUrl.endsWith("/")) {
            baseUrl += "/"
        }

        val retrofit = Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()

        val service = retrofit.create(ZappApiService::class.java)
        cachedApiService = service
        return service
    }

    fun invalidateClient() {
        cachedApiService = null
    }

    // Room local offline cache flows
    val librariesFlow: Flow<List<Library>> =
        database.libraryDao().getAllLibraries().map { list -> list.map { it.toDomain() } }

    val gamesFlow: Flow<List<Game>> =
        database.gameDao().getAllGames().map { list -> list.map { it.toDomain() } }

    fun gamesByStateFlow(state: String): Flow<List<Game>> =
        database.gameDao().getGamesByState(state).map { list -> list.map { it.toDomain() } }

    // Synchronize latest libraries and games snapshot into Room DB
    suspend fun sync(): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val api = getApiService()
            val remoteLibs = api.listLibraries()
            val remoteGames = api.listGames()

            database.libraryDao().clearLibraries()
            database.libraryDao().insertLibraries(remoteLibs.map { LibraryEntity.fromDomain(it) })

            database.gameDao().clearGames()
            database.gameDao().insertGames(remoteGames.map { GameEntity.fromDomain(it) })
        }
    }

    suspend fun getHealth(): HealthResponse = withContext(Dispatchers.IO) {
        getApiService().getHealth()
    }

    suspend fun listJobs(): List<Job> = withContext(Dispatchers.IO) {
        getApiService().listJobs()
    }

    suspend fun createJob(type: String, appId: String, targetLibraryId: String): Job =
        withContext(Dispatchers.IO) {
            getApiService().createJob(CreateJobRequest(type, appId, targetLibraryId))
        }

    suspend fun cancelJob(jobId: String): Job = withContext(Dispatchers.IO) {
        getApiService().cancelJob(jobId)
    }
}
