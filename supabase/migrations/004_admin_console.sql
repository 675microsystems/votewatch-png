-- Run AFTER 003. Platform-administrator console support.
-- Every function below checks public.is_platform_admin() itself, so it is safe to call from the website with the
-- ordinary anon key + the admin's session. No service-role key is needed or used.

-- Idempotent approve/reject. Creates the team row on first review (nothing else creates it), then reuses the
-- existing review_candidate_registration() so membership + audit behaviour stays in one place.
create or replace function public.admin_review_registration(p_registration_id uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if not p_approve and nullif(btrim(p_note), '') is null then raise exception 'A reason is required to reject'; end if;
  insert into public.teams (registration_id, team_name, status)
    select r.id, r.candidate_name || ' team', 'pending'
    from public.candidate_registrations r where r.id = p_registration_id
    on conflict (registration_id) do nothing;
  perform public.review_candidate_registration(p_registration_id, p_approve, nullif(btrim(p_note), ''));
end;
$$;

create or replace function public.admin_set_team_status(p_team uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old public.registration_status;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if p_status not in ('approved', 'suspended') then raise exception 'Status must be approved or suspended'; end if;
  if p_status = 'suspended' and nullif(btrim(p_note), '') is null then raise exception 'A reason is required to suspend'; end if;
  select status into v_old from public.teams where id = p_team for update;
  if not found then raise exception 'Team not found'; end if;
  if v_old not in ('approved', 'suspended') then raise exception 'Only approved or suspended teams can be changed here'; end if;
  update public.teams set status = p_status::public.registration_status where id = p_team;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, 'team.status_changed', 'team', p_team::text,
            jsonb_build_object('from', v_old, 'to', p_status, 'note', nullif(btrim(p_note), '')));
end;
$$;

create or replace function public.admin_create_election(p_name text, p_year integer)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if nullif(btrim(p_name), '') is null then raise exception 'Name is required'; end if;
  insert into public.elections (name, election_year) values (btrim(p_name), p_year) returning id into v_id;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'election.created', 'election', v_id::text, jsonb_build_object('name', btrim(p_name), 'year', p_year));
  return v_id;
end;
$$;

create or replace function public.admin_set_election_status(p_election uuid, p_status text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old text;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if p_status not in ('setup', 'active', 'closed', 'archived') then raise exception 'Invalid election status'; end if;
  select status into v_old from public.elections where id = p_election for update;
  if not found then raise exception 'Election not found'; end if;
  update public.elections set status = p_status where id = p_election;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'election.status_changed', 'election', p_election::text, jsonb_build_object('from', v_old, 'to', p_status));
end;
$$;

-- Returns the plain invitation code ONCE; only its SHA-256 (of UPPERCASE(trimmed code)) is stored, matching the app.
create or replace function public.admin_create_invitation(p_team uuid, p_days integer default 14, p_max_uses integer default 100)
returns text language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea; v_code text := ''; i integer; v_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if p_days not between 1 and 90 then raise exception 'Expiry must be 1 to 90 days'; end if;
  if p_max_uses not between 1 and 100 then raise exception 'Max uses must be 1 to 100'; end if;
  if not exists (select 1 from public.teams where id = p_team and status = 'approved') then
    raise exception 'Team must be approved to issue invitations';
  end if;
  v_bytes := gen_random_bytes(10);
  for i in 0..9 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  insert into public.team_invitations (team_id, code_hash, created_by, expires_at, max_uses)
    values (p_team, encode(digest(upper(btrim(v_code)), 'sha256'), 'hex'), auth.uid(), now() + make_interval(days => p_days), p_max_uses)
    returning id into v_id;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, 'team.invitation_created', 'team_invitation', v_id::text,
            jsonb_build_object('days', p_days, 'max_uses', p_max_uses));
  return v_code;
end;
$$;

create or replace function public.admin_revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_team uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  update public.team_invitations set revoked_at = now()
    where id = p_invitation and revoked_at is null returning team_id into v_team;
  if not found then raise exception 'Invitation not found or already revoked'; end if;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id)
    values (auth.uid(), v_team, 'team.invitation_revoked', 'team_invitation', p_invitation::text);
end;
$$;

-- ---- Read helpers (join auth.users for e-mail, which the client cannot read directly) ----

