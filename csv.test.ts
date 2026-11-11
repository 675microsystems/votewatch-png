import { describe, expect, it } from "vitest";
import { csvCell, parseCsv } from "../csv";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, CRLF and a BOM", () => {
    const rows = parseCsv('\uFEFFa,b\r\n"x, y","say ""hi"""\r\n');
    expect(rows).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("skips blank lines", () => expect(parseCsv("a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]));
});

describe("csvCell (spreadsheet formula injection)", () => {
  it("writes finite numbers unquoted, including negatives", () => {
    expect(csvCell(12)).toBe("12");
    expect(csvCell(-5)).toBe("-5");
  });
  it.each(["=1+1", "+cmd", "-2+3", "@SUM(A1)", "\tx", "\rx"])("neutralises %j", (v) => {
    expect(csvCell(v).startsWith("\"'")).toBe(true);
  });
  it("quotes text and doubles inner quotes", () => expect(csvCell('a"b')).toBe('"a""b"'));
  it("treats null and undefined as empty", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});
