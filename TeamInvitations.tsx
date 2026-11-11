"use client";

import { useState } from "react";
import type { AdminInvitation, Team } from "@/lib/types";
import { Badge, fmtDate, Status, useRpc, useSupabase } from "@/components/ui";

export function TeamInvitations({ team }: { team: Team }) {
  const supabase = useSupabase();
  const { data, error, loading, reload } = useRpc<AdminInvitation[]>("team_invitation_list", { p_team: team.team_id });
  const [days, setDays] = useState(14);
  const [maxUses, setMaxUses] = useState(20);
  const [code, setCode] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    setMsg(""); setCode(null); setCopied(false);
    const { data, error } = await supabase.rpc("team_create_invitation", { p_team: team.team_id, p_days: days, p_max_uses: maxUses });
    if (error) { setMsg(error.message); return; }
    setCode(data as string); reload();
  }
  async function revoke(id: string) {
    setMsg("");
    const { error } = await supabase.rpc("team_revoke_invitation", { p_invitation: id });
    if (error) setMsg(error.message); else reload();
  }

  return (
    <div>
      <p className="note">
        Give a scrutineer an invitation code. They install the Android app, create their own account, and enter the code to join your team
        (up to 100 scrutineers). Share codes privately. Each code can be limited by number of uses and expiry, and revoked at any time.
      </p>
      <div className="bar">
        <label className="note">Valid for (days) <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 80 }} /></label>
        <label className="note">Max uses <input type="number" min={1} max={100} value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} style={{ width: 80 }} /></label>
        <button className="p" onClick={create}>Create code</button>
      </div>
      {code && (
        <div className="notice">
          Your new code (shown only once; save it now): <b className="mono" style={{ fontSize: 16 }}>{code}</b>{" "}
          <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button>
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
            {data && !data.length && <tr><td colSpan={5} className="note">No invitation codes yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="note">For security only a scrambled version of each code is stored, so a code cannot be shown again after you leave this screen. Create a new one if you lose it.</p>
    </div>
  );
}
