// CLI entrypoint for the Game Encyclopedia generation pipeline.
// Contract: specs/008-game-encyclopedia/contracts/encyclopedia-data-contract.md
// Mirrors tools/map-generation/generate.ts's --install convention.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_ASSIGNMENTS, GAME_CONCEPTS_CATEGORY_ID } from "./categories";
import { parseDefinitionCategory } from "./parse-definitions";
import { parseLocalization } from "./parse-localization";
import { buildOutput, writeOutput } from "./write-output";
import type { EntrySource, ParseSkip, RawEntry } from "./types";

const DEFAULT_OUT_DIR = "public/encyclopedia";
const DEFAULT_GAME_VERSION = "unknown";
const IN_GAME_COMMON = "in_game/common";
const MAIN_MENU_COMMON = "main_menu/common";
const DLC_DIR = "dlc";

export class CliError extends Error {}

export interface CliOptions {
  installPath: string;
  outPath: string;
  gameVersion: string;
}

export function parseArgs(argv: string[]): CliOptions {
  let installPath: string | undefined;
  let outPath = DEFAULT_OUT_DIR;
  let gameVersion = DEFAULT_GAME_VERSION;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--install") {
      installPath = argv[i + 1];
      i++;
    } else if (argv[i] === "--out") {
      outPath = argv[i + 1] ?? outPath;
      i++;
    } else if (argv[i] === "--game-version") {
      gameVersion = argv[i + 1] ?? gameVersion;
      i++;
    }
  }

  if (!installPath) {
    throw new CliError(
      "--install <path-to-eu5-install> is required (see contracts/encyclopedia-data-contract.md).",
    );
  }

  return { installPath, outPath, gameVersion };
}

/** Validates that `installPath` looks like a real EU5 installation
 * (contains in_game/common/) — FR-012's "fail clearly" requirement. */
export function validateInstallPath(installPath: string): void {
  const commonPath = join(installPath, IN_GAME_COMMON);
  if (!existsSync(installPath) || !statSync(installPath).isDirectory()) {
    throw new CliError(`--install path does not exist or is not a directory: ${installPath}`);
  }
  if (!existsSync(commonPath) || !statSync(commonPath).isDirectory()) {
    throw new CliError(
      `--install path does not look like an EU5 installation: expected to find ` +
        `${IN_GAME_COMMON}/ under ${installPath}, but it wasn't there.`,
    );
  }
}

/** Finds installed DLC folder names under <install>/dlc/. */
function findInstalledDlcs(installPath: string): string[] {
  const dlcRoot = join(installPath, DLC_DIR);
  if (!existsSync(dlcRoot)) return [];
  return readdirSync(dlcRoot).filter((name) => statSync(join(dlcRoot, name)).isDirectory());
}

/** The category's own relative path under an install/DLC root —
 * game_concepts is the one category that lives under main_menu/common
 * rather than in_game/common (research.md §8). */
function categoryRelativePath(categoryId: string): string {
  const base = categoryId === GAME_CONCEPTS_CATEGORY_ID ? MAIN_MENU_COMMON : IN_GAME_COMMON;
  return join(base, categoryId);
}

/** Warns (never fails) about a base-game category folder that exists on
 * disk but has no entry in categories.ts's CATEGORY_ASSIGNMENTS table —
 * research.md §3's "a future base-game update... handled by re-running
 * generation" case. A silently-missed new category is exactly the
 * FR-007 failure mode this check exists to catch. */
export function warnOnUnlistedCategories(installPath: string): void {
  const commonPath = join(installPath, IN_GAME_COMMON);
  let folders: string[];
  try {
    folders = readdirSync(commonPath).filter((name) => statSync(join(commonPath, name)).isDirectory());
  } catch {
    return;
  }
  const known = new Set(CATEGORY_ASSIGNMENTS.map((a) => a.id));
  const unlisted = folders.filter((name) => !known.has(name));
  for (const name of unlisted) {
    console.error(
      `[encyclopedia-gen] WARNING: category folder "${name}" exists under ${IN_GAME_COMMON}/ but has no entry in categories.ts — it will not appear in the Encyclopedia at all until added there.`,
    );
  }
}

async function parseAllCategories(
  installPath: string,
  dlcNames: string[],
): Promise<{ entries: RawEntry[]; skips: ParseSkip[] }> {
  const entries: RawEntry[] = [];
  const skips: ParseSkip[] = [];

  for (const assignment of CATEGORY_ASSIGNMENTS) {
    const relativePath = categoryRelativePath(assignment.id);

    const baseDir = join(installPath, relativePath);
    if (existsSync(baseDir)) {
      const result = await parseDefinitionCategory(baseDir, assignment.id, { kind: "base" });
      entries.push(...result.entries);
      skips.push(...result.skips);
    }

    for (const dlcId of dlcNames) {
      const dlcDir = join(installPath, DLC_DIR, dlcId, relativePath);
      if (!existsSync(dlcDir)) continue;
      const source: EntrySource = { kind: "dlc", dlcId };
      const result = await parseDefinitionCategory(dlcDir, assignment.id, source);
      entries.push(...result.entries);
      skips.push(...result.skips);
    }
  }

  return { entries, skips };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  validateInstallPath(options.installPath);

  const dlcNames = findInstalledDlcs(options.installPath);
  console.error(`[encyclopedia-gen] found ${dlcNames.length} installed DLC folder(s): ${dlcNames.join(", ") || "none"}`);

  warnOnUnlistedCategories(options.installPath);

  console.error("[encyclopedia-gen] parsing definition categories...");
  const { entries, skips } = await parseAllCategories(options.installPath, dlcNames);
  console.error(`[encyclopedia-gen] parsed ${entries.length} entries across ${CATEGORY_ASSIGNMENTS.length} categories (${skips.length} file(s) skipped)`);
  for (const skip of skips) {
    console.error(`[encyclopedia-gen]   skipped ${skip.file}: ${skip.reason}`);
  }

  console.error("[encyclopedia-gen] merging localization...");
  const localization = parseLocalization(options.installPath);
  console.error(`[encyclopedia-gen] merged localization for ${localization.size} key(s)`);

  const result = buildOutput(entries, localization, {
    generatedAt: new Date().toISOString(),
    gameVersion: options.gameVersion,
    dlcs: dlcNames,
  });

  writeOutput(result, options.outPath);

  const includedCount = result.manifest.domainGroups.reduce((sum, g) => sum + g.categories.length, 0);
  console.log(
    `Wrote ${result.searchIndex.length} entries across ${includedCount} categories ` +
      `(${result.manifest.excludedCategories.length} excluded) to ${options.outPath}.`,
  );
}

// Only run when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err: unknown) => {
    if (err instanceof CliError) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  });
}
