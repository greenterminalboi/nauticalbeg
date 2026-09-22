// CLI entrypoint generating src/components/Overview/unitTypeReference.ts
// from the local EU5 install's game/in_game/common/unit_types/*.txt files
// (category/age/levy) and game/in_game/common/unit_categories/*.txt files
// (the per-category combat-stat defaults every unit type without its own
// override inherits). Mirrors tools/map-generation/generate.ts's
// --install convention.
//
// specs/012-firepower-tab research.md §3: every concrete unit type
// declares (directly, or inherited through a `copy_from` chain up to an
// abstract age-template base) a `category` and an `age`. Most concrete
// army unit files declare NEITHER category nor age directly — they
// copy_from an `a_age_N_..._<category>` template (itself copy_from a
// bare `a_<category>` base that declares `category` only), so resolution
// requires walking the copy_from chain, closest declaration wins per
// field (confirmed empirically: army files show zero direct
// `category =`/`age =` occurrences, 100% copy_from-derived; navy files
// mostly declare both directly). `levy` is read as an own field only
// (never inherited through copy_from — the abstract bases never declare
// it) and defaults to false when absent.
//
// User request 2026-09-22: the combat stats `unit_categories/readme.txt`
// documents (max_strength, combat_power, frontage, combat_speed,
// initiative, flanking_ability, secure_flanks_defense,
// morale_damage_taken, strength_damage_taken, morale_damage_done,
// strength_damage_done, food_storage_per_strength,
// food_consumption_per_strength, movement_speed, supply_weight — the
// last one is what the game's own "Unit Weight" concept
// (game_concepts/00_game_concepts.txt) is built from), plus
// artillery_barrage (not in that readme's list — found declared only on
// the land age-templates' artillery entries), are resolved the same
// copy_from-chain way as category/age, with each `unit_categories`
// file's own declaration as the final fallback for any field no
// unit_type in the chain overrides (confirmed empirically: ordinary
// unit types like `a_chambered_cannon` only copy_from an age template
// and add non-stat fields; only "unique" unit types, e.g.
// D008_byzantine_unit_types.txt's, override a stat directly). A field
// missing at every level (e.g. navy has no `combat_power` anywhere, and
// no category has `artillery_barrage`) defaults to 0, the engine's own
// convention for an unset modifier — documented here, never fabricated
// as a plausible-looking number. supply_weight is surfaced as
// `unitWeight`: the game's real "Unit Weight" is that value multiplied
// by a regiment's *live* current strength (a save-time quantity), so
// this reference table's own `unitWeight` is the static per-unit-type
// multiplier, not a live total.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Jomini } from "jomini";

const UNIT_TYPES_DIR = "in_game/common/unit_types";
const UNIT_CATEGORIES_DIR = "in_game/common/unit_categories";
const EXCLUDED_FILES = new Set(["00_age_templates_land.txt", "00_age_templates_navy.txt", "readme.txt"]);
const OUT_PATH = "src/components/Overview/unitTypeReference.ts";

const AGE_MAP: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
  age_1_traditions: 1,
  age_2_renaissance: 2,
  age_3_discovery: 3,
  age_4_reformation: 4,
  age_5_absolutism: 5,
  age_6_revolutions: 6,
};

const CATEGORY_TO_DISPLAY: Record<string, string> = {
  army_light_infantry: "Infantry",
  army_heavy_infantry: "Infantry",
  army_light_cavalry: "Cavalry",
  army_heavy_cavalry: "Cavalry",
  army_artillery: "Artillery",
  army_auxiliary: "Supply",
  navy_galley: "Galleys",
  navy_light_ship: "Lights",
  navy_transport: "Transports",
  navy_heavy_ship: "Heavies",
};

