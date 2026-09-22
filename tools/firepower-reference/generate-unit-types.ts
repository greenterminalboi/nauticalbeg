// CLI entrypoint generating src/components/Overview/unitTypeReference.ts
// from the local EU5 install's game/in_game/common/unit_types/*.txt files.
// Mirrors tools/map-generation/generate.ts's --install convention.
//
// specs/012-firepower-tab research.md §3: every concrete unit type
// declares (directly, or inherited through a `copy_from` chain up to an
// abstract age-template base) a `category`, an `age`, and optionally
// `levy = yes`. Most concrete army unit files declare NEITHER category
// nor age directly — they copy_from an `a_age_N_..._<category>` template
// (itself copy_from a bare `a_<category>` base that declares `category`
// only), so resolution requires walking the copy_from chain, closest
// declaration wins per field (confirmed empirically: army files show
// zero direct `category =`/`age =` occurrences, 100% copy_from-derived;
// navy files mostly declare both directly). `levy` is read as an own
// field only (never inherited) — the abstract bases never declare it.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Jomini } from "jomini";

const UNIT_TYPES_DIR = "in_game/common/unit_types";
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

interface RawFields {
  category?: string;
  age?: string;
  levy?: string | boolean;
  copy_from?: string;
}

interface Resolved {
  category?: string;
  age?: 1 | 2 | 3 | 4 | 5 | 6;
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

/** Resolves category/age for `key` by walking its copy_from chain
 * (own fields win; missing fields fall back to the copy_from target,
 * recursively). Cycle-guarded via `seen`. */
function resolve(key: string, all: Map<string, RawFields>, seen: Set<string>): Resolved {
  if (seen.has(key)) return {};
  seen.add(key);
  const entry = all.get(key);
  if (!entry) return {};

  let base: Resolved = {};
  if (entry.copy_from) {
    base = resolve(entry.copy_from, all, seen);
  }

  const rawAge = entry.age;
  const age = rawAge !== undefined ? AGE_MAP[rawAge.replace(/^"|"$/g, "")] : undefined;

  return {
    category: entry.category ?? base.category,
    age: age ?? base.age,
  };
}

export async function generate(installPath: string): Promise<{
  entries: Record<string, { category: string; displayCategory: string; age: 1 | 2 | 3 | 4 | 5 | 6; isLevy: boolean }>;
  unresolved: string[];
}> {
  const dir = join(installPath, UNIT_TYPES_DIR);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new CliError(`unit_types directory not found under --install: ${dir}`);
  }

  const parser = await Jomini.initialize();
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
      };
      all.set(key, raw);
      if (!isExcluded) concreteKeys.push(key);
    }
  }

  const entries: Record<string, { category: string; displayCategory: string; age: 1 | 2 | 3 | 4 | 5 | 6; isLevy: boolean }> = {};
  const unresolved: string[] = [];

  for (const key of concreteKeys) {
    const resolved = resolve(key, all, new Set());
    const displayCategory = resolved.category ? CATEGORY_TO_DISPLAY[resolved.category] : undefined;
    if (!resolved.category || !resolved.age || !displayCategory) {
      unresolved.push(key);
      continue;
    }
    const rawEntry = all.get(key)!;
    entries[key] = {
      category: resolved.category,
      displayCategory,
      age: resolved.age,
      isLevy: rawEntry.levy === "yes",
    };
  }

  return { entries, unresolved };
}

function writeOutput(
  outPath: string,
  entries: Record<string, { category: string; displayCategory: string; age: 1 | 2 | 3 | 4 | 5 | 6; isLevy: boolean }>,
): void {
  const sortedKeys = Object.keys(entries).sort();
  const lines: string[] = [];
  lines.push(
    "// The Firepower tab's unit-type → category/age/levy lookup, sourced",
    "// directly from the game's own files (constitution Principle IV) rather",
    "// than a guessed pattern.",
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
    "// specs/012-firepower-tab research.md §3. Static game-reference data,",
    "// not derivable from a save at runtime (the browser has no access to a",
    "// user's local game install) — regenerate with",
    "// `npx tsx tools/firepower-reference/generate-unit-types.ts --install <path>`",
    "// if a future game version adds/renames/recategorizes a unit type.",
    "export interface UnitTypeReferenceEntry {",
    "  /** Raw EU5 category, e.g. 'army_heavy_cavalry'. */",
    "  category: string;",
    "  displayCategory: \"Infantry\" | \"Cavalry\" | \"Artillery\" | \"Supply\" | \"Heavies\" | \"Lights\" | \"Transports\" | \"Galleys\";",
    "  age: 1 | 2 | 3 | 4 | 5 | 6;",
    "  isLevy: boolean;",
    "}",
    "",
    "export const UNIT_TYPE_REFERENCE: Record<string, UnitTypeReferenceEntry> = {",
  );
  for (const key of sortedKeys) {
    const e = entries[key];
    lines.push(
      `  ${JSON.stringify(key)}: { category: ${JSON.stringify(e.category)}, displayCategory: ${JSON.stringify(e.displayCategory)}, age: ${e.age}, isLevy: ${e.isLevy} },`,
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
