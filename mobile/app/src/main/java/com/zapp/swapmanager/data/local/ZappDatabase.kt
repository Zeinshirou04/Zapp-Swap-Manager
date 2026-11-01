package com.zapp.swapmanager.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import com.zapp.swapmanager.data.local.dao.GameDao
import com.zapp.swapmanager.data.local.dao.LibraryDao
import com.zapp.swapmanager.data.local.entity.GameEntity
import com.zapp.swapmanager.data.local.entity.LibraryEntity

@Database(entities = [LibraryEntity::class, GameEntity::class], version = 1, exportSchema = false)
abstract class ZappDatabase : RoomDatabase() {
    abstract fun libraryDao(): LibraryDao
    abstract fun gameDao(): GameDao

    companion object {
        @Volatile
        private var INSTANCE: ZappDatabase? = null

        fun getDatabase(context: Context): ZappDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    ZappDatabase::class.java,
                    "zapp_swap_snapshot.db"
                ).build()
                INSTANCE = instance
                instance
            }
        }
    }
}
