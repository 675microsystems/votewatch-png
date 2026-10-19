package pg.scrutineer.tally

import android.app.Application
import android.net.Uri
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException
import java.util.UUID

data class Draft(
    val locationId: String,
    val locationPath: String,
    val locationType: String,
    val kind: String,
    val candidateVotes: Int,
    val totalVotesCast: Int,
    val sourceRef: String,
    val notes: String,
    val correctionOf: String? = null,
    val correctionReason: String? = null
)

class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val graph = Graph.get(app)
    private val tallyDao = graph.db.tallyDao()
    private val dirDao = graph.db.directoryDao()

    val configured: Boolean get() = graph.api.configured
    val session = graph.store.session
    val teams = graph.store.teams

    /** The first approved team the user belongs to. */
    val activeTeam: StateFlow<TeamInfo?> = teams
        .map { list -> list.firstOrNull { it.status == "approved" } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, graph.store.teams.value.firstOrNull { it.status == "approved" })

    val records: StateFlow<List<TallyRecord>> = tallyDao.observeAll()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val pendingCount = tallyDao.observePendingCount().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)
    val failedCount = tallyDao.observeFailedCount().stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val message = MutableStateFlow<String?>(null)
    val busy = MutableStateFlow(false)
    val directoryInfo = MutableStateFlow("")

    private fun launchBusy(block: suspend () -> Unit) = viewModelScope.launch {
        busy.value = true
        try {
            block()
        } catch (e: ApiException) {
            message.value = e.message
        } catch (e: IOException) {
            message.value = "No connection. Try again when you are online."
        } catch (e: Exception) {
            message.value = e.message ?: "Something went wrong."
        } finally {
            busy.value = false
        }
    }

    fun clearMessage() { message.value = null }

    // ---- Account ----

    fun signIn(email: String, password: String) = launchBusy {
        val s = graph.api.signIn(email.trim(), password)
        afterSignIn(graph.store.displayName() ?: s.email)
    }

    fun signUp(email: String, password: String, name: String) = launchBusy {
        val signedIn = graph.api.signUp(email.trim(), password, name.trim())
        if (signedIn) afterSignIn(name.trim())
        else message.value = "Account created. Confirm your e-mail address, then sign in."
    }

    private suspend fun afterSignIn(name: String) {
        runCatching { graph.api.ensureProfile(name) }
        runCatching { refreshTeamsInternal() }
        SyncScheduler.enqueue(getApplication())
    }

    private suspend fun refreshTeamsInternal() { graph.store.saveTeams(graph.api.fetchMyTeams()) }

    fun refreshTeams() = launchBusy { refreshTeamsInternal() }

    fun joinTeam(code: String) = launchBusy {
        if (code.isBlank()) { message.value = "Enter the invitation code."; return@launchBusy }
        graph.api.claimInvitation(code)
        refreshTeamsInternal()
        message.value = "You have joined the team."
    }

    fun signOut() { graph.store.clear() }

    // ---- Election data (offline directory) ----

    suspend fun roots(electionId: String) = dirDao.roots(electionId)
    suspend fun children(parentId: String) = dirDao.children(parentId)

    fun refreshDirectoryInfo(electionId: String) {
        viewModelScope.launch {
            val n = dirDao.locationCount(electionId)
            val at = graph.store.directoryDownloadedAt(electionId)
            directoryInfo.value = if (n == 0) "No election data on this device yet."
            else "$n locations (downloaded " +
                java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.ROOT).format(java.util.Date(at)) + ")"
        }
    }

    fun downloadDirectory() = launchBusy {
        val team = activeTeam.value ?: return@launchBusy
        val n = graph.downloadDirectory(team.electionId)
        refreshDirectoryInfo(team.electionId)
        message.value = "Downloaded $n locations for offline use."
    }

    // ---- Tallies ----

    fun saveTally(draft: Draft, onSaved: () -> Unit) {
        viewModelScope.launch {
            val user = session.value
            val team = activeTeam.value
            if (user == null || team == null) { message.value = "Sign in and join an approved team first."; return@launch }
            val rec = TallyRecord(
                clientRecordId = UUID.randomUUID().toString(),
                teamId = team.teamId,
                electionId = team.electionId,
                locationId = draft.locationId,
                locationPath = draft.locationPath,
                locationType = draft.locationType,
                kind = draft.kind,
                candidateVotes = draft.candidateVotes,
                totalVotesCast = draft.totalVotesCast,
                sourceReference = draft.sourceRef.trim(),
                notes = draft.notes.trim(),
                deviceCreatedAt = System.currentTimeMillis(),
                scrutineerUserId = user.userId,
                scrutineerName = graph.store.displayName() ?: user.email,
                supersedesClientRecordId = draft.correctionOf,
                correctionReason = draft.correctionReason?.trim()
            )
            if (draft.correctionOf != null) tallyDao.saveCorrection(rec, draft.correctionOf)
            else tallyDao.insert(rec)
            SyncScheduler.enqueue(getApplication())
            message.value = "Saved on this device. It will upload when you are online."
            onSaved()
        }
    }

    fun syncNow() = launchBusy {
        tallyDao.retryFailed()
        message.value = when (graph.syncPending()) {
            Graph.SyncOutcome.NOTHING_TO_DO -> "Everything is already uploaded."
            Graph.SyncOutcome.ALL_UPLOADED -> "All records uploaded."
            Graph.SyncOutcome.UPLOADED_WITH_REJECTIONS -> "Some records were rejected by the server. See Records for the reason."
            Graph.SyncOutcome.NOT_SIGNED_IN -> "Sign in to upload."
            Graph.SyncOutcome.RETRY_LATER -> {
                SyncScheduler.enqueue(getApplication())
                "Could not reach the server. Upload will retry automatically."
            }
        }
    }

    // ---- Export ----

    fun exportCsvTo(uri: Uri) = launchBusy {
        withContext(Dispatchers.IO) {
            exportCsv(getApplication<Application>().contentResolver, uri, tallyDao.allRecords())
        }
        message.value = "CSV exported."
    }

    fun exportPdfTo(uri: Uri) = launchBusy {
        withContext(Dispatchers.IO) {
            exportPdf(getApplication<Application>().contentResolver, uri, tallyDao.allRecords())
        }
        message.value = "PDF exported."
    }
}
