"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { Election } from "@/lib/types";
import { ActionPanel, Badge, fmtDate, Status, useSupabase } from "@/components/ui";

type Status_ = Election["status"];
type Move = { to: Status_; label: string; warn: string; danger?: boolean; noteRequired?: boolean };

// Allowed moves (mirrors admin_set_election_status in the database, which is the real enforcement).
const MOVES: Record<Status_, Move[]> = {
  setup: [
    { to: "active", label: "Open election", warn: "Candidates can register and scrutineers can upload tallies." },
    { to: "archived", label: "Archive", warn: "Archive this election without opening it?" },
  ],
  active: [
    {
      to: "closed", label: "Close election", danger: true,
      warn: "No new records can be started. Records already captured offline are still accepted when they sync, for 30 days after closing, as long as they were created before it closed.",
    },
  ],
  closed: [
    { to: "active", label: "Reopen", noteRequired: true, danger: true, warn: "Scrutineers can upload again. Reopening a closed election is recorded in the audit log with your reason." },
    { to: "archived", label: "Archive", warn: "Archive this election? It will no longer accept uploads." },
  ],
  archived: [],
};

export function Elections() {
  const supabase = useSupabase();
  const [rows, setRows] = useState<Election[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [msg, setMsg] = useState("");
  const [acting, setActing] = useState<{ e: Election; m: Move } | null>(null);

  const load = useCallback(async () => {
    // Admins can read all elections via RLS ("approved election visible" policy).
    const { data, error } = await supabase.from("elections").select("*").order("election_year", { ascending: false });
    if (error) setError(error.message); else { setError(""); setRows(data as Election[]); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  async function create(e: FormEvent) {
    e.preventDefault(); setMsg("");
    const { error } = await supabase.rpc("admin_create_election", { p_name: name, p_year: year });
    if (error) setMsg(error.message); else { setName(""); load(); }
  }

  return (
    <div>
      <form className="bar" onSubmit={create}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Election name" required style={{ minWidth: 240 }} />
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 100 }} aria-label="Year" required />
        <button className="p" type="submit">Create election</button>
      </form>
      {msg && <div className="bad" role="alert">{msg}</div>}
      <Status error={error} loading={!rows && !error} />

      {acting && (
        <ActionPanel
          title={`${acting.m.label}: ${acting.e.name}. ${acting.m.warn}`}
          confirmLabel={acting.m.label}
          danger={acting.m.danger}
          noteLabel={acting.m.noteRequired ? "Reason" : "Note for the record"}
          noteRequired={acting.m.noteRequired}
          onCancel={() => setActing(null)}
          onConfirm={async (note) => {
            const { error } = await supabase.rpc("admin_set_election_status", {
              p_election: acting.e.id, p_status: acting.m.to, p_note: note || null,
            });
            if (error) return error.message;
            setActing(null); await load(); return null;
          }}
        />
      )}

      <div className="wrap">
        <table className="left">
          <thead><tr><th>Election</th><th>Year</th><th>Status</th><th>Closed</th><th></th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td><td>{r.election_year}</td><td><Badge value={r.status} /></td>
                <td>{r.status === "closed" || r.status === "archived" ? fmtDate(r.closed_at) : "–"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {MOVES[r.status].map((m) => (
                    <button key={m.to} className={m.to === "active" && r.status === "setup" ? "p" : undefined} onClick={() => setActing({ e: r, m })}>{m.label}</button>
                  ))}{" "}
                  {!MOVES[r.status].length && <span className="note">no further changes</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note">
        Tallies are accepted while an election is <b>active</b>. After closing, records created before the close time are still accepted for 30 days
        so devices that were offline can finish syncing.
      </p>
    </div>
  );
}
