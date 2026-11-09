"use client";

import { useEffect } from "react";
import { teamLabel } from "@/lib/teamName";
import { CANDIDATE_TYPE_LABEL, type AdminAuditEvent, type AdminOverview, type AdminRegistration, type AdminTeam } from "@/lib/types";
import { Status, fmtDate, useRpc } from "@/components/ui";

const REFRESH_MS = 30_000;

// Three-segment donut: approved / pending / suspended teams.
function TeamDonut({ ok, pending, suspended }: { ok: number; pending: number; suspended: number }) {
  const total = ok + pending + suspended, C = 2 * Math.PI * 46;
  let offset = 0;
  const seg = (v: number, color: string) => {
    const len = total ? (v / total) * C : 0;
    const el = <circle key={color} cx="60" cy="60" r="46" fill="none" stroke={color} strokeWidth="14" strokeDasharray={`${len} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
    offset += len;
    return el;
  };
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`${ok} approved, ${pending} pending, ${suspended} suspended teams`}>
      <circle cx="60" cy="60" r="46" fill="none" className="d-track" strokeWidth="14" />
      {seg(ok, "var(--chart1)")}{seg(pending, "#ffb300")}{seg(suspended, "#ff6b7d")}
      <text x="60" y="67" textAnchor="middle" className="donut-t">{total}</text>
    </svg>
  );
}

export function Overview({ goto }: { goto: (tab: string) => void }) {
  const ov = useRpc<AdminOverview>("admin_overview");
  const teams = useRpc<AdminTeam[]>("admin_teams");
  const regs = useRpc<AdminRegistration[]>("admin_registrations");
  const audit = useRpc<AdminAuditEvent[]>("admin_audit", { p_limit: 6, p_before: null });
  const data = ov.data;
  const n = (v?: number) => (v ?? 0).toLocaleString();

  // Live refresh: keep the overview current without a manual click.
  const { reload: r1 } = ov, { reload: r2 } = teams, { reload: r3 } = regs, { reload: r4 } = audit;
  const reloadAll = () => { r1(); r2(); r3(); r4(); };
  useEffect(() => {
    const id = setInterval(() => { r1(); r2(); r3(); r4(); }, REFRESH_MS);
    return () => clearInterval(id);
  }, [r1, r2, r3, r4]);

  const cards: [string, number | undefined, string?][] = [
    ["Registrations awaiting review", data?.pending_registrations, "registrations"],
    ["Approved teams", data?.approved_teams, "teams"],
    ["Suspended teams", data?.suspended_teams, "teams"],
    ["Active scrutineers", data?.active_scrutineers],
    ["Active elections", data?.active_elections, "elections"],
    ["Tally records (current)", data?.records_total],
    ["Records received, last 24h", data?.records_last_24h],
    ["Records needing review", data?.records_needs_review],
  ];
  const topTeams = [...(teams.data ?? [])].sort((a, b) => b.records - a.records).slice(0, 6);
  const maxRec = Math.max(1, ...topTeams.map((t) => t.records));
  const pending = (regs.data ?? []).filter((r) => r.status === "pending").slice(0, 5);

  return (
    <div>
      <div className="bar">
        <button onClick={reloadAll}>Refresh</button>
        <span className="note"><span className="live">● live</span> refreshes every 30 seconds</span>
      </div>
      <Status error={ov.error} loading={ov.loading && !data} />
      <div className="cards">
        {cards.map(([label, v, tab]) => (
          <div className="c" key={label}>
            <b className={label.includes("review") && v ? "bad" : undefined}>{n(v)}</b>
            {label}
            {tab && <div><a href="#" onClick={(e) => { e.preventDefault(); goto(tab); }}>Open</a></div>}
          </div>
        ))}
      </div>

      <div className="grid2">
        <section className="c"><h3>Records by team</h3><p className="note">Teams with the most current tally records.</p>
          {topTeams.map((t) => (
            <div className="hrow" key={t.team_id}>
              <span className="hn">{teamLabel(t.candidate_name, t.team_name)}</span>
              <span className="track"><span className="fillg" style={{ width: `${(100 * t.records) / maxRec}%` }} /></span>
              <b>{t.records.toLocaleString()}</b>
            </div>
          ))}
          {teams.data && !topTeams.length && <p className="note">No teams yet.</p>}
          <Status error={teams.error} loading={teams.loading && !teams.data} />
        </section>
        <section className="c"><h3>Teams</h3><p className="note">Approved, pending, suspended.</p>
          <TeamDonut ok={data?.approved_teams ?? 0} pending={data?.pending_registrations ?? 0} suspended={data?.suspended_teams ?? 0} />
          <p className="note" style={{ textAlign: "center" }}>
            <span className="key k1" /> Approved &nbsp; <span className="key" style={{ background: "#ffb300" }} /> Pending &nbsp; <span className="key" style={{ background: "#ff6b7d" }} /> Suspended
          </p>
        </section>
      </div>

      <div className="grid2 even">
        <section className="c"><h3>Waiting for approval</h3><p className="note">Check each candidate before the team goes live.</p>
          {pending.map((r) => (
            <div className="hrow" key={r.id}>
              <span className="hn" style={{ flex: 1, width: "auto" }}><b>{r.candidate_name}</b> · {CANDIDATE_TYPE_LABEL[r.candidate_type]} · {r.electorate_name}</span>
              <span className="note">{fmtDate(r.created_at)}</span>
            </div>
          ))}
          {regs.data && !pending.length && <p className="note">Nothing waiting.</p>}
          {pending.length > 0 && <a href="#" onClick={(e) => { e.preventDefault(); goto("registrations"); }}>Review registrations</a>}
        </section>
        <section className="c"><h3>Recent activity</h3><p className="note">Latest audit log events.</p>
          {(audit.data ?? []).map((a) => (
            <div className="hrow" key={a.id}>
              <span className="pip" />
              <span className="hn" style={{ flex: 1, width: "auto" }}>{a.event_type.replace(/_/g, " ")}{a.team_name ? ` · ${a.team_name}` : ""}</span>
              <span className="note">{fmtDate(a.created_at)}</span>
            </div>
          ))}
          {audit.data && !audit.data.length && <p className="note">No events yet.</p>}
          <a href="#" onClick={(e) => { e.preventDefault(); goto("audit"); }}>Open audit log</a>
        </section>
      </div>
      <p className="note">Counts are team tallies, not official election results.</p>
    </div>
  );
}
