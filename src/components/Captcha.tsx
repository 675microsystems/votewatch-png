"use client";

import { useEffect, useRef } from "react";
import { CAPTCHA_FIELD, captchaSiteKey } from "@/lib/captcha";

// Optional Cloudflare Turnstile. Renders nothing unless NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, so the site works
// without it. When the key is set you must ALSO enable CAPTCHA in Supabase (Authentication > Attack Protection) with the
// matching secret key; Supabase then verifies the token that the forms below pass as `captchaToken`.

type Turnstile = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id?: string) => void;
  remove: (id?: string) => void;
};
declare global { interface Window { turnstile?: Turnstile; __tsLoad?: Promise<void> } }

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  window.__tsLoad ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { window.__tsLoad = undefined; reject(new Error("captcha script failed")); };
    document.head.appendChild(s);
  });
  return window.__tsLoad;
}

// Put inside a <form>. The token is submitted as the hidden field "cf-turnstile-response".
// Change `resetNonce` (e.g. after a failed submit) to get a fresh challenge, because each token works once.
export function Captcha({ resetNonce = 0 }: { resetNonce?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const token = useRef<HTMLInputElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!captchaSiteKey) return;
    let gone = false;
    loadScript().then(() => {
      if (gone || !box.current || !window.turnstile) return;
      if (widget.current) { window.turnstile.reset(widget.current); }
      else {
        widget.current = window.turnstile.render(box.current, {
          sitekey: captchaSiteKey,
          callback: (t: string) => { if (token.current) token.current.value = t; },
          "expired-callback": () => { if (token.current) token.current.value = ""; },
          "error-callback": () => { if (token.current) token.current.value = ""; },
        });
      }
      if (token.current) token.current.value = "";
    }).catch(() => {});
    return () => { gone = true; };
  }, [resetNonce]);

  useEffect(() => () => { if (widget.current && window.turnstile) window.turnstile.remove(widget.current); widget.current = null; }, []);

  if (!captchaSiteKey) return null;
  return (
    <div>
      <div ref={box} />
      <input ref={token} type="hidden" name={CAPTCHA_FIELD} defaultValue="" />
    </div>
  );
}
