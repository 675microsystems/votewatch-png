# Security test plan (staging first)

Not yet run: the SQL has never been executed against a database. Do this on a staging Supabase project with fake data, and keep notes.
Have an independent person review the results before any real election data is loaded.

## Test accounts to create
`admin` (platform admin), `candA` (candidate, team A), `candB` (candidate, team B), `scrA1`, `scrA2` (scrutineers, team A), `scrB1` (team B),
and one `stranger` (signed up, no team). Register and approve candA and candB through the website. Create scrutineers by invitation codes.

## Must-pass checks
| # | As | Try | Expected |
|---|---|---|---|
| 1 | stranger | Open `/admin`, `/team`, `/dashboard` | Admin: "Administrators only". Team and dashboard: "no approved team". |
| 2 | candA | Open `/dashboard?team=<team B id>` | Shows only team A (the `team` parameter works for platform admins only). |
| 3 | candA | In the browser console call the API for team B data (see snippet below) | Empty or error, never team B rows. |
| 4 | candA | Call `admin_teams`, `admin_audit`, `admin_create_invitation` | "Administrator permission required". |
| 5 | scrA1 | Call `dashboard_rollup` for team A | "Only the candidate or team admin can view the dashboard". |
| 6 | scrA1 | Call `team_roster`, `team_create_invitation` for team A | Permission error. |
| 7 | candA | `team_set_member_active` on a team B member | Permission error. |
| 8 | candA | Remove own account, or the candidate role | "cannot change your own access". |
| 9 | team admin | Remove the candidate; change a team admin's status | Refused. |
| 10 | candA | Create 21 invitation codes | The 21st is refused. |
| 11 | scrA1 (removed) | Upload a tally from the app | Refused ("not an active scrutineer"). |
| 12 | scrA1 | Upload the same record twice | One record only (idempotent). |
| 13 | any non-admin | Insert directly into `teams`, `team_members`, `audit_events`, `tally_records` | Permission denied. |
| 14 | any | Claim an expired, revoked or used-up code | Refused. |
| 15 | scrA1 | Join team A twice | "You already belong to this team". |
| 16 | candA | Register a second candidacy | Refused (one per account). |
| 17 | stranger | Read another user's `candidate_registrations` | Only own row. |
| 18 | after team suspended | Scrutineer upload; leader dashboard | Upload refused; dashboard refused (enforced in the database from migration 007). |
| 19 | admin | Approve, reject, suspend, activate a dataset | Each writes an `audit_events` row. |
| 20 | any | Open `/login?next=https://example.com` and sign in | Lands on `/dashboard`, never off-site. |

## Added by migration 007 (run these too)
| # | As | Try | Expected |
|---|---|---|---|
| 21 | candA (open candidate, district X) | `dashboard_rollup` at `ward` | Only wards inside district X. `province` level returns no rows. |
| 22 | scrA1 (team A) | `submit_record` for a polling place in another district | Refused: "outside this team's electorate". |
| 23 | scrA1 | Read `locations` directly | Provinces and districts everywhere, but wards / polling places only inside district X. |
| 24 | scrA1, scrA2 | Both upload a tally for the same polling place | Both flagged `needs_review`; dashboard counts only the newest; the review panel lists both. |
| 25 | candA | `resolve_records` keeping one | Kept record is `verified` and counts; the other is `superseded`; empty note is refused; scrutineer and admin are refused. |
| 26 | scrA1 | Two concurrent uploads for one place | Both flagged (no lost flag). |
| 27 | scrA1 | Correct a record that was already corrected | Stored as `needs_review`, not rejected. |
| 28 | admin | Close an election, then sync a record created BEFORE the close | Accepted. A record created AFTER the close, or uploaded 30+ days later, is refused. |
| 29 | admin | Move closed to active without a reason; archived to anything | Both refused. (Opening from setup no longer needs a location dataset, migration 009.) |
| 30 | admin | Suspend a team, then as candA call `dashboard_rollup`, `team_roster`, select `tally_records` | All refused / empty. Realtime stops delivering. `/register` shows "Suspended". |
| 31 | any user | Insert directly into `candidate_registrations` | Permission denied. `register_candidate` with a district for a Governor candidate (or the reverse) is refused. |
| 32 | candA | Edit a pending registration; resubmit a rejected one; withdraw a pending one | Each works, audit-logged. Editing an approved registration is refused. |
| 33 | admin | Activate a new dataset version while registrations exist | Registrations are re-pointed by `import_key`; if any electorate is missing the activation is refused. |

## Calling the API as a user (browser console on the signed-in site)
Open the site, press F12 > Console, and use the site's own session. The simplest way is to test through the UI. For direct calls, in Supabase
SQL editor you can impersonate a user for one statement block:
```sql
begin;
select set_config('request.jwt.claims', '{"sub":"<user uuid>","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
select * from public.dashboard_rollup('<team uuid>', 'province');   -- expect an error for non-leaders
rollback;
```
For platform-admin tests set `"app_metadata":{"platform_role":"admin"}` in the claims.

## Added by migration 008 (run these too)
| # | As | Try | Expected |
|---|---|---|---|
| 24 | any signed-in user | `claim_team_invitation` with a wrong code 5 times, then a 6th time (even with a correct code) | First 5 return `null` (the app says invalid). The 6th raises "Too many failed attempts". Correct code works again after 15 minutes. |
| 25 | any signed-in user | Fire 20 wrong claims in parallel | At most 5 are counted before the lockout; none succeed. |
| 26 | admin | Check `audit_events` after test 24 | One `team.invitation_claim_lockout` row for that user; no code or hash stored. |
| 27 | any signed-in user | `select public.review_candidate_registration(...)` directly | Permission denied. Admin console approval still works (it goes through `admin_review_registration`). |
| 28 | admin | Approve, or reinstate a suspended team, whose registration has no electorate | Refused: "no electorate set". After `admin_set_registration_electorate`, it succeeds. |
| 29 | non-admin | `admin_unscoped_teams()` and `admin_set_registration_electorate(...)` | "Administrator permission required". |
| 30 | admin | `admin_set_registration_electorate` with a district for a Governor candidate, or a location from another election | Refused (type / election mismatch). |
| 31 | two sessions, same user | Call `register_candidate` at the same moment | Exactly one registration and one team result (the `user_id` unique constraint backs this). |
| 32 | any signed-in user | `insert into candidate_registrations ...` directly | Permission denied. Registration works only through `register_candidate`. |

Also run `supabase/tests/permission_audit.sql` on staging after every migration change and read each result set.

## Known gaps to close before launch
- Invitation-code throttling is per signed-in user (migration 008). Someone who creates many accounts is limited by Supabase Auth rate limits, so enable CAPTCHA there (see `docs/SUPABASE_AUTH_SETUP.md`). Codes are 10 characters from a 32-character alphabet (about 2^50 combinations).
- No automated tests; every check above is manual. Turning tests 1-32 into a scripted run against staging is the next step.
- Dashboard query speed with 6,400+ wards and live updates is untested.
- Backups: use a paid Supabase plan with daily backups before real data.
- Privacy notice and terms of use pages are not written.
- Independent security review of the staging database and deployed app is still required before real election data.
