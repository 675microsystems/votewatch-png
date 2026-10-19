-- Run AFTER schema.sql and 002_app_support.sql (staging first).
-- Replaces the multi-candidate tally model with what the product actually is:
--   * a scrutineer records ONLY their own team's candidate at a polling place:
--       candidate_votes (votes the candidate collected) and total_votes_cast (everyone who voted there);
--   * later they may record the Electoral Commission's OFFICIAL figure for the same candidate at any level
--     (ward, LLG, district, province) so the team can compare its tally with the official count.
-- These are team records, never official results.

create type public.record_kind as enum ('polling_tally', 'official_figure');

create table public.tally_records (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  election_id uuid not null references public.elections(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  kind public.record_kind not null,
  candidate_votes integer not null check (candidate_votes >= 0),
  total_votes_cast integer not null check (total_votes_cast >= 0),
  source_reference text,
  notes text,
  status public.tally_status not null default 'submitted',
  client_record_id uuid not null,
  device_created_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  supersedes_record_id uuid references public.tally_records(id) on delete restrict,
  correction_reason text,
  check (candidate_votes <= total_votes_cast),
  unique (team_id, client_record_id)
);
create index tally_records_team_loc_idx on public.tally_records(team_id, location_id, kind);
create index tally_records_team_time_idx on public.tally_records(team_id, server_received_at desc);

alter table public.tally_records enable row level security;

-- The candidate / team admin see everything for their team; a scrutineer sees only their own submissions.
create policy "records read leaders or own" on public.tally_records for select to authenticated using (
  public.is_platform_admin()
  or public.has_team_role(team_id, array['candidate','team_admin']::public.member_role[])
  or (submitted_by = auth.uid() and public.is_team_member(team_id))
);
revoke all on public.tally_records from anon, authenticated;
grant select on public.tally_records to authenticated;

-- The multi-candidate session tables are no longer used by the app: close them off (data is kept).
revoke all on public.tally_sessions, public.tally_entries from anon, authenticated;
drop function if exists public.submit_tally(jsonb);

-- Atomic, idempotent submission. This is the ONLY write path for scrutineers.
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
  v_super_client uuid := nullif(p_payload->>'supersedes_client_record_id', '')::uuid;
  v_reason text := nullif(btrim(p_payload->>'correction_reason'), '');
  v_super public.tally_records%rowtype;
  v_existing public.tally_records%rowtype;
  v_ltype public.location_type;
  v_status public.tally_status := 'submitted';
  v_conflicts integer;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if v_votes is null or v_cast is null or v_votes < 0 or v_cast < 0 then raise exception 'Votes and total votes cast are required'; end if;
  if v_votes > v_cast then raise exception 'Candidate votes cannot exceed total votes cast'; end if;

  if not exists (
    select 1 from public.team_members tm join public.teams t on t.id = tm.team_id
    where tm.team_id = v_team and tm.user_id = v_uid and tm.active = true
      and tm.role in ('scrutineer', 'team_admin') and t.status = 'approved'
  ) then raise exception 'You are not an active scrutineer on an approved team'; end if;

  if not exists (
    select 1 from public.teams t
    join public.candidate_registrations r on r.id = t.registration_id
    join public.elections e on e.id = r.election_id
    where t.id = v_team and r.election_id = v_election and e.status = 'active'
  ) then raise exception 'This election is not open for this team'; end if;

  select location_type into v_ltype from public.locations
    where id = v_location and election_id = v_election and active = true;
  if not found then raise exception 'Unknown location for this election'; end if;
  if v_kind = 'polling_tally' and v_ltype not in ('polling_place', 'counting_centre') then
    raise exception 'A polling tally must be recorded at a polling place';
  end if;

  -- Idempotent retry: same (team, client_record_id) returns the original result.
  select * into v_existing from public.tally_records where team_id = v_team and client_record_id = v_client;
  if found then
    return jsonb_build_object('record_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
  end if;

  if v_super_client is not null then
    if v_reason is null then raise exception 'A correction needs a reason'; end if;
    select * into v_super from public.tally_records where team_id = v_team and client_record_id = v_super_client;
    if not found then raise exception 'The record being corrected has not been uploaded'; end if;
    if v_super.location_id <> v_location or v_super.kind <> v_kind then
      raise exception 'A correction must be for the same location and record type';
    end if;
  else
    -- Same team, location and record type already reported? Flag both for review instead of overwriting.
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
    nullif(btrim(p_payload->>'source_reference'), ''), nullif(btrim(p_payload->>'notes'), ''),
    v_status, v_client, (p_payload->>'device_created_at')::timestamptz, v_super.id, v_reason
  )
  on conflict (team_id, client_record_id) do nothing
  returning id into v_id;

  if v_id is null then  -- lost a race with a concurrent retry
    select * into v_existing from public.tally_records where team_id = v_team and client_record_id = v_client;
    return jsonb_build_object('record_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
  end if;

  if v_super.id is not null then
    update public.tally_records set status = 'superseded' where id = v_super.id;
  elsif v_status = 'needs_review' then
    update public.tally_records set status = 'needs_review'
      where team_id = v_team and location_id = v_location and kind = v_kind and status = 'submitted' and id <> v_id;
  end if;

  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
  values (v_uid, v_team, case when v_super.id is null then 'record.submitted' else 'record.corrected' end,
          'tally_record', v_id::text,
          jsonb_build_object('client_record_id', v_client, 'kind', v_kind, 'status', v_status, 'supersedes', v_super.id, 'reason', v_reason));

  return jsonb_build_object('record_id', v_id, 'duplicate', false, 'status', v_status);
end;
$$;
revoke all on function public.submit_record(jsonb) from public;
grant execute on function public.submit_record(jsonb) to authenticated;

-- Dashboard roll-up for the candidate / team admin: own candidate's votes by ward, LLG, district, province
-- (or by polling place). Also returns polling-place coverage and the official figure for comparison.
create or replace function public.dashboard_rollup(p_team uuid, p_level public.location_type)
returns table (
  location_id uuid, location_name text, parent_name text,
  polling_places_total integer, polling_places_reported integer,
  tally_votes bigint, tally_total_cast bigint, tally_share_pct numeric,
  official_votes bigint, official_total_cast bigint, flagged integer
)
language plpgsql stable security definer set search_path = public, auth as $$
#variable_conflict use_column
declare v_election uuid;
begin
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or team admin can view the dashboard';
  end if;
  select r.election_id into v_election
    from public.teams t join public.candidate_registrations r on r.id = t.registration_id where t.id = p_team;

  return query
  with recursive anc as (
    select l.id as leaf_id, l.id as node_id, l.parent_id as up_id, l.location_type as node_type
      from public.locations l where l.election_id = v_election and l.active
    union all
    select a.leaf_id, p.id, p.parent_id, p.location_type
      from anc a join public.locations p on p.id = a.up_id
  ),
  lvl as (select a.leaf_id, a.node_id from anc a where a.node_type = p_level),
  rec as (select * from public.tally_records tr where tr.team_id = p_team and tr.status <> 'superseded'),
  polls as (
    select lv.node_id, count(distinct lv.leaf_id) as total
    from lvl lv join public.locations pl on pl.id = lv.leaf_id and pl.location_type in ('polling_place', 'counting_centre')
    group by lv.node_id
  ),
  tally as (
    select lv.node_id, count(distinct rt.location_id) as reported,
           sum(rt.candidate_votes) as votes, sum(rt.total_votes_cast) as cast_total,
           count(*) filter (where rt.status = 'needs_review') as flagged
    from lvl lv join rec rt on rt.location_id = lv.leaf_id and rt.kind = 'polling_tally'
    group by lv.node_id
  ),
  official as (
    select rt.location_id as node_id, sum(rt.candidate_votes) as votes, sum(rt.total_votes_cast) as cast_total
    from rec rt where rt.kind = 'official_figure' group by rt.location_id
  )
  select n.id, n.name, par.name,
         coalesce(polls.total, 0)::integer, coalesce(tally.reported, 0)::integer,
         coalesce(tally.votes, 0)::bigint, coalesce(tally.cast_total, 0)::bigint,
         case when coalesce(tally.cast_total, 0) > 0 then round(100.0 * tally.votes / tally.cast_total, 2) end,
         official.votes::bigint, official.cast_total::bigint, coalesce(tally.flagged, 0)::integer
  from public.locations n
  left join public.locations par on par.id = n.parent_id
  left join polls on polls.node_id = n.id
  left join tally on tally.node_id = n.id
  left join official on official.node_id = n.id
  where n.election_id = v_election and n.location_type = p_level and n.active
  order by n.name;
end;
$$;
revoke all on function public.dashboard_rollup(uuid, public.location_type) from public;
grant execute on function public.dashboard_rollup(uuid, public.location_type) to authenticated;

-- Live updates for the dashboard (Supabase Realtime respects the RLS policy above).
alter publication supabase_realtime add table public.tally_records;
