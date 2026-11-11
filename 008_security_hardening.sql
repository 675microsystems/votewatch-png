-- Run AFTER 007 (staging first). Security hardening from the source audit.
--   1. Invitation-code guessing is throttled inside the database (5 failed claims per user per 15 minutes).
--   2. Registrations cannot be approved / reinstated without an electorate (fail closed), with admin tools to fix legacy rows.
--   3. review_candidate_registration() is no longer directly callable by clients (admin_review_registration() wraps it).
-- Idempotent: safe to re-run.

-- ============================================================================================
-- 1. Invitation claim throttling
--    A failed claim must be RECORDED, and a function that raises rolls its own writes back. So an invalid code now
--    returns NULL (committed, counted) instead of raising. The lockout itself still raises, which is fine because
--    nothing needs to be saved at that point. The Android app maps NULL to "invalid, expired, or fully used".
-- ============================================================================================
create table if not exists public.invitation_claim_failures (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists invitation_claim_failures_user_time
  on public.invitation_claim_failures (user_id, attempted_at desc);
alter table public.invitation_claim_failures enable row level security;   -- no policies: no client access at all
revoke all on public.invitation_claim_failures from anon, authenticated;

create or replace function public.claim_team_invitation(p_code_hash text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  c_max_failures constant integer := 5;
  c_window       constant interval := interval '15 minutes';
  v_uid uuid := auth.uid();
  inv public.team_invitations%rowtype;
  v_team_status public.registration_status;
  v_failures integer;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;

  -- One claim at a time per user, so parallel requests cannot slip past the limit.
  perform pg_advisory_xact_lock(hashtextextended('claim_invitation:' || v_uid::text, 0));

  select count(*) into v_failures from public.invitation_claim_failures
    where user_id = v_uid and attempted_at > now() - c_window;
  if v_failures >= c_max_failures then
    raise exception 'Too many failed attempts. Wait 15 minutes and try again.';
  end if;

  select * into inv from public.team_invitations
    where code_hash = p_code_hash and revoked_at is null and expires_at > now() and uses < max_uses
    for update;
  if not found then
    insert into public.invitation_claim_failures (user_id) values (v_uid);
    delete from public.invitation_claim_failures where user_id = v_uid and attempted_at < now() - interval '7 days';
    if v_failures + 1 >= c_max_failures then   -- this failure tripped the limit: leave a trail (no code is stored)
      insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id)
        values (v_uid, 'team.invitation_claim_lockout', 'user', v_uid::text);
    end if;
    return null;
  end if;

  select status into v_team_status from public.teams where id = inv.team_id;
  if v_team_status <> 'approved' then raise exception 'Team is not approved yet'; end if;
  if exists (select 1 from public.team_members where team_id = inv.team_id and user_id = v_uid) then
    raise exception 'You already belong to this team';
  end if;
  insert into public.team_members (team_id, user_id, role) values (inv.team_id, v_uid, 'scrutineer');
  update public.team_invitations set uses = uses + 1 where id = inv.id;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id)
    values (v_uid, inv.team_id, 'team.invitation_claimed', 'team_member', v_uid::text);
  return inv.team_id;
end;
$$;
revoke all on function public.claim_team_invitation(text) from public, anon;
grant execute on function public.claim_team_invitation(text) to authenticated;

-- ============================================================================================
-- 2. Fail closed on electorate scoping
--    A registration can only be approved (or a suspended team reinstated) when it has an electorate.
--    New registrations always have one (register_candidate). Legacy rows must be mapped first.
-- ============================================================================================
create or replace function public._require_electorate_on_approval()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'approved' and new.electorate_location_id is null then
    raise exception 'This registration has no electorate set. Set one with admin_set_registration_electorate() before approving or reinstating.';
  end if;
  return new;
end;
$$;
drop trigger if exists candidate_registrations_require_electorate on public.candidate_registrations;
create trigger candidate_registrations_require_electorate
  before insert or update of status, electorate_location_id on public.candidate_registrations
  for each row execute function public._require_electorate_on_approval();

-- Registrations (and their teams) that still have no electorate, so nobody keeps whole-election scope by accident.
create or replace function public.admin_unscoped_teams()
returns table (registration_id uuid, reg_status public.registration_status, team_id uuid, team_status public.registration_status,
               candidate_name text, candidate_type public.candidate_type, electorate_name text, election_id uuid)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return query
    select r.id, r.status, t.id, t.status, r.candidate_name, r.candidate_type, r.electorate_name, r.election_id
    from public.candidate_registrations r
    left join public.teams t on t.registration_id = r.id
    where r.electorate_location_id is null and r.status <> 'rejected'
    order by r.created_at;
end;
$$;

-- Set the electorate on a legacy registration. Validates election, active location and type, and writes an audit event.
create or replace function public.admin_set_registration_electorate(p_registration uuid, p_location uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_reg public.candidate_registrations%rowtype; v_ltype public.location_type; v_team uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  select * into v_reg from public.candidate_registrations where id = p_registration for update;
  if not found then raise exception 'Registration not found'; end if;
  select location_type into v_ltype from public.locations
    where id = p_location and election_id = v_reg.election_id and active;
  if not found then raise exception 'That location is not an active location of this registration''s election'; end if;
  if v_ltype is distinct from (case v_reg.candidate_type when 'open_district' then 'district' else 'province' end)::public.location_type then
    raise exception 'The location type does not match the candidate type';
  end if;
  update public.candidate_registrations
    set electorate_location_id = p_location, electorate_name = public._electorate_label(p_location)
    where id = p_registration;
  select id into v_team from public.teams where registration_id = p_registration;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), v_team, 'registration.electorate_set', 'candidate_registration', p_registration::text,
            jsonb_build_object('from', v_reg.electorate_location_id, 'to', p_location));
end;
$$;

-- ============================================================================================
-- 3. Grants
-- ============================================================================================
-- review_candidate_registration() checks is_platform_admin() itself, but clients should only reach it through
-- admin_review_registration() (004), which is SECURITY DEFINER and keeps working without this grant.
revoke execute on function public.review_candidate_registration(uuid, boolean, text) from authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_unscoped_teams()',
    'admin_set_registration_electorate(uuid, uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Notes
--  * After running: select * from public.admin_unscoped_teams();  then for each row
--      select public.admin_set_registration_electorate('<registration id>', '<district or province location id>');
--    Until a legacy row is mapped it keeps whole-election scope (007's compatibility rule) and cannot be reinstated.
--  * Existing members are not affected by the lockout; only failed claims count, and only for the calling user.
--  * Sign-up abuse (many throwaway accounts guessing codes) is an Auth-level problem: enable CAPTCHA in Supabase Auth.
--    See docs/SUPABASE_AUTH_SETUP.md section 5.
