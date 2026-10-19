package pg.scrutineer.tally

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.io.IOException
import java.time.Instant
import java.util.concurrent.TimeUnit

/** Process-wide singletons (no DI framework needed for this size). */
class Graph private constructor(context: Context) {
    val db: AppDatabase = AppDatabase.create(context)
    val store = SessionStore(context)
    val api = SupabaseApi(store)

    enum class SyncOutcome { NOTHING_TO_DO, ALL_UPLOADED, UPLOADED_WITH_REJECTIONS, RETRY_LATER, NOT_SIGNED_IN }

    private fun payloadFor(r: TallyRecord): JSONObject = JSONObject()
        .put("client_record_id", r.clientRecordId)
        .put("team_id", r.teamId)
        .put("election_id", r.electionId)
        .put("location_id", r.locationId)
        .put("kind", r.kind)
        .put("candidate_votes", r.candidateVotes)
        .put("total_votes_cast", r.totalVotesCast)
        .put("source_reference", r.sourceReference)
        .put("notes", r.notes)
        .put("device_created_at", Instant.ofEpochMilli(r.deviceCreatedAt).toString())
        .put("supersedes_client_record_id", r.supersedesClientRecordId ?: JSONObject.NULL)
        .put("correction_reason", r.correctionReason ?: JSONObject.NULL)

    /** Uploads queued records oldest-first. Safe to call repeatedly: the server dedupes on client_record_id. */
    suspend fun syncPending(): SyncOutcome {
        val user = store.session.value ?: return SyncOutcome.NOT_SIGNED_IN
        val dao = db.tallyDao()
        val pending = dao.pendingFor(user.userId)
        if (pending.isEmpty()) return SyncOutcome.NOTHING_TO_DO
        var rejected = false
        for (s in pending) {
            try {
                val reply = api.submitRecord(payloadFor(s))
                dao.markSynced(s.clientRecordId, System.currentTimeMillis(), reply.optString("status").ifBlank { null })
            } catch (e: ApiException) {
                when {
                    e.code == 401 || e.code == 408 || e.code == 429 || e.code >= 500 -> {
                        dao.recordAttempt(s.clientRecordId, e.message)
                        return SyncOutcome.RETRY_LATER
                    }
                    else -> { // 400/403/404/409/422: the server refused this record; keep it, flag it, move on.
                        dao.markFailed(s.clientRecordId, e.message ?: "Rejected by server")
                        rejected = true
                    }
                }
            } catch (e: IOException) {
                dao.recordAttempt(s.clientRecordId, "No connection")
                return SyncOutcome.RETRY_LATER
            }
        }
        return if (rejected) SyncOutcome.UPLOADED_WITH_REJECTIONS else SyncOutcome.ALL_UPLOADED
    }

    suspend fun downloadDirectory(electionId: String): Int {
        val locations = api.fetchLocations(electionId)
        db.directoryDao().replaceDirectory(electionId, locations)
        store.setDirectoryDownloadedAt(electionId, System.currentTimeMillis())
        return locations.size
    }

    companion object {
        @Volatile private var instance: Graph? = null
        fun get(context: Context): Graph = instance ?: synchronized(this) {
            instance ?: Graph(context.applicationContext).also { instance = it }
        }
    }
}

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result =
        when (Graph.get(applicationContext).syncPending()) {
            Graph.SyncOutcome.RETRY_LATER -> Result.retry()
            else -> Result.success()
        }
}

object SyncScheduler {
    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Call after every save/sign-in. Runs as soon as a connection exists; retries with backoff. */
    fun enqueue(context: Context) {
        val req = OneTimeWorkRequestBuilder<SyncWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(context)
            .enqueueUniqueWork("tally-sync", ExistingWorkPolicy.APPEND_OR_REPLACE, req)
    }

    /** Safety net: a periodic sweep even if no one opens the app. */
    fun schedulePeriodic(context: Context) {
        val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).setConstraints(online).build()
        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork("tally-sync-periodic", ExistingPeriodicWorkPolicy.KEEP, req)
    }
}
