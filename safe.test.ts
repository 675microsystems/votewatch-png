import { describe, expect, it } from "vitest";
import { safeNext } from "../safe";

describe("safeNext (open-redirect guard)", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNext("/team")).toBe("/team");
    expect(safeNext("/dashboard?team=abc")).toBe("/dashboard?team=abc");
  });
  it("falls back for empty or missing values", () => {
    expect(safeNext(undefined)).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("")).toBe("/dashboard");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil.example"])(
    "rejects %s",
    (bad) => expect(safeNext(bad)).toBe("/dashboard"),
  );
  it("uses a custom fallback", () => expect(safeNext("//x", "/")).toBe("/"));
});
