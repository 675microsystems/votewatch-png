import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { AdminTeam, Team } from "@/lib/types";
import { teamLabel } from "@/lib/teamName";
import { getViewer } from "@/lib/viewer";
import { friendlyError } from "@/lib/errors";
import { Dashboard } from "./Dashboard";

export const metadata = { title: "Team dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  if (!supabaseConfigured()) {
    return (<><Header /><main><SetupNotice /></main></>);
  }
  const { team: viewTeam } = await searchParams;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/dashboard");
  const viewer = await getViewer();
  const admin = viewer.isAdmin;

  let teams: Team[] = [];
  let errorMsg: string | null = null;
  let viewingAs = false;

  if (admin && viewTeam) {
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
      <Header viewer={viewer} />
      <main className="wide">
        <h1>{teams.length === 1 ? teamLabel(teams[0].candidate_name, teams[0].team_name) : "Team dashboard"}</h1>
        {viewingAs && (
          <div className="notice">
            Viewing as platform administrator (read-only). <Link href="/admin">Back to admin console</Link>
          </div>
        )}
        <div className="note">
          Your team&apos;s own tallies only. <b>Not official election results.</b> Official figures shown are those
          your scrutineers copied from the Electoral Commission.
        </div>
        {errorMsg ? (
          <p className="bad" role="alert">{errorMsg}</p>
        ) : teams.length === 0 ? (
          <div className="notice">
            {viewingAs ? "Team not found." : "No approved team where you are the candidate or team admin."}
            {admin && !viewingAs && <> You are a platform administrator: <Link href="/admin">open the admin console</Link>.</>}
          </div>
        ) : (
          <Dashboard key={teams.map((t) => t.team_id).join(",")} teams={teams} readOnly={viewingAs} />
        )}
      </main>
    </>
  );
}
