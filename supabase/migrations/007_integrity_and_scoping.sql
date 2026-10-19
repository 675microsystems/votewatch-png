-- Run AFTER 006 (staging first). Workstream 1: make the numbers correct.
--   1. Suspension is enforced in the database (reads and writes), not just hidden in the UI.
--   2. A team is tied to ONE electorate (a location), and the dashboard / uploads / location list are scoped to it.
--   3. Totals count ONE record per place; duplicates are flagged and a leader can resolve them.
--   4. Elections have a closed_at time and a state machine. Records created before an election closed are
--      still accepted when they sync late (up to 30 days after closing).
--   5. Candidate registration goes through validated functions (no direct inserts), and can be edited / withdrawn.
-- Idempotent where practical. Read the notes at the end before running.

-- ============================================================================================
-- 1. Suspension: the two membership helpers now require an APPROVED team.
--    Every RLS policy and function that uses them (tally_records reads, dashboard_rollup, team_roster,
--    team_invitation_list, audit reads, Realtime) stops working for a suspended team automatically.
--    Platform admins are unaffected (they use is_platform_admin()).
-- ============================================================================================
create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.active = true and t.status = 'approved'
  );
$$;

create or replace function public.has_team_role(p_team_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
      and tm.active = true and tm.role = any(p_roles) and t.status = 'approved'
  );
$$;

-- Registration status mirrors team suspension, so /register and the admin filter tell the truth.
create or replace function public.admin_set_team_status(p_team uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old public.registration_status; v_reg uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if p_status not in ('approved', 'suspended') then raise exception 'Status must be approved or suspended'; end if;
  if p_status = 'suspended' and nullif(btrim(p_note), '') is null then raise exception 'A reason is required to suspend'; end if;
  select status, registration_id into v_old, v_reg from public.teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if v_old not in ('approved', 'suspended') then raise exception 'Only approved or suspended teams can be changed here'; end if;
  update public.teams set status = p_status::public.registration_status where id = p_team;
  update public.candidate_registrations set status = p_status::public.registration_status where id = v_reg;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, 'team.status_changed', 'team', p_team::text,
            jsonb_build_object('from', v_old, 'to', p_status, 'note', nullif(btrim(p_note), '')));
end;
$$;

-- Bring existing data in line (a suspended team whose registration still says approved).
update public.candidate_registrations r set status = t.status
  from public.teams t where t.registration_id = r.id and t.status = 'suspended' and r.status <> 'suspended';

-- ============================================================================================
-- 2. Electorate scoping
-- ============================================================================================
alter table public.candidate_registrations
  add column if not exists electorate_location_id uuid references public.locations(id) on delete restrict;
create index if not exists candidate_registrations_electorate_idx on public.candidate_registrations(electorate_location_id);

-- Best-effort backfill for rows that only have the free-text name: unique, same-type name match only.
update public.candidate_registrations r set electorate_location_id = l.id
from public.locations l
where r.electorate_location_id is null
  and l.election_id = r.election_id and l.active
  and l.location_type = (case r.candidate_type when 'open_district' then 'district' else 'province' end)::public.location_type
  and lower(btrim(l.name)) = lower(btrim(split_part(r.electorate_name, ' (', 1)))
  and (select count(*) from public.locations l2
        where l2.election_id = r.election_id and l2.active and l2.location_type = l.location_type
          and lower(btrim(l2.name)) = lower(btrim(l.name))) = 1;

-- Display label for an electorate: "District (Province)" for districts, the name for provinces.
create or replace function public._electorate_label(p_location uuid)
returns text language sql stable set search_path = public as $$
  select case when l.location_type = 'district' and par.name is not null then l.name || ' (' || par.name || ')' else l.name end
  from public.locations l left join public.locations par on par.id = l.parent_id where l.id = p_location;
$$;
revoke all on function public._electorate_label(uuid) from public, anon, authenticated;

