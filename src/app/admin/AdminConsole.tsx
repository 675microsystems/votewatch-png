"use client";

import { useState } from "react";
import { Audit } from "./Audit";
import { Elections } from "./Elections";
import { Locations } from "./Locations";
import { Overview } from "./Overview";
import { Registrations } from "./Registrations";
import { Teams } from "./Teams";

const TABS = [
  ["overview", "Overview"],
  ["registrations", "Registrations"],
  ["teams", "Teams"],
  ["elections", "Elections"],
  ["locations", "Locations"],
  ["audit", "Audit log"],
] as const;

export function AdminConsole() {
  const [tab, setTab] = useState<string>("overview");
  return (
    <div>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && <Overview goto={setTab} />}
      {tab === "registrations" && <Registrations />}
      {tab === "teams" && <Teams />}
      {tab === "elections" && <Elections />}
      {tab === "locations" && <Locations />}
      {tab === "audit" && <Audit />}
    </div>
  );
}
