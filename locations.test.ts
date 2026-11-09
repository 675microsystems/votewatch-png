import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateLocationsCsv } from "../locations";

describe("validateLocationsCsv", () => {
  it("accepts the shipped provinces/districts starter file (22 provinces, 96 districts)", () => {
    const text = readFileSync("public/templates/png_provinces_districts_nso2024.csv", "utf8");
    const r = validateLocationsCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.counts.province).toBe(22);
    expect(r.counts.district).toBe(96);
  });
  it("rejects a file with no data rows", () => {
    expect(validateLocationsCsv("key,parent_key,type,name,code\n").errors.length).toBeGreaterThan(0);
  });
  it("reports a missing required column", () => {
    expect(validateLocationsCsv("key,type,name\na,province,A\n").errors.join(" ")).toMatch(/parent_key/);
  });
  it("rejects a district whose parent is not a province", () => {
    const csv = "key,parent_key,type,name,code\nd1,,district,Orphan,\n";
    expect(validateLocationsCsv(csv).errors.length + validateLocationsCsv(csv).warnings.length).toBeGreaterThan(0);
  });
});
