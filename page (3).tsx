import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/lib/types";
import { getViewer } from "@/lib/viewer";
import { TeamConsole } from "./TeamConsole";

export const metadata = { title: "My team" };
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  if (!supabaseConfigured()) return (<><Header /><main><SetupNotice /></main></>);
  const viewer = await getViewer();
  if (!viewer.signedIn) redirect("/login?next=/team");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_teams");
  const teams = ((data ?? []) as Team[]).filter(
    (t) => t.team_status === "approved" && ["candidate", "team_admin"].includes(t.member_role),
  );

  return (
    <>
      <Header viewer={viewer} />
      <main>
        <h1>My team</h1>
        {error ? (
          <p className="bad" role="alert">{error.message}</p>
        ) : teams.length === 0 ? (
          <div className="notice">
            You do not lead an approved team yet.{" "}
            {viewer.registration ? <Link href="/register">See your registration status</Link> : <Link href="/register">Register as a candidate</Link>}
            {viewer.isAdmin && <> · <Link href="/admin">Admin console</Link></>}
          </div>
        ) : (
          <TeamConsole teams={teams} />
        )}
      </main>
    </>
  );
}
