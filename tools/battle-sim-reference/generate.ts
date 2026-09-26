// CLI entrypoint generating src/battleSim/combatRulesReference.ts from the
// local EU5 install. Mirrors tools/firepower-reference/generate-unit-types.ts's
// --install convention.
//
// specs/019-battle-simulator research.md §1: every combat constant the
// battle engine uses comes from here, never from a literal in engine code
// (contracts/engine-api.md guarantee 6). Sources:
//   - loading_screen/common/defines/00_defines.txt — NCombat + NUnit blocks
//   - main_menu/common/static_modifiers/location.txt — base local_frontage_allowed
//   - in_game/common/topography/00_default.txt, vegetation/00_default.txt —
//     `defender` dice + location_modifier.local_frontage_allowed (land only)
//   - in_game/common/location_ranks/00_default.txt — frontage deltas
//   - in_game/common/unit_formation_preference/army.txt — section weights
//   - in_game/common/traits/01_general.txt — commander_combat_bonus + the
//     army-stat modifiers the simulator models
// Per-unit-type stats are NOT regenerated here — they're 012's
// UNIT_TYPE_REFERENCE, reused unchanged.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Jomini } from "jomini";

const OUT_PATH = "src/battleSim/combatRulesReference.ts";

// Topography keys that aren't land battle terrain (sea zones, lakes,
// impassable wasteland) are excluded — land battles only (spec FR-009).
const NON_LAND_TOPOGRAPHY = /ocean|sea|lakes|narrows|wasteland|atoll/;

// General-trait modifiers the simulator knows how to apply (ledger U-39).
const TRAIT_MODIFIERS = [
  "commander_combat_bonus",
  "discipline",
  "military_tactics",
  "land_morale_modifier",
  "army_light_infantry_power",
  "army_heavy_infantry_power",
  "army_light_cavalry_power",
  "army_heavy_cavalry_power",
  "army_artillery_power",
  "army_initiative",
] as const;

export class CliError extends Error {}

export function parseArgs(argv: string[]): { installPath: string; gameVersion: string } {
  let installPath: string | undefined;
  // No version file ships in the install (checked 2026-09-26); the value
  // is passed explicitly and defaults to the save version the app's
  // single version adapter supports.
  let gameVersion = "1.3.11";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--install") installPath = argv[++i];
    else if (argv[i] === "--game-version") gameVersion = argv[++i];
  }
  if (!installPath) throw new CliError("--install <path-to-eu5-game-dir> is required.");
  return { installPath, gameVersion };
}

type Rec = Record<string, unknown>;

function asRec(v: unknown): Rec {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {};
}

function num(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

function parseFile(parser: Jomini, path: string): Rec {
  if (!existsSync(path)) throw new CliError(`Expected game file not found: ${path}`);
  const text = readFileSync(path, "utf-8").replace(/^﻿/, "");
  return parser.parseText(text, { typeNarrowing: "unquoted" }) as Rec;
}

function numericBlock(block: Rec, name: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(block)) {
    if (typeof v === "number") out[k] = v;
  }
  if (Object.keys(out).length === 0) throw new CliError(`${name} block not found or empty.`);
  return out;
}

