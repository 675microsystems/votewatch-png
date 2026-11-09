-- Opening an election no longer requires an activated location dataset.
-- Replaces admin_set_election_status from 007; the only change is that the "Activate a location dataset before
-- opening the election" check is removed. Everything else (admin check, allowed moves, reopen reason, audit log) is unchanged.
-- Safe to run more than once.

create or replace function public.admin_set_election_status(p_election uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_old text; v_note text := nullif(btrim(p_note), '');
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if p_status not in ('setup', 'active', 'closed', 'archived') then raise exception 'Invalid election status'; end if;
  select status into v_old from public.elections where id = p_election for update;
  if not found then raise exception 'Election not found'; end if;
  if v_old = p_status then return; end if;
  if not (
    (v_old = 'setup'  and p_status in ('active', 'archived')) or
    (v_old = 'active' and p_status = 'closed') or
    (v_old = 'closed' and p_status in ('active', 'archived'))
  ) then raise exception 'An election cannot move from % to %', v_old, p_status; end if;
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
