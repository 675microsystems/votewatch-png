"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminAuditEvent } from "@/lib/types";
import { fmtDate, Status, useSupabase } from "@/components/ui";

const PAGE = 100;

export function Audit() {
  const supabase = useSupabase();
  const [rows, setRows] = useState<AdminAuditEvent[]>([]);
  const [more, setMore] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async (before?: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_audit", { p_limit: PAGE, p_before: before ?? null });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setError("");
    const got = (data ?? []) as AdminAuditEvent[];
    setMore(got.length === PAGE);
    setRows((prev) => (before ? [...prev, ...got] : got));
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter((r) => [r.event_type, r.actor_email, r.team_name, r.entity_id, JSON.stringify(r.details)].join(" ").toLowerCase().includes(needle))
    : rows;

  return (
    <div>
      <div className="bar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter loaded events" style={{ minWidth: 240 }} />
        <button onClick={() => load()}>Refresh</button>
        <span className="note">{shown.length} shown · append-only log</span>
      </div>
      <Status error={error} loading={loading && !rows.length} />
      <div className="wrap">
        <table className="left">
          <thead><tr><th>When</th><th>Event</th><th>By</th><th>Team</th><th>Entity</th><th>Details</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{fmtDate(r.created_at)}</td>
                <td className="mono">{r.event_type}</td>
                <td>{r.actor_email ?? "–"}</td>
                <td>{r.team_name ?? "–"}</td>
                <td className="mono">{r.entity_type}:{r.entity_id.slice(0, 8)}</td>
                <td className="mono" style={{ whiteSpace: "normal", maxWidth: 320 }}>{Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more && <div className="bar"><button onClick={() => load(rows[rows.length - 1]?.id)} disabled={loading}>Load older</button></div>}
    </div>
  );
}
