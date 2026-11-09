"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";
import { Captcha } from "@/components/Captcha";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(signIn, {});
  return (
    <form action={action}>
      <input type="hidden" name="next" value={next} />
      <input name="email" type="email" placeholder="E-mail" autoComplete="username" required />
      <input name="password" type="password" placeholder="Password" autoComplete="current-password" required />
      <Captcha resetNonce={state} />
      <button className="p" type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
      {state.error && <div className="bad" role="alert">{state.error}</div>}
      <div className="note">
        <Link href="/forgot-password">Forgot your password?</Link> · <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link>
      </div>
    </form>
  );
}
