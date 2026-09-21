// CLI entrypoint for the Ruler History name lookup (specs/006-country-
// leaderboard, post-ship 2026-09-21, explicit user request for real
// ruler names in the tooltip, not "Ruler #N").
//
// A save's `character_db.database.*.first_name` is a raw localization
// key (e.g. "name_birger"), not display text — the same shape problem
// 008's Encyclopedia already solved for game_concepts, so this reuses
// that pipeline's own `parseLocalization` (a full scan of every
// `*_l_english.yml` under the install) rather than writing a second
// parser. Character first names live specifically in
// `main_menu/localization/english/character_names_dynamic_l_english.yml`
// (~4,546 base `name_*` keys, confirmed against a real install), but
// `parseLocalization` scans the whole tree regardless — this script
// just filters its result down to the keys this feature needs.
//
// Mirrors tools/encyclopedia-scraping/generate.ts's --install/--out CLI
// convention. Output is plain JSON (not a .ts object literal) — ~4,500
// short string entries, no reason to pay TS-parse cost for static data.
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseLocalization } from "../encyclopedia-scraping/parse-localization";

const DEFAULT_OUT_PATH = "src/components/Overview/rulerNames.json";
const NAME_KEY_PREFIX = "name_";

export class CliError extends Error {}

export interface CliOptions {
  installPath: string;
  outPath: string;
}

export function parseArgs(argv: string[]): CliOptions {
  let installPath: string | undefined;
  let outPath = DEFAULT_OUT_PATH;

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

export function validateInstallPath(installPath: string): void {
  if (!existsSync(installPath) || !statSync(installPath).isDirectory()) {
    throw new CliError(`--install path does not exist or is not a directory: ${installPath}`);
  }
}

/** Base `name_*` keys only — a key containing a dot (e.g.
 * `name_birger.greek_language`) is a regional-script variant of the
 * same name, not a separate ruler-facing key a save's `first_name`
 * field ever actually stores. */
export function buildRulerNameLookup(installPath: string): Record<string, string> {
  const localization = parseLocalization(installPath);
  const lookup: Record<string, string> = {};
  for (const [key, entry] of localization) {
    if (!key.startsWith(NAME_KEY_PREFIX)) continue;
    if (key.includes(".")) continue;
    if (entry.name === null) continue;
    lookup[key] = entry.name;
  }
  return lookup;
}

export function run(options: CliOptions): { entryCount: number; outPath: string } {
  validateInstallPath(options.installPath);
  const lookup = buildRulerNameLookup(options.installPath);
  const entryCount = Object.keys(lookup).length;
  if (entryCount === 0) {
    throw new CliError(
      "No name_* localization keys found under this install — is --install pointed at the game's own install root (containing in_game/, main_menu/)?",
    );
  }

  mkdirSync(dirname(options.outPath), { recursive: true });
  // Sorted keys: a stable, reviewable diff on regeneration.
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(lookup).sort()) sorted[key] = lookup[key];
  writeFileSync(options.outPath, JSON.stringify(sorted, null, 2) + "\n", "utf-8");

  return { entryCount, outPath: options.outPath };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = run(options);
    console.log(`Wrote ${result.entryCount} ruler names to ${result.outPath}`);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}
