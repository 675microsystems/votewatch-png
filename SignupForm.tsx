"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { friendlySignupError } from "@/lib/errors";
import { Captcha } from "@/components/Captcha";
import { captchaMissing, captchaToken } from "@/lib/captcha";

export const MIN_PASSWORD = 10;

export function SignupForm({ next }: { next: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") ?? "").trim();
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    if (!name) return setError("Enter your full name.");
    if (password.length < MIN_PASSWORD) return setError(`Use a password of at least ${MIN_PASSWORD} characters.`);
    if (password !== String(f.get("confirm") ?? "")) return setError("The two passwords do not match.");

    const captcha = captchaToken(f);
    if (captchaMissing(captcha)) return setError("Complete the verification check first.");

    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        captchaToken: captcha,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (error) { setNonce((n) => n + 1); return setError(friendlySignupError(error.code, error.status)); }
    if (data.session) { router.push(next); router.refresh(); return; }
    setSent(true); // e-mail confirmation is on; same message whether or not the address already exists
  }

  if (sent) {
    return (
      <div className="notice" role="status">
        <b>Check your e-mail.</b> If this address can be registered, we have sent a confirmation link. Open it on this device to finish.
        Nothing arrived? Check spam, or <Link href="/login">try signing in</Link>.
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit}>
      <input name="name" placeholder="Full name" autoComplete="name" required />
      <input name="email" type="email" placeholder="E-mail" autoComplete="username" required />
      <input name="password" type="password" placeholder={`Password (at least ${MIN_PASSWORD} characters)`} autoComplete="new-password" minLength={MIN_PASSWORD} required />
      <input name="confirm" type="password" placeholder="Repeat password" autoComplete="new-password" required />
      <Captcha resetNonce={nonce} />
      <button className="p" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      {error && <div className="bad" role="alert">{error}</div>}
      <div className="note">By creating an account you agree to the <Link href="/terms">Terms of use</Link> and the <Link href="/privacy">Privacy notice</Link>.</div>
      <div className="note">Already have an account? <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link></div>
    </form>
  );
}
