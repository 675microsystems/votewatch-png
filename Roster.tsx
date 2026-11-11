"use client";

import { useState } from "react";
import type { Team, TeamMember } from "@/lib/types";
import { activityOf, type Activity } from "@/lib/activity";
import { ActionPanel, Badge, fmtDate, Status, useRpc, useSupabase } from "@/components/ui";

type Act = { m: TeamMember; kind: "remove" | "reinstate" | "make_admin" | "make_scrutineer" };

const ROLE_LABEL: Record<TeamMember["member_role"], string> = { candidate: "Candidate", team_admin: "Team admin", scrutineer: "Scrutineer" };
const ACT_LABEL: Record<Activity, [string, string]> = {
  active: ["Active", "badge ok"], quiet: ["Quiet 2h+", "badge"], silent: ["Silent 6h+", "badge bad"], never: ["No uploads yet", "badge bad"],
};

export function Roster({ team }: { team: Team }) {
  const supabase = useSupabase();
  const { data, error, loading, reload } = useRpc<TeamMember[]>("team_roster", { p_team: team.team_id });
  const [acting, setActing] = useState<Act | null>(null);
  const isCandidate = team.member_role === "candidate";

  const scrutineers = (data ?? []).filter((m) => m.active && m.member_role === "scrutineer");
  const active = scrutineers.length;
  const silent = scrutineers.filter((m) => ["silent", "never"].includes(activityOf(m.last_record_at))).length;
  const titles: Record<Act["kind"], string> = {
    remove: "Remove from the team? They can no longer upload tallies. Their past records are kept.",
    reinstate: "Reinstate this member?",
    make_admin: "Make this person a team admin? They will be able to view results and manage scrutineers and invitations.",
    make_scrutineer: "Change this team admin back to a scrutineer?",
  };

  return (
    <div>
      <div className="bar">
        <button onClick={reload}>Refresh</button>
        <span className="note">{active} / 100 active scrutineers</span>
        {silent > 0 && <span className="bad" role="status">{silent} silent or not yet uploaded</span>}
      </div>
      <Status error={error} loading={loading && !data} />

      {acting && (
        <ActionPanel
          title={`${titles[acting.kind]} (${acting.m.display_name})`}
          confirmLabel={{ remove: "Remove", reinstate: "Reinstate", make_admin: "Make team admin", make_scrutineer: "Make scrutineer" }[acting.kind]}
          danger={acting.kind === "remove"}
          noteLabel={acting.kind === "remove" ? "Reason" : undefined}
          noteRequired={acting.kind === "remove"}
          onCancel={() => setActing(null)}
          onConfirm={async (note) => {
            const { error } =
              acting.kind === "remove" || acting.kind === "reinstate"
                ? await supabase.rpc("team_set_member_active", { p_team: team.team_id, p_user: acting.m.user_id, p_active: acting.kind === "reinstate", p_note: note || null })
                : await supabase.rpc("team_set_member_role", { p_team: team.team_id, p_user: acting.m.user_id, p_role: acting.kind === "make_admin" ? "team_admin" : "scrutineer" });
            if (error) return error.message;
            setActing(null); await reload(); return null;
          }}
        />
      )}

      <div className="wrap">
        <table className="left">
          <thead><tr><th>Name</th><th>E-mail</th><th>Role</th><th>Status</th><th>Activity</th><th>Joined</th><th>Records</th><th>Last upload</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((m) => {
              const a = m.active && m.member_role === "scrutineer" ? ACT_LABEL[activityOf(m.last_record_at)] : null;
              return (
                <tr key={m.user_id}>
                  <td>{m.display_name}</td><td>{m.email}</td><td>{ROLE_LABEL[m.member_role]}</td>
                  <td><Badge value={m.active ? "active" : "removed"} /></td>
                  <td>{a ? <span className={a[1]}>{a[0]}</span> : "–"}</td>
                  <td>{fmtDate(m.joined_at)}</td><td>{m.records.toLocaleString()}</td><td>{fmtDate(m.last_record_at)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {m.member_role !== "candidate" && (isCandidate || m.member_role === "scrutineer") && (
                      m.active
                        ? <button onClick={() => setActing({ m, kind: "remove" })}>Remove</button>
                        : <button className="p" onClick={() => setActing({ m, kind: "reinstate" })}>Reinstate</button>
                    )}{" "}
                    {isCandidate && m.active && m.member_role === "scrutineer" && <button onClick={() => setActing({ m, kind: "make_admin" })}>Make admin</button>}
                    {isCandidate && m.active && m.member_role === "team_admin" && <button onClick={() => setActing({ m, kind: "make_scrutineer" })}>Make scrutineer</button>}
                  </td>
                </tr>
              );
            })}
            {data && !data.length && <tr><td colSpan={9} className="note">No members yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">
        Activity is based on the last record each person uploaded: active under 2 hours, quiet 2 to 6, silent over 6. A scrutineer who is
        offline will look silent until their phone syncs. The Records column counts current (non-superseded) tally records.
      </p>
    </div>
  );
}
