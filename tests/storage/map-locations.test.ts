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

  it("returns rank/market_idx/possible_tax/soldiers and culture/religion name+color, joined by id (specs/011-atlas-map-modes)", async () => {
    db = await openSaveDatabase("map-locations-atlas-map-modes.db");
    await applySchema(db);
    await parseAndStore(db, "save-3", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listMapLocationsArrow(db));

    const loc3975 = rows.find((r) => r.name === "mazyr");
    expect(loc3975).toMatchObject({
      rank: "town",
      market_idx: 1,
      // market 1's center is location 1 ("stockholm") — both locations
      // 1 and 3975 belong to market 1 in the fixture, so both must show
      // the same real center-location name, not a bare "Market 1"
      // (post-ship correction, 2026-09-21).
      market_name: "stockholm",
      culture_name: "polesian_culture",
      culture_color_r: 166,
      culture_color_g: 133,
      culture_color_b: 133,
      religion_name: "orthodox",
      religion_color_r: 121,
      religion_color_g: 53,
      religion_color_b: 140,
    });
    expect(Number(loc3975!.possible_tax)).toBeCloseTo(31.69176, 5);
    expect(Number(loc3975!.soldiers)).toBeCloseTo(9.5, 5);

    // Location 1 has no population.pop_stats.soldiers entry in the
    // fixture — must come back NULL, never a fabricated 0.
    const loc1 = rows.find((r) => r.name === "stockholm");
    expect(loc1?.soldiers).toBeNull();
    expect(loc1).toMatchObject({
      rank: "city",
      market_idx: 1,
      market_name: "stockholm",
      culture_name: "swedish",
      religion_name: "lutheran",
    });
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
      "SELECT name, raw_material, controller_idx, control, rank, culture_idx, religion_idx, market_idx, possible_tax, soldiers FROM locations WHERE idx = 1",
    );
    expect(locCols.toArray()[0].toJSON()).toMatchObject({
      name: null,
      raw_material: null,
      controller_idx: null,
      control: null,
      rank: null,
      culture_idx: null,
      religion_idx: null,
      market_idx: null,
      possible_tax: null,
      soldiers: null,
    });

    // cultures/religions didn't exist at all before this feature — must
    // now exist and be queryable (empty, since this "kept" save was
    // never re-parsed).
    const cultureCount = await db.conn.query("SELECT COUNT(*) as n FROM cultures");
    expect(cultureCount.toArray()[0].toJSON().n).toBe(0n);
    const religionCount = await db.conn.query("SELECT COUNT(*) as n FROM religions");
    expect(religionCount.toArray()[0].toJSON().n).toBe(0n);

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

  // specs/014-country-province-map-modes contracts/queries.md: owner_* and
  // province_* aggregates, repeated onto every location row.
  it("repeats the owner's treasury/stability/government and live works-of-art count onto every location it owns (fixture)", async () => {
    db = await openSaveDatabase("map-locations-014-fixture.db");
    await applySchema(db);
    await parseAndStore(db, "save-014", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listMapLocationsArrow(db));
    const rus = rows.filter((r) => r.owner_idx === 2025);
    expect(rus.length).toBeGreaterThanOrEqual(1);
    const nation = (
      await db.conn.query("SELECT treasury, stability, government_type FROM nations WHERE idx = 2025")
    ).toArray()[0].toJSON();
    for (const row of rus) {
      expect(row.owner_treasury).toBe(nation.treasury);
      expect(row.owner_stability).toBe(nation.stability);
      expect(row.owner_government_type).toBe(nation.government_type);
      // Fixture: RUS owns one live work and one destroyed work; the
      // unowned work counts for nobody (research.md §2).
      expect(Number(row.owner_works_of_art)).toBe(1);
    }

    const unowned = rows.filter((r) => r.owner_idx === null);
    for (const row of unowned) {
      expect(row.owner_treasury).toBeNull();
      expect(row.owner_works_of_art).toBeNull();
      expect(row.owner_advances).toBeNull();
    }
  });

  describe("synthetic world (specs/014-country-province-map-modes)", () => {
    async function syntheticDb(name: string): Promise<SaveDatabase> {
      db = await openSaveDatabase(name);
      await applySchema(db);
      const statements = [
        "INSERT INTO nations (idx, tag, treasury, stability, government_type) VALUES (1, 'AAA', -50, -20, 'monarchy'), (2, 'BBB', 300, 40, 'republic')",
        // Province 10: two AAA locations. Province 20: one BBB location
        // and one with no development at all. Province 30: water only.
        `INSERT INTO locations (idx, owner_idx, province_idx, development, name, possible_tax, soldiers) VALUES
           (101, 1, 10, 5, 'a1', 2, 1),
           (102, 1, 10, 7, 'a2', 3, NULL),
           (201, 2, 20, 10, 'b1', 4, 6),
           (202, 2, 20, NULL, 'b2', NULL, NULL),
           (301, NULL, 30, NULL, 'sea', NULL, NULL)`,
        "INSERT INTO provinces (idx, name) VALUES (10, 'Alpha'), (20, 'Beta')",
        // AAA peaked in 1400 but its latest (1500) value is lower.
        `INSERT INTO nation_history (nation_idx, year, metric, value) VALUES
           (1, 1400, 'population', 900), (1, 1500, 'population', 400),
           (1, 1400, 'economical_base', 80), (1, 1500, 'economical_base', 60)`,
        // AAA pops: size 1 @ 10% and size 3 @ 50% → weighted 40%.
        "INSERT INTO population (idx, size, literacy) VALUES (1, 1, 10), (2, 3, 50), (3, 2, 20)",
        "INSERT INTO location_pops (location_idx, pop_idx) VALUES (101, 1), (102, 2), (202, 3)",
        "INSERT INTO nation_advances (nation_idx, advance) VALUES (1, 'x'), (1, 'y')",
        "INSERT INTO works_of_art (idx, owner_idx, type, quality, location_idx, destroyed_date) VALUES (1, 2, 'painting', 50, 201, NULL)",
      ];
      for (const sql of statements) await db.conn.query(sql);
      return db;
    }

    function byName(rows: Record<string, unknown>[], name: string): Record<string, unknown> {
      const row = rows.find((r) => r.name === name);
      expect(row).toBeTruthy();
      return row!;
    }

    it("sums province totals over the province's own locations, NULL when every value is NULL", async () => {
      const rows = decodeRows(await listMapLocationsArrow(await syntheticDb("map-locations-014-province.db")));
      for (const name of ["a1", "a2"]) {
        expect(byName(rows, name)).toMatchObject({
          province_idx: 10,
          province_name: "Alpha",
          province_development: 12,
          province_tax_base: 5,
          province_soldiers: 1,
        });
      }
      // Province population only counts locations with development
      // (b2's pop is excluded — the location Population layer's rule).
      expect(byName(rows, "b1").province_population).toBe(0);
      expect(byName(rows, "a1").province_population).toBe(4);
      const sea = byName(rows, "sea");
      expect(sea.province_development).toBeNull();
      expect(sea.province_population).toBeNull();
      expect(sea.province_name).toBe("Province 30");
    });

    it("uses the latest year's history value, not the peak", async () => {
      const rows = decodeRows(await listMapLocationsArrow(await syntheticDb("map-locations-014-latest.db")));
      expect(byName(rows, "a1").owner_population).toBe(400);
      expect(byName(rows, "a2").owner_economical_base).toBe(60);
      expect(byName(rows, "b1").owner_population).toBeNull();
    });

    it("computes a population-size-weighted literacy over the owner's locations", async () => {
      const rows = decodeRows(await listMapLocationsArrow(await syntheticDb("map-locations-014-literacy.db")));
      expect(Number(byName(rows, "a1").owner_literacy)).toBeCloseTo(40, 5);
      expect(Number(byName(rows, "b1").owner_literacy)).toBeCloseTo(20, 5);
    });

    it("reports a confirmed 0 count for an owned country with none, but NULL once the source table is empty", async () => {
      const database = await syntheticDb("map-locations-014-counts.db");
      let rows = decodeRows(await listMapLocationsArrow(database));
      expect(Number(byName(rows, "a1").owner_advances)).toBe(2);
      expect(Number(byName(rows, "b1").owner_advances)).toBe(0);
      expect(Number(byName(rows, "a1").owner_works_of_art)).toBe(0);
      expect(Number(byName(rows, "b1").owner_works_of_art)).toBe(1);
      expect(byName(rows, "sea").owner_advances).toBeNull();

      await database.conn.query("DELETE FROM nation_advances");
      await database.conn.query("DELETE FROM works_of_art");
      rows = decodeRows(await listMapLocationsArrow(database));
      expect(byName(rows, "a1").owner_advances).toBeNull();
      expect(byName(rows, "b1").owner_works_of_art).toBeNull();
    });
  });
});
