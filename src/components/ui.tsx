"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSupabase() {
  return useMemo(() => createClient(), []);
}

// Loads an RPC on mount / when args change. `reload()` refetches after an action.
export function useRpc<T>(fn: string, args?: Record<string, unknown>) {
  const supabase = useSupabase();
  const argsKey = JSON.stringify(args ?? {});
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc(fn, JSON.parse(argsKey));
    if (error) setError(error.message);
    else { setError(""); setData(data as T); }
    setLoading(false);
  }, [supabase, fn, argsKey]);

  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload };
}

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "–";

export function Badge({ value }: { value: string }) {
  const tone =
    ["approved", "active"].includes(value) ? "ok"
    : ["rejected", "suspended", "revoked", "removed", "expired", "closed"].includes(value) ? "bad"
    : "mid";
  return <span className={"badge " + tone}>{value}</span>;
}

// Confirmation panel used for every state-changing admin action; optionally requires a written reason.
export function ActionPanel(props: {
  title: string;
  confirmLabel: string;
  noteLabel?: string;
  noteRequired?: boolean;
  danger?: boolean;
  onConfirm: (note: string) => Promise<string | null>; // returns an error message, or null on success
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const missing = props.noteRequired && !note.trim();

  async function go() {
    setBusy(true); setErr("");
    const e = await props.onConfirm(note.trim());
    setBusy(false);
    if (e) setErr(e);
  }
  return (
    <div className="panel" role="group" aria-label={props.title}>
      <b>{props.title}</b>
      {props.noteLabel && (
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={props.noteLabel + (props.noteRequired ? " (required)" : " (optional)")}
        />
      )}
      {err && <div className="bad" role="alert">{err}</div>}
      <div className="bar" style={{ margin: 0 }}>
        <button className={props.danger ? "danger" : "p"} onClick={go} disabled={busy || !!missing}>
          {busy ? "Working…" : props.confirmLabel}
        </button>
        <button onClick={props.onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

export function Status({ error, loading }: { error: string; loading: boolean }) {
  if (error) return <p className="bad" role="alert">{error}</p>;
  if (loading) return <p className="note">Loading…</p>;
  return null;
}