export async function generate(installPath: string, gameVersion: string): Promise<string> {
  const parser = await Jomini.initialize();
  const defines = parseFile(parser, join(installPath, "loading_screen/common/defines/00_defines.txt"));
  const nCombat = numericBlock(asRec(defines.NCombat), "NCombat");
  const nUnit = numericBlock(asRec(defines.NUnit), "NUnit");

  const locationStatic = parseFile(parser, join(installPath, "main_menu/common/static_modifiers/location.txt"));
  // Only the hardcoded `location_base_values` block is the base — other
  // blocks in the same file (e.g. `pap_drained_marshes`) are situational
  // modifiers that also set local_frontage_allowed.
  const baseFrontage = num(asRec(locationStatic.location_base_values).local_frontage_allowed);
  if (baseFrontage === undefined) throw new CliError("location_base_values.local_frontage_allowed not found in static_modifiers/location.txt.");

  const terrain = (file: string, filterLand: boolean) => {
    const root = parseFile(parser, join(installPath, file));
    const out: Record<string, { defenderDice: number; frontageDelta: number }> = {};
    for (const [key, raw] of Object.entries(root)) {
      if (filterLand && NON_LAND_TOPOGRAPHY.test(key)) continue;
      const rec = asRec(raw);
      out[key] = {
        defenderDice: num(rec.defender) ?? 0,
        frontageDelta: num(asRec(rec.location_modifier).local_frontage_allowed) ?? 0,
      };
    }
    return out;
  };
  const topography = terrain("in_game/common/topography/00_default.txt", true);
  const vegetation = terrain("in_game/common/vegetation/00_default.txt", false);

  const ranksRoot = parseFile(parser, join(installPath, "in_game/common/location_ranks/00_default.txt"));
  const locationRanks: Record<string, { frontageDelta: number }> = {};
  for (const [key, raw] of Object.entries(ranksRoot)) {
    // Frontage lives inside a nested modifier block whose name varies;
    // take the first local_frontage_allowed found anywhere in the rank.
    let delta = 0;
    const walk = (v: unknown) => {
      const r = asRec(v);
      const f = num(r.local_frontage_allowed);
      if (f !== undefined) delta = f;
      else for (const child of Object.values(r)) if (typeof child === "object") walk(child);
    };
    walk(raw);
    locationRanks[key] = { frontageDelta: delta };
  }

  const formRoot = parseFile(parser, join(installPath, "in_game/common/unit_formation_preference/army.txt"));
  const formations: Record<string, { isDefault: boolean; sections: Record<string, { weights: Record<string, number>; maxFrontage: number | null }> }> = {};
  for (const [key, raw] of Object.entries(formRoot)) {
    const rec = asRec(raw);
    const sections: Record<string, { weights: Record<string, number>; maxFrontage: number | null }> = {};
    for (const section of ["left", "center", "right", "reserves"]) {
      const s = asRec(rec[section]);
      const weights: Record<string, number> = {};
      // Entries are `<weight> = <category>`: jomini yields weight keys,
      // category values (repeated weights collapse to arrays).
      for (const [k, v] of Object.entries(s)) {
        if (k === "max_frontage") continue;
        const w = Number(k);
        if (!Number.isFinite(w)) continue;
        for (const cat of Array.isArray(v) ? v : [v]) if (typeof cat === "string") weights[cat] = w;
      }
      sections[section] = { weights, maxFrontage: num(s.max_frontage) ?? null };
    }
    formations[key] = { isDefault: rec.default === true, sections };
  }

  const traitsRoot = parseFile(parser, join(installPath, "in_game/common/traits/01_general.txt"));
  const generalTraits: Record<string, Record<string, number>> = {};
  for (const [key, raw] of Object.entries(traitsRoot)) {
    const rec = asRec(raw);
    if (rec.category !== "general") continue;
    const mod = asRec(rec.modifier);
    const out: Record<string, number> = {};
    for (const m of TRAIT_MODIFIERS) {
      const v = num(mod[m]);
      if (v !== undefined) out[m] = v;
    }
    generalTraits[key] = out;
  }

  const data = { gameVersion, nCombat, nUnit, baseFrontage, topography, vegetation, locationRanks, formations, generalTraits };
  return [
    "// GENERATED by tools/battle-sim-reference/generate.ts — do not edit by hand.",
    "// Combat constants and tables for the 019 battle simulator, extracted",
    "// from the local EU5 install's own files (structured game-mechanics",
    "// data only, per the constitution's Encyclopedia-data exception).",
    "// Regenerate with",
    "// `npx tsx tools/battle-sim-reference/generate.ts --install <EU5 game dir> [--game-version X]`.",
    "// See specs/019-battle-simulator/research.md §1.",
    "",
    "export interface TerrainEntry { defenderDice: number; frontageDelta: number }",
    "export interface FormationSection { weights: Record<string, number>; maxFrontage: number | null }",
    "export interface FormationEntry { isDefault: boolean; sections: Record<\"left\" | \"center\" | \"right\" | \"reserves\", FormationSection> }",
    "",
    "export interface CombatRulesReference {",
    "  gameVersion: string;",
    "  nCombat: Record<string, number>;",
    "  nUnit: Record<string, number>;",
    "  baseFrontage: number;",
    "  topography: Record<string, TerrainEntry>;",
    "  vegetation: Record<string, TerrainEntry>;",
    "  locationRanks: Record<string, { frontageDelta: number }>;",
    "  formations: Record<string, FormationEntry>;",
    "  generalTraits: Record<string, Partial<Record<string, number>>>;",
    "}",
    "",
    `export const COMBAT_RULES_REFERENCE: CombatRulesReference = ${JSON.stringify(data, null, 2)};`,
    "",
  ].join("\n");
}

async function main() {
  try {
    const { installPath, gameVersion } = parseArgs(process.argv.slice(2));
    const out = await generate(installPath, gameVersion);
    writeFileSync(OUT_PATH, out);
    console.log(`Wrote ${OUT_PATH}`);
  } catch (e) {
    if (e instanceof CliError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
}

if (process.argv[1]?.endsWith("generate.ts")) void main();
