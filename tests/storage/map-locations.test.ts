import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tableFromIPC } from "apache-arrow";
import {
  applySchema,
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { listMapLocationsArrow } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listMapLocationsArrow (Map tab)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("returns one row per location with owner/controller color, raw good, control, and summed population", async () => {
    db = await openSaveDatabase("map-locations-basic.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listMapLocationsArrow(db));
    expect(rows.length).toBeGreaterThanOrEqual(2);

    const loc3975 = rows.find((r) => r.name === "mazyr");
    expect(loc3975).toBeTruthy();
    expect(loc3975).toMatchObject({
      idx: 3975,
      owner_idx: 2025,
      owner_color_r: 183,
      owner_color_g: 136,
      owner_color_b: 27,
      owner_name: "RUS", // no nations.name set for RUS — falls back to tag
      controller_idx: 2025,
      controller_color_r: 183,
      controller_color_g: 136,
      controller_color_b: 27,
      controller_name: "RUS",
      raw_material: "wool",
    });
    expect(Number(loc3975!.control)).toBeCloseTo(0.43119, 5);
    expect(Number(loc3975!.total_population)).toBeCloseTo(0.22409 + 1.80333, 5);

    // Location 1 (owned/controlled by SCA, idx 3) has no color in the
    // fixture and no population.pops list — must come back NULL/0, never
    // a fabricated value (constitution Principle IV).
    const loc1 = rows.find((r) => r.name === "stockholm");
    expect(loc1).toMatchObject({
      idx: 1,
      owner_idx: 3,
      owner_color_r: null,
      owner_color_g: null,
      owner_color_b: null,
      raw_material: "clay",
    });
    expect(Number(loc1!.total_population)).toBe(0);
  });

  it("keeps a location's row even when it has no matching nation (Unknown fallback, matching listWarsArrow's convention)", async () => {
    db = await openSaveDatabase("map-locations-unknown-nation.db");
    await applySchema(db);
    await parseAndStore(db, "save-2", "rus-1628-minimal.eu5", toBytes(fixtureText));
    await db.conn.query(
      "INSERT INTO locations (idx, owner_idx, controller_idx, name) VALUES (999999, 424242, 424242, 'nowhere')",
    );

    const rows = decodeRows(await listMapLocationsArrow(db));
    const row = rows.find((r) => r.name === "nowhere");
    expect(row?.owner_name).toBe("Unknown");
    expect(row?.controller_name).toBe("Unknown");
  });

  it("adds the new locations/nations columns and location_pops table to a database created with the pre-005 schema (kept-save compatibility, research.md §6)", async () => {
    db = await openSaveDatabase("map-locations-kept-save.db");

    // Simulate a save kept BEFORE this feature shipped: hand-create
    // locations/nations exactly as they existed pre-005 (no name/
    // raw_material/controller_idx/control/color_* columns, no
    // location_pops table at all), with one existing row each — the
    // way a real already-parsed kept save would look on reopen.
    await db.conn.query(`
      CREATE TABLE locations (
        idx INTEGER PRIMARY KEY,
        owner_idx INTEGER,
        province_idx INTEGER,
        development DOUBLE
      )
    `);
    await db.conn.query(`
      CREATE TABLE nations (
        idx INTEGER PRIMARY KEY,
        tag TEXT NOT NULL,
        name TEXT,
        country_type TEXT,
        is_player INTEGER NOT NULL DEFAULT 0,
        treasury DOUBLE,
        stability DOUBLE,
        government_type TEXT
      )
    `);
    await db.conn.query(
      "INSERT INTO locations (idx, owner_idx, province_idx, development) VALUES (1, 3, 0, 46.90152)",
    );
    await db.conn.query("INSERT INTO nations (idx, tag) VALUES (3, 'SCA')");

    // Reopening a kept save re-runs applySchema today (see
    // src/parser/load-save.ts's resumeSave) — this is the same call a
    // real resume makes, not a special test-only path.
    await applySchema(db);

    const locCols = await db.conn.query(
      "SELECT name, raw_material, controller_idx, control FROM locations WHERE idx = 1",
    );
    expect(locCols.toArray()[0].toJSON()).toMatchObject({
      name: null,
      raw_material: null,
      controller_idx: null,
      control: null,
    });

    const nationCols = await db.conn.query(
      "SELECT color_r, color_g, color_b FROM nations WHERE idx = 3",
    );
    expect(nationCols.toArray()[0].toJSON()).toMatchObject({
      color_r: null,
      color_g: null,
      color_b: null,
    });

    // location_pops didn't exist at all pre-005 — must now exist and be
    // queryable (empty, since this "kept" save was never re-parsed).
    const pops = await db.conn.query("SELECT COUNT(*) as n FROM location_pops");
    expect(pops.toArray()[0].toJSON().n).toBe(0n);

    // Re-running applySchema again (e.g. a second resume) must stay a
    // no-op, not error on an already-added column.
    await applySchema(db);
  });
});
