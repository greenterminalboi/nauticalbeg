// Validates spec SC-002: every province name a real parsed save produces
// is directly joinable against the generated map asset's feature names —
// no manual remapping table (research.md §2's core design decision). Also
// validates specs/005-map-visualization/research.md §1's location join:
// every fixture location name (sourced from the save's own
// metadata.compatibility.locations array, not this asset) must resolve a
// matching `objects.locations` feature's `properties.name`.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { LocationProperties, ProvinceProperties } from "../../tools/map-generation/types";
import {
  applySchema,
  closeSaveDatabase,
  openSaveDatabase,
  queryRows,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const MAP_ASSET_PATH = path.resolve(process.cwd(), "public/map/provinces.topojson");
const LOCATIONS_ASSET_PATH = path.resolve(process.cwd(), "public/map/locations.topojson");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

describe("generated map asset joins against real parsed save province names (spec SC-002)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("finds every fixture province name directly in the decoded asset's feature names", async () => {
    if (!existsSync(MAP_ASSET_PATH)) {
      // The asset is a generated, committed artifact (tasks.md T028) —
      // skip gracefully rather than failing a checkout that hasn't run
      // the generator yet (e.g. before it's first committed).
      return;
    }

    db = await openSaveDatabase("join-with-save.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryRows(
      db,
      "SELECT DISTINCT name FROM provinces WHERE name IS NOT NULL",
    );
    const saveProvinceNames = rows.map((r) => r.name as string);
    expect(saveProvinceNames.length).toBeGreaterThan(0); // sanity: the fixture does have named provinces

    const topology = JSON.parse(readFileSync(MAP_ASSET_PATH, "utf-8"));
    const decoded = feature<ProvinceProperties>(
      topology,
      topology.objects.provinces,
    ) as unknown as FeatureCollection<Geometry, ProvinceProperties>;
    const assetNames = new Set(decoded.features.map((f) => f.properties?.name));

    for (const name of saveProvinceNames) {
      expect(assetNames.has(name)).toBe(true);
    }
  });

  it("finds every fixture location name directly in the decoded asset's feature names (005 research.md §1)", async () => {
    if (!existsSync(LOCATIONS_ASSET_PATH)) {
      return; // same graceful skip as the province test above
    }

    db = await openSaveDatabase("join-with-save-locations.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryRows(
      db,
      "SELECT DISTINCT name FROM locations WHERE name IS NOT NULL",
    );
    const saveLocationNames = rows.map((r) => r.name as string);
    expect(saveLocationNames.length).toBeGreaterThan(0); // sanity: the fixture's locations resolve real names

    const topology = JSON.parse(readFileSync(LOCATIONS_ASSET_PATH, "utf-8"));
    const decoded = feature<LocationProperties>(
      topology,
      topology.objects.locations,
    ) as unknown as FeatureCollection<Geometry, LocationProperties>;
    const assetNames = new Set(decoded.features.map((f) => f.properties?.name));

    for (const name of saveLocationNames) {
      expect(assetNames.has(name)).toBe(true);
    }
  });
});
