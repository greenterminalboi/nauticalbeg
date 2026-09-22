// Scans the local EU5 game install for every static source that
// contributes to the 5 computed Army Stats this feature needs:
// `discipline`, `military_tactics` (displayed "Tactics"),
// `fort_limit_modifier`, `siege_ability`, and `global_defensive`
// (displayed "Fort Defense" — NOT the literal string "fort_defense",
// which does not exist as an internal keyword; confirmed via
// game/in_game/gui/military_ledger.gui and
// main_menu/localization/english/modifier_types_l_english.yml — see
// specs/012-firepower-tab/research.md §5).
//
// Reuses this project's existing `jomini` dependency (same Clausewitz
// script grammar src/parser/version-adapters/1.3.11.ts already parses
// for saves, and tools/encyclopedia-scraping/parse-definitions.ts
// already parses for game definition files) rather than a regex parser.
//
// Approach: rather than hand-transcribing a curated source list (error-
// prone across dozens of files), this recursively walks the parsed tree
// of every .txt file under the directories known to touch these 5
// keywords, and records every occurrence of each keyword with a plain
// numeric value. A keyword found nested under a non-numeric/conditional
// structure (e.g. scaled by a runtime stat, or gated by a script trigger
// this tool doesn't evaluate) is recorded with `value: null` and
// `sourceKind: 'dynamic'` rather than guessing a flat number.
//
// `sourceKind: 'other'` entries (religions, religious_aspects,
// subject_types, chivalric_orders, international_organizations, gods,
// avatars, bureaucracies) are catalogued for completeness but are NOT
// currently joined against any per-country save data by this feature —
// only 'advance'/'reform'/'privilege'/'law' sources are summed into a
// country's Army Stats totals (armyNavyStats.ts). Treat 'other' as a
// documented reference catalog for possible future use, not a ready-to-
// join source list.
//
// Character/leader trait contributions to discipline/military_tactics/
// siege_ability are NOT scanned here at all (no traits/*.txt files are
// walked) — this codebase has no character/leader parsing, so those
// sources are an intentional, accepted gap (specs/012-firepower-tab/
// spec.md Assumptions), not a bug in this generator.
//
// Regenerate the same way if a future game version adds/changes a
// source: re-run this script against an updated install and replace
// militaryModifierReference.ts's contents.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Jomini } from "jomini";

const INSTALL = process.argv[2] ?? process.env.EU5_INSTALL;
if (!INSTALL) {
  console.error("Usage: tsx generate-modifier-sources.ts <path-to-eu5-game-dir>");
  process.exit(1);
}

const STATS = ["discipline", "military_tactics", "fort_limit_modifier", "siege_ability", "global_defensive"] as const;
type ModifierStat = (typeof STATS)[number];
type ModifierSourceKind = "advance" | "reform" | "privilege" | "law" | "societal_value" | "other" | "dynamic";

interface ModifierSourceEntry {
  sourceKind: ModifierSourceKind;
  sourceName: string;
  stat: ModifierStat;
  value: number | null;
  note?: string;
}

// Directory (relative to game/in_game/common/) -> sourceKind bucket.
const DIRS: Record<string, ModifierSourceKind> = {
  advances: "advance",
  government_reforms: "reform",
  estate_privileges: "privilege",
  laws: "law",
  societal_values: "societal_value",
  auto_modifiers: "dynamic",
  religions: "other",
  religious_aspects: "other",
  subject_types: "other",
  chivalric_orders: "other",
  international_organizations: "other",
  gods: "other",
  avatars: "other",
  bureaucracies: "other",
};

let parserPromise: ReturnType<typeof Jomini.initialize> | undefined;
async function getParser() {
  parserPromise ??= Jomini.initialize();
  return parserPromise;
}

function listTxtFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const n of names) {
    const p = join(dir, n);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...listTxtFiles(p));
    else if (n.endsWith(".txt") && !/readme/i.test(n)) out.push(p);
  }
  return out;
}

