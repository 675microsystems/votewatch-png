"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export type ElectionOption = { id: string; name: string; year: number };
export type AreaOption = { id: string; election_id: string; kind: "province" | "district"; parent_id: string | null; name: string };
type CandidateType = "open_district" | "provincial_governor";
export type Initial = { election_id: string; type: CandidateType; candidate_name: string; location_id: string | null; party_name: string | null; status: "pending" | "rejected" };

// New registration, or (when `initial` is given) edit and resubmit an existing pending / rejected one.
export function RegisterForm({ elections, areas, initial }: { elections: ElectionOption[]; areas: AreaOption[]; initial?: Initial }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [election, setElection] = useState(initial?.election_id ?? elections[0]?.id ?? "");
  const [type, setType] = useState<CandidateType>(initial?.type ?? "open_district");
  // Province first; for Open candidates the district list then shows only that province's districts.
  const initialArea = areas.find((a) => a.id === initial?.location_id);
  const [provinceId, setProvinceId] = useState(initialArea ? (initialArea.kind === "province" ? initialArea.id : initialArea.parent_id ?? "") : "");
  const [districtId, setDistrictId] = useState(initialArea?.kind === "district" ? initialArea.id : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  const byName = (a: AreaOption, b: AreaOption) => a.name.localeCompare(b.name);
  const provinces = useMemo(() => areas.filter((a) => a.election_id === election && a.kind === "province").sort(byName), [areas, election]);
  const districts = useMemo(
    () => areas.filter((a) => a.election_id === election && a.kind === "district" && a.parent_id === provinceId).sort(byName),
    [areas, election, provinceId],
  );
  // The electorate that is saved: the district for Open candidates, the province for Governor candidates.
  const areaId = type === "open_district" ? districtId : provinceId;
  const areaValid = type === "open_district" ? districts.some((a) => a.id === districtId) : provinces.some((a) => a.id === provinceId);
  const resetAreas = () => { setProvinceId(""); setDistrictId(""); };

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const candidate_name = String(f.get("candidate_name") ?? "").trim();
    const party = String(f.get("party_name") ?? "").trim();
    if (!candidate_name) return setError("Enter the candidate's name.");
    if (!provinceId) return setError("Choose the province from the list.");
    if (!areaValid) return setError("Choose the district from the list.");

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
          <select value={election} onChange={(e) => { setElection(e.target.value); resetAreas(); }} required style={{ width: "100%" }}>
            {elections.map((el) => <option key={el.id} value={el.id}>{el.name} ({el.year})</option>)}
          </select>
        </label>
      )}

      <fieldset style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
        <legend>Candidate type</legend>
        <label style={{ display: "block", marginBottom: 8 }}>
          <input type="radio" name="type" checked={type === "open_district"} onChange={() => { setType("open_district"); setDistrictId(""); }} />{" "}
          <b>Open (District) candidate</b>
          <div className="note">Stands for an open electorate, usually a district, in the National Parliament.</div>
        </label>
        <label style={{ display: "block" }}>
          <input type="radio" name="type" checked={type === "provincial_governor"} onChange={() => { setType("provincial_governor"); setDistrictId(""); }} />{" "}
          <b>Provincial electorate candidate (Governor)</b>
          <div className="note">Stands for the whole province. This is the provincial seat in the National Parliament, and the winner is the provincial Governor.</div>
        </label>
      </fieldset>

      <label>Candidate name (as on the nomination)
        <input name="candidate_name" required maxLength={120} defaultValue={initial?.candidate_name ?? ""} style={{ width: "100%" }} />
      </label>
      <label>Province
        <select value={provinces.some((a) => a.id === provinceId) ? provinceId : ""} onChange={(e) => { setProvinceId(e.target.value); setDistrictId(""); }} required style={{ width: "100%" }}>
          <option value="" disabled>{provinces.length ? "Choose the province" : "No provinces loaded yet"}</option>
          {provinces.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {type === "open_district" && (
        <label>Open electorate / district
          <select value={districts.some((a) => a.id === districtId) ? districtId : ""} onChange={(e) => setDistrictId(e.target.value)} required disabled={!provinceId} style={{ width: "100%" }}>
            <option value="" disabled>{provinceId ? "Choose the district you are contesting" : "Choose a province first"}</option>
            {districts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
      )}
      <div className="note">Your results dashboard and your scrutineers&apos; uploads are limited to this electorate, so choose it carefully.</div>
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
