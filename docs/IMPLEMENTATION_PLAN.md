# Recommended product decisions and implementation plan

## Decisions confirmed

- **Candidate registration:** manual administrator approval before the candidate team goes live.
- **Scrutineer access:** individual accounts, joined through a team invitation code. Never store a shared team password in plaintext.
- **Permissions:** role-based access for platform administrators, candidates/team admins, and scrutineers.
- **Team size:** maximum 100 active scrutineers per team, enforced by the backend as well as the UI.
- **Candidate types:** Open (District) Candidate and Provincial Electorate Candidate (Governor). The latter label refers to the provincial electorate seat in the National Parliament; the UI should explain this clearly.
- **Offline-first:** local records are saved on the Android device and queued for upload when a connection returns.

## Geographic model

Use a versioned, election-specific directory. Expected levels include province, district, LLG, ward, locality/village/suburb, polling place, and counting centre. These are not interchangeable: polling places and counting centres may serve multiple localities. Store stable IDs and parent IDs rather than relying on typed names. Import only a verified, dated source dataset; do not treat the app's sample locations as official boundaries.

## Tally upload rules

1. Create a unique client record ID on the device before upload.
2. Preserve device creation time and record server receipt time separately.
3. Make retries idempotent using `(team_id, client_record_id)`.
4. Never silently overwrite a submitted tally. Corrections create a new record linked to the earlier record, with an audit event and a reason.
5. Dashboard totals must show submission coverage and review status, not imply that unofficial campaign tallies are official election results.
6. Keep announced totals distinct from detailed-batch worksheets; do not label a worksheet as the official PNG count algorithm without validating the applicable procedure.

## Suggested build phases

1. **Android foundation:** stable IDs, election/team setup, ward and polling-place selectors, correction workflow, local encrypted storage, CSV/PDF export.
2. **Backend and identity:** Supabase Auth, candidate registration, admin approval, invite claim, individual membership, row-level security, audit events.
3. **Offline sync:** retry queue, idempotency, duplicate/conflict reporting, upload state UI, safe handling of partial failures.
4. **Candidate dashboard:** online summaries by province/district/LLG/ward/polling place, team roster, active scrutineer count, coverage, discrepancies, reports.
5. **Admin console:** approve/reject registrations, manage election datasets, suspend teams, review audit events.
6. **Field validation:** verify election-year location datasets with PNGEC/NSO sources; test low-connectivity devices, access controls, backup/restore, and load limits.

## Security and release gate

The included `supabase/migrations/001_schema.sql` is a starter for review, not a production-certified migration. Before live election use, run it in a disposable Supabase project, add trusted server endpoints for candidate/team creation and invitation generation, test every RLS policy with separate candidate/scrutineer/admin accounts, add rate limiting and monitoring, and obtain an independent security review. Keep Supabase service-role keys off Android devices. Do not deploy real candidate or voter data until these checks pass.
