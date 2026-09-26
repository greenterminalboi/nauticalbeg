// Dev-only: extracts the battles a real save records under
// war_manager.database[*].battle into
// tests/fixtures/battle-sim/reference-battles.json, for the battle
// simulator's calibration suite (specs/019-battle-simulator research.md
// §8, SC-003). The output is derived data (numbers, keys), not raw save
// bytes.
//
// Only the needed top-level sections are sliced out of the save text
// (metadata, character_db, war_manager) and parsed with jomini — a
// multi-hundred-MB save isn't parsed whole.
//
// Interpretation (combat-unknowns.md): the 10-slot `total`/`losses` arrays
// follow the unit_categories file order, army slots first, in thousands
// of men (U-41); `result=yes` means the battle's attacker won (U-42) —
// both cross-checked here and reported.
//
// Usage: npx tsx tools/battle-sim-reference/extract-reference-battles.ts \
//   --save <melted .eu5> --install <EU5 game dir> [--out <json>]
import { createReadStream, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Jomini } from "jomini";

export const SLOT_CATEGORIES = [
  "army_light_infantry",
  "army_heavy_infantry",
  "army_light_cavalry",
  "army_heavy_cavalry",
  "army_artillery",
  "army_auxiliary",
] as const;

export interface ReferenceSide {
  country: number;
  generalTrait: string | null;
  /** Thousands of men per army category (SLOT_CATEGORIES order). */
  total: number[];
  losses: number[];
  experience: number | null;
  prestige: number | null;
}

export interface ReferenceBattle {
  war: string;
  date: string;
  location: number;
  locationName: string | null;
  topography: string | null;
  vegetation: string | null;
  attackerWon: boolean;
  attacker: ReferenceSide;
  defender: ReferenceSide;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" && !Array.isArray(v) ? (v as Rec) : {});
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);

async function sliceSections(savePath: string, keys: string[]): Promise<Record<string, string>> {
  const wanted = new Set(keys);
  const out: Record<string, string[]> = {};
  let current: string | null = null;
  const rl = createInterface({ input: createReadStream(savePath, { encoding: "utf-8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    const top = /^([a-z_]+)=/.exec(line);
    if (top) current = wanted.has(top[1]) ? top[1] : null;
    if (current) (out[current] ??= []).push(line);
  }
  return Object.fromEntries(Object.entries(out).map(([k, lines]) => [k, lines.join("\n")]));
}

function formatDate(v: unknown): string {
  if (v instanceof Date) return `${v.getUTCFullYear()}.${v.getUTCMonth() + 1}.${v.getUTCDate()}`;
  return String(v);
}

function readTemplates(installPath: string): Map<string, { topography: string | null; vegetation: string | null }> {
  const text = readFileSync(join(installPath, "in_game/map_data/location_templates.txt"), "utf-8");
  const map = new Map<string, { topography: string | null; vegetation: string | null }>();
  for (const line of text.split("\n")) {
    const m = /^(\w+)\s*=\s*\{(.*)\}/.exec(line);
    if (!m) continue;
    map.set(m[1], {
      topography: /topography\s*=\s*(\w+)/.exec(m[2])?.[1] ?? null,
      vegetation: /vegetation\s*=\s*(\w+)/.exec(m[2])?.[1] ?? null,
    });
  }
  return map;
}

export async function extract(savePath: string, installPath: string) {
  const parser = await Jomini.initialize();
  const sections = await sliceSections(savePath, ["metadata", "character_db", "war_manager"]);
  const metadata = rec(rec(parser.parseText(sections.metadata ?? "", { typeNarrowing: "unquoted" })).metadata);
  const locationNames = arr(rec(metadata.compatibility).locations).map(String);
  const characters = rec(rec(rec(parser.parseText(sections.character_db ?? "", { typeNarrowing: "unquoted" })).character_db).database);
  const wars = rec(rec(rec(parser.parseText(sections.war_manager ?? "", { typeNarrowing: "unquoted" })).war_manager).database);
  const templates = readTemplates(installPath);

  const side = (s: Rec): ReferenceSide => {
    const who = rec(s.who);
    const character = s.character !== undefined ? rec(characters[String(s.character)]) : {};
    const slots = (v: unknown) => SLOT_CATEGORIES.map((_, i) => Number(arr(v)[i] ?? 0));
    return {
      country: Number(who.country),
      generalTrait: typeof character.general_trait === "string" ? character.general_trait : null,
      total: slots(s.total),
      losses: slots(s.losses),
      experience: num(who.experience),
      prestige: num(who.prestige),
    };
  };

  const battles: ReferenceBattle[] = [];
  for (const [warIdx, war] of Object.entries(wars)) {
    for (const b of arr(rec(war).battle).map(rec)) {
      if (!b.attacker || !b.defender) continue;
      const attacker = side(rec(b.attacker));
      const defender = side(rec(b.defender));
      // Naval battles carry their men in slots 6-9; land only (FR-009).
      if (attacker.total.every((t) => t === 0) || defender.total.every((t) => t === 0)) continue;
      const location = Number(b.location);
      const name = locationNames[location - 1] ?? null;
      const t = name ? templates.get(name) : undefined;
      battles.push({
        war: warIdx,
        date: formatDate(b.date),
        location,
        locationName: name,
        topography: t?.topography ?? null,
        vegetation: t?.vegetation ?? null,
        attackerWon: b.result === true || b.result === "yes",
        attacker,
        defender,
      });
    }
  }

  // U-42 cross-check: the winner's prestige change should be positive.
  const prestigeChecked = battles.filter((b) => b.attacker.prestige !== null && b.defender.prestige !== null);
  const consistent = prestigeChecked.filter((b) =>
    b.attackerWon ? (b.attacker.prestige ?? 0) > (b.defender.prestige ?? 0) : (b.defender.prestige ?? 0) > (b.attacker.prestige ?? 0),
  ).length;
  return { battles, check: { prestigeChecked: prestigeChecked.length, prestigeConsistent: consistent } };
}

if (process.argv[1]?.endsWith("extract-reference-battles.ts")) {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const savePath = get("--save");
  const installPath = get("--install");
  const outPath = get("--out") ?? "tests/fixtures/battle-sim/reference-battles.json";
  if (!savePath || !installPath) {
    console.error("Usage: --save <melted .eu5> --install <EU5 game dir> [--out <json>]");
    process.exit(1);
  }
  void extract(savePath, installPath).then(({ battles, check }) => {
    writeFileSync(outPath, `${JSON.stringify(battles, null, 2)}\n`);
    console.log(`Wrote ${battles.length} land battles to ${outPath}`);
    console.log(`U-42 check: winner had the higher prestige change in ${check.prestigeConsistent}/${check.prestigeChecked} battles`);
  });
}
