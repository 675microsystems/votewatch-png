"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Captcha } from "@/components/Captcha";
import { captchaMissing, captchaToken } from "@/lib/captcha";

export function ForgotForm() {
  const supabase = useMemo(() => createClient(), []);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [nonce, setNonce] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const captcha = captchaToken(f);
    if (captchaMissing(captcha)) return setError("Complete the verification check first.");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
      captchaToken: captcha,
    });
    setBusy(false);
    setNonce((n) => n + 1);
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
      <Captcha resetNonce={nonce} />
      <button className="p" type="submit" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
      {error && <div className="bad" role="alert">{error}</div>}
    </form>
  );
}
