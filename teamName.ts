// "John Smith" -> "Team Smith". Uses the last word of the candidate's name, ignoring common suffixes.
const SUFFIXES = new Set(["jr", "jr.", "sr", "sr.", "ii", "iii", "iv", "mp", "obe", "cbe", "mbe"]);

export function teamLabel(candidateName: string | null | undefined, fallback = "Team"): string {
  const parts = String(candidateName ?? "").replace(/,/g, " ").trim().split(/\s+/).filter(Boolean);
  while (parts.length > 1 && SUFFIXES.has(parts[parts.length - 1].toLowerCase())) parts.pop();
  const last = parts[parts.length - 1];
  return last ? `Team ${last}` : fallback;
}