// Raw EU5 field name -> UnitTypeStats' own camelCase key. Shared by both
// the unit_types copy_from resolution and the unit_categories fallback
// parse, so the two stay in lockstep.
const STAT_FIELDS: { raw: string; key: keyof UnitTypeStats }[] = [
  { raw: "max_strength", key: "maxStrength" },
  { raw: "combat_power", key: "combatPower" },
  { raw: "frontage", key: "frontage" },
  { raw: "combat_speed", key: "combatSpeed" },
  { raw: "initiative", key: "initiative" },
  { raw: "flanking_ability", key: "flankingAbility" },
  { raw: "secure_flanks_defense", key: "secureFlanksDefense" },
  { raw: "morale_damage_taken", key: "moraleDamageTaken" },
  { raw: "strength_damage_taken", key: "strengthDamageTaken" },
  { raw: "morale_damage_done", key: "moraleDamageDone" },
  { raw: "strength_damage_done", key: "strengthDamageDone" },
  { raw: "food_storage_per_strength", key: "foodStoragePerStrength" },
  { raw: "food_consumption_per_strength", key: "foodConsumptionPerStrength" },
  { raw: "movement_speed", key: "movementSpeed" },
  { raw: "supply_weight", key: "unitWeight" },
  { raw: "artillery_barrage", key: "artilleryBarrage" },
];

export interface UnitTypeStats {
  maxStrength: number;
  combatPower: number;
  frontage: number;
  combatSpeed: number;
  initiative: number;
  flankingAbility: number;
  secureFlanksDefense: number;
  moraleDamageTaken: number;
  strengthDamageTaken: number;
  moraleDamageDone: number;
  strengthDamageDone: number;
  foodStoragePerStrength: number;
  foodConsumptionPerStrength: number;
  movementSpeed: number;
  unitWeight: number;
  /** Only meaningful for Artillery (declared solely on the land
   * age-templates' artillery entries, and occasionally overridden by a
   * unique unit) — every other category resolves to 0. */
  artilleryBarrage: number;
}

interface RawFields {
  category?: string;
  age?: string;
  levy?: string | boolean;
  copy_from?: string;
  stats: Partial<Record<string, number>>;
}

interface Resolved {
  category?: string;
  age?: 1 | 2 | 3 | 4 | 5 | 6;
  stats: Partial<Record<string, number>>;
}

export class CliError extends Error {}

export function parseArgs(argv: string[]): { installPath: string; outPath: string } {
  let installPath: string | undefined;
  let outPath = OUT_PATH;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--install") {
      installPath = argv[i + 1];
      i++;
    } else if (argv[i] === "--out") {
      outPath = argv[i + 1] ?? outPath;
      i++;
    }
  }
  if (!installPath) {
    throw new CliError("--install <path-to-eu5-install> is required.");
  }
  return { installPath, outPath };
}

function toStringOrUndefined(v: unknown): string | undefined {
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return undefined;
}

