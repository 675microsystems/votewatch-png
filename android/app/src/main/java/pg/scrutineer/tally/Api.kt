package pg.scrutineer.tally

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class ApiException(val code: Int, message: String) : Exception(message)

data class AuthSession(
    val userId: String,
    val email: String,
    val accessToken: String,
    val refreshToken: String,
    val expiresAtMs: Long
)

data class TeamInfo(
    val teamId: String,
    val teamName: String,
    val role: String,
    val status: String,
    val electionId: String,
    val electionName: String,
    val candidateName: String,
    val candidateType: String
) {
    fun toJson(): JSONObject = JSONObject()
        .put("teamId", teamId).put("teamName", teamName).put("role", role).put("status", status)
        .put("electionId", electionId).put("electionName", electionName)
        .put("candidateName", candidateName).put("candidateType", candidateType)

    companion object {
        fun fromJson(o: JSONObject) = TeamInfo(
            o.getString("teamId"), o.getString("teamName"), o.getString("role"), o.getString("status"),
            o.getString("electionId"), o.getString("electionName"),
            o.optString("candidateName"), o.optString("candidateType")
        )
    }
}

private fun JSONObject.strOrNull(key: String): String? = if (isNull(key)) null else getString(key)

/** Tokens and cached team info live in AES-256 encrypted preferences. */
class SessionStore(context: Context) {
    private val prefs = run {
        val key = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context.applicationContext, "secure_session", key,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    private val _session = MutableStateFlow(readSession())
    val session: StateFlow<AuthSession?> = _session

    private val _teams = MutableStateFlow(readTeams())
    val teams: StateFlow<List<TeamInfo>> = _teams

    private fun readSession(): AuthSession? {
        val uid = prefs.getString("uid", null) ?: return null
        return AuthSession(
            uid, prefs.getString("email", "") ?: "", prefs.getString("at", "") ?: "",
            prefs.getString("rt", "") ?: "", prefs.getLong("exp", 0L)
        )
    }

    private fun readTeams(): List<TeamInfo> = try {
        val arr = JSONArray(prefs.getString("teams", "[]"))
        (0 until arr.length()).map { TeamInfo.fromJson(arr.getJSONObject(it)) }
    } catch (e: Exception) { emptyList() }

    fun save(s: AuthSession, displayName: String?) {
        val editor = prefs.edit()
        editor.putString("uid", s.userId)
        editor.putString("email", s.email)
        editor.putString("at", s.accessToken)
        editor.putString("rt", s.refreshToken)
        editor.putLong("exp", s.expiresAtMs)
        if (displayName != null) editor.putString("name", displayName)
        editor.apply()
        _session.value = s
    }

    fun displayName(): String? = prefs.getString("name", null)

    fun saveTeams(list: List<TeamInfo>) {
        val arr = JSONArray(); list.forEach { arr.put(it.toJson()) }
        prefs.edit().putString("teams", arr.toString()).apply()
        _teams.value = list
    }

    fun setDirectoryDownloadedAt(electionId: String, at: Long) { prefs.edit().putLong("dir_$electionId", at).apply() }
    fun directoryDownloadedAt(electionId: String): Long = prefs.getLong("dir_$electionId", 0L)

    /** Signing out keeps unsynced records in the local database. */
    fun clear() {
        prefs.edit().remove("uid").remove("email").remove("at").remove("rt").remove("exp")
            .remove("name").remove("teams").apply()
        _session.value = null
        _teams.value = emptyList()
    }
}

/** Minimal Supabase client (Auth + PostgREST) using only the platform HTTP stack. */
class SupabaseApi(private val store: SessionStore) {
    private val base = BuildConfig.SUPABASE_URL.trimEnd('/')
    private val anon = BuildConfig.SUPABASE_ANON_KEY
    val configured: Boolean get() = base.isNotBlank() && anon.isNotBlank()
    private val refreshLock = Mutex()

    private fun request(method: String, path: String, body: String?, token: String?, extra: Map<String, String> = emptyMap()): Pair<Int, String> {
        val conn = URL(base + path).openConnection() as HttpURLConnection
        try {
            conn.requestMethod = method
            conn.connectTimeout = 15_000
            conn.readTimeout = 30_000
            conn.setRequestProperty("apikey", anon)
            conn.setRequestProperty("Authorization", "Bearer " + (token ?: anon))
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Accept", "application/json")
            extra.forEach { (k, v) -> conn.setRequestProperty(k, v) }
            if (body != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            return code to text
        } finally {
            conn.disconnect()
        }
    }

    private fun errorMessage(text: String): String = try {
        val o = JSONObject(text)
        listOf("msg", "message", "error_description", "error")
            .map { o.optString(it) }.firstOrNull { it.isNotBlank() } ?: text.take(200)
    } catch (e: Exception) { text.take(200) }

    private fun parseSession(o: JSONObject): Pair<AuthSession, String?> {
        val user = o.getJSONObject("user")
        val expiresIn = o.optLong("expires_in", 3600L)
        val name = user.optJSONObject("user_metadata")?.optString("display_name")?.takeIf { it.isNotBlank() }
        return AuthSession(
            user.getString("id"), user.optString("email"),
            o.getString("access_token"), o.getString("refresh_token"),
            System.currentTimeMillis() + expiresIn * 1000
        ) to name
    }

    // ---- Auth ----

    /** Returns true when signed in immediately, false when e-mail confirmation is still required. */
    suspend fun signUp(email: String, password: String, displayName: String): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email).put("password", password)
            .put("data", JSONObject().put("display_name", displayName)).toString()
        val (code, text) = request("POST", "/auth/v1/signup", body, null)
        if (code !in 200..299) throw ApiException(code, errorMessage(text))
        val o = JSONObject(text)
        if (o.has("access_token")) {
            val (s, n) = parseSession(o); store.save(s, n ?: displayName); true
        } else false
    }

