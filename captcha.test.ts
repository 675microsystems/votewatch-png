import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

async function load(key: string) {
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", key);
  vi.resetModules();
  return import("../captcha");
}

describe("captcha helpers", () => {
  it("does nothing when no site key is configured", async () => {
    const c = await load("");
    const f = new FormData();
    expect(c.captchaToken(f)).toBeUndefined();
    expect(c.captchaMissing(c.captchaToken(f))).toBe(false);
  });
  it("requires a token when a site key is configured", async () => {
    const c = await load("site-key");
    const f = new FormData();
    expect(c.captchaMissing(c.captchaToken(f))).toBe(true);
    f.set(c.CAPTCHA_FIELD, "tok");
    expect(c.captchaToken(f)).toBe("tok");
    expect(c.captchaMissing(c.captchaToken(f))).toBe(false);
  });
});