-- Is p_location the electorate itself or somewhere beneath it? A NULL electorate (legacy row) means "unscoped".
create or replace function public._location_in_scope(p_electorate uuid, p_location uuid)
returns boolean language sql stable set search_path = public as $$
  select p_electorate is null or exists (
    with recursive up as (
      select l.id, l.parent_id from public.locations l where l.id = p_location
      union all
      select l.id, l.parent_id from public.locations l join up on l.id = up.parent_id
    )
    select 1 from up where up.id = p_electorate
  );
$$;
revoke all on function public._location_in_scope(uuid, uuid) from public, anon, authenticated;

-- Every location the caller may work in through their approved teams (the electorate and everything beneath it).
-- Used by the locations RLS policy below so the Android app only downloads its own electorate's geography.
create or replace function public.my_scope_location_ids()
returns setof uuid language sql stable security definer set search_path = public, auth as $$
  with recursive roots as (
    select r.election_id, r.electorate_location_id as root_id
    from public.team_members tm
    join public.teams t on t.id = tm.team_id and t.status = 'approved'
    join public.candidate_registrations r on r.id = t.registration_id
    where tm.user_id = auth.uid() and tm.active
  ),
  tree as (
    select l.id from public.locations l join roots ro on ro.root_id = l.id where l.active
    union all
    select c.id from public.locations c join tree on c.parent_id = tree.id where c.active
  )
  select id from tree
  union
  -- legacy teams with no electorate: whole election
  select l.id from public.locations l join roots ro on ro.root_id is null and ro.election_id = l.election_id where l.active;
$$;
revoke all on function public.my_scope_location_ids() from public, anon;
grant execute on function public.my_scope_location_ids() to authenticated;

-- Provinces and districts stay readable to every signed-in user (the registration form needs them);
-- everything below that is visible only inside your own team's electorate. Admins see all.
drop policy if exists "location directory visible" on public.locations;
create policy "location directory visible" on public.locations for select to authenticated using (
  public.is_platform_admin()
  or (active = true and (location_type in ('province', 'district') or id in (select public.my_scope_location_ids())))
);

-- ============================================================================================
-- 3. Candidate registration through validated functions
-- ============================================================================================
revoke insert on public.candidate_registrations from authenticated;
drop policy if exists "registration create self pending" on public.candidate_registrations;

create or replace function public.register_candidate(
  p_election uuid, p_type public.candidate_type, p_name text, p_location uuid, p_party text default null
) returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid(); v_id uuid; v_ltype public.location_type;
  v_name text := nullif(btrim(p_name), ''); v_party text := nullif(btrim(p_party), '');
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_name is null then raise exception 'Candidate name is required'; end if;
  if length(v_name) > 120 or length(coalesce(v_party, '')) > 120 then raise exception 'Name and party must be 120 characters or fewer'; end if;
  if not exists (select 1 from public.elections where id = p_election and status = 'active') then
    raise exception 'That election is not open for registration';
  end if;
  if exists (select 1 from public.candidate_registrations where user_id = v_uid) then
    raise exception 'This account has already submitted a registration';
  end if;
  select location_type into v_ltype from public.locations where id = p_location and election_id = p_election and active;
  if not found then raise exception 'Choose an electorate from the list'; end if;
  if v_ltype is distinct from (case p_type when 'open_district' then 'district' else 'province' end)::public.location_type then
    raise exception 'The electorate does not match the candidate type';
  end if;
  insert into public.candidate_registrations (user_id, election_id, candidate_type, candidate_name, electorate_name, electorate_location_id, party_name)
    values (v_uid, p_election, p_type, v_name, public._electorate_label(p_location), p_location, v_party)
    returning id into v_id;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (v_uid, 'candidate.registration_submitted', 'candidate_registration', v_id::text,
            jsonb_build_object('election', p_election, 'electorate', p_location, 'type', p_type));
  return v_id;
end;
$$;

