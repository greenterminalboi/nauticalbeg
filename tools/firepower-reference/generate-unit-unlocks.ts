// CLI: generates src/components/Overview/unitUnlockReference.ts from the
// local EU5 install's advance definitions. Reuses this project's existing
// `jomini` dependency (same Clausewitz script grammar
// src/parser/version-adapters/1.3.11.ts already parses for saves), the
// same technique as tools/encyclopedia-scraping/parse-definitions.ts.
//
// Usage: npx tsx tools/firepower-reference/generate-unit-unlocks.ts --install "<path to game/ dir>"
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Jomini } from "jomini";

const README_RE = /readme/i;

interface UnitUnlockReferenceEntry {
  advance: string;
  unlockedUnitTypes: string[];
  potential?: { cultureGroup?: string; region?: string[]; tag?: string; raw?: string };
}

function parseArgs(argv: string[]): { installPath: string } {
  let installPath: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--install") {
      installPath = argv[i + 1];
      i++;
    }
  }
  if (!installPath) {
    throw new Error("Usage: generate-unit-unlocks.ts --install <path to game/ dir>");
  }
  return { installPath };
}

// Recursively searches a parsed `potential` block for the specific,
// simple gate shapes this feature cares about (data-model.md's "known
// accepted simplification"): a culture-group check, a region check
// (possibly repeated under an OR), or a direct tag check. Anything more
// complex is left for the `raw` fallback — never guessed at.
function extractSimpleGates(node: unknown): { cultureGroup?: string; region?: string[]; tag?: string } {
  const out: { cultureGroup?: string; region?: string[]; tag?: string } = {};
  function walk(n: unknown): void {
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
      return;
    }
    if (n === null || typeof n !== "object") return;
    for (const [key, value] of Object.entries(n as Record<string, unknown>)) {
      if (key === "has_culture_group" && typeof value === "string") {
        out.cultureGroup = value.replace(/^culture_group:/, "");
      } else if (key === "has_or_had_tag" || key === "tag") {
        if (typeof value === "string") out.tag = value;
      } else if (key === "region") {
        const regions = Array.isArray(value) ? value : [value];
        out.region = (out.region ?? []).concat(
          regions.filter((r): r is string => typeof r === "string").map((r) => r.replace(/^region:/, "")),
        );
      } else {
        walk(value);
      }
    }
  }
  walk(node);
  return out;
}

async function main() {
  const { installPath } = parseArgs(process.argv.slice(2));
  const advancesDir = join(installPath, "in_game/common/advances");

  const parser = await Jomini.initialize();
  const allFiles = readdirSync(advancesDir).filter((f) => f.endsWith(".txt") && !README_RE.test(f));

  // Only files actually containing `unlock_unit` need parsing for this
  // purpose, but we still parse with jomini (not grep) so field shapes
  // (single value vs. list) are handled correctly rather than guessed
  // from text.
  const candidateFiles = allFiles.filter((f) => {
    const text = readFileSync(join(advancesDir, f), "utf-8");
    return text.includes("unlock_unit");
  });

  const entries: UnitUnlockReferenceEntry[] = [];
  const skips: string[] = [];

  for (const file of candidateFiles) {
    const filePath = join(advancesDir, file);
    let root: Record<string, unknown>;
    try {
      root = parser.parseText(readFileSync(filePath, "utf-8"), { typeNarrowing: "unquoted" }) as Record<
        string,
        unknown
      >;
    } catch (err) {
      skips.push(`${file}: parse error: ${(err as Error).message}`);
      continue;
    }

    for (const [key, value] of Object.entries(root)) {
      if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
      const fields = value as Record<string, unknown>;
      if (!("unlock_unit" in fields)) continue;

      const rawUnlock = fields.unlock_unit;
      const unlockedUnitTypes = (Array.isArray(rawUnlock) ? rawUnlock : [rawUnlock]).filter(
        (u): u is string => typeof u === "string",
      );
      if (unlockedUnitTypes.length === 0) {
        skips.push(`${file}/${key}: unlock_unit present but no string value found`);
        continue;
      }

      const entry: UnitUnlockReferenceEntry = { advance: key, unlockedUnitTypes };
      if (fields.potential && typeof fields.potential === "object") {
        const simple = extractSimpleGates(fields.potential);
        if (simple.cultureGroup || simple.region || simple.tag) {
          entry.potential = simple;
        } else {
          entry.potential = { raw: JSON.stringify(fields.potential) };
        }
      }
      entries.push(entry);
    }
  }

  if (skips.length > 0) {
    console.warn(`Skipped ${skips.length} entries:\n` + skips.map((s) => `  - ${s}`).join("\n"));
  }

  const out = `// The advance -> unlocked-unit-type lookup, sourced directly from the
// game's own advance definition files (constitution Principle IV / the
// Encyclopedia-data exception): every advance in
// \`game/in_game/common/advances/*.txt\` that carries an \`unlock_unit\`
// field, confirmed against a real local install and cross-checked
// against a real save's \`researched_advances\` flags (specs/012-firepower-tab
// research.md \xa74, \xa76) — the flat \`<advance>=yes\` boolean list on a
// country's save record is confirmed to be the real, only gate; this
// table is what turns that boolean list into a recruitable unit roster.
//
// \`potential\` captures the small subset of unlock-gating triggers this
// feature actually interprets (a culture-group check, a region check, or
// a tag check per data-model.md's "known accepted simplification") —
// anything more complex is kept as \`raw\` (the full parsed trigger,
// JSON-stringified) rather than guessed at or silently dropped. Most
// entries have no \`potential\` at all: a country-specific advance file
// (e.g. \`country_chi.txt\`) is already correctly scoped by the advance's
// own research-availability gate, so the flag alone is authoritative for
// those (research.md \xa74's note) — \`potential\` here only matters for
// the minority of *culture-group*- or *region*-gated unique unlocks.
//
// Static game-reference data, not derivable from a save at runtime.
// Regenerate with: npx tsx tools/firepower-reference/generate-unit-unlocks.ts --install "<path to game/ dir>"
export interface UnitUnlockReferenceEntry {
  advance: string;
  unlockedUnitTypes: string[];
  potential?: { cultureGroup?: string; region?: string[]; tag?: string; raw?: string };
}

export const UNIT_UNLOCK_REFERENCE: UnitUnlockReferenceEntry[] = ${JSON.stringify(entries, null, 2)};
`;

  writeFileSync("src/components/Overview/unitUnlockReference.ts", out, "utf-8");
  console.log(`Wrote ${entries.length} entries to src/components/Overview/unitUnlockReference.ts`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
