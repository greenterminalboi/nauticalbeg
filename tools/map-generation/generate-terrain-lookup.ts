// specs/011-atlas-map-modes: reads the local game install's own
// location_templates.txt (research.md §5) and writes a committed
// name -> topography lookup, the same generation-then-commit shape
// `rgoGameColors.ts` already established for the RGO layer's colors
// (constitution's Encyclopedia-data exception — structured reference
// data derived from the base game's own files, never redistributed as
// art/text). Not part of the province-map-generation topojson pipeline
// (tools/map-generation/generate.ts): terrain is a per-location-name
// static lookup, joined the same way the map already joins geometry to
// save data, not baked into the map geometry asset itself.
//
// Usage: tsx tools/map-generation/generate-terrain-lookup.ts --install <path-to-eu5-install> [--out <path>]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const MAP_DATA_RELATIVE_PATH = "in_game/map_data/location_templates.txt";
const DEFAULT_OUT_PATH = "src/components/Overview/locationTerrain.ts";

export class CliError extends Error {}

export interface Args {
  installPath: string;
  outPath: string;
}

export function parseArgs(argv: string[]): Args {
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

// One location per line: `<name> = { topography = <value> ... }` — every
// other field on the same line (vegetation/climate/religion/culture/
// raw_material/natural_harbor_suitability) is irrelevant here. Confirmed
// against the real install: all 28,573 entries carry `topography`, none
// span multiple lines.
const LINE_PATTERN = /^(\S+)\s*=\s*\{[^}]*\btopography\s*=\s*(\S+)/;

export function parseLocationTemplates(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const match = LINE_PATTERN.exec(line);
    if (!match) continue;
    const [, name, topography] = match;
    result[name] = topography;
  }
  return result;
}

export function formatOutput(terrain: Record<string, string>): string {
  const entries = Object.entries(terrain)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, topography]) => `  ${JSON.stringify(name)}: ${JSON.stringify(topography)},`)
    .join("\n");
  return `// specs/011-atlas-map-modes: each location's static terrain (topography)
// category, sourced directly from the game's own
// game/in_game/map_data/location_templates.txt (research.md §5) rather
// than a computed approximation (constitution Principle IV). Keyed by
// location name, matching the same join key the map already uses
// against the generated map geometry's decoded properties.name
// (mapLocationData.ts's own doc comment).
//
// This table is static game-reference data, not something derivable
// from a save at runtime (the browser has no access to a user's local
// game install) — regenerate it the same way if a future game version
// adds/renames a location or changes its terrain: re-run
// \`npm run generate:terrain -- --install <path-to-eu5-install>\` against
// an updated install and replace this table's contents.
export const LOCATION_TERRAIN: Record<string, string> = {
${entries}
};
`;
}

export function main(argv: string[]): void {
  const { installPath, outPath } = parseArgs(argv);
  const templatesPath = join(installPath, MAP_DATA_RELATIVE_PATH);
  if (!existsSync(templatesPath)) {
    throw new CliError(`location_templates.txt not found at ${templatesPath}`);
  }
  const content = readFileSync(templatesPath, "utf-8");
  const terrain = parseLocationTemplates(content);
  writeFileSync(outPath, formatOutput(terrain), "utf-8");
  console.log(`Wrote ${Object.keys(terrain).length} locations' terrain to ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}
