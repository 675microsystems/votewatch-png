import { parseCsv } from "./csv";

export type LocType = "province" | "district" | "llg" | "ward" | "locality" | "polling_place" | "counting_centre";
export type LocRow = { key: string; parent_key: string; type: LocType; name: string; code: string };

export const LOC_TYPES: LocType[] = ["province", "district", "llg", "ward", "locality", "polling_place", "counting_centre"];

// Import order: parents must reach the database before their children.
const DEPTH: Record<LocType, number> = {
  province: 0, district: 1, llg: 2, ward: 3, locality: 4, polling_place: 5, counting_centre: 5,
};

// Same rule as admin_import_locations() in the database (which is the real enforcement).
const ALLOWED_PARENTS: Record<LocType, LocType[]> = {
  province: [],
  district: ["province"],
  llg: ["district"],
  ward: ["llg"],
  locality: ["ward"],
  polling_place: ["ward", "locality"],
  counting_centre: ["province", "district", "llg"],
};

export type ParseResult = {
  rows: LocRow[];          // sorted parents-first
  errors: string[];        // block the import
  warnings: string[];      // parent not in file (must already exist in the draft version)
  counts: Partial<Record<LocType, number>>;
};

export function validateLocationsCsv(text: string): ParseResult {
  const errors: string[] = [], warnings: string[] = [];
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: ["The file has no data rows."], warnings, counts: {} };

  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (n: string) => head.indexOf(n);
  for (const need of ["key", "parent_key", "type", "name"]) {
    if (col(need) < 0) errors.push(`Missing required column "${need}".`);
  }
  if (errors.length) return { rows: [], errors, warnings, counts: {} };

  const rows: LocRow[] = [];
  const byKey = new Map<string, LocRow>();
  const codes = new Set<string>();

  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (n: string) => (col(n) >= 0 ? (cells[col(n)] ?? "").trim() : "");
    const type = get("type").toLowerCase().replace(/[\s-]+/g, "_") as LocType;
    const r: LocRow = { key: get("key"), parent_key: get("parent_key"), type, name: get("name"), code: get("code") };
    if (!r.key || !r.name) { errors.push(`Line ${line}: key and name are required.`); return; }
    if (!LOC_TYPES.includes(type)) { errors.push(`Line ${line} (${r.key}): unknown type "${get("type")}". Use: ${LOC_TYPES.join(", ")}.`); return; }
    if (byKey.has(r.key)) { errors.push(`Line ${line}: duplicate key "${r.key}".`); return; }
    if (r.code) {
      if (codes.has(r.code)) { errors.push(`Line ${line} (${r.key}): duplicate code "${r.code}".`); return; }
      codes.add(r.code);
    }
    if (!r.parent_key && type !== "province") { errors.push(`Line ${line} (${r.key}): only provinces may have no parent_key.`); return; }
    if (r.parent_key && type === "province") { errors.push(`Line ${line} (${r.key}): a province cannot have a parent.`); return; }
    byKey.set(r.key, r);
    rows.push(r);
  });

  let external = 0;
  for (const r of rows) {
    if (!r.parent_key) continue;
    const p = byKey.get(r.parent_key);
    if (!p) { external++; continue; }
    if (!ALLOWED_PARENTS[r.type].includes(p.type)) {
      errors.push(`${r.key}: a ${r.type} cannot sit under a ${p.type} (${p.key}).`);
    }
  }
  if (external) warnings.push(`${external} row(s) have a parent that is not in this file. They only work if that parent was already imported into the same dataset version.`);

  // Cycles are impossible once parent types are checked (depth strictly increases), so a depth sort is a valid order.
  rows.sort((a, b) => DEPTH[a.type] - DEPTH[b.type]);
  const counts: Partial<Record<LocType, number>> = {};
  rows.forEach((r) => { counts[r.type] = (counts[r.type] ?? 0) + 1; });
  return { rows, errors, warnings, counts };
}
