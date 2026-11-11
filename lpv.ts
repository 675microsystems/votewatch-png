// Limited Preferential Voting count. Pure functions, no database: feed it ballot patterns
// (e.g. A>B>C: 120 ballots) and it returns the round-by-round distribution.
// Rules modelled: up to 3 preferences; a candidate wins with MORE THAN HALF of the continuing
// (non-exhausted) votes; otherwise the lowest candidate is eliminated and each of their ballots
// moves to its next continuing preference, or is exhausted. Verify against PNGEC's count procedure
// before relying on it; ties for elimination are flagged, never silently decided.
export type Pattern = { prefs: string[]; count: number };
export type Round = {
  round: number;
  counts: Record<string, number>;
  exhausted: number;     // ballots with no continuing preference left
  continuing: number;    // ballots still counting for a candidate
  threshold: number;     // votes needed to win this round
  leader: string | null;
  winner: string | null;
  eliminated: string | null; // eliminated AFTER this round's count
  tie: boolean;          // lowest places tied: the elimination needs a manual decision
};

export function countLpv(candidates: string[], patterns: Pattern[], opts: { eliminateFirst?: string[] } = {}): Round[] {
  const alive = new Set(candidates);
  const forced = (opts.eliminateFirst ?? []).filter((c) => alive.has(c));
  const ballots = patterns.filter((p) => p.count > 0 && p.prefs.slice(0, 3).some((c) => alive.has(c)));
  const rounds: Round[] = [];
  let firstPrefs: Record<string, number> | null = null;

  for (let n = 1; alive.size > 0; n++) {
    const counts: Record<string, number> = Object.fromEntries([...alive].map((c) => [c, 0]));
    let exhausted = 0;
    for (const b of ballots) {
      const pick = b.prefs.slice(0, 3).find((c) => alive.has(c));
      if (pick) counts[pick] += b.count; else exhausted += b.count;
    }
    firstPrefs ??= { ...counts };
    const continuing = Object.values(counts).reduce((a, v) => a + v, 0);
    const threshold = Math.floor(continuing / 2) + 1;
    const ranked = [...alive].sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    const leader = ranked[0] ?? null;
    const done = continuing === 0 || alive.size === 1 || (leader !== null && counts[leader] >= threshold);
    if (done) {
      rounds.push({ round: n, counts, exhausted, continuing, threshold, leader, winner: continuing > 0 ? leader : null, eliminated: null, tie: false });
      break;
    }
    const lowest = Math.min(...Object.values(counts));
    const lows = ranked.filter((c) => counts[c] === lowest);
    const fp = firstPrefs;
    const out = forced.length ? forced.shift()! : [...lows].sort((a, b) => fp[a] - fp[b] || a.localeCompare(b))[0];
    rounds.push({ round: n, counts, exhausted, continuing, threshold, leader, winner: null, eliminated: out, tie: !forced.length && lows.length > 1 });
    alive.delete(out);
  }
  return rounds;
}
