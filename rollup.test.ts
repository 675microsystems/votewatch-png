import { describe, expect, it } from "vitest";
import { enrich } from "../rollup";
import { levelsFor } from "../types";
import type { RollupRow } from "../types";

const base: RollupRow = {
  location_id: "1", location_name: "Abau", parent_name: "Central",
  polling_places_total: 10, polling_places_reported: 4,
  tally_votes: 300, tally_total_cast: 1000, tally_share_pct: 30,
  official_votes: 500, official_total_cast: 1500, flagged: 0,
};

describe("enrich", () => {
  it("computes coverage, difference and partial", () => {
    const r = enrich(base);
    expect(r.coverage).toBeCloseTo(0.4);
    expect(r.diff).toBe(-200);
    expect(r.partial).toBe(true);
  });
  it("is not partial once every polling place has reported", () => {
    expect(enrich({ ...base, polling_places_reported: 10 }).partial).toBe(false);
  });
  it("has no coverage or diff when there is nothing to compare", () => {
    const r = enrich({ ...base, polling_places_total: 0, official_votes: null });
    expect(r.coverage).toBeNull();
    expect(r.diff).toBeNull();
    expect(r.partial).toBe(true);
  });
});

describe("levelsFor", () => {
  it("hides 'by province' for open (district) candidates", () => {
    expect(levelsFor("open_district").map((l) => l.value)).not.toContain("province");
    expect(levelsFor("provincial_governor").map((l) => l.value)).toContain("province");
  });
});
