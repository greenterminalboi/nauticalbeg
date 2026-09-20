import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
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

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/rus-1628-minimal.eu5",
);
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

async function queryAll(
  db: SaveDatabase,
  sql: string,
): Promise<Array<Record<string, unknown>>> {
  return queryRows(db, sql);
}

describe("version-adapters/1.3.11 parseAndStore", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function freshDb(name: string): Promise<SaveDatabase> {
    db = await openSaveDatabase(name);
    await applySchema(db);
    return db;
  }

  it("returns the save's in-game date and the player nation's tag", async () => {
    const database = await freshDb("adapter-summary.db");
    const summary = await parseAndStore(
      database,
      "save-1",
      "rus-1628-minimal.eu5",
      toBytes(fixtureText),
    );
    // The fixture's played_country entry references index 1576, which is
    // NOT in the fixture's (deliberately trimmed) tags table — this
    // mirrors the real save's genuine multiplayer ambiguity documented in
    // research-save-format.md, so an empty tag here is the correct,
    // honest result for this fixture, not a bug.
    expect(summary.inGameDate).toBe("1628.8.14");
    expect(summary.playerNationTag).toBe("");
  });

  it("populates save_meta with the detected version and date", async () => {
    const database = await freshDb("adapter-save-meta.db");
    await parseAndStore(database, "save-2", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(database, "SELECT * FROM save_meta");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "save-2",
      filename: "rus-1628-minimal.eu5",
      detected_version: "1.3.11",
      supported: 1,
      in_game_date: "1628.8.14",
      kept: 0,
    });
  });

  it("populates nations from countries.tags + countries.database, including RUS's real values", async () => {
    const database = await freshDb("adapter-nations.db");
    await parseAndStore(database, "save-3", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(
      database,
      "SELECT * FROM nations WHERE idx = 2025",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      idx: 2025,
      tag: "RUS",
      country_type: "Real",
      is_player: 0, // fixture's played_country doesn't reference RUS (see above)
      treasury: 5493.12008,
      stability: 27.27082,
      government_type: "monarchy",
    });

    const dummy = await queryAll(database, "SELECT * FROM nations WHERE idx = 0");
    expect(dummy[0]).toMatchObject({ tag: "DUMMY", country_type: "Pirates" });
  });

  it("populates provinces with numeric owner references", async () => {
    const database = await freshDb("adapter-provinces.db");
    await parseAndStore(database, "save-4", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(
      database,
      "SELECT * FROM provinces WHERE idx = 16777289",
    );
    expect(rows[0]).toMatchObject({
      idx: 16777289,
      name: "mazyr_province",
      owner_idx: 2025,
      capital_location_idx: 3975,
    });
  });

  it("populates locations with development, matching the province back-reference", async () => {
    const database = await freshDb("adapter-locations.db");
    await parseAndStore(database, "save-5", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(
      database,
      "SELECT * FROM locations WHERE idx = 3975",
    );
    expect(rows[0]).toMatchObject({
      idx: 3975,
      owner_idx: 2025,
      province_idx: 16777289,
      development: 28.83884,
    });
  });

  it("populates locations.name/raw_material/controller_idx/control and nations.color_r/g/b (specs/005-map-visualization)", async () => {
    const database = await freshDb("adapter-map-fields.db");
    await parseAndStore(database, "save-13", "rus-1628-minimal.eu5", toBytes(fixtureText));

    // Location 1: name comes from metadata.compatibility.locations[0]
    // (the fixture's array position 0 is "stockholm" — research.md §1),
    // not from any per-location field on the location record itself.
    const loc1 = await queryAll(database, "SELECT * FROM locations WHERE idx = 1");
    expect(loc1[0]).toMatchObject({
      name: "stockholm",
      raw_material: "clay",
      controller_idx: 3,
      control: 1,
    });

    // Location 3975: name comes from
    // metadata.compatibility.locations[3974] (the fixture's array
    // position 3974 is "mazyr").
    const loc3975 = await queryAll(database, "SELECT * FROM locations WHERE idx = 3975");
    expect(loc3975[0]).toMatchObject({
      name: "mazyr",
      raw_material: "wool",
      controller_idx: 2025,
    });
    expect(loc3975[0].control).toBeCloseTo(0.43119, 5);

    // RUS's in-game color, from countries.database[2025].color.rgb.
    const rus = await queryAll(database, "SELECT color_r, color_g, color_b FROM nations WHERE idx = 2025");
    expect(rus[0]).toMatchObject({ color_r: 183, color_g: 136, color_b: 27 });

    // SCA (idx 3) has no `color` field in the fixture — must stay NULL,
    // never a fabricated default (constitution Principle IV).
    const sca = await queryAll(database, "SELECT color_r, color_g, color_b FROM nations WHERE idx = 3");
    expect(sca[0]).toMatchObject({ color_r: null, color_g: null, color_b: null });
  });

  it("leaves locations.name NULL, without throwing, when metadata.compatibility is absent (specs/005-map-visualization research.md §1)", async () => {
    // Some saves (e.g. never-multiplayer-flagged ones — unconfirmed
    // either way against a real singleplayer save) may not carry this
    // block at all. Constitution Principle IV: never fabricate a name,
    // never crash — the map's existing neutral "no data" rendering
    // already covers a NULL name (spec FR-009).
    const textWithoutCompatibility = fixtureText.replace(
      /\tcompatibility=\{[\s\S]*?\n\t\}\n/,
      "",
    );
    expect(textWithoutCompatibility).not.toContain("compatibility=");

    const database = await freshDb("adapter-no-compatibility.db");
    await parseAndStore(database, "save-15", "rus-1628-minimal.eu5", toBytes(textWithoutCompatibility));

    const rows = await queryAll(database, "SELECT idx, name FROM locations ORDER BY idx");
    expect(rows).toEqual([
      { idx: 1, name: null },
      { idx: 3975, name: null },
    ]);
  });

  it("populates location_pops from a location's population.pops list (specs/005-map-visualization)", async () => {
    const database = await freshDb("adapter-location-pops.db");
    await parseAndStore(database, "save-14", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(
      database,
      "SELECT pop_idx FROM location_pops WHERE location_idx = 3975 ORDER BY pop_idx",
    );
    // queryAll goes through queryRows, which coerces BIGINT to plain
    // JS number (db.ts's toPlainRow) — unlike a raw Arrow-decode path.
    expect(rows).toEqual([{ pop_idx: 943 }, { pop_idx: 14016 }]);

    // Confirms the join actually resolves to the real population rows
    // (data-model.md's listMapLocationsArrow depends on this).
    const total = await queryAll(
      database,
      `SELECT SUM(population.size) as total
       FROM location_pops
       JOIN population ON population.idx = location_pops.pop_idx
       WHERE location_pops.location_idx = 3975`,
    );
    expect(total[0].total).toBeCloseTo(0.22409 + 1.80333, 5);
  });

  it("computes total development and location count for RUS via aggregation, not a stored column", async () => {
    const database = await freshDb("adapter-aggregate.db");
    await parseAndStore(database, "save-6", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(
      database,
      "SELECT SUM(development) as total_dev, COUNT(*) as loc_count FROM locations WHERE owner_idx = 2025",
    );
    expect(rows[0].total_dev).toBeCloseTo(28.83884, 5);
    expect(rows[0].loc_count).toBe(1);
  });

  it("sets is_player and name once played_country resolves to a real nation", async () => {
    // The fixture's real played_country references index 1576, which
    // isn't one of the fixture's trimmed nations — this test swaps it to
    // 2025 (RUS) to exercise the deferred UPDATE path (played_country
    // comes after countries in real file order, so is_player/name can't
    // be set at insert time).
    const textWithRusAsPlayer = fixtureText.replace(
      "country=1576",
      "country=2025",
    );
    const database = await freshDb("adapter-player-flag.db");
    await parseAndStore(
      database,
      "save-8",
      "rus-1628-minimal.eu5",
      toBytes(textWithRusAsPlayer),
    );
    const rows = await queryAll(
      database,
      "SELECT is_player, name FROM nations WHERE idx = 2025",
    );
    expect(rows[0]).toMatchObject({ is_player: 1, name: "Russia" });
  });

  it("captures unrecognized top-level sections as raw JSON rather than dropping them", async () => {
    const database = await freshDb("adapter-raw-sections.db");
    await parseAndStore(database, "save-9", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(
      database,
      "SELECT * FROM raw_sections WHERE key = 'cheats'",
    );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].data as string)).toEqual({
      cheat_type: {},
    });
  });

  it("does not create raw_sections rows for sections with a real table", async () => {
    const database = await freshDb("adapter-raw-sections-exclusion.db");
    await parseAndStore(database, "save-10", "rus-1628-minimal.eu5", toBytes(fixtureText));
    const rows = await queryAll(
      database,
      "SELECT key FROM raw_sections WHERE key IN ('metadata', 'countries', 'provinces', 'locations', 'war_manager', 'played_country', 'population')",
    );
    expect(rows).toHaveLength(0);
  });

  it("populates population from population.database (specs/004-full-schema-mapping US2)", async () => {
    const database = await freshDb("adapter-population.db");
    await parseAndStore(database, "save-11", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(database, "SELECT * FROM population ORDER BY idx");
    expect(rows).toHaveLength(2);

    // idx 943: a fixed-shape-only entry — every optional field this
    // entry doesn't have (status, satisfaction, owner_idx,
    // missing_goods) must come back NULL, not a fabricated default
    // (constitution Principle IV).
    const peasants = rows.find((r) => r.idx === 943);
    expect(peasants).toMatchObject({
      pop_type: "peasants",
      estate: "peasants_estate",
      culture: 873,
      religion: 18,
      status: null,
      satisfaction: null,
      owner_idx: null,
      missing_goods: null,
    });
    expect(peasants!.size).toBeCloseTo(0.22409, 5);
    expect(peasants!.literacy).toBeCloseTo(39.1474, 4);

    // idx 14016: every optional field present, including the
    // variable-keyed `missing` trade-good map — captured losslessly as
    // JSON (FR-006), not flattened into per-good columns.
    const tribesmen = rows.find((r) => r.idx === 14016);
    expect(tribesmen).toMatchObject({
      pop_type: "tribesmen",
      estate: "tribes_estate",
      culture: 1019,
      status: "Primary",
      religion: 186,
      owner_idx: 2065,
    });
    expect(tribesmen!.satisfaction).toBeCloseTo(0.78336, 5);
    expect(tribesmen!.size).toBeCloseTo(1.80333, 5);
    expect(JSON.parse(tribesmen!.missing_goods as string)).toEqual({ demand: "pop_demand" });
  });

  it("populates war_participants and correctly identifies RUS as at war", async () => {
    const database = await freshDb("adapter-war.db");
    await parseAndStore(database, "save-7", "rus-1628-minimal.eu5", toBytes(fixtureText));

    // DuckDB's EXISTS(...) returns a real boolean, not SQLite's 1/0
    // integer — production code (`getNationOverview`) already coerces
    // via `Number(...)`, which handles both correctly; this raw query
    // asserts DuckDB's actual return type directly.
    const rusAtWar = await queryAll(
      database,
      "SELECT EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = 2025 AND status = 'Active') as at_war",
    );
    expect(rusAtWar[0].at_war).toBe(true);

    const declinedNotAtWar = await queryAll(
      database,
      "SELECT EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = 220 AND status = 'Active') as at_war",
    );
    expect(declinedNotAtWar[0].at_war).toBe(false);
  });

  it("sets is_human_played for every played_country entry's country, not just the first (specs/006-country-leaderboard)", async () => {
    // The fixture has three played_country entries: the original
    // (dangling, country=1576 — doesn't match any nation, see above) plus
    // two added for this feature, referencing RUS (2025) and SCA (3).
    // is_player/name resolution (existing behavior) only ever looks at
    // the first entry; is_human_played must look at all of them.
    const database = await freshDb("adapter-human-played.db");
    await parseAndStore(database, "save-16", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rus = await queryAll(database, "SELECT is_human_played FROM nations WHERE idx = 2025");
    expect(rus[0]).toMatchObject({ is_human_played: 1 });

    const sca = await queryAll(database, "SELECT is_human_played FROM nations WHERE idx = 3");
    expect(sca[0]).toMatchObject({ is_human_played: 1 });

    // DUMMY (idx 0) is never referenced by any played_country entry.
    const dummy = await queryAll(database, "SELECT is_human_played FROM nations WHERE idx = 0");
    expect(dummy[0]).toMatchObject({ is_human_played: 0 });
  });

  it("populates nation_history from historical_population/historical_tax_base/historical_economical_base, year = 1337 + array index (specs/006-country-leaderboard research.md §1, §3)", async () => {
    const database = await freshDb("adapter-nation-history.db");
    await parseAndStore(database, "save-17", "rus-1628-minimal.eu5", toBytes(fixtureText));

    // SCA (idx 3): 3 real entries per metric, no leading zeros.
    const scaPopulation = await queryAll(
      database,
      "SELECT year, value FROM nation_history WHERE nation_idx = 3 AND metric = 'population' ORDER BY year",
    );
    expect(scaPopulation).toEqual([
      { year: 1337, value: 12.10004 },
      { year: 1338, value: 12.34517 },
      { year: 1339, value: 12.55029 },
    ]);
    const scaTaxBase = await queryAll(
      database,
      "SELECT year, value FROM nation_history WHERE nation_idx = 3 AND metric = 'tax_base' ORDER BY year",
    );
    expect(scaTaxBase.map((r) => r.year)).toEqual([1337, 1338, 1339]);
    const scaEconomicalBase = await queryAll(
      database,
      "SELECT year, value FROM nation_history WHERE nation_idx = 3 AND metric = 'economical_base' ORDER BY year",
    );
    expect(scaEconomicalBase.map((r) => r.year)).toEqual([1337, 1338, 1339]);

    // RUS (idx 2025): leading zeros at indices 0/1 (years 1337/1338) are
    // still stored as real, raw rows (data-model.md: suppression is a
    // presentation-layer concern applied when reading this table, not a
    // filter applied when populating it — constitution Principle IV).
    const rusPopulation = await queryAll(
      database,
      "SELECT year, value FROM nation_history WHERE nation_idx = 2025 AND metric = 'population' ORDER BY year",
    );
    expect(rusPopulation).toEqual([
      { year: 1337, value: 0 },
      { year: 1338, value: 0 },
      { year: 1339, value: 39.18862 },
      { year: 1340, value: 39.55171 },
      { year: 1341, value: 40.01348 },
    ]);
  });

  it("populates wars from war_manager.database (Encyclopedia's Wars tab)", async () => {
    const database = await freshDb("adapter-wars.db");
    await parseAndStore(database, "save-12", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(database, "SELECT * FROM wars ORDER BY idx");
    expect(rows).toHaveLength(2);

    // idx 1879048200: concluded, no scores recorded, defender_losses
    // present but empty (a real, confirmed zero — not "unknown").
    const civilWar = rows.find((r) => r.idx === 1879048200);
    expect(civilWar).toMatchObject({
      war_name_key: "CIVIL_WAR_NAME",
      attacker_idx: 50332944,
      defender_idx: 1141,
      start_date: "1628.2.1",
      end_date: "1628.4.15",
      duration_days: 74,
      attacker_score: null,
      defender_score: null,
      attacker_casualties: 90,
      defender_casualties: 0,
    });

    // idx 2030043139: still ongoing (no end_date) — duration is computed
    // against the save's own current in-game date (1628.8.14), not real
    // wall-clock time. Only defender_score was ever recorded for this
    // war (attacker_score stays NULL, not fabricated as 0 or copied).
    const ongoingWar = rows.find((r) => r.idx === 2030043139);
    expect(ongoingWar).toMatchObject({
      war_name_key: "AGRESSION_WAR_NAME",
      attacker_idx: 2025,
      defender_idx: 33556892, // first of original_defenders=[33556892, 1961]
      start_date: "1627.12.13",
      end_date: null,
      duration_days: 245,
      attacker_score: null,
      defender_score: 8,
      attacker_casualties: 30474,
      defender_casualties: 53232,
    });
  });
});
