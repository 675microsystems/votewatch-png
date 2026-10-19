"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ElectionOption = { id: string; name: string; year: number };
export type AreaOption = { id: string; election_id: string; kind: "province" | "district"; label: string };
type CandidateType = "open_district" | "provincial_governor";
export type Initial = { election_id: string; type: CandidateType; candidate_name: string; location_id: string | null; party_name: string | null; status: "pending" | "rejected" };

// New registration, or (when `initial` is given) edit and resubmit an existing pending / rejected one.
export function RegisterForm({ elections, areas, initial }: { elections: ElectionOption[]; areas: AreaOption[]; initial?: Initial }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [election, setElection] = useState(initial?.election_id ?? elections[0]?.id ?? "");
  const [type, setType] = useState<CandidateType>(initial?.type ?? "open_district");
  const [areaId, setAreaId] = useState(initial?.location_id ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const kind = type === "open_district" ? "district" : "province";
  const options = useMemo(
    () => areas.filter((a) => a.election_id === election && a.kind === kind).sort((a, b) => a.label.localeCompare(b.label)),
    [areas, election, kind],
  );
  const areaValid = options.some((a) => a.id === areaId);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const candidate_name = String(f.get("candidate_name") ?? "").trim();
    const party = String(f.get("party_name") ?? "").trim();
    if (!candidate_name) return setError("Enter the candidate's name.");
    if (!areaValid) return setError(type === "open_district" ? "Choose the district from the list." : "Choose the province from the list.");

    setBusy(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setBusy(false); return setError("Your session has expired. Please sign in again."); }
    const { error } = initial
      ? await supabase.rpc("update_my_registration", { p_type: type, p_name: candidate_name, p_location: areaId, p_party: party || null })
      : await supabase.rpc("register_candidate", { p_election: election, p_type: type, p_name: candidate_name, p_location: areaId, p_party: party || null });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  async function withdraw() {
    setBusy(true); setError("");
    const { error } = await supabase.rpc("withdraw_my_registration");
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 560 }}>
      {!initial && (
        <label>Election
          <select value={election} onChange={(e) => { setElection(e.target.value); setAreaId(""); }} required style={{ width: "100%" }}>
            {elections.map((el) => <option key={el.id} value={el.id}>{el.name} ({el.year})</option>)}
          </select>
        </label>
      )}

      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
        <legend>Candidate type</legend>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input type="radio" name="type" checked={type === "open_district"} onChange={() => { setType("open_district"); setAreaId(""); }} />{" "}
          <b>Open (District) candidate</b>
          <div className="note">Stands for an open electorate, usually a district, in the National Parliament.</div>
        </label>
        <label style={{ display: "block" }}>
          <input type="radio" name="type" checked={type === "provincial_governor"} onChange={() => { setType("provincial_governor"); setAreaId(""); }} />{" "}
          <b>Provincial electorate candidate (Governor)</b>
          <div className="note">Stands for the whole province. This is the provincial seat in the National Parliament, and the winner is the provincial Governor.</div>
        </label>
      </fieldset>

      <label>Candidate name (as on the nomination)
        <input name="candidate_name" required maxLength={120} defaultValue={initial?.candidate_name ?? ""} style={{ width: "100%" }} />
      </label>
      <label>{type === "open_district" ? "Open electorate / district" : "Province"}
        <select value={areaValid ? areaId : ""} onChange={(e) => setAreaId(e.target.value)} required style={{ width: "100%" }}>
          <option value="" disabled>{type === "open_district" ? "Choose the district you are contesting" : "Choose the province you are contesting"}</option>
          {options.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <div className="note">Your results dashboard and your scrutineers&apos; uploads are limited to this electorate, so choose it carefully.</div>
      </label>
      <label>Party (optional)
        <input name="party_name" maxLength={120} defaultValue={initial?.party_name ?? ""} style={{ width: "100%" }} />
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <input type="checkbox" required style={{ marginTop: 4 }} />
        <span className="note">
          I am this candidate, or I am authorised by the candidate to register them. I understand an administrator will verify this
          before the team is approved, and that figures in VoteWatch PNG are unofficial team tallies, not election results.
        </span>
      </label>

      {error && <div className="bad" role="alert">{error}</div>}
      <div className="bar" style={{ margin: 0 }}>
        <button className="p" type="submit" disabled={busy}>
          {busy ? "Saving…" : initial ? (initial.status === "rejected" ? "Save and resubmit" : "Save changes") : "Submit registration"}
        </button>
        {initial?.status === "pending" && !confirmWithdraw && (
          <button type="button" onClick={() => setConfirmWithdraw(true)} disabled={busy}>Withdraw registration</button>
        )}
        {initial?.status === "pending" && confirmWithdraw && (
          <>
            <span className="note">Withdraw this registration? You can register again afterwards.</span>
            <button type="button" className="danger" onClick={withdraw} disabled={busy}>Yes, withdraw</button>
            <button type="button" onClick={() => setConfirmWithdraw(false)} disabled={busy}>Keep it</button>
          </>
        )}
      </div>
    </form>
  );
}
