-- Supabase starter schema for the VoteWatch PNG app.
-- Apply to a NEW Supabase project after reviewing and testing in staging.
-- Do not use for a live election until independent security review and field testing.

create extension if not exists pgcrypto;

create type public.candidate_type as enum ('open_district', 'provincial_governor');
create type public.registration_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.member_role as enum ('candidate', 'team_admin', 'scrutineer');
create type public.location_type as enum ('province', 'district', 'llg', 'ward', 'locality', 'polling_place', 'counting_centre');
create type public.tally_status as enum ('draft', 'submitted', 'needs_review', 'verified', 'superseded');
create type public.tally_mode as enum ('announced', 'batch_detail');

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  created_at timestamptz not null default now()
);

create table public.elections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  election_year integer not null,
  status text not null default 'setup' check (status in ('setup','active','closed','archived')),
  location_dataset_version text,
  created_at timestamptz not null default now()
);

-- One row represents a candidate's registration and the team they own.
create table public.candidate_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  election_id uuid not null references public.elections(id) on delete restrict,
  candidate_type public.candidate_type not null,
  candidate_name text not null,
  electorate_name text not null,
  party_name text,
  status public.registration_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.candidate_registrations(id) on delete restrict,
  team_name text not null,
  status public.registration_status not null default 'pending',
  max_scrutineers integer not null default 100 check (max_scrutineers between 1 and 100),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role public.member_role not null,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

-- Store only a hash of invitation codes, never the plain-text code.
create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  max_uses integer not null default 100 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  election_id uuid not null references public.elections(id) on delete restrict,
  parent_id uuid references public.locations(id) on delete restrict,
  location_type public.location_type not null,
  official_code text,
  name text not null,
  dataset_version text not null,
  active boolean not null default true,
  source_note text,
  unique (election_id, dataset_version, official_code)
);
create index locations_parent_idx on public.locations(parent_id);
create index locations_election_type_idx on public.locations(election_id, location_type, active);

create table public.tally_sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  election_id uuid not null references public.elections(id) on delete restrict,
  location_id uuid not null references public.locations(id) on delete restrict,
  polling_place_name text,
  source_sheet_reference text,
  mode public.tally_mode not null,
  status public.tally_status not null default 'submitted',
  client_record_id uuid not null,
  device_created_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  notes text,
  supersedes_session_id uuid references public.tally_sessions(id) on delete restrict,
  unique (team_id, client_record_id)
);
create index tally_sessions_team_location_idx on public.tally_sessions(team_id, location_id, server_received_at desc);
create index tally_sessions_election_idx on public.tally_sessions(election_id, status, server_received_at desc);

create table public.tally_entries (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.tally_sessions(id) on delete restrict,
  candidate_label text not null,
  candidate_code text,
  votes integer not null check (votes >= 0),
  is_informal boolean not null default false,
  is_rejected boolean not null default false,
  created_at timestamptz not null default now(),
  check (not (is_informal and is_rejected))
);
create index tally_entries_session_idx on public.tally_entries(session_id);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  team_id uuid references public.teams(id) on delete restrict,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_team_time_idx on public.audit_events(team_id, created_at desc);

-- Helper functions: SECURITY DEFINER functions use a fixed search_path.
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'platform_role') = 'admin', false);
$$;

create or replace function public.is_team_member(p_team_id uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid() and tm.active = true
  );
$$;

create or replace function public.has_team_role(p_team_id uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.team_members tm
    where tm.team_id = p_team_id and tm.user_id = auth.uid()
      and tm.active = true and tm.role = any(p_roles)
  );
$$;

-- Team creation and membership cap are enforced in the database, not just the UI.
create or replace function public.enforce_scrutineer_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cap integer;
  current_count integer;
begin
  if new.role <> 'scrutineer' or not new.active then
    return new;
  end if;
  select max_scrutineers into cap from public.teams where id = new.team_id for update;
  if cap is null then raise exception 'Team does not exist'; end if;
  select count(*) into current_count from public.team_members
    where team_id = new.team_id and role = 'scrutineer' and active = true
      and (tg_op = 'INSERT' or user_id <> new.user_id);
  if current_count >= cap then raise exception 'This team has reached its scrutineer limit'; end if;
  return new;
end;
$$;
create trigger team_member_scrutineer_cap
before insert or update of role, active, team_id on public.team_members
for each row execute function public.enforce_scrutineer_cap();

-- Invite claim is intended to be called by the authenticated app after sign-in.
-- Pass SHA-256 hex of the invitation code, not the raw code. Add rate limiting at the API edge.
create or replace function public.claim_team_invitation(p_code_hash text)
returns uuid language plpgsql security definer set search_path = public, auth as $$
declare
  inv public.team_invitations%rowtype;
  team_status public.registration_status;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.team_invitations
    where code_hash = p_code_hash and revoked_at is null and expires_at > now()
      and uses < max_uses
    for update;
  if not found then raise exception 'Invitation is invalid, expired, or fully used'; end if;
  select status into team_status from public.teams where id = inv.team_id;
  if team_status <> 'approved' then raise exception 'Team is not approved yet'; end if;
  if exists (select 1 from public.team_members where team_id = inv.team_id and user_id = auth.uid()) then
    raise exception 'You already belong to this team';
  end if;
  insert into public.team_members(team_id, user_id, role) values (inv.team_id, auth.uid(), 'scrutineer');
  update public.team_invitations set uses = uses + 1 where id = inv.id;
  insert into public.audit_events(actor_user_id, team_id, event_type, entity_type, entity_id)
    values (auth.uid(), inv.team_id, 'team.invitation_claimed', 'team_member', auth.uid()::text);
  return inv.team_id;
