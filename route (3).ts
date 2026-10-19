import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe";
import { createClient } from "@/lib/supabase/server";

// Landing point for e-mail links (confirm sign-up, reset password): swaps the one-time code for a session.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  const msg = encodeURIComponent("That link is invalid or has expired. Please try again.");
  return NextResponse.redirect(`${origin}/login?error=${msg}`);
}
