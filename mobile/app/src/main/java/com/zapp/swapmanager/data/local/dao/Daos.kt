package com.zapp.swapmanager.data.local.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.zapp.swapmanager.data.local.entity.GameEntity
import com.zapp.swapmanager.data.local.entity.LibraryEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface LibraryDao {
    @Query("SELECT * FROM libraries")
    fun getAllLibraries(): Flow<List<LibraryEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertLibraries(libraries: List<LibraryEntity>)

    @Query("DELETE FROM libraries")
    suspend fun clearLibraries()
}

@Dao
interface GameDao {
    @Query("SELECT * FROM games ORDER BY name ASC")
    fun getAllGames(): Flow<List<GameEntity>>

    @Query("SELECT * FROM games WHERE state = :state ORDER BY name ASC")
    fun getGamesByState(state: String): Flow<List<GameEntity>>

    @Query("SELECT * FROM games WHERE appId = :appId")
    suspend fun getGameById(appId: Long): GameEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertGames(games: List<GameEntity>)

    @Query("DELETE FROM games")
    suspend fun clearGames()
}
