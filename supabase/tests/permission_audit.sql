-- READ-ONLY permission audit. Paste into the Supabase SQL editor of the STAGING project after running 001-008.
-- Every result set should be empty or match what you expect. Nothing here changes data.

-- A. Tables in public WITHOUT row level security (expect: none)
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- B. What anon and authenticated can do directly to tables (review every write privilege; RLS still applies)
select grantee, table_name, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by 1, 2 order by 2, 1;

-- C. Direct write access that should NOT exist (expect: none)
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  and table_name in ('teams', 'team_members', 'team_invitations', 'audit_events', 'candidate_registrations',
                     'tally_records', 'invitation_claim_failures');

-- D. SECURITY DEFINER functions without a fixed search_path (expect: none)
select p.oid::regprocedure as function_missing_search_path
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');

-- E. Every public function: owner, definer flag, and who can execute it.
--    has_function_privilege includes grants inherited from PUBLIC, so anon_exec = true means PUBLIC or anon can call it.
--    Expect anon_exec = false everywhere except functions you deliberately expose.
select p.oid::regprocedure as function, pg_get_userbyid(p.proowner) as owner, p.prosecdef as definer,
       has_function_privilege('anon', p.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by anon_exec desc, p.prosecdef desc, 1;

-- F. Retired / superseded functions (expect: no rows. submit_tally was dropped in 003.)
select p.oid::regprocedure as should_not_exist
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'submit_tally';

-- G. review_candidate_registration must not be executable by clients directly (expect: false)
select has_function_privilege('authenticated', 'public.review_candidate_registration(uuid, boolean, text)', 'execute')
       as client_can_call_review_directly;

-- H. Uniqueness that backs the registration rules (expect: both rows)
select conrelid::regclass as tbl, pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'u' and conrelid in ('public.candidate_registrations'::regclass, 'public.teams'::regclass)
  and (pg_get_constraintdef(oid) like '%(user_id)%' or pg_get_constraintdef(oid) like '%(registration_id)%');

-- I. Registrations / teams with no electorate (legacy scope). Expect: none before launch.
--    Fix each with: select public.admin_set_registration_electorate('<registration id>', '<location id>');
--    (admin_unscoped_teams() gives the same list but needs an admin JWT; this version runs in the SQL editor.)
select r.id as registration_id, r.status, r.candidate_name, r.candidate_type, r.electorate_name, t.id as team_id
from public.candidate_registrations r left join public.teams t on t.registration_id = r.id
where r.electorate_location_id is null and r.status <> 'rejected';

-- J. Invitation lockouts in the last 7 days (who is being throttled)
select actor_user_id, count(*) as lockouts, max(created_at) as last_lockout
from public.audit_events
where event_type = 'team.invitation_claim_lockout' and created_at > now() - interval '7 days'
group by 1 order by 3 desc;