// Recursively walk a parsed entry's value tree looking for any of the 5
// stat keywords. `entryName` is the top-level key this value tree hangs
// off of (e.g. the advance/reform/law-choice id) — that's what we record
// as sourceName, not whatever nested sub-key the modifier is found under.
// Paradox script "@name = value" file-local constants (e.g.
// `@fort_limit_modifier_increase = 0.1` at the top of 3_fort_level.txt,
// referenced later as `fort_limit_modifier = @fort_limit_modifier_increase`).
// jomini's object tree doesn't resolve these, so a plain regex pass over
// the raw text builds a per-file lookup used to resolve any "@name"
// string value found while walking.
function extractScriptVariables(text: string): Map<string, number> {
  // Strip a leading UTF-8 BOM — several game files have one, and it
  // otherwise defeats the `^` anchor on the file's very first line
  // (confirmed: advances/3_fort_level.txt's @fort_limit_modifier_increase
  // definition sits right after a BOM).
  const clean = text.replace(/^﻿/, "");
  const vars = new Map<string, number>();
  for (const m of clean.matchAll(/^@(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/gm)) {
    vars.set(m[1], Number(m[2]));
  }
  return vars;
}

function walk(
  value: unknown,
  entryName: string,
  kind: ModifierSourceKind,
  file: string,
  out: ModifierSourceEntry[],
  seen: Set<string>,
  scriptVars: Map<string, number>,
): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const v of value) walk(v, entryName, kind, file, out, seen, scriptVars);
    return;
  }
  const obj = value as Record<string, unknown>;
  for (const [key, val] of Object.entries(obj)) {
    if ((STATS as readonly string[]).includes(key)) {
      const stat = key as ModifierStat;
      const dedupeKey = `${kind}:${entryName}:${stat}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const resolved = typeof val === "string" && val.startsWith("@") ? scriptVars.get(val.slice(1)) : undefined;
      if (typeof val === "number") {
        out.push({ sourceKind: kind, sourceName: entryName, stat, value: val, note: file });
      } else if (resolved !== undefined) {
        out.push({ sourceKind: kind, sourceName: entryName, stat, value: resolved, note: `${file} (resolved from ${val})` });
      } else if (typeof val === "object" && val !== null && !Array.isArray(val)) {
        const inner = val as Record<string, unknown>;
        if (typeof inner.value === "number") {
          out.push({ sourceKind: kind, sourceName: entryName, stat, value: inner.value, note: file });
        } else {
          out.push({ sourceKind: "dynamic", sourceName: entryName, stat, value: null, note: `conditional/nested in ${file}` });
        }
      } else {
        out.push({ sourceKind: "dynamic", sourceName: entryName, stat, value: null, note: `non-numeric in ${file}` });
      }
    }
    // Keep walking regardless — a stat keyword can appear more than once
    // nested at different depths within the same entry (rare but seen
    // with age-conditional modifier blocks), and other keys may contain
    // nested entries of their own worth descending into.
    walk(val, entryName, kind, file, out, seen, scriptVars);
  }
}

async function main() {
  const parser = await getParser();
  const results: ModifierSourceEntry[] = [];

  for (const [subdir, kind] of Object.entries(DIRS)) {
    const dir = join(INSTALL!, "in_game", "common", subdir);
    const files = listTxtFiles(dir);
    for (const file of files) {
      let text: string;
      try {
        text = readFileSync(file, "utf-8");
      } catch {
        continue;
      }
      let root: Record<string, unknown>;
      try {
        root = parser.parseText(text, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
      } catch (err) {
        console.error(`parse error ${file}: ${(err as Error).message}`);
        continue;
      }
      const scriptVars = extractScriptVariables(text);
      const seen = new Set<string>();
      for (const [entryName, entryValue] of Object.entries(root)) {
        if (entryValue === null || typeof entryValue !== "object") continue;
        if (kind === "law") {
          // Law files nest one level deeper than every other category:
          // `recruitment_law = { law_category = military
          // expanded_levies_policy = { country_modifier = {...} } ... }`
          // — the save's nation_laws.object matches the CHOICE id
          // (expanded_levies_policy), never the category id
          // (recruitment_law), so sourceName must be the choice key, not
          // the file's top-level key (confirmed against the real save's
          // implemented_laws shape, research.md §6).
          for (const [choiceName, choiceValue] of Object.entries(entryValue as Record<string, unknown>)) {
            if (choiceValue === null || typeof choiceValue !== "object") continue;
            walk(choiceValue, choiceName, kind, file.replace(INSTALL! + "/", ""), results, seen, scriptVars);
          }
        } else {
          walk(entryValue, entryName, kind, file.replace(INSTALL! + "/", ""), results, seen, scriptVars);
        }
      }
    }
  }

  results.sort((a, b) => a.stat.localeCompare(b.stat) || a.sourceKind.localeCompare(b.sourceKind) || a.sourceName.localeCompare(b.sourceName));

  const byStat: Record<string, number> = {};
  const byKind: Record<string, number> = {};
  for (const r of results) {
    byStat[r.stat] = (byStat[r.stat] ?? 0) + 1;
    byKind[r.sourceKind] = (byKind[r.sourceKind] ?? 0) + 1;
  }
  console.error("By stat:", byStat);
  console.error("By kind:", byKind);
  console.error("Total:", results.length);

  const lines: string[] = [];
  lines.push(`export type ModifierStat = ${STATS.map((s) => `"${s}"`).join(" | ")};`);
  lines.push(`export type ModifierSourceKind = "advance" | "reform" | "privilege" | "law" | "societal_value" | "other" | "dynamic";`);
  lines.push(``);
  lines.push(`export interface ModifierSourceEntry {`);
  lines.push(`  sourceKind: ModifierSourceKind;`);
  lines.push(`  sourceName: string;`);
  lines.push(`  stat: ModifierStat;`);
  lines.push(`  value: number | null; // null for 'dynamic' entries (runtime-state-scaled or conditional, not a flat value)`);
  lines.push(`  note?: string;`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export const MILITARY_MODIFIER_REFERENCE: ModifierSourceEntry[] = ${JSON.stringify(results, null, 2)};`);
  lines.push(``);

  console.log(lines.join("\n"));
}

main();
