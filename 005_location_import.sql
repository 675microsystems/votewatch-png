-- Run AFTER 004. Safe, versioned import of the election geography (locations).
-- Workflow: import into a DRAFT dataset version (rows inactive, invisible to the app) -> review counts ->
-- activate (one version per election is active at a time). Every step is admin-only and audit-logged.

alter table public.locations add column if not exists import_key text;
alter table public.locations add column if not exists imported_by uuid references auth.users(id);
alter table public.locations add column if not exists imported_at timestamptz;
create unique index if not exists locations_import_key_uq
  on public.locations (election_id, dataset_version, import_key) where import_key is not null;

-- p_rows: [{key, parent_key, type, name, code}] ordered parents-before-children (the website sorts them).
-- Idempotent: re-sending the same rows is a no-op; a key that exists with DIFFERENT data is an error.
create or replace function public.admin_import_locations(p_election uuid, p_dataset_version text, p_source_note text, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  r jsonb; v_idx integer := 0;
  v_key text; v_pkey text; v_name text; v_code text; v_type public.location_type;
  v_parent public.locations%rowtype; v_existing public.locations%rowtype;
  v_inserted integer := 0; v_skipped integer := 0; v_parent_id uuid;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if not exists (select 1 from public.elections where id = p_election) then raise exception 'Election not found'; end if;
  if nullif(btrim(p_dataset_version), '') is null then raise exception 'Dataset version is required'; end if;
  if length(btrim(coalesce(p_source_note, ''))) < 10 then
    raise exception 'Source note is required (cite the official document, e.g. gazette number and date)';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'No rows supplied'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Send at most 1000 rows per call'; end if;
  if exists (select 1 from public.locations where election_id = p_election and dataset_version = btrim(p_dataset_version) and active) then
    raise exception 'That dataset version is already active and cannot be changed. Use a new version name.';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_key := nullif(btrim(r->>'key'), '');
    v_pkey := nullif(btrim(r->>'parent_key'), '');
    v_name := nullif(btrim(r->>'name'), '');
    v_code := nullif(btrim(r->>'code'), '');
    if v_key is null or v_name is null then raise exception 'Row %: key and name are required', v_idx; end if;
    begin v_type := (r->>'type')::public.location_type;
    exception when others then raise exception 'Row % (%): unknown type "%"', v_idx, v_key, r->>'type'; end;
    if v_type is null then raise exception 'Row % (%): type is required', v_idx, v_key; end if;

    v_parent_id := null;
    if v_pkey is null then
      if v_type <> 'province' then raise exception 'Row % (%): only provinces may have no parent', v_idx, v_key; end if;
    else
      select * into v_parent from public.locations
        where election_id = p_election and dataset_version = btrim(p_dataset_version) and import_key = v_pkey;
      if not found then raise exception 'Row % (%): parent "%" not found (list parents before children)', v_idx, v_key, v_pkey; end if;
      if not (
        (v_type = 'district' and v_parent.location_type = 'province') or
        (v_type = 'llg' and v_parent.location_type = 'district') or
        (v_type = 'ward' and v_parent.location_type = 'llg') or
        (v_type = 'locality' and v_parent.location_type = 'ward') or
        (v_type = 'polling_place' and v_parent.location_type in ('ward', 'locality')) or
        (v_type = 'counting_centre' and v_parent.location_type in ('province', 'district', 'llg'))
      ) then raise exception 'Row % (%): a % cannot sit under a %', v_idx, v_key, v_type, v_parent.location_type; end if;
      v_parent_id := v_parent.id;
    end if;

    select * into v_existing from public.locations
      where election_id = p_election and dataset_version = btrim(p_dataset_version) and import_key = v_key;
    if found then
      if v_existing.name = v_name and v_existing.location_type = v_type and v_existing.parent_id is not distinct from v_parent_id then
        v_skipped := v_skipped + 1; continue;
      end if;
      raise exception 'Row % (%): key already exists in this version with different data', v_idx, v_key;
    end if;

    begin
      insert into public.locations (election_id, parent_id, location_type, official_code, name, dataset_version, active,
                                    source_note, import_key, imported_by, imported_at)
      values (p_election, v_parent_id, v_type, v_code, v_name, btrim(p_dataset_version), false,
              btrim(p_source_note), v_key, auth.uid(), now());
    exception when unique_violation then
      raise exception 'Row % (%): duplicate official code "%"', v_idx, v_key, v_code;
    end;
    v_inserted := v_inserted + 1;
  end loop;

  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'locations.imported', 'election', p_election::text,
            jsonb_build_object('dataset_version', btrim(p_dataset_version), 'inserted', v_inserted, 'skipped', v_skipped,
                               'source', btrim(p_source_note)));
  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped);
end;
$$;

create or replace function public.admin_location_datasets(p_election uuid)
returns table (dataset_version text, is_active boolean, total integer, counts jsonb, source_note text, imported_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  return query
    select l.dataset_version, bool_and(l.active), count(*)::integer,
           (select jsonb_object_agg(t.location_type, t.n) from (
              select x.location_type, count(*) as n from public.locations x
              where x.election_id = p_election and x.dataset_version = l.dataset_version group by x.location_type) t),
           max(l.source_note), max(l.imported_at)
    from public.locations l where l.election_id = p_election
    group by l.dataset_version order by max(l.imported_at) desc nulls last, l.dataset_version;
end;
$$;

create or replace function public.admin_activate_location_dataset(p_election uuid, p_dataset_version text)
returns void language plpgsql security definer set search_path = public, auth as $$
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
  update public.locations set active = (dataset_version = p_dataset_version) where election_id = p_election;
  update public.elections set location_dataset_version = p_dataset_version where id = p_election;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'locations.activated', 'election', p_election::text, jsonb_build_object('dataset_version', p_dataset_version));
end;
$$;

-- Removes a DRAFT version only (never an active one, never one that tally records point at).
create or replace function public.admin_delete_location_dataset(p_election uuid, p_dataset_version text)
returns integer language plpgsql security definer set search_path = public, auth as $$
declare v_t public.location_type; v_n integer := 0; v_c integer;
begin
  if not public.is_platform_admin() then raise exception 'Administrator permission required'; end if;
  if exists (select 1 from public.locations where election_id = p_election and dataset_version = p_dataset_version and active) then
    raise exception 'An active dataset cannot be deleted';
  end if;
  if exists (select 1 from public.tally_records tr join public.locations l on l.id = tr.location_id
             where l.election_id = p_election and l.dataset_version = p_dataset_version) then
    raise exception 'Tally records reference this dataset; it cannot be deleted';
  end if;
  -- Children first: the parent foreign key is ON DELETE RESTRICT.
  foreach v_t in array array['polling_place','counting_centre','locality','ward','llg','district','province']::public.location_type[] loop
    delete from public.locations where election_id = p_election and dataset_version = p_dataset_version and location_type = v_t;
    get diagnostics v_c = row_count; v_n := v_n + v_c;
  end loop;
  insert into public.audit_events (actor_user_id, event_type, entity_type, entity_id, details)
    values (auth.uid(), 'locations.draft_deleted', 'election', p_election::text,
            jsonb_build_object('dataset_version', p_dataset_version, 'rows', v_n));
  return v_n;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'admin_import_locations(uuid, text, text, jsonb)', 'admin_location_datasets(uuid)',
    'admin_activate_location_dataset(uuid, text)', 'admin_delete_location_dataset(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
