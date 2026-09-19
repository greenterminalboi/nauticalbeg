// Validates spec SC-002: every province name a real parsed save produces
// is directly joinable against the generated map asset's feature names —
// no manual remapping table (research.md §2's core design decision).

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { ProvinceProperties } from "../../tools/map-generation/types";
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
});