end;
$$;
revoke all on function public.claim_team_invitation(text) from public;
grant execute on function public.claim_team_invitation(text) to authenticated;

-- Approval is admin-only. Call from a protected admin console or server-side function.
create or replace function public.review_candidate_registration(
  p_registration_id uuid, p_approve boolean, p_note text default null
)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  update public.candidate_registrations
    set status = case when p_approve then 'approved'::public.registration_status else 'rejected'::public.registration_status end,
        reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
    where id = p_registration_id;
  if not found then raise exception 'Registration not found'; end if;
  update public.teams
    set status = case when p_approve then 'approved'::public.registration_status else 'rejected'::public.registration_status end
    where registration_id = p_registration_id;
  if p_approve then
    insert into public.team_members(team_id, user_id, role)
      select t.id, r.user_id, 'candidate'::public.member_role
      from public.teams t join public.candidate_registrations r on r.id = t.registration_id
      where r.id = p_registration_id
      on conflict (team_id, user_id) do nothing;
  end if;
  insert into public.audit_events(actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'candidate.registration_reviewed', 'candidate_registration', p_registration_id::text,
      jsonb_build_object('approved', p_approve, 'note', p_note));
end;
$$;
revoke all on function public.review_candidate_registration(uuid, boolean, text) from public;
grant execute on function public.review_candidate_registration(uuid, boolean, text) to authenticated;

-- RLS: deny by default; policies below grant only the intended team scope.
alter table public.profiles enable row level security;
alter table public.elections enable row level security;
alter table public.candidate_registrations enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;
alter table public.locations enable row level security;
alter table public.tally_sessions enable row level security;
alter table public.tally_entries enable row level security;
alter table public.audit_events enable row level security;

create policy "profile read self" on public.profiles for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "profile insert self" on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy "profile update self" on public.profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "approved election visible" on public.elections for select to authenticated using (status in ('active','closed','archived') or public.is_platform_admin());
create policy "location directory visible" on public.locations for select to authenticated using (active = true or public.is_platform_admin());

create policy "registration read owner or admin" on public.candidate_registrations for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "registration create self pending" on public.candidate_registrations for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
create policy "team read own or admin" on public.teams for select to authenticated using (public.is_team_member(id) or public.is_platform_admin());
create policy "team members read own team" on public.team_members for select to authenticated using (public.is_team_member(team_id) or public.is_platform_admin());

-- No direct invitation reads for scrutineers. Team admins can manage invitations through a trusted server endpoint.
create policy "invitation read team admins" on public.team_invitations for select to authenticated using (public.has_team_role(team_id, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin());

create policy "tally sessions read own team" on public.tally_sessions for select to authenticated using (public.is_team_member(team_id) or public.is_platform_admin());
create policy "scrutineer submits own team tally" on public.tally_sessions for insert to authenticated with check (
  public.is_team_member(team_id)
  and exists (select 1 from public.team_members tm where tm.team_id = tally_sessions.team_id and tm.user_id = auth.uid() and tm.active = true and tm.role = 'scrutineer')
  and status = 'submitted'
);
-- Submitted tallies are append-only. Corrections should be new sessions linked by supersedes_session_id.
create policy "tally entries read team" on public.tally_entries for select to authenticated using (
  exists (select 1 from public.tally_sessions s where s.id = session_id and (public.is_team_member(s.team_id) or public.is_platform_admin()))
);
create policy "scrutineer adds entries to own submitted session" on public.tally_entries for insert to authenticated with check (
  exists (select 1 from public.tally_sessions s where s.id = session_id and s.submitted_by = auth.uid()
    and exists (select 1 from public.team_members tm where tm.team_id = s.team_id and tm.user_id = auth.uid() and tm.active = true and tm.role = 'scrutineer'))
);
create policy "audit events read candidate admins" on public.audit_events for select to authenticated using (
  public.is_platform_admin() or (team_id is not null and public.has_team_role(team_id, array['candidate','team_admin']::public.member_role[]))
);

-- Direct writes to membership, invitations, audit events, and approval fields should be disabled
-- for client roles. Use server-side admin endpoints with service-role secrets kept off devices.
revoke insert, update, delete on public.teams from anon, authenticated;
revoke insert, update, delete on public.team_members from anon, authenticated;
revoke insert, update, delete on public.team_invitations from anon, authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;
revoke update, delete on public.tally_sessions from anon, authenticated;
revoke update, delete on public.tally_entries from anon, authenticated;

grant select on public.profiles, public.elections, public.candidate_registrations, public.teams,
  public.team_members, public.team_invitations, public.locations, public.tally_sessions,
  public.tally_entries, public.audit_events to authenticated;
grant insert, update on public.profiles to authenticated;
grant insert on public.candidate_registrations to authenticated;
grant insert on public.tally_sessions, public.tally_entries to authenticated;
