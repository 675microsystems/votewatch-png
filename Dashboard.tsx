"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teamName";
import { levelsFor, type Level, type RollupRow, type Team } from "@/lib/types";
import { ReviewPanel } from "./ReviewPanel";

type Row = RollupRow & { coverage: number | null; diff: number | null; partial: boolean };
type ColKey = keyof Row;

const COLS: [ColKey, string][] = [
  ["location_name", "Area"],
  ["parent_name", "Under"],
  ["tally_votes", "My votes"],
  ["tally_total_cast", "Total voted"],
  ["tally_share_pct", "Share %"],
  ["coverage", "Polling places reported"],
  ["official_votes", "Official votes"],
  ["diff", "Tally − official"],
  ["flagged", "To review"],
];

const n = (v: number | null | undefined) => (v == null ? "–" : Number(v).toLocaleString());

function enrich(r: RollupRow): Row {
  return {
    ...r,
    coverage: r.polling_places_total ? r.polling_places_reported / r.polling_places_total : null,
    diff: r.official_votes == null ? null : r.tally_votes - r.official_votes,
    // Fewer polling places reported than exist: the tally is expected to be below the official figure.
    partial: !r.polling_places_total || r.polling_places_reported < r.polling_places_total,
  };
}

// Numbers are written as numbers (so a negative difference stays numeric). Text is neutralised against
// spreadsheet formula injection, same rule as the Android export.
function csvCell(v: unknown) {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
}

type Point = { t: number; my: number; total: number };
type Activity = { id: string; at: Date; text: string; bad: boolean };

