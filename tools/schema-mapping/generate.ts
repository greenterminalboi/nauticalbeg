// CLI entrypoint for the schema-mapping tool.
// Contract: specs/004-full-schema-mapping/contracts/cli-contract.md

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Jomini } from "jomini";
import { buildSaveInventory } from "./inventory";
import { diffSaveInventories } from "./diff";
import { formatSaveInventoryAsMarkdown } from "./format-markdown";
import type { SaveInventory } from "./types";

const DEFAULT_INVENTORY_DIR = "tools/schema-mapping/inventories";

export class CliError extends Error {}

interface InventoryOptions {
  savePath: string;
  outPath: string;
  markdown: boolean;
}

export function parseInventoryArgs(argv: string[]): InventoryOptions {
  let savePath: string | undefined;
  let outPath: string | undefined;
  let markdown = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--save") {
      savePath = argv[i + 1];
      i++;
    } else if (argv[i] === "--out") {
      outPath = argv[i + 1];
      i++;
    } else if (argv[i] === "--markdown") {
      markdown = true;
    }
  }

  if (!savePath) {
    throw new CliError("--save <path-to-save-file> is required (see contracts/cli-contract.md).");
  }
  if (!outPath) {
    const base = basename(savePath, ".eu5");
    outPath = join(DEFAULT_INVENTORY_DIR, `${base}.json`);
  }

  return { savePath, outPath, markdown };
}

/** Loads and validates a save file, mirroring the same "does this even
 * look like a save" signal `src/parser/version-adapters/1.3.11.ts`
 * checks (a `metadata` section must exist) — per
 * contracts/cli-contract.md's exit-behavior table. */
async function parseSaveFile(savePath: string): Promise<Record<string, unknown>> {
  if (!existsSync(savePath)) {
    throw new CliError(`--save path does not exist: ${savePath}`);
  }
  let bytes: Buffer;
  try {
    bytes = readFileSync(savePath);
  } catch (cause) {
    throw new CliError(`could not read --save path ${savePath}: ${cause}`);
  }

  const parser = await Jomini.initialize();
  let root: Record<string, unknown>;
  try {
    root = parser.parseText(bytes, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
  } catch (cause) {
    throw new CliError(`${savePath} could not be parsed as an EU5 save: ${cause}`);
  }
  if (root === null || typeof root !== "object" || !("metadata" in root)) {
    throw new CliError(`${savePath} does not look like an EU5 save (no top-level "metadata" section).`);
  }
  return root;
}

function writeJsonFile(outPath: string, data: unknown): void {
  const dir = dirname(outPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(outPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function runInventory(argv: string[]): Promise<void> {
  const options = parseInventoryArgs(argv);
  console.error(`[schema-map] parsing ${options.savePath}...`);
  const root = await parseSaveFile(options.savePath);

  console.error("[schema-map] walking every top-level section...");
  const inventory = buildSaveInventory(root, basename(options.savePath));

  writeJsonFile(options.outPath, inventory);

  let markdownPath: string | null = null;
  if (options.markdown) {
    markdownPath = options.outPath.replace(/\.json$/, ".md");
    writeFileSync(markdownPath, formatSaveInventoryAsMarkdown(inventory), "utf-8");
  }

  const totalFields = inventory.sections.reduce((sum, s) => sum + s.entries.length, 0);
  const unconfirmedSections = inventory.sections.filter((s) => !s.shapeConfirmed).length;
  console.log(
    `Wrote inventory for ${inventory.sections.length} section(s), ${totalFields} field path(s), to ${options.outPath}` +
      (markdownPath ? ` (and ${markdownPath})` : "") +
      ` (${unconfirmedSections} section(s) shape-unconfirmed from this sample).`,
  );
}

interface DiffOptions {
  baselinePath: string;
  candidatePath: string;
  outPath: string | null;
}

export function parseDiffArgs(argv: string[]): DiffOptions {
  let baselinePath: string | undefined;
  let candidatePath: string | undefined;
  let outPath: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--baseline") {
      baselinePath = argv[i + 1];
      i++;
    } else if (argv[i] === "--candidate") {
      candidatePath = argv[i + 1];
      i++;
    } else if (argv[i] === "--out") {
      outPath = argv[i + 1] ?? null;
      i++;
    }
  }

  if (!baselinePath) {
    throw new CliError("--baseline <path-to-inventory.json> is required (see contracts/cli-contract.md).");
  }
  if (!candidatePath) {
    throw new CliError("--candidate <path-to-inventory.json> is required (see contracts/cli-contract.md).");
  }

  return { baselinePath, candidatePath, outPath };
}

/** Loads and structurally validates a previously-generated Save
 * Inventory JSON file — per contracts/cli-contract.md's exit-behavior
 * table, a missing/invalid input is a non-zero exit naming which input
 * and why, not a crash. */
function loadInventoryFile(label: "--baseline" | "--candidate", path: string): SaveInventory {
  if (!existsSync(path)) {
    throw new CliError(`${label} path does not exist: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch (cause) {
    throw new CliError(`${label} path ${path} is not valid JSON: ${cause}`);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).sourceFile !== "string" ||
    !Array.isArray((parsed as Record<string, unknown>).sections)
  ) {
    throw new CliError(
      `${label} path ${path} does not look like a Save Inventory (expected "sourceFile" and "sections" — did you pass a raw save file instead of this tool's own "inventory" output?).`,
    );
  }
  return parsed as SaveInventory;
}

async function runDiff(argv: string[]): Promise<void> {
  const options = parseDiffArgs(argv);
  const baseline = loadInventoryFile("--baseline", options.baselinePath);
  const candidate = loadInventoryFile("--candidate", options.candidatePath);

  const report = diffSaveInventories(baseline, candidate);
  const output = JSON.stringify(report, null, 2);

  if (options.outPath) {
    writeJsonFile(options.outPath, report);
  }
  console.log(output);
  if (!report.hasDrift) {
    console.log("No drift found.");
  }
}

async function main(): Promise<void> {
  const [mode, ...rest] = process.argv.slice(2);
  if (mode === "inventory") {
    await runInventory(rest);
  } else if (mode === "diff") {
    await runDiff(rest);
  } else {
    throw new CliError(
      `Unknown mode "${mode ?? ""}" — expected "inventory" or "diff" (see contracts/cli-contract.md).`,
    );
  }
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
