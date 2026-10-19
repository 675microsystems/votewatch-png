"use client";

import { useCallback, useEffect, useState } from "react";
import { validateLocationsCsv, type ParseResult } from "@/lib/locations";
import type { Election, LocationDataset } from "@/lib/types";
import { ActionPanel, Badge, fmtDate, Status, useSupabase } from "@/components/ui";

const CHUNK = 400;
const ORDER = ["province", "district", "llg", "ward", "locality", "polling_place", "counting_centre"];

function CountsLine({ counts }: { counts: Record<string, number> | null | undefined }) {
  const c = counts ?? {};
  const parts = ORDER.filter((t) => c[t]).map((t) => `${c[t].toLocaleString()} ${t.replace("_", " ")}${c[t] === 1 ? "" : "s"}`);
  return <>{parts.length ? parts.join(" · ") : "–"}</>;
}

export function Locations() {
  const supabase = useSupabase();
  const [elections, setElections] = useState<Election[]>([]);
  const [electionId, setElectionId] = useState("");
  const [datasets, setDatasets] = useState<LocationDataset[] | null>(null);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<{ d: LocationDataset; kind: "activate" | "delete" } | null>(null);

  const [version, setVersion] = useState("");
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("elections").select("*").order("election_year", { ascending: false });
      if (error) { setError(error.message); return; }
      setElections(data as Election[]);
      if (data?.length) setElectionId(data[0].id);
    })();
  }, [supabase]);

  const loadDatasets = useCallback(async () => {
    if (!electionId) return;
    const { data, error } = await supabase.rpc("admin_location_datasets", { p_election: electionId });
    if (error) setError(error.message); else { setError(""); setDatasets(data as LocationDataset[]); }
  }, [supabase, electionId]);
  useEffect(() => { setDatasets(null); loadDatasets(); }, [loadDatasets]);

  async function onFile(f: File | undefined) {
    setMsg(""); setParsed(null); setFileName(f?.name ?? "");
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setMsg("File is larger than 20 MB."); return; }
    setParsed(validateLocationsCsv(await f.text()));
  }

  async function runImport() {
    if (!parsed || parsed.errors.length || !electionId) return;
    setBusy(true); setMsg("");
    let inserted = 0, skipped = 0;
    for (let i = 0; i < parsed.rows.length; i += CHUNK) {
      setProgress(`Importing ${Math.min(i + CHUNK, parsed.rows.length).toLocaleString()} of ${parsed.rows.length.toLocaleString()}…`);
      const { data, error } = await supabase.rpc("admin_import_locations", {
        p_election: electionId, p_dataset_version: version.trim(), p_source_note: source.trim(),
        p_rows: parsed.rows.slice(i, i + CHUNK),
      });
      if (error) {
        setBusy(false); setProgress("");
        setMsg(`Stopped at row ${i + 1}: ${error.message}. Rows before this were saved to the draft; fix the file and import again (already-saved rows are skipped).`);
        loadDatasets(); return;
      }
      inserted += data.inserted; skipped += data.skipped;
    }
    setBusy(false); setProgress("");
    setMsg(`Done: ${inserted.toLocaleString()} added, ${skipped.toLocaleString()} already present. The dataset is a DRAFT until you activate it below.`);
    setParsed(null); setFileName(""); loadDatasets();
  }

  const ready = parsed && !parsed.errors.length && version.trim() && source.trim().length >= 10 && electionId;

  return (
    <div>
      <div className="bar">
        <select value={electionId} onChange={(e) => setElectionId(e.target.value)} aria-label="Election">
          {elections.map((e) => <option key={e.id} value={e.id}>{e.name} ({e.election_year})</option>)}
        </select>
        <button onClick={loadDatasets}>Refresh</button>
      </div>
      {!elections.length && !error && <p className="note">Create an election first (Elections tab).</p>}
      <Status error={error} loading={false} />

      {acting && (
        <ActionPanel
          title={acting.kind === "activate"
            ? `Activate "${acting.d.dataset_version}"? Scrutineers' apps will download this geography. Any other version is switched off.`
            : `Delete draft "${acting.d.dataset_version}" (${acting.d.total.toLocaleString()} rows)? This cannot be undone.`}
          confirmLabel={acting.kind === "activate" ? "Activate dataset" : "Delete draft"}
          danger={acting.kind === "delete"}
          onCancel={() => setActing(null)}
          onConfirm={async () => {
            const { error } = acting.kind === "activate"
              ? await supabase.rpc("admin_activate_location_dataset", { p_election: electionId, p_dataset_version: acting.d.dataset_version })
              : await supabase.rpc("admin_delete_location_dataset", { p_election: electionId, p_dataset_version: acting.d.dataset_version });
            if (error) return error.message;
            setActing(null); await loadDatasets(); return null;
          }}
        />
      )}

      <h2>Datasets for this election</h2>
      <div className="wrap">
        <table className="left">
          <thead><tr><th>Version</th><th>Status</th><th>Contents</th><th>Source</th><th>Imported</th><th></th></tr></thead>
          <tbody>
            {(datasets ?? []).map((d) => (
              <tr key={d.dataset_version}>
                <td className="mono">{d.dataset_version}</td>
                <td><Badge value={d.is_active ? "active" : "draft"} /></td>
                <td><CountsLine counts={d.counts} /></td>
                <td style={{ whiteSpace: "normal", maxWidth: 300 }}>{d.source_note}</td>
                <td>{fmtDate(d.imported_at)}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  {!d.is_active && <button className="p" onClick={() => setActing({ d, kind: "activate" })}>Activate</button>}{" "}
                  {!d.is_active && <button onClick={() => setActing({ d, kind: "delete" })}>Delete draft</button>}
                </td>
              </tr>
            ))}
            {datasets && !datasets.length && <tr><td colSpan={6} className="note">No locations loaded for this election yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Import locations from CSV</h2>
      <div className="panel">
        <div className="note">
          Columns: <span className="mono">key, parent_key, type, name, code</span>. Types: province, district (open electorate), llg, ward,
          locality, polling_place, counting_centre. Each row&apos;s parent must be listed in the file or already imported into the same version.
          Imported data is saved as a <b>draft</b> and is invisible to scrutineers until you activate it.
        </div>
        <div className="bar" style={{ margin: 0 }}>
          <a className="btn" href="/templates/locations_template.csv" download>Download blank template</a>
          <a className="btn" href="/templates/png_provinces_districts_nso2024.csv" download>Download provinces + districts starter (NSO 2024)</a>
        </div>
        <input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Dataset version name, e.g. ge27-draft-1" />
        <textarea
          rows={2}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          placeholder="Source (required): cite the official document, e.g. PNGEC gazette number and date, or NSO/OCHA file name and date"
        />
        <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} aria-label="CSV file" />

        {parsed && (
          <div>
            <b>{fileName}</b>: <CountsLine counts={parsed.counts} />
            {parsed.warnings.map((w) => <div key={w} className="note">⚠ {w}</div>)}
            {parsed.errors.length > 0 && (
              <div className="bad" role="alert">
                {parsed.errors.length} problem(s) to fix before importing:
                <ul>{parsed.errors.slice(0, 30).map((e) => <li key={e}>{e}</li>)}</ul>
                {parsed.errors.length > 30 && <div>…and {parsed.errors.length - 30} more.</div>}
              </div>
            )}
          </div>
        )}
        {msg && <div className={msg.startsWith("Done") ? "live" : "bad"} role="status">{msg}</div>}
        {progress && <div className="note">{progress}</div>}
        <div className="bar" style={{ margin: 0 }}>
          <button className="p" disabled={!ready || busy} onClick={runImport}>{busy ? "Importing…" : "Import as draft"}</button>
        </div>
      </div>
    </div>
  );
}
