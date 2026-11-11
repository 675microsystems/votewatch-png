import { describe, expect, it } from "vitest";
import { activityOf } from "../activity";

const now = Date.parse("2027-06-01T12:00:00Z");
const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();

describe("activityOf", () => {
  it("classifies by hours since the last upload", () => {
    expect(activityOf(ago(1), now)).toBe("active");
    expect(activityOf(ago(3), now)).toBe("quiet");
    expect(activityOf(ago(7), now)).toBe("silent");
    expect(activityOf(null, now)).toBe("never");
  });
});
