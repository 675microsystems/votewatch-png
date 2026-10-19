-- Run AFTER 005. Lets a team's candidate / team admin manage their own roster and invitation codes.
-- Every function checks the caller's role in the database; the website is only a convenience.

-- Internal helper: random 10-character code from an alphabet without look-alike characters (no 0/O, 1/I).
-- Not callable by clients; only by the SECURITY DEFINER functions below.
create or replace function public._new_invite_code()
returns text language plpgsql set search_path = public, extensions as $$
declare v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_bytes bytea := gen_random_bytes(10); v_code text := ''; i integer;
begin
  for i in 0..9 loop v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1); end loop;
  return v_code;
end;
$$;
revoke all on function public._new_invite_code() from public, anon, authenticated;

create or replace function public.team_roster(p_team uuid)
returns table (user_id uuid, display_name text, email text, member_role public.member_role, active boolean,
               joined_at timestamptz, records integer, last_record_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or a team admin can view the roster';
  end if;
  return query
    select m.user_id, coalesce(p.display_name, split_part(u.email, '@', 1))::text, u.email::text, m.role, m.active, m.joined_at,
           (select count(*)::integer from public.tally_records x where x.team_id = m.team_id and x.submitted_by = m.user_id and x.status <> 'superseded'),
           (select max(x.server_received_at) from public.tally_records x where x.team_id = m.team_id and x.submitted_by = m.user_id)
    from public.team_members m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.team_id = p_team
    order by (m.role = 'candidate') desc, (m.role = 'team_admin') desc, m.joined_at;
end;
$$;

-- Remove (deactivate) or reinstate a member. Records they submitted are kept. Reinstating respects the 100-scrutineer cap.
create or replace function public.team_set_member_active(p_team uuid, p_user uuid, p_active boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_role public.member_role; v_status public.registration_status; v_is_candidate boolean;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or a team admin can change membership';
  end if;
  select status into v_status from public.teams where id = p_team;
  if v_status is distinct from 'approved' then raise exception 'The team is not active'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own access'; end if;
  select role into v_role from public.team_members where team_id = p_team and user_id = p_user for update;
  if not found then raise exception 'Member not found'; end if;
  if v_role = 'candidate' then raise exception 'The candidate cannot be removed'; end if;
  v_is_candidate := public.has_team_role(p_team, array['candidate']::public.member_role[]) or public.is_platform_admin();
  if v_role = 'team_admin' and not v_is_candidate then raise exception 'Only the candidate can change a team admin'; end if;
  if not p_active and nullif(btrim(p_note), '') is null then raise exception 'A reason is required to remove a member'; end if;
  update public.team_members set active = p_active where team_id = p_team and user_id = p_user;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, case when p_active then 'team.member_reinstated' else 'team.member_removed' end,
            'team_member', p_user::text, jsonb_build_object('note', nullif(btrim(p_note), '')));
end;
$$;

-- Candidate only: make a scrutineer a team admin (can see the dashboard and manage scrutineers) or back.
create or replace function public.team_set_member_role(p_team uuid, p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old public.member_role;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not (public.has_team_role(p_team, array['candidate']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate can change roles';
  end if;
  if p_role not in ('team_admin', 'scrutineer') then raise exception 'Role must be team_admin or scrutineer'; end if;
  if p_user = auth.uid() then raise exception 'You cannot change your own role'; end if;
  select role into v_old from public.team_members where team_id = p_team and user_id = p_user and active for update;
  if not found then raise exception 'Active member not found'; end if;
  if v_old = 'candidate' then raise exception 'The candidate role cannot be changed'; end if;
  update public.team_members set role = p_role::public.member_role where team_id = p_team and user_id = p_user;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, 'team.member_role_changed', 'team_member', p_user::text, jsonb_build_object('from', v_old, 'to', p_role));
end;
$$;

-- Returns the plain code ONCE; only its SHA-256 (of UPPERCASE(trimmed code)) is stored, matching the app.
create or replace function public.team_create_invitation(p_team uuid, p_days integer default 14, p_max_uses integer default 100)
returns text language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_code text; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or a team admin can create invitations';
  end if;
  if not exists (select 1 from public.teams where id = p_team and status = 'approved') then raise exception 'The team is not active'; end if;
  if p_days not between 1 and 90 then raise exception 'Expiry must be 1 to 90 days'; end if;
  if p_max_uses not between 1 and 100 then raise exception 'Max uses must be 1 to 100'; end if;
  if (select count(*) from public.team_invitations
        where team_id = p_team and revoked_at is null and expires_at > now() and uses < max_uses) >= 20 then
    raise exception 'This team already has 20 active invitation codes. Revoke some first.';
  end if;
  v_code := public._new_invite_code();
  insert into public.team_invitations (team_id, code_hash, created_by, expires_at, max_uses)
    values (p_team, encode(digest(upper(btrim(v_code)), 'sha256'), 'hex'), auth.uid(), now() + make_interval(days => p_days), p_max_uses)
    returning id into v_id;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), p_team, 'team.invitation_created', 'team_invitation', v_id::text,
            jsonb_build_object('days', p_days, 'max_uses', p_max_uses));
  return v_code;
end;
$$;

create or replace function public.team_invitation_list(p_team uuid)
returns table (id uuid, created_at timestamptz, expires_at timestamptz, max_uses integer, uses integer, revoked_at timestamptz, state text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not (public.has_team_role(p_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or a team admin can view invitations';
  end if;
  return query
    select i.id, i.created_at, i.expires_at, i.max_uses, i.uses, i.revoked_at,
           case when i.revoked_at is not null then 'revoked' when i.expires_at <= now() then 'expired'
                when i.uses >= i.max_uses then 'used up' else 'active' end
    from public.team_invitations i where i.team_id = p_team order by i.created_at desc;
end;
$$;

create or replace function public.team_revoke_invitation(p_invitation uuid)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_team uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select team_id into v_team from public.team_invitations where id = p_invitation;
  if v_team is null then raise exception 'Invitation not found'; end if;
  if not (public.has_team_role(v_team, array['candidate','team_admin']::public.member_role[]) or public.is_platform_admin()) then
    raise exception 'Only the candidate or a team admin can revoke invitations';
  end if;
  update public.team_invitations set revoked_at = now() where id = p_invitation and revoked_at is null;
  if not found then raise exception 'Invitation already revoked'; end if;
  insert into public.audit_events (actor_user_id, team_id, event_type, entity_type, entity_id)
    values (auth.uid(), v_team, 'team.invitation_revoked', 'team_invitation', p_invitation::text);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'team_roster(uuid)', 'team_set_member_active(uuid, uuid, boolean, text)', 'team_set_member_role(uuid, uuid, text)',
    'team_create_invitation(uuid, integer, integer)', 'team_invitation_list(uuid)', 'team_revoke_invitation(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
