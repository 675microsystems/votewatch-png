"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function ForgotForm() {
  const supabase = useMemo(() => createClient(), []);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(""); setBusy(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
    });
    setBusy(false);
    if (error && error.status === 429) return setError("Too many requests. Wait a few minutes and try again.");
    setSent(true); // never reveal whether the address has an account
  }

  if (sent) {
    return (
      <div className="notice" role="status">
        If that address has an account, a reset link is on its way. Open it on this device. <Link href="/login">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" placeholder="E-mail" autoComplete="username" required />
      <button className="p" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      {error && <div className="bad" role="alert">{error}</div>}
    </form>
  );
}
