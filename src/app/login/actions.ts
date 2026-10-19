"use server";

import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(String(formData.get("next") ?? ""));
  if (!email || !password) return { error: "Enter your e-mail and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // Do not echo Supabase's raw message. Keep only the cases the person can act on.
    if (error.code === "email_not_confirmed") return { error: "Confirm your e-mail first: open the link we sent you, then sign in." };
    if (error.status === 429 || error.code === "over_request_rate_limit") return { error: "Too many attempts. Wait a few minutes and try again." };
    return { error: "E-mail or password is incorrect." };
  }
  redirect(next);
}