function TrendChart({ points }: { points: Point[] }) {
  if (points.length < 2) return <p className="note">The trend builds as new results arrive while this page is open.</p>;
  const W = 620, H = 200, L = 44, B = 24, T = 12;
  const t0 = points[0].t, t1 = points[points.length - 1].t || 1;
  const max = Math.max(1, ...points.map((p) => Math.max(p.my, p.total)));
  const x = (t: number) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - 8);
  const y = (v: number) => T + (1 - v / max) * (H - T - B);
  const line = (k: "my" | "total") => points.map((p) => `${x(p.t).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Line chart of your votes and total voted since you opened this page">
      {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W - 8} y1={y(max * f)} y2={y(max * f)} className="grid" /><text x={0} y={y(max * f) + 4} className="axis">{Math.round(max * f).toLocaleString()}</text></g>)}
      <polyline points={line("total")} fill="none" stroke="#8fa3c4" strokeWidth="2.5" />
      <polyline points={line("my")} fill="none" stroke="#3de3fb" strokeWidth="3" />
      <text x={L} y={H - 4} className="axis">{new Date(t0).toLocaleTimeString()}</text>
      <text x={W - 8} y={H - 4} textAnchor="end" className="axis">{new Date(t1).toLocaleTimeString()}</text>
    </svg>
  );
}

function Donut({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0, C = 2 * Math.PI * 46;
  return (
    <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`${Math.round(pct * 100)} percent of polling places have reported`}>
      <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="14" />
      <circle cx="60" cy="60" r="46" fill="none" stroke="#3de3fb" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 60 60)" />
      <text x="60" y="67" textAnchor="middle" className="donut-t">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

export function Dashboard({ teams, readOnly = false }: { teams: Team[]; readOnly?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [teamId, setTeamId] = useState(teams[0].team_id);
  const [level, setLevel] = useState<Level>("ward");
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<Date | null>(null);
  const [sortKey, setSortKey] = useState<ColKey>("tally_share_pct");
  const [sortDir, setSortDir] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevRows = useRef<Map<string, Row> | null>(null);
  const [history, setHistory] = useState<Point[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [live, setLive] = useState<boolean | null>(null); // Realtime channel state; null until first report
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0); // guards against an older response overwriting a newer one

  const team = teams.find((t) => t.team_id === teamId) ?? teams[0];
  const levels = useMemo(() => levelsFor(team.candidate_type), [team.candidate_type]);

  function changeTeam(id: string) {
    const next = teams.find((t) => t.team_id === id);
    setTeamId(id);
    if (next && !levelsFor(next.candidate_type).some((l) => l.value === level)) setLevel("district");
  }

  // A new team or level starts a fresh trend and feed, and clears the old rows so they are never shown under the wrong heading.
  useEffect(() => { prevRows.current = null; setHistory([]); setActivity([]); setRows([]); setLoading(true); }, [teamId, level]);

  const load = useCallback(async () => {
    const mine = ++reqId.current;
    const { data, error } = await supabase.rpc("dashboard_rollup", { p_team: teamId, p_level: level });
    if (mine !== reqId.current) return; // a newer request has started; drop this answer
    setLoading(false);
    if (error) { setError(error.message); return; }
    setError("");
    const next = ((data ?? []) as RollupRow[]).map(enrich);
    const now = new Date();
    const prev = prevRows.current;
    if (prev) {
      const fresh: Activity[] = [];
      for (const r of next) {
        const o = prev.get(r.location_id);
        const dv = r.tally_votes - (o?.tally_votes ?? 0);
        if (dv !== 0) fresh.push({ id: r.location_id + now.getTime(), at: now, text: `${r.location_name}: ${dv > 0 ? "+" : ""}${dv.toLocaleString()} votes`, bad: r.flagged > (o?.flagged ?? 0) });
      }
      if (fresh.length) setActivity((a) => [...fresh, ...a].slice(0, 8));
    }
    prevRows.current = new Map(next.map((r) => [r.location_id, r]));
    setHistory((h) => [...h, { t: now.getTime(), my: next.reduce((a, r) => a + r.tally_votes, 0), total: next.reduce((a, r) => a + r.tally_total_cast, 0) }].slice(-60));
    setRows(next);
    setUpdated(now);
  }, [supabase, teamId, level]);

  useEffect(() => { load(); }, [load]);

  // If the live channel is down, fall back to refreshing every 30 seconds.
  useEffect(() => {
    if (live === true) return;
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [live, load]);

  // Live updates: Supabase Realtime respects the tally_records RLS policy.
  useEffect(() => {
    const channel = supabase
      .channel("tallies-" + teamId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tally_records", filter: "team_id=eq." + teamId },
        () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(load, 800);
        },
      )
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      setLive(null);
      supabase.removeChannel(channel);
    };
  }, [supabase, teamId, load]);

  const totals = useMemo(() => {
    const sum = (f: (r: Row) => number) => rows.reduce((a, r) => a + f(r), 0);
    return {
      tv: sum((r) => r.tally_votes),
      tc: sum((r) => r.tally_total_cast),
      pp: sum((r) => r.polling_places_total),
      pr: sum((r) => r.polling_places_reported),
      fl: sum((r) => r.flagged),
    };
  }, [rows]);

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const x = a[sortKey], y = b[sortKey];
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "string" ? x.localeCompare(String(y)) : Number(x) - Number(y)) * sortDir;
    });
  }, [rows, sortKey, sortDir]);

  const maxShare = Math.max(1, ...rows.map((r) => r.tally_share_pct ?? 0));

  function sortBy(k: ColKey) {
    setSortDir(k === sortKey ? -sortDir : -1);
    setSortKey(k);
  }

  function exportCsv() {
    const head = COLS.map((c) => c[1]).concat(["Official total voted"]);
    const body = sorted.map((r) =>
      COLS.map(([k]) => k === "coverage" ? (r.polling_places_total ? `${r.polling_places_reported} / ${r.polling_places_total}` : "") : r[k])
        .concat([r.official_total_cast]));
    const text = [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    // The BOM makes Excel read the file as UTF-8.
    a.href = URL.createObjectURL(new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" }));
    a.download = "votewatch-" + level + ".csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const gain = history.length > 1 ? totals.tv - history[0].my : 0;
  const cards: [string, string, string?][] = [
    ["My votes (team tally)", n(totals.tv), gain ? `${gain > 0 ? "+" : ""}${n(gain)} since you opened this page` : undefined],
    ["Total voted where reported", n(totals.tc)],
    ["My share", totals.tc ? ((100 * totals.tv) / totals.tc).toFixed(1) + "%" : "–"],
    ["Polling places reported", totals.pp ? `${totals.pr} / ${totals.pp}` : "–", totals.pp ? `${Math.round((100 * totals.pr) / totals.pp)}% coverage` : undefined],
    ["Records to review", n(totals.fl)],
  ];
  const ranked = rows.filter((r) => r.tally_share_pct != null && r.tally_total_cast > 0).sort((a, b) => (b.tally_share_pct ?? 0) - (a.tally_share_pct ?? 0));
  const strong = ranked.slice(0, 5), weak = ranked.slice(-5).reverse().filter((r) => !strong.includes(r));

  return (
    <div>
      <div className="bar">
        <select value={teamId} onChange={(e) => changeTeam(e.target.value)} aria-label="Team">
          {teams.map((t) => (
            <option key={t.team_id} value={t.team_id}>
              {teamLabel(t.candidate_name, t.team_name) + " – " + t.election_name}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Level">
          {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <button onClick={exportCsv} disabled={!rows.length}>Export CSV</button>
        <button onClick={() => window.print()}>Print / PDF</button>
        <span className="note">
          {updated && (live === true
            ? <><span className="live">● live</span> updated {updated.toLocaleTimeString()}</>
            : <><span aria-hidden="true">○</span> not live: refreshing every 30 s · updated {updated.toLocaleTimeString()}</>)}
        </span>
      </div>
      {error && <p className="bad" role="alert">{error}</p>}
      {loading && !error && <p className="note" role="status">Loading…</p>}

      <div className="cards">
        {cards.map(([k, v, d]) => (
          <div className="c" key={k}><b>{v}</b>{k}{d && <span className="delta">{d}</span>}</div>
        ))}
      </div>

      <div className="grid2">
        <section className="c"><h3>Votes since you opened this page</h3><p className="note">Your tally against everyone who voted, in reported areas.</p>
          <TrendChart points={history} />
          <p className="note"><span className="key k1" /> My votes &nbsp; <span className="key k2" /> Total voted</p>
        </section>
        <section className="c"><h3>Reporting coverage</h3><p className="note">Polling places that have reported.</p>
          <Donut done={totals.pr} total={totals.pp} />
          <p className="note" style={{ textAlign: "center" }}>{totals.pr} reported · {Math.max(0, totals.pp - totals.pr)} to come</p>
        </section>
      </div>

      {totals.fl > 0 && <ReviewPanel teamId={teamId} readOnly={readOnly} refreshKey={updated?.getTime() ?? 0} onResolved={load} />}

      <div className="grid2 even">
        <section className="c"><h3>Strongest and weakest areas</h3><p className="note">Share of votes in areas that have reported.</p>
          {[...strong, ...weak].map((r, i) => (
            <div className="hrow" key={r.location_id}>
              <span className="hn">{r.location_name}</span>
              <span className="track"><span className={i < strong.length ? "fillg" : "fillw"} style={{ width: `${Math.min(100, r.tally_share_pct ?? 0)}%` }} /></span>
              <b>{r.tally_share_pct}%</b>
            </div>
          ))}
          {!ranked.length && <p className="note">No reported areas yet.</p>}
        </section>
        <section className="c"><h3>Live activity</h3><p className="note">Changes appear here as scrutineers upload.</p>
          {activity.map((a) => (
            <div className="hrow" key={a.id}><span className={a.bad ? "pip bad" : "pip"} /><span className="hn" style={{ flex: 1 }}>{a.text}</span><span className="note">{a.at.toLocaleTimeString()}</span></div>
          ))}
          {!activity.length && <p className="note">Waiting for the next upload…</p>}
        </section>
      </div>

      <h2>Where you are strongest and weakest</h2>
      <div className="note">
        Share = your candidate&apos;s votes as a percentage of everyone who voted in the areas that have reported.
        Click a heading to sort.
      </div>
      <div className="wrap">
        <table>
          <thead>
            <tr>
              {COLS.map(([k, t]) => (
                <th key={k} onClick={() => sortBy(k)}>{t + (k === sortKey ? (sortDir < 0 ? " ▼" : " ▲") : "")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.location_id}>
                <td>{r.location_name}</td>
                <td>{r.parent_name ?? ""}</td>
                <td>{n(r.tally_votes)}</td>
                <td>{n(r.tally_total_cast)}</td>
                <td>
                  {r.tally_share_pct == null ? "–" : <>
                    {r.tally_share_pct}%
                    <span className="bar2" style={{ width: Math.round((70 * r.tally_share_pct) / maxShare) }} />
                  </>}
                </td>
                <td>{r.polling_places_total ? `${r.polling_places_reported} / ${r.polling_places_total}` : "–"}</td>
                <td>{n(r.official_votes)}</td>
                <td
                  className={r.diff && !r.partial ? "bad" : r.diff ? "note" : undefined}
                  title={r.diff && r.partial ? "Not all polling places have reported, so a gap is expected." : undefined}
                >
                  {r.diff == null ? "–" : (r.diff > 0 ? "+" : "") + n(r.diff) + (r.partial ? " (partial)" : "")}
                </td>
                <td className={r.flagged ? "bad" : undefined}>{r.flagged || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="note">
        Areas with no reported polling places show 0. A gap between tally and official votes is a prompt to check
        the count sheets, not a result, and it is only meaningful once every polling place in the area has reported.
      </div>
    </div>
  );
}