-- Edit a pending registration, or fix and resubmit a rejected one. The previous note is kept in the audit log.
create or replace function public.update_my_registration(
  p_type public.candidate_type, p_name text, p_location uuid, p_party text default null
) returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid(); v_reg public.candidate_registrations%rowtype; v_ltype public.location_type;
  v_name text := nullif(btrim(p_name), ''); v_party text := nullif(btrim(p_party), '');
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select * into v_reg from public.candidate_registrations where user_id = v_uid for update;
  if not found then raise exception 'You have no registration to edit'; end if;
  if v_reg.status not in ('pending', 'rejected') then raise exception 'Only pending or rejected registrations can be edited'; end if;
  if v_name is null then raise exception 'Candidate name is required'; end if;
  if length(v_name) > 120 or length(coalesce(v_party, '')) > 120 then raise exception 'Name and party must be 120 characters or fewer'; end if;
  select location_type into v_ltype from public.locations where id = p_location and election_id = v_reg.election_id and active;
  if not found then raise exception 'Choose an electorate from the list'; end if;
  if v_ltype is distinct from (case p_type when 'open_district' then 'district' else 'province' end)::public.location_type then
    raise exception 'The electorate does not match the candidate type';
  end if;
  update public.candidate_registrations
    set candidate_type = p_type, candidate_name = v_name, electorate_name = public._electorate_label(p_location),
        electorate_location_id = p_location, party_name = v_party,
        status = 'pending', reviewed_by = null, reviewed_at = null, review_note = null
    where id = v_reg.id;
  update public.teams set status = 'pending' where registration_id = v_reg.id;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (v_uid, 'candidate.registration_updated', 'candidate_registration', v_reg.id::text,
            jsonb_build_object('previous_status', v_reg.status, 'previous_note', v_reg.review_note));
end;
$$;

create or replace function public.withdraw_my_registration()
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid := auth.uid(); v_reg public.candidate_registrations%rowtype;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  select * into v_reg from public.candidate_registrations where user_id = v_uid for update;
  if not found then raise exception 'You have no registration'; end if;
  if v_reg.status <> 'pending' then raise exception 'Only a pending registration can be withdrawn'; end if;
  delete from public.teams where registration_id = v_reg.id and status = 'pending';
  delete from public.candidate_registrations where id = v_reg.id;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (v_uid, 'candidate.registration_withdrawn', 'candidate_registration', v_reg.id::text,
            jsonb_build_object('candidate_name', v_reg.candidate_name));
end;
$$;

-- ============================================================================================
-- 4. Elections: closed_at + a real state machine
-- ============================================================================================
alter table public.elections add column if not exists closed_at timestamptz;
update public.elections set closed_at = now() where status in ('closed', 'archived') and closed_at is null;

drop function if exists public.admin_set_election_status(uuid, text);
create or replace function public.admin_set_election_status(p_election uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old text; v_dataset text; v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if p_status not in ('setup', 'active', 'closed', 'archived') then raise exception 'Invalid election status'; end if;
  select status, location_dataset_version into v_old, v_dataset from public.elections where id = p_election for update;
  if not found then raise exception 'Election not found'; end if;
  if v_old = p_status then return; end if;
  if not (
    (v_old = 'setup'  and p_status in ('active', 'archived')) or
    (v_old = 'active' and p_status = 'closed') or
    (v_old = 'closed' and p_status in ('active', 'archived'))
  ) then raise exception 'An election cannot move from % to %', v_old, p_status; end if;
  if v_old = 'setup' and p_status = 'active' and v_dataset is null then
    raise exception 'Activate a location dataset before opening the election';
  end if;
  if v_old = 'closed' and p_status = 'active' and v_note is null then
    raise exception 'A reason is required to reopen a closed election';
  end if;
  update public.elections set status = p_status,
      closed_at = case when p_status = 'closed' then now() when p_status = 'active' then null else closed_at end
    where id = p_election;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'election.status_changed', 'election', p_election::text,
            jsonb_build_object('from', v_old, 'to', p_status, 'note', v_note));
