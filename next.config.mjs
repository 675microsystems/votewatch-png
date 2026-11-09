const isDev = process.env.NODE_ENV !== "production";

// Allow the app to talk to your own Supabase project only (REST + Realtime websocket).
let supabaseHttp = "https://*.supabase.co";
let supabaseWs = "wss://*.supabase.co";
try {
  const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  supabaseHttp = u.origin;
  supabaseWs = "wss://" + u.host;
} catch {
  /* env not set at build time: fall back to the wildcard above */
}

// Cloudflare Turnstile (optional CAPTCHA) needs its script, frame and verification calls allowed.
const turnstile = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? " https://challenges.cloudflare.com" : "";

// Next.js injects small inline scripts, so 'unsafe-inline' is needed for script-src unless you move to nonces.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}${turnstile}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseHttp} ${supabaseWs}${isDev ? " ws://localhost:*" : ""}${turnstile}`,
  `frame-src 'self'${turnstile}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};
export default nextConfig;
