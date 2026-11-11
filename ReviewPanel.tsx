"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReviewRow } from "@/lib/types";
import { ActionPanel, fmtDate, Status, useRpc, useSupabase } from "@/components/ui";

const KIND: Record<ReviewRow["kind"], string> = { polling_tally: "Polling tally", official_figure: "Official figure" };
const n = (v: number) => v.toLocaleString();

// Lists places where more than one record exists. Until a leader chooses which to keep, only the most recent
// record for each place counts toward the totals.
export function ReviewPanel({
  teamId, readOnly, refreshKey, onResolved,
}: { teamId: string; readOnly: boolean; refreshKey: number; onResolved: () => void }) {
  const supabase = useSupabase();
  const { data, error, loading, reload } = useRpc<ReviewRow[]>("team_review_queue", { p_team: teamId });
  const [acting, setActing] = useState<ReviewRow | null>(null);

  // Refresh when the dashboard receives new data (skip the first run: useRpc already loaded).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    reload();
  }, [refreshKey, reload]);

  const groups = useMemo(() => {
    const m = new Map<string, ReviewRow[]>();
    for (const r of data ?? []) {
      const k = r.location_id + ":" + r.kind;
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()];
  }, [data]);

  if (error) return <Status error={error} loading={false} />;
  if (loading && !data) return null;
  if (!groups.length) return null;

  return (
    <section className="c" style={{ marginTop: 16 }} aria-label="Records to review">
      <h3>Records to review ({groups.length} {groups.length === 1 ? "place" : "places"})</h3>
      <p className="note">
        More than one record exists for each place below. Until you choose, only the most recent one is counted in your totals.
        {readOnly ? " (Read-only: platform administrators cannot resolve records.)" : " Keep the one that matches the count sheet."}
      </p>

      {acting && (
        <ActionPanel
          title={`Keep ${n(acting.candidate_votes)} of ${n(acting.total_votes_cast)} (by ${acting.submitted_by_name}) for ${acting.location_name} and discard the other record(s)? Discarded records stay in the history.`}
          confirmLabel="Keep this record"
          noteLabel="Why this one is correct"
          noteRequired
          onCancel={() => setActing(null)}
          onConfirm={async (note) => {
            const { error } = await supabase.rpc("resolve_records", { p_team: teamId, p_keep: acting.record_id, p_note: note });
            if (error) return error.message;
            setActing(null); await reload(); onResolved(); return null;
          }}
        />
      )}

      {groups.map(([key, rows]) => (
        <div key={key} style={{ marginTop: 12 }}>
          <b>{rows[0].location_name}</b>
          <span className="note">{rows[0].parent_name ? ` · ${rows[0].parent_name}` : ""} · {KIND[rows[0].kind]}</span>
          <div className="wrap">
            <table className="left">
              <thead><tr><th>Votes</th><th>Total voted</th><th>Uploaded by</th><th>Received</th><th>Source</th><th>Notes</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.record_id}>
                    <td>{n(r.candidate_votes)}</td><td>{n(r.total_votes_cast)}</td><td>{r.submitted_by_name}</td>
                    <td>{fmtDate(r.server_received_at)}</td>
                    <td style={{ whiteSpace: "normal" }}>{r.source_reference ?? "–"}</td>
                    <td style={{ whiteSpace: "normal", maxWidth: 260 }}>{r.notes ?? ""}</td>
                    <td>{!readOnly && <button className="p" onClick={() => setActing(r)}>Keep this one</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
