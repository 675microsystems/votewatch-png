package pg.scrutineer.tally

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

private const val DISCLAIMER =
    "Team tally only. Not an official election result and not a substitute for the Electoral Commission's count."

private fun typeLabel(type: String) = when (type) {
    "province" -> "Province"
    "district" -> "District"
    "llg" -> "LLG"
    "ward" -> "Ward"
    "locality" -> "Village / locality"
    "polling_place" -> "Polling place"
    "counting_centre" -> "Counting centre"
    else -> type
}

private fun fmt(ms: Long) = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.ROOT).format(Date(ms))

@Composable
fun AppRoot(vm: AppViewModel = viewModel()) {
    val session by vm.session.collectAsState()
    val team by vm.activeTeam.collectAsState()
    val message by vm.message.collectAsState()
    val busy by vm.busy.collectAsState()

    Frame(message, busy, vm::clearMessage) {
        when {
            session == null -> AuthScreen(vm)
            team == null -> JoinTeamScreen(vm)
            else -> MainScreen(vm, team!!)
        }
    }
}

/** Shared frame: busy indicator + dismissible message dialog. */
@Composable
private fun Frame(message: String?, busy: Boolean, onDismiss: () -> Unit, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize()) {
        if (busy) CircularProgressIndicator(Modifier.padding(8.dp))
        Column(Modifier.weight(1f)) { content() }
    }
    if (message != null) {
        AlertDialog(
            onDismissRequest = onDismiss,
            confirmButton = { TextButton(onClick = onDismiss) { Text("OK") } },
            text = { Text(message) }
        )
    }
}