end;
$$;
revoke all on function public.admin_set_election_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_election_status(uuid, text, text) to authenticated;

-- Activating a new dataset version re-points registrations at the matching locations (by import_key).
create or replace function public.admin_activate_location_dataset(p_election uuid, p_dataset_version text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_unmapped integer;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if not exists (select 1 from public.locations where election_id = p_election and dataset_version = p_dataset_version and location_type = 'province') then
    raise exception 'Dataset version not found, or it has no provinces';
  end if;
  if exists (
    select 1 from public.tally_records tr join public.locations l on l.id = tr.location_id
    where tr.election_id = p_election and l.dataset_version <> p_dataset_version
  ) then
    raise exception 'Tally records already reference another dataset version. Switching would orphan them; migrate the records first.';
  end if;

  update public.candidate_registrations r set electorate_location_id = n.id
    from public.locations o
    join public.locations n on n.election_id = o.election_id and n.dataset_version = p_dataset_version and n.import_key = o.import_key
    where r.electorate_location_id = o.id and r.election_id = p_election and o.dataset_version <> p_dataset_version;
  select count(*) into v_unmapped from public.candidate_registrations r
    join public.locations o on o.id = r.electorate_location_id
    where r.election_id = p_election and o.dataset_version <> p_dataset_version;
  if v_unmapped > 0 then
    raise exception '% registration(s) point at electorates that are missing from this dataset. Add them (same keys) or fix the registrations first.', v_unmapped;
  end if;

  update public.locations set active = (dataset_version = p_dataset_version) where election_id = p_election;
  update public.elections set location_dataset_version = p_dataset_version where id = p_election;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'locations.activated', 'election', p_election::text, jsonb_build_object('dataset_version', p_dataset_version));
end;
$$;