create or replace function public.admin_overview()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return jsonb_build_object(
    'pending_registrations', (select count(*) from public.candidate_registrations where status = 'pending'),
    'approved_teams',        (select count(*) from public.teams where status = 'approved'),
    'suspended_teams',       (select count(*) from public.teams where status = 'suspended'),
    'active_scrutineers',    (select count(*) from public.team_members where role = 'scrutineer' and active),
    'active_elections',      (select count(*) from public.elections where status = 'active'),
    'records_total',         (select count(*) from public.tally_records where status <> 'superseded'),
    'records_needs_review',  (select count(*) from public.tally_records where status = 'needs_review'),
    'records_last_24h',      (select count(*) from public.tally_records where server_received_at > now() - interval '24 hours')
  );
end;
$$;

create or replace function public.admin_registrations()
returns table (
  id uuid, created_at timestamptz, status public.registration_status, candidate_name text,
  candidate_type public.candidate_type, electorate_name text, party_name text, email text,
  election_name text, review_note text, reviewed_at timestamptz, team_id uuid, team_status public.registration_status
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return query
    select r.id, r.created_at, r.status, r.candidate_name, r.candidate_type, r.electorate_name, r.party_name,
           u.email::text, e.name, r.review_note, r.reviewed_at, t.id, t.status
    from public.candidate_registrations r
    join auth.users u on u.id = r.user_id
    join public.elections e on e.id = r.election_id
    left join public.teams t on t.registration_id = r.id
    order by (r.status = 'pending') desc, r.created_at desc;
end;
$$;

create or replace function public.admin_teams()
returns table (
  team_id uuid, team_name text, team_status public.registration_status, member_role public.member_role,
  election_id uuid, election_name text, candidate_name text, candidate_type public.candidate_type,
  scrutineers integer, max_scrutineers integer, records integer, needs_review integer, last_record_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return query
    select t.id, t.team_name, t.status, 'candidate'::public.member_role, r.election_id, e.name, r.candidate_name, r.candidate_type,
           (select count(*)::integer from public.team_members m where m.team_id = t.id and m.role = 'scrutineer' and m.active),
           t.max_scrutineers,
           (select count(*)::integer from public.tally_records x where x.team_id = t.id and x.status <> 'superseded'),
           (select count(*)::integer from public.tally_records x where x.team_id = t.id and x.status = 'needs_review'),
           (select max(x.server_received_at) from public.tally_records x where x.team_id = t.id)
    from public.teams t
    join public.candidate_registrations r on r.id = t.registration_id
    join public.elections e on e.id = r.election_id
    order by t.created_at desc;
end;
$$;

create or replace function public.admin_invitations(p_team uuid)
returns table (id uuid, created_at timestamptz, expires_at timestamptz, max_uses integer, uses integer, revoked_at timestamptz, state text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return query
    select i.id, i.created_at, i.expires_at, i.max_uses, i.uses, i.revoked_at,
           case when i.revoked_at is not null then 'revoked'
                when i.expires_at <= now() then 'expired'
                when i.uses >= i.max_uses then 'used up'
                else 'active' end
    from public.team_invitations i where i.team_id = p_team order by i.created_at desc;
end;
$$;

create or replace function public.admin_audit(p_limit integer default 100, p_before bigint default null)
returns table (id bigint, created_at timestamptz, actor_email text, team_name text, event_type text, entity_type text, entity_id text, details jsonb)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return query
    select a.id, a.created_at, u.email::text, t.team_name, a.event_type, a.entity_type, a.entity_id, a.details
    from public.audit_events a
    left join auth.users u on u.id = a.actor_user_id
    left join public.teams t on t.id = a.team_id
    where p_before is null or a.id < p_before
    order by a.id desc limit least(greatest(p_limit, 1), 500);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_review_registration(uuid, boolean, text)', 'admin_set_team_status(uuid, text, text)',
    'admin_create_election(text, integer)', 'admin_set_election_status(uuid, text)',
    'admin_create_invitation(uuid, integer, integer)', 'admin_revoke_invitation(uuid)',
    'admin_overview()', 'admin_registrations()', 'admin_teams()', 'admin_invitations(uuid)', 'admin_audit(integer, bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
