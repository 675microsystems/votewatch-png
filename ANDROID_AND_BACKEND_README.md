# VoteWatch PNG - Android app v0.3

Offline-first Android app (Kotlin, Jetpack Compose, Room, WorkManager) for scrutineers to record
independent tallies and upload them to a candidate's team backend (Supabase) when online.

**Status:** source-complete but NOT yet compiled or field-tested. Expect to fix a few compile errors on
first build. Not production-ready: see "Before real use".

## What this is (and is not)
A campaign-side tally tool. It is **not** an election result system. Scrutineers record only their own
candidate; the candidate / team admin sees only their own votes. Official figures are the Electoral
Commission's and are entered separately for comparison.

## What works in this version
- Individual e-mail/password accounts (Supabase Auth); tokens in AES-256 encrypted preferences
- Join a team with an invitation code (hashed on-device, claimed via `claim_team_invitation`)
- Download election geography once while online; use it fully offline
- **Polling place tally:** pick Province > District > LLG > Ward > ... > Polling place, then enter
  *votes your candidate collected* and *total people who voted there*
- **Official count figure:** the same two numbers copied from the Electoral Commission's announcement,
  at any level (ward, LLG, district, province), so the team can compare tally vs official
- Every record gets a UUID on the device; saved locally first, queued, uploaded by WorkManager with
  exponential backoff. The server dedupes retries, so a bad connection can never double-count
- Records are never edited or deleted. Mistakes are fixed with a linked **correction** that needs a reason
- Server: 100-scrutineer cap, role checks, approved-team check, duplicate/conflict flagging (`needs_review`),
  append-only audit events, `dashboard_rollup()` for the candidate / team admin, Realtime enabled
- Per-record sync status, retry, sync-now; CSV (formula-injection-safe) and PDF export from the device

## Not built yet
- Team + invitation management and candidate approval screens (need trusted server endpoints)
- Candidate registration and admin approval screens
- Loading the official PNGEC/NSO geography (including polling places) into `locations`
- SQLCipher-encrypted local database, app lock

## Team dashboard (`web/dashboard.html`)
Single static page for the candidate / team admin. Edit the two constants at the top (project URL and
**anon** key), then host it anywhere that serves HTTPS (Netlify, Cloudflare Pages, GitHub Pages) or open it
from your computer. Sign in with the candidate or team-admin account. It shows your own votes, total voted,
share, polling places reported, official figure and difference, by province / district / LLG / ward /
polling place; sorts to show strongest and weakest areas; updates live; exports CSV; prints to PDF.

## 1. Set up the backend
1. Create a Supabase project (use a staging project first).
2. SQL editor, in order: `supabase/migrations/001_schema.sql`, then `002`, `003` ... in order (see the README for the full list).
3. Create an `elections` row with `status = 'active'` and load `locations` (the polling places must be in it).
4. Platform admins: set `app_metadata.platform_role = 'admin'` on the admin user (server-side only).
5. Invitation codes are stored as `sha256(UPPERCASE(trimmed code))` in hex in `team_invitations.code_hash`.
6. Auth settings: decide whether e-mail confirmation is required; the app handles both.
7. Copy the project URL and the **anon** key. Never put the service-role key in the app.

## 2. Get an APK - option A: no Android Studio (GitHub)
1. Create a private GitHub repo and upload this whole folder.
2. Repo > Settings > Secrets and variables > Actions: add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
3. Actions tab > "Build APK" > Run workflow. Download the `VoteWatchPNG-debug-apk` artifact.
4. Copy the `.apk` to a phone and install it (allow "install unknown apps").
If the build fails, open the log and send me the error lines; I will fix the code.

## 2. Get an APK - option B: Android Studio
1. Install Android Studio and open this folder; let Gradle sync (it uses Gradle 8.11.1, JDK 17).
2. Copy `local.properties.example` to `local.properties` and fill in the two values.
3. Run on an emulator/phone, or Build > Build APK(s).

## Before real use (release gate)
Run the SQL in staging and test RLS with separate admin / candidate / scrutineer accounts; add rate limiting;
add encrypted local storage; field-test with weak connectivity and phone restarts mid-sync; verify the
location data against PNGEC/NSO sources; independent security review. See `IMPLEMENTATION_PLAN.md`.
