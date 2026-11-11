import { describe, expect, it } from "vitest";
import { countLpv } from "../lpv";

const P = (prefs: string[], count: number) => ({ prefs, count });

describe("countLpv", () => {
  it("wins in round 1 with more than half of first preferences", () => {
    const r = countLpv(["A", "B"], [P(["A"], 60), P(["B"], 40)]);
    expect(r).toHaveLength(1);
    expect(r[0].winner).toBe("A");
    expect(r[0].threshold).toBe(51);
  });
  it("distributes preferences and counts exhausted ballots", () => {
    const r = countLpv(["A", "B", "C"], [P(["A", "C"], 40), P(["B"], 35), P(["C", "B"], 15), P(["C"], 10)]);
    expect(r[0].eliminated).toBe("C");
    expect(r[1].counts).toEqual({ A: 40, B: 50 });
    expect(r[1].exhausted).toBe(10);
    expect(r[1].winner).toBe("B");
    expect(r[1].threshold).toBe(46); // falls as ballots exhaust
  });
  it("simulates a forced elimination", () => {
    const pats = [P(["A", "B"], 30), P(["B", "A"], 30), P(["C", "A"], 20), P(["D", "B"], 20)];
    expect(countLpv(["A", "B", "C", "D"], pats, { eliminateFirst: ["D"] })[0].eliminated).toBe("D");
  });
  it("flags a tie for last place instead of hiding it", () => {
    const r = countLpv(["A", "B", "C"], [P(["A"], 50), P(["B"], 25), P(["C"], 25)]);
    expect(r[0].tie).toBe(true);
  });
  it("ignores preferences beyond the third", () => {
    const r = countLpv(["A", "B", "C", "D"], [P(["A", "B", "C", "D"], 10), P(["B"], 5)]);
    expect(r[r.length - 1].winner).toBe("A");
  });
});