// ---------------------------------------------------------------- Auth

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AuthScreen(vm: AppViewModel) {
    var signUp by remember { mutableStateOf(false) }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    Scaffold(topBar = { TopAppBar(title = { Text("VoteWatch PNG") }) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Text(if (signUp) "Create your scrutineer account" else "Sign in", style = MaterialTheme.typography.titleLarge)
            if (!vm.configured) {
                Text(
                    "This build has no backend configured. Set SUPABASE_URL and SUPABASE_ANON_KEY and rebuild.",
                    color = MaterialTheme.colorScheme.error
                )
            }
            if (signUp) OutlinedTextField(name, { name = it }, label = { Text("Your full name") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                email, { email = it }, label = { Text("E-mail") }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(
                password, { password = it }, label = { Text("Password") }, singleLine = true,
                visualTransformation = PasswordVisualTransformation(), modifier = Modifier.fillMaxWidth()
            )
            Button(
                onClick = { if (signUp) vm.signUp(email, password, name) else vm.signIn(email, password) },
                enabled = vm.configured && email.isNotBlank() && password.length >= 6 && (!signUp || name.isNotBlank()),
                modifier = Modifier.fillMaxWidth()
            ) { Text(if (signUp) "Create account" else "Sign in") }
            TextButton(onClick = { signUp = !signUp }) {
                Text(if (signUp) "I already have an account" else "New scrutineer? Create an account")
            }
            Text("You need a team invitation code from your candidate after signing in.", style = MaterialTheme.typography.bodySmall)
            Text(DISCLAIMER, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun JoinTeamScreen(vm: AppViewModel) {
    val teams by vm.teams.collectAsState()
    var code by remember { mutableStateOf("") }
    LaunchedEffect(Unit) { vm.refreshTeams() }
    Scaffold(topBar = { TopAppBar(title = { Text("Join your team") }) }) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            teams.forEach {
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(it.teamName, style = MaterialTheme.typography.titleMedium)
                        Text("${it.candidateName} - ${it.electionName}")
                        Text(
                            if (it.status == "approved") "Active" else "Waiting for administrator approval",
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                }
            }
            Text("Enter the invitation code from your candidate's team administrator.")
            OutlinedTextField(code, { code = it }, label = { Text("Invitation code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = { vm.joinTeam(code) }, enabled = code.isNotBlank(), modifier = Modifier.fillMaxWidth()) { Text("Join team") }
            OutlinedButton(onClick = { vm.refreshTeams() }, modifier = Modifier.fillMaxWidth()) { Text("Refresh status") }
            TextButton(onClick = { vm.signOut() }) { Text("Sign out") }
            Text(DISCLAIMER, style = MaterialTheme.typography.bodySmall)
        }
    }
}

// ---------------------------------------------------------------- Main shell

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainScreen(vm: AppViewModel, team: TeamInfo) {
    var tab by remember { mutableStateOf(0) }
    var correcting by remember { mutableStateOf<TallyRecord?>(null) }
    Scaffold(
        topBar = { TopAppBar(title = { Text(team.candidateName.ifBlank { team.teamName }) }) },
        bottomBar = {
            NavigationBar {
                NavigationBarItem(selected = tab == 0, onClick = { tab = 0; correcting = null }, icon = {}, label = { Text("New tally") })
                NavigationBarItem(selected = tab == 1, onClick = { tab = 1 }, icon = {}, label = { Text("Records") })
                NavigationBarItem(selected = tab == 2, onClick = { tab = 2 }, icon = {}, label = { Text("Account") })
            }
        }
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            when (tab) {
                0 -> TallyForm(vm, team, correcting) { correcting = null; tab = 1 }
                1 -> RecordsTab(vm) { correcting = it; tab = 0 }
                else -> AccountTab(vm, team)
            }
        }
    }
}

// ---------------------------------------------------------------- Pickers

@Composable
private fun PickerField(label: String, options: List<Pair<String, String>>, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    OutlinedButton(onClick = { query = ""; open = true }, modifier = Modifier.fillMaxWidth()) { Text("Select $label") }
    if (open) {
        AlertDialog(
            onDismissRequest = { open = false },
            confirmButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
            title = { Text(label) },
            text = {
                Column {
                    OutlinedTextField(query, { query = it }, label = { Text("Search") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    val shown = options.filter { it.second.contains(query, ignoreCase = true) }
                    LazyColumn(Modifier.heightIn(max = 320.dp)) {
                        items(shown) { (id, name) ->
                            TextButton(onClick = { open = false; onPick(id) }, modifier = Modifier.fillMaxWidth()) { Text(name) }
                        }
                    }
                }
            }
        )
    }
}

@Composable
private fun LocationPicker(vm: AppViewModel, electionId: String, path: List<LocationEntity>, onPath: (List<LocationEntity>) -> Unit) {
    val last = path.lastOrNull()
    var options by remember(electionId, last?.id) { mutableStateOf<List<LocationEntity>?>(null) }
    LaunchedEffect(electionId, last?.id) {
        options = if (last == null) vm.roots(electionId) else vm.children(last.id)
    }
    path.forEachIndexed { i, loc ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("${typeLabel(loc.type)}: ${loc.name}", modifier = Modifier.weight(1f))
            TextButton(onClick = { onPath(path.take(i)) }) { Text("Change") }
        }
    }
    val opts = options
    if (opts != null) {
        if (opts.isEmpty()) {
            if (path.isEmpty()) Text("No location data on this device. Open Account and download election data while online.", color = MaterialTheme.colorScheme.error)
        } else {
            PickerField(typeLabel(opts.first().type), opts.map { it.id to it.name }) { id ->
                opts.firstOrNull { it.id == id }?.let { onPath(path + it) }
            }
        }
    }
}

// ---------------------------------------------------------------- Tally form

private val POLLING_TYPES = setOf("polling_place", "counting_centre")

@Composable
private fun TallyForm(vm: AppViewModel, team: TeamInfo, correcting: TallyRecord?, onSaved: () -> Unit) {
    val key = correcting?.clientRecordId
    var path by remember(key) { mutableStateOf<List<LocationEntity>>(emptyList()) }
    var kind by remember(key) { mutableStateOf(correcting?.kind ?: RecordKind.POLLING_TALLY) }
    var votes by remember(key) { mutableStateOf(correcting?.candidateVotes?.toString() ?: "") }
    var cast by remember(key) { mutableStateOf(correcting?.totalVotesCast?.toString() ?: "") }
    var sourceRef by remember(key) { mutableStateOf(correcting?.sourceReference ?: "") }
    var notes by remember(key) { mutableStateOf("") }
    var reason by remember(key) { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var confirm by remember { mutableStateOf<Draft?>(null) }
    val who = team.candidateName.ifBlank { "your candidate" }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text(if (correcting != null) "Correction" else "Record votes for $who", style = MaterialTheme.typography.titleLarge)
        Text(DISCLAIMER, style = MaterialTheme.typography.bodySmall)

        if (correcting != null) {
            Text("${kindLabel(correcting.kind)}: ${correcting.locationPath}")
            Text("The original record is kept. This creates a new linked record.", style = MaterialTheme.typography.bodySmall)
            OutlinedTextField(reason, { reason = it }, label = { Text("Reason for correction (required)") }, modifier = Modifier.fillMaxWidth())
        } else {
            Text("What are you recording?")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = kind == RecordKind.POLLING_TALLY, onClick = { kind = RecordKind.POLLING_TALLY; path = emptyList() }, label = { Text("My polling place tally") })
                FilterChip(selected = kind == RecordKind.OFFICIAL_FIGURE, onClick = { kind = RecordKind.OFFICIAL_FIGURE; path = emptyList() }, label = { Text("Official count figure") })
            }
            Text(
                if (kind == RecordKind.POLLING_TALLY) "Pick the polling place down to the last level."
                else "Copy the figure announced by the Electoral Commission. Pick the ward, LLG, district or province it applies to, then tap Use this level.",
                style = MaterialTheme.typography.bodySmall
            )
            LocationPicker(vm, team.electionId, path) { path = it }
            if (kind == RecordKind.OFFICIAL_FIGURE && path.isNotEmpty()) {
                Text("Selected level: ${typeLabel(path.last().type)} - ${path.last().name}", style = MaterialTheme.typography.bodySmall)
            }
        }

        HorizontalDivider()
        OutlinedTextField(
            votes, { votes = it.filter(Char::isDigit).take(8) }, label = { Text("Votes $who collected here") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            cast, { cast = it.filter(Char::isDigit).take(8) }, label = { Text("Total people who voted here (all candidates)") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number), modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(sourceRef, { sourceRef = it }, label = { Text("Count sheet / ballot box reference (optional)") }, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(notes, { notes = it }, label = { Text("Notes (optional)") }, modifier = Modifier.fillMaxWidth())

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

        Button(
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                error = null
                val locId: String; val locPath: String; val locType: String; val k: String
                if (correcting != null) {
                    locId = correcting.locationId; locPath = correcting.locationPath
                    locType = correcting.locationType; k = correcting.kind
                    if (reason.isBlank()) { error = "Enter the reason for the correction."; return@Button }
                } else {
                    val lowest = path.lastOrNull()
                    if (lowest == null) { error = "Choose a location first."; return@Button }
                    if (kind == RecordKind.POLLING_TALLY && lowest.type !in POLLING_TYPES) {
                        error = "Keep selecting until you reach the polling place."; return@Button
                    }
                    locId = lowest.id; locPath = path.joinToString(" > ") { it.name }
                    locType = lowest.type; k = kind
                }
                val v = votes.toIntOrNull(); val c = cast.toIntOrNull()
                if (v == null || c == null) { error = "Enter the votes and the total votes cast."; return@Button }
                if (v > c) { error = "Votes for $who cannot be more than the total votes cast."; return@Button }
                confirm = Draft(
                    locId, locPath, locType, k, v, c, sourceRef, notes,
                    correctionOf = correcting?.clientRecordId,
                    correctionReason = if (correcting != null) reason else null
                )
            }
        ) { Text(if (correcting != null) "Review correction" else "Review and save") }
        if (correcting != null) OutlinedButton(onClick = onSaved, modifier = Modifier.fillMaxWidth()) { Text("Cancel correction") }
    }

    confirm?.let { d ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = { Text("Confirm") },
            text = {
                Column(Modifier.verticalScroll(rememberScrollState())) {
                    Text(kindLabel(d.kind), style = MaterialTheme.typography.titleSmall)
                    Text(d.locationPath)
                    Text("$who: ${d.candidateVotes} of ${d.totalVotesCast} votes cast (${sharePct(d.candidateVotes, d.totalVotesCast)})")
                    Text("Saved records are never edited; mistakes are fixed with a linked correction.", style = MaterialTheme.typography.bodySmall)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    confirm = null
                    vm.saveTally(d) { votes = ""; cast = ""; notes = ""; path = emptyList(); onSaved() }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { confirm = null }) { Text("Back") } }
        )
    }
}

// ---------------------------------------------------------------- Records

@Composable
private fun RecordsTab(vm: AppViewModel, onCorrect: (TallyRecord) -> Unit) {
    val records by vm.records.collectAsState()
    val pending by vm.pendingCount.collectAsState()
    val failed by vm.failedCount.collectAsState()

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Records on this device", style = MaterialTheme.typography.titleLarge)
        Text("$pending waiting to upload, $failed rejected by server")
        Button(onClick = { vm.syncNow() }, enabled = pending + failed > 0, modifier = Modifier.fillMaxWidth()) {
            Text(if (failed > 0) "Retry and sync now" else "Sync now")
        }

        val tallies = records.filter { !it.supersededLocally && it.kind == RecordKind.POLLING_TALLY }
        if (tallies.isNotEmpty()) {
            val v = tallies.sumOf { it.candidateVotes }
            val c = tallies.sumOf { it.totalVotesCast }
            Text("My tallies on this device (unofficial)", style = MaterialTheme.typography.titleMedium)
            Text("${tallies.size} polling places: $v of $c votes cast (${sharePct(v, c)})")
            HorizontalDivider()
        }
        if (records.isEmpty()) Text("No records yet.")
        records.forEach { r ->
            ElevatedCard(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(r.locationPath, style = MaterialTheme.typography.titleSmall)
                    Text(kindLabel(r.kind), style = MaterialTheme.typography.bodySmall)
                    val badge = when {
                        r.supersededLocally -> "Superseded by a correction"
                        r.syncState == SyncState.SYNCED -> "Uploaded" + (r.serverStatus?.let { " ($it)" } ?: "")
                        r.syncState == SyncState.FAILED -> "Rejected: ${r.lastError.orEmpty()}"
                        else -> "Waiting to upload" + (r.lastError?.let { " - $it" } ?: "")
                    }
                    Text(badge, style = MaterialTheme.typography.bodySmall,
                        color = if (r.syncState == SyncState.FAILED) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary)
                    Text("${r.candidateVotes} of ${r.totalVotesCast} votes cast (${sharePct(r.candidateVotes, r.totalVotesCast)}) | ${fmt(r.deviceCreatedAt)}")
                    if (r.supersedesClientRecordId != null) Text("Correction: ${r.correctionReason.orEmpty()}", style = MaterialTheme.typography.bodySmall)
                    if (!r.supersededLocally) TextButton(onClick = { onCorrect(r) }) { Text("Create correction") }
                }
            }
        }
        Text(DISCLAIMER, style = MaterialTheme.typography.bodySmall)
    }
}

// ---------------------------------------------------------------- Account

@Composable
private fun AccountTab(vm: AppViewModel, team: TeamInfo) {
    val session by vm.session.collectAsState()
    val info by vm.directoryInfo.collectAsState()
    LaunchedEffect(team.electionId) { vm.refreshDirectoryInfo(team.electionId) }

    val csvLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        if (uri != null) vm.exportCsvTo(uri)
    }
    val pdfLauncher = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/pdf")) { uri ->
        if (uri != null) vm.exportPdfTo(uri)
    }

    Column(
        Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Text("Account", style = MaterialTheme.typography.titleLarge)
        Text("Signed in as ${session?.email.orEmpty()}")
        Text("Team: ${team.teamName} (${team.role})")
        Text("Election: ${team.electionName}")
        HorizontalDivider()
        Text("Election data for offline use", style = MaterialTheme.typography.titleMedium)
        Text(info)
        Text("Download this while you have a connection, before going to the field.", style = MaterialTheme.typography.bodySmall)
        Button(onClick = { vm.downloadDirectory() }, modifier = Modifier.fillMaxWidth()) { Text("Download election data") }
        HorizontalDivider()
        Text("Export what is on this device", style = MaterialTheme.typography.titleMedium)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = { csvLauncher.launch("votewatch-png.csv") }, modifier = Modifier.weight(1f)) { Text("Export CSV") }
            OutlinedButton(onClick = { pdfLauncher.launch("votewatch-png.pdf") }, modifier = Modifier.weight(1f)) { Text("Export PDF") }
        }
        HorizontalDivider()
        OutlinedButton(onClick = { vm.signOut() }, modifier = Modifier.fillMaxWidth()) { Text("Sign out") }
        Text("Signing out keeps unsent records on this phone; they upload after you sign in again.", style = MaterialTheme.typography.bodySmall)
        Text(DISCLAIMER, style = MaterialTheme.typography.bodySmall)
    }
}