-- ============================================================================================
-- 5. submit_record: scope, late-sync policy, race-safe duplicate flagging, safer corrections
--    (signature unchanged, so the Android app needs no change)
-- ============================================================================================
create or replace function public.submit_record(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid := (p_payload->>'team_id')::uuid;
  v_election uuid := (p_payload->>'election_id')::uuid;
  v_location uuid := (p_payload->>'location_id')::uuid;
  v_client uuid := (p_payload->>'client_record_id')::uuid;
  v_kind public.record_kind := (p_payload->>'kind')::public.record_kind;
  v_votes integer := (p_payload->>'candidate_votes')::integer;
  v_cast integer := (p_payload->>'total_votes_cast')::integer;
  v_device timestamptz := (p_payload->>'device_created_at')::timestamptz;
  v_source text := nullif(btrim(p_payload->>'source_reference'), '');
  v_notes text := nullif(btrim(p_payload->>'notes'), '');
  v_super_client uuid := nullif(p_payload->>'supersedes_client_record_id', '')::uuid;
  v_reason text := nullif(btrim(p_payload->>'correction_reason'), '');
  v_super public.tally_records%rowtype;
  v_super_id uuid;
  v_existing public.tally_records%rowtype;
  v_ltype public.location_type;
  v_electorate uuid; v_estatus text; v_closed timestamptz;
  v_status public.tally_status := 'submitted';
  v_conflicts integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_votes is null or v_cast is null or v_votes < 0 or v_cast < 0 then raise exception 'Votes and total votes cast are required'; end if;
  if v_votes > v_cast then raise exception 'Candidate votes cannot exceed total votes cast'; end if;
  if v_device is null then raise exception 'The record has no creation time'; end if;
  if length(coalesce(v_notes, '')) > 1000 or length(coalesce(v_source, '')) > 200 or length(coalesce(v_reason, '')) > 500 then
    raise exception 'Notes, source reference or correction reason is too long';
  end if;

  if not exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.team_id = v_team and tm.user_id = v_uid and tm.active = true
      and tm.role in ('scrutineer', 'team_admin') and t.status = 'approved'
  ) then raise exception 'You are not an active scrutineer on an approved team'; end if;

  -- Idempotent retry first: a record that is already stored is reported as such even if the election has since closed.
  select * into v_existing from public.tally_records where team_id = v_team and client_record_id = v_client;
  if found then
    return jsonb_build_object('record_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
  end if;

  select r.electorate_location_id, e.status, e.closed_at into v_electorate, v_estatus, v_closed
    from public.teams t
    join public.candidate_registrations r on r.id = t.registration_id
    join public.elections e on e.id = r.election_id
    where t.id = v_team and r.election_id = v_election;
  if not found then raise exception 'This election is not open for this team'; end if;
  if v_estatus <> 'active' then
    -- Late sync: a record captured before the election closed is still accepted for 30 days after closing.
    if not (v_estatus = 'closed' and v_closed is not null and v_device <= v_closed and now() <= v_closed + interval '30 days') then
      raise exception 'This election is closed. Only records created before it closed, and uploaded within 30 days, are accepted';
    end if;
  end if;

  select location_type into v_ltype from public.locations
    where id = v_location and election_id = v_election and active = true;
  if not found then raise exception 'Unknown location for this election'; end if;
  if not public._location_in_scope(v_electorate, v_location) then
    raise exception 'That location is outside this team''s electorate';
  end if;
  if v_kind = 'polling_tally' and v_ltype not in ('polling_place', 'counting_centre') then
    raise exception 'A polling tally must be recorded at a polling place';
  end if;

  -- Serialise submissions for the same place so duplicate detection cannot be raced.
  perform pg_advisory_xact_lock(hashtextextended(v_team::text || ':' || v_location::text || ':' || v_kind::text, 0));

  if v_super_client is not null then
    if v_reason is null then raise exception 'A correction needs a reason'; end if;
    select * into v_super from public.tally_records where team_id = v_team and client_record_id = v_super_client for update;
    if not found then raise exception 'The record being corrected has not been uploaded'; end if;
    if v_super.location_id <> v_location or v_super.kind <> v_kind then
      raise exception 'A correction must be for the same location and record type';
    end if;
    -- If it was already corrected (e.g. two corrections made offline), keep the data but flag it for review.
    if v_super.status <> 'superseded' then v_super_id := v_super.id; end if;
  end if;

  if v_super_id is null then
    select count(*) into v_conflicts from public.tally_records
      where team_id = v_team and location_id = v_location and kind = v_kind
        and status in ('submitted', 'needs_review', 'verified');
    if v_conflicts > 0 then v_status := 'needs_review'; end if;
  end if;

  insert into public.tally_records (
    team_id, submitted_by, election_id, location_id, kind, candidate_votes, total_votes_cast,
    source_reference, notes, status, client_record_id, device_created_at, supersedes_record_id, correction_reason
  ) values (
    v_team, v_uid, v_election, v_location, v_kind, v_votes, v_cast,
    v_source, v_notes, v_status, v_client, v_device, v_super.id, v_reason
  )
  on conflict (team_id, client_record_id) do nothing
  returning id into v_id;

  if v_id is null then  -- lost a race with a concurrent retry
    select * into v_existing from public.tally_records where team_id = v_team and client_record_id = v_client;
    return jsonb_build_object('record_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
  end if;

  if v_super_id is not null then
    update public.tally_records set status = 'superseded' where id = v_super_id;
  elsif v_status = 'needs_review' then
    update public.tally_records set status = 'needs_review'
      where team_id = v_team and location_id = v_location and kind = v_kind and status = 'submitted' and id <> v_id;
  end if;

  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
  values (v_uid, v_team, case when v_super_id is null then 'record.submitted' else 'record.corrected' end,
          'tally_record', v_id::text,
          jsonb_build_object('client_record_id', v_client, 'kind', v_kind, 'status', v_status, 'supersedes', v_super_id,
                             'reason', v_reason, 'election_status', v_estatus));

  return jsonb_build_object('record_id', v_id, 'duplicate', false, 'status', v_status);
end;
$$;

-- ============================================================================================
-- 6. Dashboard roll-up: scoped to the team's electorate, ONE record per place, flagged duplicates shown separately.
--    Same signature as 003, so the website and anything else calling it keep working.
-- ============================================================================================
create or replace function public.dashboard_rollup(p_team uuid, p_level public.location_type)
returns table (
  location_id uuid, location_name text, parent_name text,
  polling_places_total integer, polling_places_reported integer,
  tally_votes bigint, tally_total_cast bigint, tally_share_pct numeric,
  official_votes bigint, official_total_cast bigint, flagged integer
)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
declare v_election uuid; v_scope uuid;
begin
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or team admin of an active team can view the dashboard';
  end if;
  select r.election_id, r.electorate_location_id into v_election, v_scope
    from public.teams t join public.candidate_registrations r on r.id = t.registration_id where t.id = p_team;
  if v_election is null then return; end if;

  return query
  with recursive
  -- the electorate and everything beneath it (or the whole election for a legacy, unscoped team)
  scope as (
    select l.id from public.locations l
      where l.election_id = v_election and l.active and (v_scope is null or l.id = v_scope)
    union all
    select c.id from public.locations c join scope s on c.parent_id = s.id
      where c.active and v_scope is not null
  ),
  -- every in-scope location paired with each of its ancestors (stopping at the electorate)
  anc as (
    select l.id as leaf_id, l.id as node_id, l.parent_id as up_id, l.location_type as node_type
      from public.locations l join scope s on s.id = l.id
    union all
    select a.leaf_id, p.id, p.parent_id, p.location_type
      from anc a join public.locations p on p.id = a.up_id
      where v_scope is null or a.node_id <> v_scope
  ),
  lvl as (select a.leaf_id, a.node_id from anc a join scope s on s.id = a.node_id where a.node_type = p_level),
  live as (select tr.* from public.tally_records tr where tr.team_id = p_team and tr.status <> 'superseded'),
  -- ONE record per place and kind: a leader-verified record wins, otherwise the most recent
  latest as (
    select distinct on (x.location_id, x.kind) x.*
      from live x
      order by x.location_id, x.kind, (x.status = 'verified') desc, x.server_received_at desc, x.id
  ),
  polls as (
    select lv.node_id, count(distinct lv.leaf_id) as total
      from lvl lv join public.locations pl on pl.id = lv.leaf_id and pl.location_type in ('polling_place', 'counting_centre')
      group by lv.node_id
  ),
  tally as (
    select lv.node_id, count(distinct rt.location_id) as reported,
           sum(rt.candidate_votes) as votes, sum(rt.total_votes_cast) as cast_total
      from lvl lv join latest rt on rt.location_id = lv.leaf_id and rt.kind = 'polling_tally'
      group by lv.node_id
  ),
  flags as (
    select lv.node_id, count(*) as n_flagged
      from lvl lv join live fr on fr.location_id = lv.leaf_id and fr.status = 'needs_review'
      group by lv.node_id
  ),
  official as (
    select rt.location_id as node_id, rt.candidate_votes as votes, rt.total_votes_cast as cast_total
      from latest rt where rt.kind = 'official_figure'
  )
  select n.id, n.name, par.name,
         coalesce(polls.total, 0)::integer, coalesce(tally.reported, 0)::integer,
         coalesce(tally.votes, 0)::bigint, coalesce(tally.cast_total, 0)::bigint,
         case when coalesce(tally.cast_total, 0) > 0 then round(100.0 * tally.votes / tally.cast_total, 2) end,
         official.votes::bigint, official.cast_total::bigint, coalesce(flags.n_flagged, 0)::integer
  from public.locations n
  join scope sc on sc.id = n.id
  left join public.locations par on par.id = n.parent_id
  left join polls on polls.node_id = n.id
  left join tally on tally.node_id = n.id
  left join flags on flags.node_id = n.id
  left join official on official.node_id = n.id
  where n.location_type = p_level
  order by n.name;
end;
$$;

-- ============================================================================================
-- 7. Review queue and resolution (leaders only; platform admins are read-only)
-- ============================================================================================
create or replace function public.team_review_queue(p_team uuid)
returns table (
  record_id uuid, location_id uuid, location_name text, parent_name text, kind public.record_kind,
  candidate_votes integer, total_votes_cast integer, submitted_by_name text, server_received_at timestamptz,
  source_reference text, notes text, status public.tally_status
)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
begin
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or team admin of an active team can view this';
  end if;
  return query
    select tr.id, tr.location_id, l.name, par.name, tr.kind, tr.candidate_votes, tr.total_votes_cast,
           coalesce(p.display_name, split_part(u.email, '@', 1))::text, tr.server_received_at,
           tr.source_reference, tr.notes, tr.status
    from public.tally_records tr
    join public.locations l on l.id = tr.location_id
    left join public.locations par on par.id = l.parent_id
    left join public.profiles p on p.user_id = tr.submitted_by
    left join auth.users u on u.id = tr.submitted_by
    where tr.team_id = p_team and tr.status <> 'superseded'
      and exists (select 1 from public.tally_records x
                  where x.team_id = tr.team_id and x.location_id = tr.location_id and x.kind = tr.kind and x.status = 'needs_review')
    order by l.name, tr.kind, tr.server_received_at;
end;
$$;

-- Keep one record for a place: it becomes 'verified' (and counts); every other live record for that place + kind
-- is superseded (kept for history). A written note is mandatory and goes in the audit log.
create or replace function public.resolve_records(p_team uuid, p_keep uuid, p_note text)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_keep public.tally_records%rowtype; v_n integer; v_note text := nullif(btrim(p_note), '');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) then
    raise exception 'Only the candidate or team admin of an active team can resolve records';
  end if;
  if v_note is null then raise exception 'A note is required'; end if;
  select * into v_keep from public.tally_records where id = p_keep and team_id = p_team and status <> 'superseded';
  if not found then raise exception 'Record not found, or it has already been replaced'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_team::text || ':' || v_keep.location_id::text || ':' || v_keep.kind::text, 0));
  update public.tally_records set status = 'superseded'
    where team_id = p_team and location_id = v_keep.location_id and kind = v_keep.kind
      and status <> 'superseded' and id <> v_keep.id;
  get diagnostics v_n = row_count;
  update public.tally_records set status = 'verified' where id = v_keep.id;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, 'record.resolved', 'tally_record', v_keep.id::text,
            jsonb_build_object('location_id', v_keep.location_id, 'kind', v_keep.kind, 'discarded', v_n, 'note', v_note));
  return v_n;
end;
$$;

-- ============================================================================================
-- Grants
-- ============================================================================================
do $$
declare f text;
begin
  foreach f in array array[
    'register_candidate(uuid, public.candidate_type, text, uuid, text)',
    'update_my_registration(public.candidate_type, text, uuid, text)',
    'withdraw_my_registration()',
    'team_review_queue(uuid)',
    'resolve_records(uuid, uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Notes
--  * Existing teams created before this migration keep working: a NULL electorate_location_id means "unscoped".
--    The backfill above fills it where the name matches exactly one location. Check the remainder in the admin console
--    and set them with:  update public.candidate_registrations set electorate_location_id = '<location id>' where id = '<reg id>';
--  * Android: no change needed. submit_record keeps its signature, my_teams is unchanged, and the locations policy now
--    limits the downloaded directory to the team's electorate. A record outside it is refused with a clear message.
--  * The 30-day late-sync window is the interval literal in submit_record.
