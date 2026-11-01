package com.zapp.swapmanager.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.zapp.swapmanager.data.model.Game
import com.zapp.swapmanager.data.model.Library

@Entity(tableName = "libraries")
data class LibraryEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val totalBytes: Long,
    val freeBytes: Long
) {
    fun toDomain() = Library(
        id = id,
        name = name,
        type = type,
        totalBytes = totalBytes,
        freeBytes = freeBytes
    )

    companion object {
        fun fromDomain(lib: Library) = LibraryEntity(
            id = lib.id,
            name = lib.name,
            type = lib.type,
            totalBytes = lib.totalBytes,
            freeBytes = lib.freeBytes
        )
    }
}

@Entity(tableName = "games")
data class GameEntity(
    @PrimaryKey val appId: Long,
    val name: String,
    val installDir: String,
    val sizeBytes: Long,
    val state: String,
    val currentLibraryId: String,
    val buildId: String,
    val lastBackupTime: String?,
    val backupClean: Boolean
) {
    fun toDomain() = Game(
        appId = appId,
        name = name,
        installDir = installDir,
        sizeBytes = sizeBytes,
        state = state,
        currentLibraryId = currentLibraryId,
        buildId = buildId,
        lastBackupTime = lastBackupTime,
        backupClean = backupClean
    )

    companion object {
        fun fromDomain(game: Game) = GameEntity(
            appId = game.appId,
            name = game.name,
            installDir = game.installDir,
            sizeBytes = game.sizeBytes,
            state = game.state,
            currentLibraryId = game.currentLibraryId,
            buildId = game.buildId,
            lastBackupTime = game.lastBackupTime,
            backupClean = game.backupClean
        )
    }
}
