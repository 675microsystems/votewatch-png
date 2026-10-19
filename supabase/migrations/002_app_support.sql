-- Run AFTER supabase/schema.sql, in a staging project first.
-- Adds what the Android app needs: candidate lists, my_teams(), and an atomic, idempotent submit_tally().

alter table public.tally_sessions add column if not exists correction_reason text;

-- Ballot candidates per electorate (an electorate is a 'district' (open) or 'province' (provincial) location).
create table if not exists public.election_candidates (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  electorate_location_id uuid not null references public.locations(id) on delete restrict,
  ballot_name text not null,
  party_name text,
  candidate_code text,
  active boolean not null default true,
  unique (election_id, electorate_location_id, ballot_name)
);
alter table public.election_candidates enable row level security;
create policy "candidates visible" on public.election_candidates for select to authenticated
  using (active = true or public.is_platform_admin());
grant select on public.election_candidates to authenticated;

-- Teams the signed-in user belongs to (scrutineers cannot read candidate_registrations directly).
create or replace function public.my_teams()
returns table (
  team_id uuid, team_name text, member_role public.member_role, team_status public.registration_status,
  election_id uuid, election_name text, candidate_name text, candidate_type public.candidate_type
)
language sql stable security definer set search_path = public, auth as $$
  select t.id, t.team_name, tm.role, t.status, r.election_id, e.name, r.candidate_name, r.candidate_type
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  join public.candidate_registrations r on r.id = t.registration_id
  join public.elections e on e.id = r.election_id
  where tm.user_id = auth.uid() and tm.active = true;
$$;
revoke all on function public.my_teams() from public;
grant execute on function public.my_teams() to authenticated;

-- Atomic, idempotent tally submission. Direct inserts are revoked below so every write is validated here.
create or replace function public.submit_tally(p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_uid uuid := auth.uid();
  v_team uuid := (p_payload->>'team_id')::uuid;
  v_election uuid := (p_payload->>'election_id')::uuid;
  v_location uuid := (p_payload->>'location_id')::uuid;
  v_client uuid := (p_payload->>'client_record_id')::uuid;
  v_mode public.tally_mode := (p_payload->>'mode')::public.tally_mode;
  v_polling text := nullif(btrim(p_payload->>'polling_place_name'), '');
  v_super_client uuid := nullif(p_payload->>'supersedes_client_record_id', '')::uuid;
  v_reason text := nullif(btrim(p_payload->>'correction_reason'), '');
  v_super_id uuid;
  v_session uuid;
  v_ltype public.location_type;
  v_status public.tally_status := 'submitted';
  v_conflicts integer;
  v_existing public.tally_sessions%rowtype;
  v_line jsonb;
begin
  if v_uid is null then raise exception 'Sign in first'; end if;
  if jsonb_typeof(p_payload->'lines') is distinct from 'array' or jsonb_array_length(p_payload->'lines') = 0 then
    raise exception 'A tally needs at least one line';
  end if;

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
  if v_ltype in ('province', 'district', 'llg') then
    raise exception 'Tallies must be recorded at ward level or below';
  end if;

  -- Idempotent retry: same (team, client_record_id) returns the original result.
  select * into v_existing from public.tally_sessions where team_id = v_team and client_record_id = v_client;
  if found then
    return jsonb_build_object('session_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
  end if;

  if v_super_client is not null then
    if v_reason is null then raise exception 'A correction needs a reason'; end if;
    select id into v_super_id from public.tally_sessions where team_id = v_team and client_record_id = v_super_client;
    if v_super_id is null then raise exception 'The record being corrected has not been uploaded'; end if;
  else
    -- Same team, ward/location, mode and polling place already reported? Flag both for review.
    select count(*) into v_conflicts from public.tally_sessions
      where team_id = v_team and location_id = v_location and mode = v_mode
        and lower(coalesce(polling_place_name, '')) = lower(coalesce(v_polling, ''))
        and status in ('submitted', 'needs_review', 'verified');
    if v_conflicts > 0 then v_status := 'needs_review'; end if;
  end if;

  insert into public.tally_sessions (
    team_id, submitted_by, election_id, location_id, polling_place_name, source_sheet_reference,
    mode, status, client_record_id, device_created_at, notes, supersedes_session_id, correction_reason
  ) values (
    v_team, v_uid, v_election, v_location, v_polling, nullif(btrim(p_payload->>'source_sheet_reference'), ''),
    v_mode, v_status, v_client, (p_payload->>'device_created_at')::timestamptz,
    nullif(btrim(p_payload->>'notes'), ''), v_super_id, v_reason
  )
  on conflict (team_id, client_record_id) do nothing
  returning id into v_session;

  if v_session is null then  -- lost a race with a concurrent retry
    select * into v_existing from public.tally_sessions where team_id = v_team and client_record_id = v_client;
    return jsonb_build_object('session_id', v_existing.id, 'duplicate', true, 'status', v_existing.status);
  end if;

  for v_line in select * from jsonb_array_elements(p_payload->'lines') loop
    insert into public.tally_entries (session_id, candidate_label, candidate_code, votes, is_informal, is_rejected)
    values (
      v_session, v_line->>'candidate_label', nullif(v_line->>'candidate_code', ''),
      (v_line->>'votes')::integer,
      coalesce((v_line->>'is_informal')::boolean, false), coalesce((v_line->>'is_rejected')::boolean, false)
    );
  end loop;

  if v_super_id is not null then
    update public.tally_sessions set status = 'superseded' where id = v_super_id;
  elsif v_status = 'needs_review' then
    update public.tally_sessions set status = 'needs_review'
      where team_id = v_team and location_id = v_location and mode = v_mode
        and lower(coalesce(polling_place_name, '')) = lower(coalesce(v_polling, ''))
        and status = 'submitted' and id <> v_session;
  end if;

  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
  values (v_uid, v_team, case when v_super_id is null then 'tally.submitted' else 'tally.corrected' end,
          'tally_session', v_session::text,
          jsonb_build_object('client_record_id', v_client, 'status', v_status, 'supersedes', v_super_id, 'reason', v_reason));

  return jsonb_build_object('session_id', v_session, 'duplicate', false, 'status', v_status);
end;
$$;
revoke all on function public.submit_tally(jsonb) from public;
grant execute on function public.submit_tally(jsonb) to authenticated;

-- All writes now go through submit_tally().
revoke insert on public.tally_sessions, public.tally_entries from anon, authenticated;
