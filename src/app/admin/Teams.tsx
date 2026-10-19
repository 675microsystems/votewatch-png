"use client";

import Link from "next/link";
import { useState } from "react";
import { CANDIDATE_TYPE_LABEL, type AdminInvitation, type AdminTeam } from "@/lib/types";
import { ActionPanel, Badge, fmtDate, Status, useRpc, useSupabase } from "@/components/ui";

function Invitations({ team, onClose }: { team: AdminTeam; onClose: () => void }) {
  const supabase = useSupabase();
  const { data, error, loading, reload } = useRpc<AdminInvitation[]>("admin_invitations", { p_team: team.team_id });
  const [days, setDays] = useState(14);
  const [maxUses, setMaxUses] = useState(100);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function create() {
    setMsg(""); setCode(null);
    const { data, error } = await supabase.rpc("admin_create_invitation", { p_team: team.team_id, p_days: days, p_max_uses: maxUses });
    if (error) { setMsg(error.message); return; }
    setCode(data as string); reload();
  }
  async function revoke(id: string) {
    setMsg("");
    const { error } = await supabase.rpc("admin_revoke_invitation", { p_invitation: id });
    if (error) setMsg(error.message); else reload();
  }
  return (
    <div className="panel">
      <div className="bar" style={{ margin: 0, justifyContent: "space-between" }}>
        <b>Invitation codes: {team.candidate_name || team.team_name}</b>
        <button onClick={onClose}>Close</button>
      </div>
      {team.team_status !== "approved" ? (
        <p className="note">Only approved teams can issue invitation codes.</p>
      ) : (
        <div className="bar">
          <label className="note">Valid for (days) <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 80 }} /></label>
          <label className="note">Max uses <input type="number" min={1} max={100} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} style={{ width: 80 }} /></label>
          <button className="p" onClick={create}>Create code</button>
        </div>
      )}
      {code && (
        <div className="notice">
          New code (shown once; only a hash is stored): <b className="mono">{code}</b>{" "}
          <button onClick={() => navigator.clipboard?.writeText(code)}>Copy</button>
        </div>
      )}
      {msg && <div className="bad" role="alert">{msg}</div>}
      <Status error={error} loading={loading && !data} />
      <div className="wrap">
        <table className="left">
          <thead><tr><th>Created</th><th>Expires</th><th>Used</th><th>State</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((i) => (
              <tr key={i.id}>
                <td>{fmtDate(i.created_at)}</td><td>{fmtDate(i.expires_at)}</td>
                <td>{i.uses} / {i.max_uses}</td><td><Badge value={i.state} /></td>
                <td>{i.state === "active" && <button onClick={() => revoke(i.id)}>Revoke</button>}</td>
              </tr>
            ))}
            {data && !data.length && <tr><td colSpan={5} className="note">No invitations yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Teams() {
  const supabase = useSupabase();
  const { data, error, loading, reload } = useRpc<AdminTeam[]>("admin_teams");
  const [acting, setActing] = useState<{ t: AdminTeam; to: "approved" | "suspended" } | null>(null);
  const [inviting, setInviting] = useState<AdminTeam | null>(null);

  return (
    <div>
      <div className="bar"><button onClick={reload}>Refresh</button><span className="note">{data?.length ?? 0} teams</span></div>
      <Status error={error} loading={loading && !data} />

      {acting && (
        <ActionPanel
          title={acting.to === "suspended"
            ? `Suspend ${acting.t.candidate_name || acting.t.team_name}? Their dashboard and scrutineer uploads stop working.`
            : `Reinstate ${acting.t.candidate_name || acting.t.team_name}?`}
          confirmLabel={acting.to === "suspended" ? "Suspend team" : "Reinstate team"}
          danger={acting.to === "suspended"}
          noteLabel="Reason"
          noteRequired={acting.to === "suspended"}
          onCancel={() => setActing(null)}
          onConfirm={async (note) => {
            const { error } = await supabase.rpc("admin_set_team_status", {
              p_team: acting.t.team_id, p_status: acting.to, p_note: note || null,
            });
            if (error) return error.message;
            setActing(null); await reload(); return null;
          }}
        />
      )}
      {inviting && <Invitations team={inviting} onClose={() => setInviting(null)} />}

      <div className="wrap">
        <table className="left">
          <thead><tr><th>Candidate / team</th><th>Election</th><th>Status</th><th>Scrutineers</th><th>Records</th><th>To review</th><th>Last upload</th><th></th></tr></thead>
          <tbody>
            {(data ?? []).map((t) => (
              <tr key={t.team_id}>
                <td>{t.candidate_name}<div className="note">{CANDIDATE_TYPE_LABEL[t.candidate_type]} · {t.team_name}</div></td>
                <td>{t.election_name}</td>
                <td><Badge value={t.team_status} /></td>
                <td>{t.scrutineers} / {t.max_scrutineers}</td>
                <td>{t.records.toLocaleString()}</td>
                <td className={t.needs_review ? "bad" : undefined}>{t.needs_review || ""}</td>
                <td>{fmtDate(t.last_record_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <Link className="btn" href={`/dashboard?team=${t.team_id}`}>View</Link>{" "}
                  <button onClick={() => setInviting(t)}>Invites</button>{" "}
                  {t.team_status === "approved" && <button onClick={() => setActing({ t, to: "suspended" })}>Suspend</button>}
                  {t.team_status === "suspended" && <button className="p" onClick={() => setActing({ t, to: "approved" })}>Reinstate</button>}
                </td>
              </tr>
            ))}
            {data && !data.length && <tr><td colSpan={8} className="note">No teams yet. Teams are created when you approve a registration.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
