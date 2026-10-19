package pg.scrutineer.tally

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

object SyncState {
    const val PENDING = "PENDING"
    const val SYNCED = "SYNCED"
    const val FAILED = "FAILED"
}

object RecordKind {
    /** The team's own tally at a polling place / counting centre. */
    const val POLLING_TALLY = "polling_tally"
    /** A figure copied from the Electoral Commission's official count at any level (ward, LLG, district, province). */
    const val OFFICIAL_FIGURE = "official_figure"
}

/** Versioned election geography, downloaded while online and cached for offline use. */
@Entity(tableName = "locations", primaryKeys = ["id"], indices = [Index("electionId", "parentId")])
data class LocationEntity(
    val id: String,
    val electionId: String,
    val parentId: String?,
    val type: String,          // province, district, llg, ward, locality, polling_place, counting_centre
    val name: String,
    val officialCode: String?
)

/**
 * One record for the team's OWN candidate at one location.
 * clientRecordId is generated on the device and makes uploads idempotent.
 */
@Entity(tableName = "tally_records")
data class TallyRecord(
    @PrimaryKey val clientRecordId: String,
    val teamId: String,
    val electionId: String,
    val locationId: String,
    val locationPath: String,
    val locationType: String,
    val kind: String,
    val candidateVotes: Int,
    val totalVotesCast: Int,
    val sourceReference: String,
    val notes: String,
    val deviceCreatedAt: Long,
    val scrutineerUserId: String,
    val scrutineerName: String,
    val syncState: String = SyncState.PENDING,
    val attempts: Int = 0,
    val lastError: String? = null,
    val syncedAt: Long? = null,
    val serverStatus: String? = null,
    val supersedesClientRecordId: String? = null,
    val correctionReason: String? = null,
    val supersededLocally: Boolean = false
)

@Dao
abstract class DirectoryDao {
    @Query("SELECT * FROM locations WHERE electionId = :electionId AND parentId IS NULL ORDER BY name")
    abstract suspend fun roots(electionId: String): List<LocationEntity>

    @Query("SELECT * FROM locations WHERE parentId = :parentId ORDER BY name")
    abstract suspend fun children(parentId: String): List<LocationEntity>

    @Query("SELECT COUNT(*) FROM locations WHERE electionId = :electionId")
    abstract suspend fun locationCount(electionId: String): Int

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertLocations(items: List<LocationEntity>)

    @Query("DELETE FROM locations WHERE electionId = :electionId")
    abstract suspend fun deleteLocations(electionId: String)

    @Transaction
    open suspend fun replaceDirectory(electionId: String, locations: List<LocationEntity>) {
        deleteLocations(electionId)
        insertLocations(locations)
    }
}

@Dao
abstract class TallyDao {
    @Insert
    abstract suspend fun insert(record: TallyRecord)

    @Query("UPDATE tally_records SET supersededLocally = 1 WHERE clientRecordId = :id")
    abstract suspend fun markSuperseded(id: String)

    /** Corrections never edit or delete the original; they append a linked record. */
    @Transaction
    open suspend fun saveCorrection(record: TallyRecord, originalId: String) {
        insert(record)
        markSuperseded(originalId)
    }

    @Query("SELECT * FROM tally_records ORDER BY deviceCreatedAt DESC")
    abstract fun observeAll(): Flow<List<TallyRecord>>

    @Query("SELECT * FROM tally_records ORDER BY deviceCreatedAt ASC")
    abstract suspend fun allRecords(): List<TallyRecord>

    @Query("SELECT * FROM tally_records WHERE syncState = 'PENDING' AND scrutineerUserId = :userId ORDER BY deviceCreatedAt ASC")
    abstract suspend fun pendingFor(userId: String): List<TallyRecord>

    @Query("UPDATE tally_records SET syncState = 'SYNCED', syncedAt = :at, serverStatus = :status, lastError = NULL WHERE clientRecordId = :id")
    abstract suspend fun markSynced(id: String, at: Long, status: String?)

    @Query("UPDATE tally_records SET attempts = attempts + 1, lastError = :error WHERE clientRecordId = :id")
    abstract suspend fun recordAttempt(id: String, error: String?)

    @Query("UPDATE tally_records SET syncState = 'FAILED', attempts = attempts + 1, lastError = :error WHERE clientRecordId = :id")
    abstract suspend fun markFailed(id: String, error: String)

    @Query("UPDATE tally_records SET syncState = 'PENDING', lastError = NULL WHERE syncState = 'FAILED'")
    abstract suspend fun retryFailed()

    @Query("SELECT COUNT(*) FROM tally_records WHERE syncState = 'PENDING'")
    abstract fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM tally_records WHERE syncState = 'FAILED'")
    abstract fun observeFailedCount(): Flow<Int>
}

// NOTE: not encrypted. Add SQLCipher (or similar) before real election use.
@Database(entities = [LocationEntity::class, TallyRecord::class], version = 1, exportSchema = false)
abstract class AppDatabase : RoomDatabase() {
    abstract fun directoryDao(): DirectoryDao
    abstract fun tallyDao(): TallyDao

    companion object {
        fun create(context: Context): AppDatabase =
            Room.databaseBuilder(context.applicationContext, AppDatabase::class.java, "scrutineer-tally-v3.db").build()
    }
}
