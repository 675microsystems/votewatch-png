import { describe, expect, it } from "vitest";
import { teamLabel } from "../teamName";

describe("teamLabel", () => {
  it("uses the last word of the name", () => expect(teamLabel("John Smith")).toBe("Team Smith"));
  it("ignores suffixes and commas", () => {
    expect(teamLabel("John Smith Jr")).toBe("Team Smith");
    expect(teamLabel("Hon. Jane Doe, MP")).toBe("Team Doe");
  });
  it("falls back when there is no name", () => {
    expect(teamLabel(null)).toBe("Team");
    expect(teamLabel("  ", "Fallback")).toBe("Fallback");
  });
});
