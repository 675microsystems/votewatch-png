import { describe, expect, it, vi } from "vitest";
import { friendlyError, friendlySignupError } from "../errors";

describe("friendlyError", () => {
  it("maps known database messages", () => {
    expect(friendlyError("Too many failed attempts. Wait 15 minutes and try again.")).toMatch(/15 minutes/);
    expect(friendlyError("JWT expired")).toMatch(/session has expired/);
  });
  it("never echoes unknown internals", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const out = friendlyError('relation "public.tally_records" does not exist');
    expect(out).not.toMatch(/tally_records/);
    expect(out).toMatch(/Something went wrong/);
  });
});

describe("friendlySignupError", () => {
  it("does not reveal whether an address exists", () => {
    expect(friendlySignupError("user_already_exists", 422)).not.toMatch(/already/i);
  });
  it("explains rate limits and weak passwords", () => {
    expect(friendlySignupError(undefined, 429)).toMatch(/Too many/);
    expect(friendlySignupError("weak_password", 422)).toMatch(/password/);
  });
});
