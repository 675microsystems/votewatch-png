# Security audit: finding status

Source-code audit only. Nothing below is proven until it passes on a staging Supabase project
(`docs/SECURITY_TEST_PLAN.md` plus `supabase/tests/permission_audit.sql`).

| ID | Finding | Status | What changed |
|---|---|---|---|
| V-01 | Migration 007 outside the migrations folder | Fixed in repo | 007 moved into `supabase/migrations/`. `schema.sql` is now `001_schema.sql`, so a fresh setup is one ordered folder (001 to 008). Do **not** re-run 007 on a database that already applied it: check what is applied first. |
| V-02 | Registration form inserts directly; 007 revokes that | Fixed | `RegisterForm.tsx` calls `register_candidate` with a chosen location id (and `update_my_registration` / `withdraw_my_registration`). Direct insert is gone. |
| V-03 | No rate limit on invitation claims | Fixed in 008 (staging test needed) | 5 failed claims per user per 15 minutes, enforced inside `claim_team_invitation`, with an audit event on lockout. Android maps the new `null` result to an error message. Many-account abuse still needs Auth CAPTCHA. |
| V-04 | Isolation and privileges unverified | Open | `supabase/tests/permission_audit.sql` added, and tests 24-32 added to the plan. Needs a real staging run. |
| V-05 | Legacy teams can stay unscoped | Mitigated in 008 | Approving or reinstating without an electorate is refused. `admin_unscoped_teams()` lists the stragglers and `admin_set_registration_electorate()` fixes them. Existing already-approved NULL teams keep whole-election scope until you map them. |
| V-06 | Registration race | Already covered | `candidate_registrations.user_id` and `teams.registration_id` are both `unique` in the base schema. Test 31 confirms it. |
| V-07 | Grants / definer functions unaudited | Tooling added | `permission_audit.sql`. All `SECURITY DEFINER` functions in the source set `search_path`. `review_candidate_registration` is no longer client-executable (008). |
| V-08 | Old and new tally paths | Already resolved | `submit_tally` is dropped in `003_team_tallies.sql`; the Android app uses `submit_record`. Audit query F confirms it on the live database. |
| Auth C | Raw login error text shown | Fixed | `login/actions.ts` shows a generic message, keeping only "confirm e-mail" and "too many attempts". |
