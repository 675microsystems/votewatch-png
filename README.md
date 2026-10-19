# VoteWatch PNG

Independent, offline-first vote tallying for Papua New Guinea candidate teams. **Not an election result system.**

| Folder | What |
|---|---|
| `src/` | Next.js 15 website (App Router, TypeScript) - landing page, sign-in, live team dashboard. Deploys to Vercel. |
| `supabase/` | Database schema + migrations (run in order: `001_schema.sql` through `010_seed_png_provinces_districts.sql`, all in `supabase/migrations/`). |
| `android/` | Offline-first Kotlin / Compose scrutineer app. Built by GitHub Actions (`.github/workflows/build-apk.yml`). |
| `docs/` | Implementation plan and the original Android/backend README. |

The website and the app share one Supabase project: the dashboard calls the same `my_teams()` and
`dashboard_rollup()` functions and subscribes to Realtime on `tally_records`, all under the signed-in user's RLS.

## Run locally
```bash
cp .env.example .env.local   # fill in project URL + anon key
npm install
npm run dev                  # http://localhost:3000
```
`/api/health` reports whether the env vars are set.

## Deploy: GitHub -> Vercel
1. Push this repo to GitHub.
2. Vercel > Add New > Project > import the repo. Framework is detected as Next.js; root directory is the repo root.
3. Add env vars `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Production + Preview).
4. Supabase > Authentication > URL Configuration: set Site URL to your Vercel domain and add
   `https://*-<team>.vercel.app/**` as a redirect URL for previews.
5. Every push to `main` deploys; every PR gets a preview URL.

Only the **anon** key ever goes in the web app or the APK. Never the service-role key.

## Backend setup
See `docs/ANDROID_AND_BACKEND_README.md` section 1 (create project, run SQL, create an `active` election, load
`locations`, set `app_metadata.platform_role = 'admin'` for admins). Android build notes are there too; the
APK workflow now runs inside `android/`, so add `SUPABASE_URL` and `SUPABASE_ANON_KEY` as GitHub Actions secrets.

## Pages and who uses them
| Page | Who | Purpose |
|---|---|---|
| `/`, `/signup`, `/login`, `/forgot-password`, `/reset-password` | everyone | Account creation and recovery. E-mail links return via `/auth/callback`. |
| `/register` | any signed-in user | Register a candidacy (choose your district or province from the list), see approval status, edit or withdraw while pending, fix and resubmit if rejected. |
| `/team` | approved candidate / team admin | Create and revoke invitation codes, see the scrutineer roster, remove or reinstate people, promote team admins. |
| `/dashboard` | approved candidate / team admin (admins: `?team=`) | Live results for the team's own electorate by district / LLG / ward / polling place (province too for Governor candidates), plus a review queue for duplicate records. |
| `/admin` | platform admins | Approvals, teams, elections, locations, audit log. |

Setup notes: `docs/SUPABASE_AUTH_SETUP.md` (do first), `docs/ANDROID_BUILD_ONLINE.md`, `docs/SECURITY_TEST_PLAN.md`.

## Admin console (`/admin`)
For platform administrators only (`app_metadata.platform_role = 'admin'`). Tabs:
- **Overview:** pending registrations, teams, scrutineers, record counts, records needing review.
- **Registrations:** approve (creates the team and adds the candidate) or reject with a reason.
- **Teams:** scrutineer count, uploads, last activity; suspend / reinstate; open any team's dashboard read-only;
  create and revoke invitation codes (the code is shown once, only its hash is stored).
- **Elections:** create elections and move them through setup > active > closed > archived (opening needs no location dataset) (reopening a closed election needs a written reason). Records created before an election closed are still accepted for 30 days so offline devices can finish syncing.
- **Locations:** import the election geography from CSV into a *draft* dataset (validated: parents, nesting, duplicates, required source citation), review counts, then activate. See `docs/LOCATION_DATA_SOURCES.md` for official sources and current data status.
- **Audit log:** append-only history of admin and team actions, with filter and paging.

All writes go through `admin_*` functions in `supabase/migrations/004_admin_console.sql`. Each one re-checks the
caller's JWT in the database, so the page is a convenience, not the security boundary, and no service-role key is
used. To make someone an admin, run in the SQL editor (they must sign out and in again):
```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"platform_role":"admin"}' where email = 'you@example.com';
```

## Roadmap (website)
- LLG / ward / polling-place data (waiting on NSO and PNGEC)
- Rate limiting on invitation claims; privacy and terms pages
- Coverage by scrutineer and discrepancy reports; web entry of tallies

## Release gate
Unchanged from the Android README: test RLS with separate admin / candidate / scrutineer accounts in staging,
add rate limiting, verify location data against PNGEC/NSO, and get an independent security review before real use.

## How tallies are counted (migration 007)
- A team is tied to **one electorate** (a district for Open candidates, a province for Governor candidates). The dashboard, uploads and the
  location list the Android app downloads are limited to it.
- Totals count **one record per polling place**: a leader-verified record if there is one, otherwise the most recent. If a second record arrives for
  the same place it is flagged "needs review" and listed in the dashboard's review panel, where the candidate or a team admin keeps one (with a note).
- A **suspended** team loses dashboard, roster, invitation and upload access in the database itself, not just in the UI.
