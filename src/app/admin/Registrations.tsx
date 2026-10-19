"use client";

import { useState } from "react";
import { CANDIDATE_TYPE_LABEL, type AdminRegistration, type RegStatus } from "@/lib/types";
import { ActionPanel, Badge, fmtDate, Status, useRpc, useSupabase } from "@/components/ui";

export function Registrations() {
  const supabase = useSupabase();
  const { data, error, loading, reload } = useRpc<AdminRegistration[]>("admin_registrations");
  const [filter, setFilter] = useState<RegStatus | "all">("pending");
  const [acting, setActing] = useState<{ r: AdminRegistration; approve: boolean } | null>(null);

  const rows = (data ?? []).filter((r) => filter === "all" || r.status === filter);

  return (
    <div>
      <div className="bar">
        <select value={filter} onChange={(e) => setFilter(e.target.value as RegStatus | "all")} aria-label="Status filter">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Suspended</option>
          <option value="all">All</option>
        </select>
        <button onClick={reload}>Refresh</button>
        <span className="note">{rows.length} shown</span>
      </div>
      <Status error={error} loading={loading && !data} />

      {acting && (
        <ActionPanel
          title={`${acting.approve ? "Approve" : "Reject"} ${acting.r.candidate_name} (${acting.r.email})?`}
          confirmLabel={acting.approve ? "Approve and create team" : "Reject"}
          danger={!acting.approve}
          noteLabel="Note for the record"
          noteRequired={!acting.approve}
          onCancel={() => setActing(null)}
          onConfirm={async (note) => {
            const { error } = await supabase.rpc("admin_review_registration", {
              p_registration_id: acting.r.id, p_approve: acting.approve, p_note: note || null,
            });
            if (error) return error.message;
            setActing(null); await reload(); return null;
          }}
        />
      )}

      <div className="wrap">
        <table className="left">
          <thead><tr><th>Candidate</th><th>Type / electorate</th><th>Account</th><th>Election</th><th>Submitted</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.candidate_name}{r.party_name ? <span className="note"> · {r.party_name}</span> : null}</td>
                <td>{CANDIDATE_TYPE_LABEL[r.candidate_type]}<div className="note">{r.electorate_name}</div></td>
                <td>{r.email}</td>
                <td>{r.election_name}</td>
                <td>{fmtDate(r.created_at)}</td>
                <td><Badge value={r.status} />{r.review_note && <div className="note">{r.review_note}</div>}</td>
                <td>
                  {r.status !== "approved" && <button className="p" onClick={() => setActing({ r, approve: true })}>Approve</button>}{" "}
                  {r.status === "pending" && <button onClick={() => setActing({ r, approve: false })}>Reject</button>}
                </td>
              </tr>
            ))}
            {!rows.length && !loading && <tr><td colSpan={7} className="note">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
