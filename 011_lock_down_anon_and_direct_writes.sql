-- Applied to the live Supabase project as migration 20261110002329 (011_lock_down_anon_and_direct_writes).
-- Synced into the repo so the database can be rebuilt from source.

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ok
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if f.auth_ok then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
  end loop;
end $$;

revoke execute on function public.enforce_scrutineer_cap() from authenticated;

revoke insert, update, delete on all tables in schema public from authenticated;
grant insert, update on public.profiles        to authenticated;
grant insert         on public.tally_sessions  to authenticated;
grant insert         on public.tally_entries   to authenticated;

alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema public revoke all on tables from anon;
