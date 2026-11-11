// How recently a scrutineer uploaded a record. Used for "silent scrutineer" warnings on election day.
export type Activity = "never" | "active" | "quiet" | "silent";
export const QUIET_HOURS = 2;
export const SILENT_HOURS = 6;

export function activityOf(lastRecordAt: string | null | undefined, now = Date.now()): Activity {
  if (!lastRecordAt) return "never";
  const hours = (now - new Date(lastRecordAt).getTime()) / 3_600_000;
  return hours >= SILENT_HOURS ? "silent" : hours >= QUIET_HOURS ? "quiet" : "active";
}
