// CLI entrypoint for the province map generation pipeline.
// Contract: specs/003-province-map-generation/contracts/cli-contract.md

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { parseNamedLocations } from "./read-named-locations";
import { groupPixelsByColor, type DecodedBitmap } from "./read-locations-bitmap";
import { parseDefinitions } from "./read-definitions";
import { traceRegionToPolygons, unionPixelRegions } from "./trace-polygons";
import { projectPixel } from "./project";
import { buildCombinedTopology, buildLocationsOnlyTopology, writeTopologyFile } from "./write-topology";
import type {
  CliOptions,
  LocationPixelRegion,
  MapAssetProperties,
  NamedLocation,
  ProjectedLocationFeature,
  ProjectedProvinceFeature,
  RawPolygon,
} from "./types";
import type { MultiPolygon, Polygon } from "geojson";

const DEFAULT_OUT_PATH = "public/map/provinces.topojson";
const DEFAULT_OUT_LOCATIONS_PATH = "public/map/locations.topojson";
const DEFAULT_GAME_VERSION = "unknown";
const MAP_DATA_RELATIVE_PATH = "game/in_game/map_data";

export class CliError extends Error {}

export function parseArgs(argv: string[]): CliOptions {
  let installPath: string | undefined;
  let outPath = DEFAULT_OUT_PATH;
  let outLocationsPath = DEFAULT_OUT_LOCATIONS_PATH;
  let gameVersion = DEFAULT_GAME_VERSION;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--install") {
      installPath = argv[i + 1];
      i++;
    } else if (argv[i] === "--out") {
      outPath = argv[i + 1] ?? outPath;
      i++;
    } else if (argv[i] === "--out-locations") {
      outLocationsPath = argv[i + 1] ?? outLocationsPath;
      i++;
    } else if (argv[i] === "--game-version") {
      gameVersion = argv[i + 1] ?? gameVersion;
      i++;
    }
  }

  if (!installPath) {
    throw new CliError(
      "--install <path-to-eu5-install> is required (see contracts/cli-contract.md).",
    );
  }

  return { installPath, outPath, outLocationsPath, gameVersion };
}

/**
 * Validates that `installPath` looks like a real EU5 installation (contains
 * game/in_game/map_data/) per contracts/cli-contract.md's "Exit behavior"
 * table, row 2. Throws CliError with an actionable message otherwise.
 */
export function validateInstallPath(installPath: string): string {
  const mapDataPath = join(installPath, MAP_DATA_RELATIVE_PATH);
  if (!existsSync(installPath) || !statSync(installPath).isDirectory()) {
    throw new CliError(
      `--install path does not exist or is not a directory: ${installPath}`,
    );
  }
  if (!existsSync(mapDataPath) || !statSync(mapDataPath).isDirectory()) {
    throw new CliError(
      `--install path does not look like an EU5 installation: expected to find ` +
        `${MAP_DATA_RELATIVE_PATH}/ under ${installPath}, but it wasn't there.`,
    );
  }
  return mapDataPath;
}

function loadNamedLocations(mapDataPath: string): NamedLocation[] {
  const dir = join(mapDataPath, "named_locations");
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".txt"));
  } catch (cause) {
    throw new CliError(`could not read named_locations/ under ${mapDataPath}: ${cause}`);
  }

  const result: NamedLocation[] = [];
  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    result.push(...parseNamedLocations(content));
  }
  return result;
}

function loadBitmap(mapDataPath: string): DecodedBitmap {
  const path = join(mapDataPath, "locations.png");
  try {
    const png = PNG.sync.read(readFileSync(path));
    return { width: png.width, height: png.height, data: png.data };
  } catch (cause) {
    throw new CliError(`locations.png at ${path} is not a valid PNG: ${cause}`);
  }
}

function loadDefinitions(mapDataPath: string) {
  const path = join(mapDataPath, "definitions.txt");
  try {
    const content = readFileSync(path, "utf-8");
    const groupings = parseDefinitions(content);
    if (groupings.length === 0) {
      throw new Error("no province groupings found — unexpected file shape");
    }
    return groupings;
  } catch (cause) {
    throw new CliError(`definitions.txt at ${path} could not be parsed: ${cause}`);
  }
}