    suspend fun signIn(email: String, password: String): AuthSession = withContext(Dispatchers.IO) {
        val body = JSONObject().put("email", email).put("password", password).toString()
        val (code, text) = request("POST", "/auth/v1/token?grant_type=password", body, null)
        if (code !in 200..299) throw ApiException(code, errorMessage(text))
        val (s, n) = parseSession(JSONObject(text))
        store.save(s, n); s
    }

    private fun refreshBlocking(current: AuthSession): AuthSession {
        val body = JSONObject().put("refresh_token", current.refreshToken).toString()
        val (code, text) = request("POST", "/auth/v1/token?grant_type=refresh_token", body, null)
        if (code == 400 || code == 401 || code == 403) {
            store.clear()
            throw ApiException(401, "Your session expired. Please sign in again.")
        }
        if (code !in 200..299) throw ApiException(code, errorMessage(text))
        val (s, _) = parseSession(JSONObject(text))
        store.save(s, null); return s
    }

    private suspend fun validToken(forceRefresh: Boolean = false): String = refreshLock.withLock {
        val s = store.session.value ?: throw ApiException(401, "Not signed in")
        if (forceRefresh || s.expiresAtMs - System.currentTimeMillis() < 60_000) {
            withContext(Dispatchers.IO) { refreshBlocking(s) }.accessToken
        } else s.accessToken
    }

    private suspend fun authed(method: String, path: String, body: String? = null, extra: Map<String, String> = emptyMap()): String {
        var token = validToken()
        var (code, text) = withContext(Dispatchers.IO) { request(method, path, body, token, extra) }
        if (code == 401) {
            token = validToken(forceRefresh = true)
            val retry = withContext(Dispatchers.IO) { request(method, path, body, token, extra) }
            code = retry.first; text = retry.second
        }
        if (code !in 200..299) throw ApiException(code, errorMessage(text))
        return text
    }

    // ---- App endpoints ----

    suspend fun ensureProfile(displayName: String) {
        val uid = store.session.value?.userId ?: return
        val body = JSONObject().put("user_id", uid).put("display_name", displayName.ifBlank { "Scrutineer" }).toString()
        authed("POST", "/rest/v1/profiles?on_conflict=user_id", body,
            mapOf("Prefer" to "resolution=ignore-duplicates,return=minimal"))
    }

    suspend fun fetchMyTeams(): List<TeamInfo> {
        val arr = JSONArray(authed("POST", "/rest/v1/rpc/my_teams", "{}"))
        return (0 until arr.length()).map {
            val o = arr.getJSONObject(it)
            TeamInfo(
                o.getString("team_id"), o.getString("team_name"), o.getString("member_role"),
                o.getString("team_status"), o.getString("election_id"), o.getString("election_name"),
                o.optString("candidate_name"), o.optString("candidate_type")
            )
        }
    }

    /** The server stores SHA-256(UPPERCASE(trimmed code)); the raw code never leaves the device. */
    suspend fun claimInvitation(rawCode: String): String {
        val normalised = rawCode.trim().uppercase()
        val hash = MessageDigest.getInstance("SHA-256").digest(normalised.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        val body = JSONObject().put("p_code_hash", hash).toString()
        val result = authed("POST", "/rest/v1/rpc/claim_team_invitation", body).trim().trim('"')
        // Migration 008: an invalid code now comes back as JSON null (so the failed attempt can be counted) instead of an error.
        if (result.isEmpty() || result == "null") throw ApiException(400, "Invitation is invalid, expired, or fully used")
        return result
    }

    private suspend fun pagedGet(path: String): List<JSONObject> {
        val out = ArrayList<JSONObject>()
        var offset = 0
        val page = 1000
        while (true) {
            val arr = JSONArray(authed("GET", "$path&limit=$page&offset=$offset"))
            for (i in 0 until arr.length()) out.add(arr.getJSONObject(i))
            if (arr.length() < page) break
            offset += page
        }
        return out
    }

    suspend fun fetchLocations(electionId: String): List<LocationEntity> =
        pagedGet("/rest/v1/locations?election_id=eq.$electionId&active=eq.true&select=id,parent_id,location_type,name,official_code&order=id").map {
            LocationEntity(it.getString("id"), electionId, it.strOrNull("parent_id"),
                it.getString("location_type"), it.getString("name"), it.strOrNull("official_code"))
        }

    /** Returns the server's JSON reply: {record_id, duplicate, status}. */
    suspend fun submitRecord(payload: JSONObject): JSONObject =
        JSONObject(authed("POST", "/rest/v1/rpc/submit_record", JSONObject().put("p_payload", payload).toString()))
}
