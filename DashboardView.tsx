import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AdminTeam, Team } from "@/lib/types";
import { teamLabel } from "@/lib/teamName";
import { friendlyError } from "@/lib/errors";
import type { Viewer } from "@/lib/viewer";
import { Dashboard } from "@/app/dashboard/Dashboard";

// The live dashboard. Rendered on the homepage for signed-in candidates and team admins.
export async function DashboardView({ viewer, viewTeam }: { viewer: Viewer; viewTeam?: string }) {
  const supabase = await createClient();
  let teams: Team[] = [];
  let errorMsg: string | null = null;
  let viewingAs = false;

  if (viewer.isAdmin && viewTeam) {
    // Platform admins may open any team's dashboard (read-only). dashboard_rollup() allows admins server-side.
    const { data, error } = await supabase.rpc("admin_teams");
    if (error) errorMsg = friendlyError(error.message);
    teams = ((data ?? []) as AdminTeam[]).filter((t) => t.team_id === viewTeam);
    viewingAs = true;
  } else {
    const { data, error } = await supabase.rpc("my_teams");
    if (error) errorMsg = friendlyError(error.message);
    teams = ((data ?? []) as Team[]).filter(
      (t) => t.team_status === "approved" && ["candidate", "team_admin"].includes(t.member_role),
    );
  }

  return (
    <>
      <div className="pagehead">
        <div>
          <p className="kicker"><span className="live-dot" aria-hidden="true" />Live dashboard</p>
          <h1>{teams.length === 1 ? teamLabel(teams[0].candidate_name, teams[0].team_name) : "Team dashboard"}</h1>
        </div>
        <p className="note disclaimer">Your team&apos;s own tallies. <b>Not official election results.</b> Official figures are those your scrutineers copied from the Electoral Commission.</p>
      </div>
      {viewingAs && (
        <div className="notice">
          Viewing as platform administrator (read-only). <Link href="/admin">Back to admin console</Link>
        </div>
      )}
      {errorMsg ? (
        <p className="bad" role="alert">{errorMsg}</p>
      ) : teams.length === 0 ? (
        <div className="notice">
          {viewingAs ? "Team not found." : "No approved team where you are the candidate or team admin."}
          {viewer.isAdmin && !viewingAs && <> You are a platform administrator: <Link href="/admin">open the admin console</Link>.</>}
        </div>
      ) : (
        <Dashboard key={teams.map((t) => t.team_id).join(",")} teams={teams} readOnly={viewingAs} />
      )}
    </>
  );
}
