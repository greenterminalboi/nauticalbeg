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
import {
  listLatestNationMetricArrow,
  listLeaderboardCountriesArrow,
  listNationHistoryArrow,
  listRulerHistoryArrow,
} from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listLeaderboardCountriesArrow + listNationHistoryArrow (Leaderboard tab)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("listLeaderboardCountriesArrow returns one row per country_type='Real' nation, excluding Pirates/Mercenaries/DUMMY", async () => {
    db = await openSaveDatabase("leaderboard-countries-basic.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listLeaderboardCountriesArrow(db));

    // Fixture has exactly two country_type='Real' entries (RUS, SCA) and
    // one Pirates entry (DUMMY, idx 0) that must be excluded.
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.tag === "DUMMY")).toBe(false);

    const rus = rows.find((r) => r.tag === "RUS");
    expect(rus).toMatchObject({
      idx: 2025,
      color_r: 183,
      color_g: 136,
      color_b: 27,
      is_human_played: 1,
    });

    const sca = rows.find((r) => r.tag === "SCA");
    expect(sca).toMatchObject({
      idx: 3,
      // SCA has no `color` field in the fixture — must stay NULL, never
      // a fabricated color (constitution Principle IV).
      color_r: null,
      color_g: null,
      color_b: null,
      is_human_played: 1,
    });
  });

  it("listNationHistoryArrow scopes strictly to the requested nation indices", async () => {
    db = await openSaveDatabase("leaderboard-history-basic.db");
    await applySchema(db);
    await parseAndStore(db, "save-2", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listNationHistoryArrow(db, [3]));

    // Only SCA's (idx 3) rows come back, even though RUS (2025) also has
    // nation_history rows in this database.
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.nation_idx === 3)).toBe(true);

    const population = rows
      .filter((r) => r.metric === "population")
      .sort((a, b) => (a.year as number) - (b.year as number));
    expect(population).toEqual([
      { nation_idx: 3, year: 1337, metric: "population", value: 12.10004 },
      { nation_idx: 3, year: 1338, metric: "population", value: 12.34517 },
      { nation_idx: 3, year: 1339, metric: "population", value: 12.55029 },
    ]);
  });

  it("listLatestNationMetricArrow returns each real country's most-recently-recorded value for the metric (treemap stretch goal)", async () => {
    db = await openSaveDatabase("leaderboard-latest-metric.db");
    await applySchema(db);
    await parseAndStore(db, "save-3", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listLatestNationMetricArrow(db, "population"));

    // Both real countries appear, excluding DUMMY (country_type='Pirates').
    expect(rows).toHaveLength(2);
    // RUS's array has a leading zero run (years 1337/1338) before real
    // values start at 1339 — arg_max still correctly picks the value at
    // the array's actual latest year (1341), not an earlier one.
    expect(rows.find((r) => r.nation_idx === 2025)).toMatchObject({ value: 40.01348 });
    expect(rows.find((r) => r.nation_idx === 3)).toMatchObject({ value: 12.55029 });
  });

  it("listLatestNationMetricArrow excludes a country_type='Real' country that no longer owns any location (defunct/annexed, per direct correction — 'actually exist' means owns territory)", async () => {
    db = await openSaveDatabase("leaderboard-latest-metric-defunct.db");
    await applySchema(db);

    // idx 10: Real, owns a location — must appear.
    // idx 20: Real, owns nothing — a historical tag annexed centuries
    // ago that still carries a stale nation_history value from when it
    // was last alive; must NOT appear (research.md §4: country_type =
    // 'Real' alone covers the overwhelming majority of a save's ~2,470
    // country slots, most of them long-defunct).
    await db.conn.query(
      "INSERT INTO nations (idx, tag, country_type) VALUES (10, 'ALV', 'Real'), (20, 'DED', 'Real')",
    );
    await db.conn.query("INSERT INTO locations (idx, owner_idx) VALUES (1, 10)");
    await db.conn.query(
      "INSERT INTO nation_history (nation_idx, year, metric, value) VALUES (10, 1600, 'population', 5), (20, 1400, 'population', 999)",
    );

    const rows = decodeRows(await listLatestNationMetricArrow(db, "population"));
    expect(rows).toEqual([{ nation_idx: 10, value: 5 }]);
  });

  it("adds the is_human_played column and nation_history table to a database created with the pre-006 schema (kept-save compatibility)", async () => {
    db = await openSaveDatabase("leaderboard-kept-save.db");

    // Simulate a save kept BEFORE this feature shipped: hand-create
    // nations exactly as it existed pre-006 (no is_human_played column),
    // with no nation_history table at all — the way a real already-
    // parsed kept save would look on reopen.
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
    await db.conn.query("INSERT INTO nations (idx, tag, country_type) VALUES (3, 'SCA', 'Real')");

    // Reopening a kept save re-runs applySchema today (src/parser/load-save.ts's resumeSave)
    // — this is the same call a real resume makes, not a special test-only path.
    await applySchema(db);

    const nationCols = await db.conn.query("SELECT is_human_played FROM nations WHERE idx = 3");
    expect(nationCols.toArray()[0].toJSON()).toMatchObject({ is_human_played: 0 });

    // nation_history didn't exist at all pre-006 — must now exist and be
    // queryable (empty, since this "kept" save was never re-parsed).
    const history = await db.conn.query("SELECT COUNT(*) as n FROM nation_history");
    expect(history.toArray()[0].toJSON().n).toBe(0n);

    // Re-running applySchema again (e.g. a second resume) must stay a
    // no-op, not error on an already-added column/table.
    await applySchema(db);
  });

  it("listRulerHistoryArrow scopes strictly to the requested nation indices, in reign order (Ruler History stretch goal)", async () => {
    db = await openSaveDatabase("leaderboard-ruler-history.db");
    await applySchema(db);
    await parseAndStore(db, "save-4", "rus-1628-minimal.eu5", toBytes(fixtureText));

    // Only RUS's (2025) rows come back, even though SCA (3) also has
    // ruler_history rows in this database.
    const rows = decodeRows(await listRulerHistoryArrow(db, [2025]));
    expect(rows).toEqual([
      {
        nation_idx: 2025,
        start_date: "1337.11.11",
        regnal_number: 1,
        first_name_key: "name_test_ruler_a",
        nickname: null,
        adm: 80,
        dip: 60,
        mil: 50,
      },
      {
        nation_idx: 2025,
        start_date: "1400.1.1",
        regnal_number: 2,
        first_name_key: "name_test_ruler_b",
        nickname: null,
        adm: 40,
        dip: 30,
        mil: 20,
      },
    ]);
  });

  it("listRulerHistoryArrow returns an empty result for an empty idx list, never every nation's rows", async () => {
    db = await openSaveDatabase("leaderboard-ruler-history-empty.db");
    await applySchema(db);
    await parseAndStore(db, "save-5", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listRulerHistoryArrow(db, []));
    expect(rows).toEqual([]);
  });
});
