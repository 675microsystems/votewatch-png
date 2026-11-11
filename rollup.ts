import type { RollupRow } from "./types";

export type Row = RollupRow & { coverage: number | null; diff: number | null; partial: boolean };

export function enrich(r: RollupRow): Row {
  return {
    ...r,
    coverage: r.polling_places_total ? r.polling_places_reported / r.polling_places_total : null,
    diff: r.official_votes == null ? null : r.tally_votes - r.official_votes,
    // Fewer polling places reported than exist: the tally is expected to be below the official figure.
    partial: !r.polling_places_total || r.polling_places_reported < r.polling_places_total,
  };
}
