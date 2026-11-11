"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function subscribe(cb: () => void) {
  const m = new MutationObserver(cb);
  m.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => m.disconnect();
}
const snapshot = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => "dark" as Theme);
  const light = theme === "light";
  function flip() {
    const next: Theme = light ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("vw-theme", next); } catch { /* private mode: the choice just won't persist */ }
  }
  return (
    <button type="button" role="switch" aria-checked={light} aria-label="Light mode" title={light ? "Switch to dark mode" : "Switch to light mode"} className="tswitch" onClick={flip}>
      <svg viewBox="0 0 24 24" className="ti moon" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" className="ti sun" aria-hidden="true"><circle cx="12" cy="12" r="4.2" fill="currentColor" /><g stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.3 5.3l1.7 1.7M17 17l1.7 1.7M5.3 18.7L7 17M17 7l1.7-1.7" /></g></svg>
      <span className="knob" />
    </button>
  );
}
