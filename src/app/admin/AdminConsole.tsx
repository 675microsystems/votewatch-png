"use client";

import { useEffect, useState } from "react";
import { useSupabase } from "@/components/ui";
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

// The database reads the admin role from the access token, which is issued at sign-in and cached for up to an hour.
// If the role was granted after that, the token is stale and every admin_* call fails. Refresh once on load and
// check the new token really carries the role, so the person gets a clear message instead of a database error.
function tokenRole(accessToken: string | undefined): string | null {
  try {
    const b64 = (accessToken ?? "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=")));
    return claims?.app_metadata?.platform_role ?? null;
  } catch {
    return null;
  }
}

export function AdminConsole() {
  const supabase = useSupabase();
  const [tab, setTab] = useState<string>("overview");
  const [session, setSession] = useState<"checking" | "ok" | "no-role" | "error">("checking");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error } = await supabase.auth.refreshSession();
      if (!alive) return;
      if (error || !data.session) return setSession("error");
      setSession(tokenRole(data.session.access_token) === "admin" ? "ok" : "no-role");
    })();
    return () => { alive = false; };
  }, [supabase]);

  if (session === "checking") return <p className="note">Checking your administrator session…</p>;
  if (session === "error") {
    return <div className="note">Your session could not be refreshed. Sign out, sign in again, then open this page.</div>;
  }
  if (session === "no-role") {
    return (
      <div className="note">
        You are signed in, but your login token does not carry the administrator role, so the database will refuse admin
        actions. Check that the <code>platform_role</code> flag was set in <code>app_metadata</code> (not user metadata)
        on this exact account, in the same Supabase project this site is connected to, then sign out and in again.
      </div>
    );
  }
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
