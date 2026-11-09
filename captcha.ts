// Server- and client-safe CAPTCHA helpers (the widget itself is in components/Captcha.tsx, a client component).
export const captchaSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
export const CAPTCHA_FIELD = "cf-turnstile-response";

// Read the token from a form submission; undefined when CAPTCHA is not configured.
export function captchaToken(f: FormData): string | undefined {
  if (!captchaSiteKey) return undefined;
  return String(f.get(CAPTCHA_FIELD) ?? "");
}
export const captchaMissing = (t: string | undefined) => captchaSiteKey !== "" && !t;