function toNumberOrUndefined(v: unknown): number | undefined {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function readStatFields(fields: Record<string, unknown>): Partial<Record<string, number>> {
  const stats: Partial<Record<string, number>> = {};
  for (const { raw } of STAT_FIELDS) {
    const value = toNumberOrUndefined(fields[raw]);
    if (value !== undefined) stats[raw] = value;
  }
  return stats;
}

/** Resolves category/age/stats for `key` by walking its copy_from chain
 * (own fields win; missing fields fall back to the copy_from target,
 * recursively). Cycle-guarded via `seen`. */
function resolve(key: string, all: Map<string, RawFields>, seen: Set<string>): Resolved {
  if (seen.has(key)) return { stats: {} };
  seen.add(key);
  const entry = all.get(key);
  if (!entry) return { stats: {} };

  let base: Resolved = { stats: {} };
  if (entry.copy_from) {
    base = resolve(entry.copy_from, all, seen);
  }

  const rawAge = entry.age;
  const age = rawAge !== undefined ? AGE_MAP[rawAge.replace(/^"|"$/g, "")] : undefined;

  return {
    category: entry.category ?? base.category,
    age: age ?? base.age,
    stats: { ...base.stats, ...entry.stats },
  };
}

/** Parses every `unit_categories/*.txt` file (excluding readme.txt) into
 * raw-category-name -> its own directly-declared stat fields — the final
 * fallback for any unit_type field no level of its copy_from chain
 * overrides. */
function parseCategoryStats(installPath: string, parser: Jomini): Map<string, Partial<Record<string, number>>> {
  const dir = join(installPath, UNIT_CATEGORIES_DIR);
  const result = new Map<string, Partial<Record<string, number>>>();
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return result;

  const files = readdirSync(dir).filter((f) => f.endsWith(".txt") && f !== "readme.txt");
  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf-8");
    const root = parser.parseText(text, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
    for (const [key, value] of Object.entries(root)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      result.set(key, readStatFields(value as Record<string, unknown>));
    }
  }
  return result;
}

export interface GeneratedUnitTypeEntry {
  category: string;
  displayCategory: string;
  age: 1 | 2 | 3 | 4 | 5 | 6;
  isLevy: boolean;
  stats: UnitTypeStats;
}

export async function generate(installPath: string): Promise<{
  entries: Record<string, GeneratedUnitTypeEntry>;
  unresolved: string[];
}> {
  const dir = join(installPath, UNIT_TYPES_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new CliError(`unit_types directory not found under --install: ${dir}`);
  }

  const parser = await Jomini.initialize();
  const categoryStats = parseCategoryStats(installPath, parser);
  const files = readdirSync(dir).filter((f) => f.endsWith(".txt"));

  const all = new Map<string, RawFields>();
  const concreteKeys: string[] = [];

  for (const file of files) {
    const text = readFileSync(join(dir, file), "utf-8");
    const root = parser.parseText(text, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
    const isExcluded = EXCLUDED_FILES.has(file);
    for (const [key, value] of Object.entries(root)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const fields = value as Record<string, unknown>;
      const raw: RawFields = {
        category: toStringOrUndefined(fields.category),
        age: toStringOrUndefined(fields.age),
        levy: toStringOrUndefined(fields.levy),
        copy_from: toStringOrUndefined(fields.copy_from),
        stats: readStatFields(fields),
      };
      all.set(key, raw);
      if (!isExcluded) concreteKeys.push(key);
    }
  }

  const entries: Record<string, GeneratedUnitTypeEntry> = {};
  const unresolved: string[] = [];

  for (const key of concreteKeys) {
    const resolved = resolve(key, all, new Set());
    const displayCategory = resolved.category ? CATEGORY_TO_DISPLAY[resolved.category] : undefined;
    if (!resolved.category || !resolved.age || !displayCategory) {
      unresolved.push(key);
      continue;
    }
    const rawEntry = all.get(key)!;
    const categoryDefaults = categoryStats.get(resolved.category) ?? {};
    const stats = {} as UnitTypeStats;
    for (const { raw, key: statKey } of STAT_FIELDS) {
      stats[statKey] = resolved.stats[raw] ?? categoryDefaults[raw] ?? 0;
    }
    entries[key] = {
      category: resolved.category,
      displayCategory,
      age: resolved.age,
      isLevy: rawEntry.levy === "yes",
      stats,
    };
  }

  return { entries, unresolved };
}

function writeOutput(outPath: string, entries: Record<string, GeneratedUnitTypeEntry>): void {
  const sortedKeys = Object.keys(entries).sort();
  const lines: string[] = [];
  lines.push(
    "// The Firepower tab's unit-type → category/age/levy/combat-stats lookup,",
    "// sourced directly from the game's own files (constitution Principle IV)",
    "// rather than a guessed pattern.",
    "//",
    "// Every concrete unit type in `game/in_game/common/unit_types/*.txt`",
    "// (excluding the two abstract age-template files and readme.txt)",
    "// declares, directly or via a `copy_from` chain resolved back to an",
    "// abstract `age_N_..._<category>` template, a `category` and an `age`",
    "// (`age_1_traditions`..`age_6_revolutions`, mapped here to 1-6); `levy`",
    "// is read as an own field only (never inherited through copy_from — the",
    "// abstract bases never declare it) and defaults to false when absent.",
    "// EU5's raw category values are collapsed to the display categories the",
    "// Firepower spec actually asks for: army_light_infantry/army_heavy_infantry",
    '// → "Infantry", army_light_cavalry/army_heavy_cavalry → "Cavalry",',
    '// army_artillery → "Artillery", army_auxiliary → "Supply";',
    '// navy_heavy_ship → "Heavies", navy_light_ship → "Lights",',
    '// navy_transport → "Transports", navy_galley → "Galleys". Both the raw',
    "// EU5 category and the resolved display category are kept.",
    "//",
    "// `stats` (user request 2026-09-22): the per-unit-type combat stats",
    "// `unit_categories/readme.txt` documents, resolved the same copy_from-chain",
    "// way as category/age/levy, falling back to the unit's raw category's own",
    "// `unit_categories/*.txt` declaration for any field no unit_type in the",
    "// chain overrides, and finally to 0 (the engine's own default for an unset",
    "// modifier) if no level declares it at all. `unitWeight` is `supply_weight`",
    "// — a static per-unit-type multiplier, NOT the game's live \"Unit Weight\"",
    "// concept (which is this value times a regiment's current strength, a",
    "// save-time quantity this static reference table does not carry).",
    "//",
    "// specs/012-firepower-tab research.md §3. Static game-reference data,",
    "// not derivable from a save at runtime (the browser has no access to a",
    "// user's local game install) — regenerate with",
    "// `npx tsx tools/firepower-reference/generate-unit-types.ts --install <path>`",
    "// if a future game version adds/renames/recategorizes a unit type or",
    "// changes a combat stat.",
    "export interface UnitTypeStats {",
    "  maxStrength: number;",
    "  combatPower: number;",
    "  frontage: number;",
    "  combatSpeed: number;",
    "  initiative: number;",
    "  flankingAbility: number;",
    "  secureFlanksDefense: number;",
    "  moraleDamageTaken: number;",
    "  strengthDamageTaken: number;",
    "  moraleDamageDone: number;",
    "  strengthDamageDone: number;",
    "  foodStoragePerStrength: number;",
    "  foodConsumptionPerStrength: number;",
    "  movementSpeed: number;",
    "  unitWeight: number;",
    "  /** Only meaningful for Artillery (declared solely on the land",
    "   * age-templates' artillery entries, and occasionally overridden by a",
    "   * unique unit) — every other category resolves to 0. */",
    "  artilleryBarrage: number;",
    "}",
    "",
    "export interface UnitTypeReferenceEntry {",
    "  /** Raw EU5 category, e.g. 'army_heavy_cavalry'. */",
    "  category: string;",
    "  displayCategory: \"Infantry\" | \"Cavalry\" | \"Artillery\" | \"Supply\" | \"Heavies\" | \"Lights\" | \"Transports\" | \"Galleys\";",
    "  age: 1 | 2 | 3 | 4 | 5 | 6;",
    "  isLevy: boolean;",
    "  stats: UnitTypeStats;",
    "}",
    "",
    "export const UNIT_TYPE_REFERENCE: Record<string, UnitTypeReferenceEntry> = {",
  );
  for (const key of sortedKeys) {
    const e = entries[key];
    const statsLiteral = STAT_FIELDS.map(({ key: statKey }) => `${statKey}: ${e.stats[statKey]}`).join(", ");
    lines.push(
      `  ${JSON.stringify(key)}: { category: ${JSON.stringify(e.category)}, displayCategory: ${JSON.stringify(e.displayCategory)}, age: ${e.age}, isLevy: ${e.isLevy}, stats: { ${statsLiteral} } },`,
    );
  }
  lines.push("};", "");
  writeFileSync(outPath, lines.join("\n"), "utf-8");
}

async function main(): Promise<void> {
  const { installPath, outPath } = parseArgs(process.argv.slice(2));
  const { entries, unresolved } = await generate(installPath);
  writeOutput(outPath, entries);
  const count = Object.keys(entries).length;
  console.log(`Wrote ${count} unit type entries to ${outPath}`);
  if (unresolved.length > 0) {
    console.warn(`WARNING: ${unresolved.length} unit types could not be resolved (skipped, not fabricated):`);
    for (const key of unresolved) console.warn(`  - ${key}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
