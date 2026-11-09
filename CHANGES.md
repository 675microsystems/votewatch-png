# Cleanup and fixes (review follow-up)

## Repo layout
- Rebuilt a proper tree: `src/`, `supabase/migrations/` (001–010), `supabase/tests/`, `android/`, `docs/`, `.github/workflows/`.
- `download` -> `.gitignore`; `env.example` -> `.env.example`; workflows moved into `.github/workflows/`.
- Newer files that were only at the zip root are now in `src/`: `admin/AdminConsole.tsx`, `admin/Elections.tsx`,
  `register/RegisterForm.tsx`, `register/page.tsx`. Migrations 009 and 010 added to `supabase/migrations/`.
- Docs and `permission_audit.sql` use the newer root versions. Duplicate root-level Kotlin/Gradle/CSV copies removed.

## Code
- Dashboard defaults to "By district" (LLG/ward/polling-place data is not loaded yet) and shows a message for empty levels.
- Dashboard re-syncs when the realtime channel (re)subscribes; sortable headers are real buttons with `aria-sort`.
- `lib/errors.ts`: sign-up and dashboard errors no longer echo raw Supabase/Postgres text; sign-up no longer reveals existing accounts.
  Admin-console screens still show the detailed database message on purpose (admins need it).
- `getViewer()` wrapped in React `cache()` (one lookup per request).
- Security headers: CSP (Supabase origin taken from env), HSTS, Permissions-Policy, plus the existing three.
- Added `robots.ts`, `not-found.tsx`, `error.tsx`. `mark.png` resized (300 KB -> 220 KB).

## Database
- `003_team_tallies.sql`: realtime publication step is now safe to re-run.
  (Do not re-run 007 on a database that already applied it, as before.)

## Second round
- **Dependencies:** `next` ^15.5.29 with a `postcss` ^8.5.32 override. `npm audit --omit=dev` now reports 0 vulnerabilities; the build and typecheck pass.
  Dev tooling: Vitest is on 5.x (the 3.x line had critical advisories). One moderate advisory remains in `minimatch` inside the lint tooling (dev-only, never shipped; forcing a newer minimatch breaks ESLint, so wait for typescript-eslint to update). Node 22.12+ is now the minimum (package `engines` and CI matrix 22/24).
  (The override is needed because Next pins an older PostCSS; remove it once a Next release ships a patched one.)
- **Lint and tests:** ESLint (`npm run lint`) and Vitest (`npm test`, 36 tests: redirect guard, CSV parsing and formula-injection
  guard, error mapping, team labels, rollup maths, the shipped 22-province / 96-district CSV, CAPTCHA helpers). `npm run check`
  runs all three with the typecheck; CI does too. `csvCell` and `enrich` moved out of `Dashboard.tsx` into `lib/` to be testable.
- **Privacy and terms:** `/privacy` and `/terms` (drafts) with a footer, a consent line on sign-up, and operator details from env vars.
  A visible DRAFT banner stays until `NEXT_PUBLIC_LEGAL_REVIEWED=true`. Retention and liability sections are placeholders.
- **Android:** release signing config (env / `local.properties`), R8 + resource shrinking with `proguard-rules.pro`, a manual
  "release" option in the APK workflow, and `docs/ANDROID_RELEASE_SIGNING.md`. Not test-built here (no Android SDK): do one
  release build and smoke test it on a phone.
- **CAPTCHA (website):** optional Cloudflare Turnstile on sign-up, sign-in and forgot-password, enabled only when
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set; CSP adjusts automatically. Must be enabled in Supabase at the same time.

## Left for you
- Staging RLS test run (`docs/SECURITY_TEST_PLAN.md`, `supabase/tests/permission_audit.sql`).
- Turn CAPTCHA on in Cloudflare/Supabase/Vercel, and decide how scrutineer sign-in in the Android app is handled.
- Independent security review.
- Lawyer review of the privacy notice and terms; fill in retention, liability and governing law.
- Create the Android keystore, add the CI secrets, and test the release build.

## 0.6.0
- New logo set (mark tile, lockup, OG image, app icon).
- Light/dark theme with a header toggle (saved per browser, defaults to system setting).
- Homepage is now the live dashboard for signed-in candidates and team admins; /dashboard redirects to /.
- Sign-in and password reset now land on the homepage.
