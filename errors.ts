// Turns database / auth error text into something a person can act on, without echoing internals.
// Known messages come from the SECURITY DEFINER functions in supabase/migrations; everything else is generic.
const KNOWN: [RegExp, string][] = [
  [/Too many failed attempts/i, "Too many failed attempts. Wait 15 minutes and try again."],
  [/Administrator permission required/i, "Administrator permission is required for that action."],
  [/Only the candidate or team admin/i, "Only the candidate or a team admin of an active team can view this."],
  [/JWT expired|invalid JWT/i, "Your session has expired. Sign out, sign in again, and retry."],
  [/Failed to fetch|NetworkError|network/i, "Could not reach the server. Check your connection and try again."],
];

export function friendlyError(message: string | null | undefined): string {
  const m = message ?? "";
  for (const [re, text] of KNOWN) if (re.test(m)) return text;
  if (process.env.NODE_ENV !== "production") console.error("[votewatch]", m);
  return "Something went wrong. Please try again, and contact an administrator if it keeps happening.";
}

// Sign-up: never reveal whether an address is already registered.
export function friendlySignupError(code: string | undefined, status: number | undefined): string {
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit")
    return "Too many attempts. Wait a few minutes and try again.";
  if (code === "weak_password") return "That password is too weak. Use a longer, less common password.";
  if (code === "email_address_invalid") return "Enter a valid e-mail address.";
  return "We could not create the account. Check your details and try again.";
}
