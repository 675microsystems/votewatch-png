"use client";

import Link from "next/link";
import { useState } from "react";
import type { Team } from "@/lib/types";
import { teamLabel } from "@/lib/teamName";
import { Roster } from "./Roster";
import { TeamInvitations } from "./TeamInvitations";

export function TeamConsole({ teams }: { teams: Team[] }) {
  const [teamId, setTeamId] = useState(teams[0].team_id);
  const [tab, setTab] = useState<"roster" | "invitations">("invitations");
  const team = teams.find((t) => t.team_id === teamId) ?? teams[0];
  return (
    <div>
      <div className="bar">
        {teams.length > 1 ? (
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team">
            {teams.map((t) => <option key={t.team_id} value={t.team_id}>{teamLabel(t.candidate_name, t.team_name) + " – " + t.election_name}</option>)}
          </select>
        ) : (
          <b>{teamLabel(team.candidate_name, team.team_name) + " – " + team.election_name}</b>
        )}
        <span className="note">You are the {team.member_role === "candidate" ? "candidate" : "team admin"}.</span>
        <Link className="btn" href="/dashboard">Results dashboard</Link>
      </div>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === "invitations"} className={tab === "invitations" ? "on" : ""} onClick={() => setTab("invitations")}>Invitation codes</button>
        <button role="tab" aria-selected={tab === "roster"} className={tab === "roster" ? "on" : ""} onClick={() => setTab("roster")}>Scrutineers</button>
      </div>
      {tab === "invitations" && <TeamInvitations key={team.team_id} team={team} />}
      {tab === "roster" && <Roster key={team.team_id} team={team} />}
    </div>
  );
}