function toGeoJSONGeometry(
  polygons: RawPolygon[],
  width: number,
  height: number,
): Polygon | MultiPolygon {
  const projectRing = (ring: RawPolygon[number]) =>
    ring.map(([x, y]) => projectPixel(x, y, width, height));
  const projectedPolygons = polygons.map((rings) => rings.map(projectRing));

  if (projectedPolygons.length === 1) {
    return { type: "Polygon", coordinates: projectedPolygons[0] };
  }
  return { type: "MultiPolygon", coordinates: projectedPolygons };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const mapDataPath = validateInstallPath(options.installPath);

  console.error("[map-gen] loading named locations...");
  const namedLocations = loadNamedLocations(mapDataPath);
  console.error(`[map-gen] loaded ${namedLocations.length} named locations`);

  console.error("[map-gen] decoding locations.png (this is the slow step)...");
  const bitmap = loadBitmap(mapDataPath);
  console.error(`[map-gen] decoded bitmap ${bitmap.width}x${bitmap.height}`);

  const provinceGroupings = loadDefinitions(mapDataPath);
  console.error(`[map-gen] loaded ${provinceGroupings.length} province groupings`);

  console.error("[map-gen] grouping pixels by color...");
  const regionsByName = new Map<string, LocationPixelRegion>(
    groupPixelsByColor(bitmap, namedLocations).map((r) => [r.name, r]),
  );
  console.error(`[map-gen] grouped ${regionsByName.size} location pixel regions`);

  const skippedLocationNames = new Set<string>();
  const provinceFeatures: ProjectedProvinceFeature[] = [];

  let processed = 0;
  for (const province of provinceGroupings) {
    processed++;
    if (processed % 500 === 0) {
      console.error(`[map-gen] traced ${processed}/${provinceGroupings.length} provinces...`);
    }
    const memberRegions: LocationPixelRegion[] = [];
    for (const locationName of province.locationNames) {
      const region = regionsByName.get(locationName);
      if (region) {
        memberRegions.push(region);
      } else {
        // research.md §6: a location with no paintable color — skip it,
        // report it, never crash the whole run over it (FR-008).
        skippedLocationNames.add(locationName);
      }
    }

    if (memberRegions.length === 0) continue; // no paintable member — skip the whole province

    const unioned = unionPixelRegions(memberRegions);
    const polygons = traceRegionToPolygons(unioned);
    if (polygons.length === 0) continue;

    provinceFeatures.push({
      type: "Feature",
      properties: { name: province.name, location_count: memberRegions.length },
      geometry: toGeoJSONGeometry(polygons, bitmap.width, bitmap.height),
    });
  }

  console.error("[map-gen] tracing individual locations...");
  const locationFeatures: ProjectedLocationFeature[] = [];
  let locationsProcessed = 0;
  for (const region of regionsByName.values()) {
    locationsProcessed++;
    if (locationsProcessed % 5000 === 0) {
      console.error(`[map-gen] traced ${locationsProcessed}/${regionsByName.size} locations...`);
    }
    const polygons = traceRegionToPolygons(region.rows);
    if (polygons.length === 0) continue;

    locationFeatures.push({
      type: "Feature",
      properties: { name: region.name },
      geometry: toGeoJSONGeometry(polygons, bitmap.width, bitmap.height),
    });
  }

  const properties: MapAssetProperties = {
    generated_from_game_version: options.gameVersion,
    generated_at: new Date().toISOString(),
    source_bitmap_width: bitmap.width,
    source_bitmap_height: bitmap.height,
    province_count: provinceFeatures.length,
    location_count: locationFeatures.length,
    skipped_location_names: [...skippedLocationNames].sort(),
  };

  // Build (and validate) both topologies before writing either file — a
  // failure on the second build must not leave the first file's write
  // committed (contracts/cli-contract.md's "neither file written on
  // failure" guarantee).
  const combined = buildCombinedTopology(provinceFeatures, locationFeatures, properties);
  const locationsOnly = buildLocationsOnlyTopology(locationFeatures, properties);

  writeTopologyFile(options.outPath, combined);
  writeTopologyFile(options.outLocationsPath, locationsOnly);

  console.log(
    `Wrote ${provinceFeatures.length} provinces + ${locationFeatures.length} locations to ${options.outPath}, ` +
      `and ${locationFeatures.length} locations to ${options.outLocationsPath} ` +
      `(${skippedLocationNames.size} unpaintable location(s) skipped).`,
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
