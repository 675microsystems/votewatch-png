-- Applied to the live Supabase project as migration 20261110002736 (012_performance_and_legacy_tally_lockdown).
-- Synced into the repo so the database can be rebuilt from source.

revoke insert, update, delete on public.tally_sessions, public.tally_entries from anon, authenticated;

create index if not exists audit_events_actor_idx            on public.audit_events (actor_user_id);
create index if not exists cand_reg_election_idx             on public.candidate_registrations (election_id);
create index if not exists cand_reg_reviewed_by_idx          on public.candidate_registrations (reviewed_by);
create index if not exists election_cand_electorate_idx      on public.election_candidates (electorate_location_id);
create index if not exists locations_imported_by_idx         on public.locations (imported_by);
create index if not exists tally_records_election_idx        on public.tally_records (election_id);
create index if not exists tally_records_location_idx        on public.tally_records (location_id);
create index if not exists tally_records_submitted_by_idx    on public.tally_records (submitted_by);
create index if not exists tally_records_supersedes_idx      on public.tally_records (supersedes_record_id);
create index if not exists tally_sessions_location_fk_idx    on public.tally_sessions (location_id);
create index if not exists tally_sessions_submitted_by_idx   on public.tally_sessions (submitted_by);
create index if not exists tally_sessions_supersedes_idx     on public.tally_sessions (supersedes_session_id);
create index if not exists team_invitations_created_by_idx   on public.team_invitations (created_by);
create index if not exists team_invitations_team_idx         on public.team_invitations (team_id);
create index if not exists team_members_user_idx             on public.team_members (user_id);

alter policy "profile read self" on public.profiles
  using ((user_id = (select auth.uid())) or public.is_platform_admin());
alter policy "profile insert self" on public.profiles
  with check (user_id = (select auth.uid()));
alter policy "profile update self" on public.profiles
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "registration read owner or admin" on public.candidate_registrations
  using ((user_id = (select auth.uid())) or public.is_platform_admin());
alter policy "records read leaders or own" on public.tally_records
  using (public.is_platform_admin()
         or public.has_team_role(team_id, array['candidate'::public.member_role, 'team_admin'::public.member_role])
         or ((submitted_by = (select auth.uid())) and public.is_team_member(team_id)));
alter policy "scrutineer submits own team tally" on public.tally_sessions
  with check (public.is_team_member(team_id)
    and exists (select 1 from public.team_members tm
                where tm.team_id = tally_sessions.team_id and tm.user_id = (select auth.uid())
                  and tm.active = true and tm.role = 'scrutineer'::public.member_role)
    and status = 'submitted'::public.tally_status);
alter policy "scrutineer adds entries to own submitted session" on public.tally_entries
  with check (exists (select 1 from public.tally_sessions s
    where s.id = tally_entries.session_id and s.submitted_by = (select auth.uid())
      and exists (select 1 from public.team_members tm
                  where tm.team_id = s.team_id and tm.user_id = (select auth.uid())
                    and tm.active = true and tm.role = 'scrutineer'::public.member_role)));
