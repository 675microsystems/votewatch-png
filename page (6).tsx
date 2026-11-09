import Link from "next/link";
import { redirect } from "next/navigation";
import { Header } from "@/components/Header";
import { SetupNotice } from "@/components/SetupNotice";
import { supabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { CANDIDATE_TYPE_LABEL, type Team } from "@/lib/types";
import { getViewer } from "@/lib/viewer";
import { RegisterForm, type AreaOption, type ElectionOption, type Initial } from "./RegisterForm";

export const metadata = { title: "Register as a candidate" };
export const dynamic = "force-dynamic";

type RegRow = {
  status: "pending" | "approved" | "rejected" | "suspended";
  candidate_name: string;
  candidate_type: Team["candidate_type"];
  electorate_name: string;
  party_name: string | null;
  review_note: string | null;
  created_at: string;
  election_id: string;
  electorate_location_id: string | null;
  elections: { name: string } | { name: string }[] | null;
};

type Loc = { id: string; election_id: string; parent_id: string | null; name: string; location_type: "province" | "district" };

// Provinces and districts for the given elections. Districts carry their province (parent_id) so the form can filter them.
async function loadAreas(supabase: Awaited<ReturnType<typeof createClient>>, electionIds: string[]): Promise<AreaOption[]> {
  const { data } = await supabase
    .from("locations").select("id,election_id,parent_id,name,location_type")
    .in("election_id", electionIds).in("location_type", ["province", "district"]);
  const locs = (data ?? []) as Loc[];
  return locs.map((l) => ({
    id: l.id,
    election_id: l.election_id,
    kind: l.location_type,
    parent_id: l.parent_id,
    name: l.name,
  }));
}

export default async function RegisterPage() {
  if (!supabaseConfigured()) return (<><Header /><main><SetupNotice /></main></>);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login?next=/register");
  const viewer = await getViewer();

  // Make sure a profile row exists (sign-up stored the name in user metadata; with e-mail confirmation there was no session yet).
  const display = String(auth.user.user_metadata?.display_name ?? auth.user.email?.split("@")[0] ?? "User");
  await supabase.from("profiles").upsert({ user_id: auth.user.id, display_name: display }, { onConflict: "user_id", ignoreDuplicates: true });

  const { data: regData } = await supabase
    .from("candidate_registrations")
    .select("status,candidate_name,candidate_type,electorate_name,party_name,review_note,created_at,election_id,electorate_location_id,elections(name)")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  const reg = regData as RegRow | null;

  const editAreas: AreaOption[] = reg && (reg.status === "pending" || reg.status === "rejected")
    ? await loadAreas(supabase, [reg.election_id]) : [];

  let body: React.ReactNode;
  if (reg) {
    const el = Array.isArray(reg.elections) ? reg.elections[0] : reg.elections;
    body = (
      <div className="panel">
        <div><b>{reg.candidate_name}</b> · {CANDIDATE_TYPE_LABEL[reg.candidate_type]} · {reg.electorate_name}{reg.party_name ? ` · ${reg.party_name}` : ""}</div>
        <div className="note">{el?.name}</div>
        {reg.status === "pending" && (
          <div className="notice">
            <b>Waiting for approval.</b> An administrator checks every registration before a team goes live. You will be able to open your
            dashboard and invite scrutineers once it is approved. Sign in again later to see the result.
          </div>
        )}
        {reg.status === "approved" && (
          <div className="notice"><b>Approved.</b> <Link href="/team">Manage your team and invitations</Link> or <Link href="/dashboard">open your dashboard</Link>.</div>
        )}
        {reg.status === "rejected" && (
          <div className="notice"><b>Not approved.</b>{reg.review_note ? ` Reason: ${reg.review_note}` : ""} Contact the administrator if you think this is a mistake.</div>
        )}
        {reg.status === "suspended" && <div className="notice"><b>Suspended.</b> Contact the administrator.</div>}
        {(reg.status === "pending" || reg.status === "rejected") && (
          <details style={{ marginTop: 12 }}>
            <summary>{reg.status === "rejected" ? "Fix the details and resubmit" : "Edit or withdraw this registration"}</summary>
            <div style={{ marginTop: 12 }}>
              <RegisterForm
                elections={[]}
                areas={editAreas}
                initial={{
                  election_id: reg.election_id, type: reg.candidate_type, candidate_name: reg.candidate_name,
                  location_id: reg.electorate_location_id, party_name: reg.party_name, status: reg.status,
                } satisfies Initial}
              />
            </div>
          </details>
        )}
      </div>
    );
  } else {
    const { data: elData } = await supabase.from("elections").select("id,name,election_year").eq("status", "active").order("election_year", { ascending: false });
    const elections: ElectionOption[] = (elData ?? []).map((e: { id: string; name: string; election_year: number }) => ({ id: e.id, name: e.name, year: e.election_year }));
    if (!elections.length) {
      body = <div className="notice">No election is open for registration yet. Please check back later.</div>;
    } else {
      const areas = await loadAreas(supabase, elections.map((e) => e.id));
      body = <RegisterForm elections={elections} areas={areas} />;
    }
  }

  return (
    <>
      <Header viewer={viewer} />
      <main>
        <h1>Register as a candidate</h1>
        <p className="note">
          Registration creates your candidate team. After an administrator approves it, you can invite up to 100 scrutineers who record
          tallies on the Android app, and watch results here.
        </p>
        {body}
      </main>
    </>
  );
}
