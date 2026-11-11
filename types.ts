export type Level = "province" | "district" | "llg" | "ward" | "polling_place";

export type Team = {
  team_id: string;
  team_name: string;
  member_role: "candidate" | "team_admin" | "scrutineer";
  team_status: "pending" | "approved" | "rejected" | "suspended";
  election_id: string;
  election_name: string;
  candidate_name: string | null;
  candidate_type: "open_district" | "provincial_governor";
};

// Row returned by public.dashboard_rollup(p_team, p_level). bigint columns arrive as numbers via PostgREST.
export type RollupRow = {
  location_id: string;
  location_name: string;
  parent_name: string | null;
  polling_places_total: number;
  polling_places_reported: number;
  tally_votes: number;
  tally_total_cast: number;
  tally_share_pct: number | null;
  official_votes: number | null;
  official_total_cast: number | null;
  flagged: number;
};

export const LEVELS: { value: Level; label: string }[] = [
  { value: "province", label: "By province" },
  { value: "district", label: "By district" },
  { value: "llg", label: "By LLG" },
  { value: "ward", label: "By ward" },
  { value: "polling_place", label: "By polling place" },
];

// ---- Admin console (see supabase/migrations/004_admin_console.sql) ----
export type RegStatus = "pending" | "approved" | "rejected" | "suspended";

export type AdminOverview = {
  pending_registrations: number;
  approved_teams: number;
  suspended_teams: number;
  active_scrutineers: number;
  active_elections: number;
  records_total: number;
  records_needs_review: number;
  records_last_24h: number;
};

export type AdminRegistration = {
  id: string;
  created_at: string;
  status: RegStatus;
  candidate_name: string;
  candidate_type: Team["candidate_type"];
  electorate_name: string;
  party_name: string | null;
  email: string;
  election_name: string;
  review_note: string | null;
  reviewed_at: string | null;
  team_id: string | null;
  team_status: RegStatus | null;
};

export type AdminTeam = Team & {
  scrutineers: number;
  max_scrutineers: number;
  records: number;
  needs_review: number;
  last_record_at: string | null;
};

export type AdminInvitation = {
  id: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
  state: "active" | "revoked" | "expired" | "used up";
};

export type AdminAuditEvent = {
  id: number;
  created_at: string;
  actor_email: string | null;
  team_name: string | null;
  event_type: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, unknown>;
};

export type Election = {
  id: string;
  name: string;
  election_year: number;
  status: "setup" | "active" | "closed" | "archived";
  location_dataset_version: string | null;
  closed_at: string | null;
  created_at: string;
};

export const CANDIDATE_TYPE_LABEL: Record<Team["candidate_type"], string> = {
  open_district: "Open (District)",
  provincial_governor: "Provincial (Governor)",
};

export type LocationDataset = {
  dataset_version: string;
  is_active: boolean;
  total: number;
  counts: Record<string, number> | null;
  source_note: string | null;
  imported_at: string | null;
};

// ---- Team management (see supabase/migrations/006_team_management.sql) ----
export type TeamMember = {
  user_id: string;
  display_name: string;
  email: string;
  member_role: Team["member_role"];
  active: boolean;
  joined_at: string;
  records: number;
  last_record_at: string | null;
};

// ---- Review queue (see supabase/migrations/007_integrity_and_scoping.sql) ----
export type ReviewRow = {
  record_id: string;
  location_id: string;
  location_name: string;
  parent_name: string | null;
  kind: "polling_tally" | "official_figure";
  candidate_votes: number;
  total_votes_cast: number;
  submitted_by_name: string;
  server_received_at: string;
  source_reference: string | null;
  notes: string | null;
  status: "submitted" | "needs_review" | "verified";
};

// A team's dashboard levels. An open (district) candidate's electorate is one district, so "by province" is not offered.
export const levelsFor = (candidateType: "open_district" | "provincial_governor") =>
  LEVELS.filter((l) => candidateType === "provincial_governor" || l.value !== "province");
