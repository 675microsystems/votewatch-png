"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MIN_PASSWORD } from "../signup/SignupForm";

export function ResetForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password.length < MIN_PASSWORD) return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== String(f.get("confirm") ?? "")) return setError("The two passwords do not match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.push("/"); router.refresh();
  }
  return (
    <form onSubmit={onSubmit}>
      <input name="password" type="password" placeholder={`New password (at least ${MIN_PASSWORD} characters)`} autoComplete="new-password" minLength={MIN_PASSWORD} required />
      <input name="confirm" type="password" placeholder="Repeat new password" autoComplete="new-password" required />
      <button className="p" type="submit" disabled={busy}>{busy ? "Saving…" : "Save new password"}</button>
      {error && <div className="bad" role="alert">{error}</div>}
    </form>
  );
}
