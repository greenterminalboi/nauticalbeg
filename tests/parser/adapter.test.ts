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

  it("populates province_good_production from provinces.database.*.last_month_produced (specs/009-world-goods-production)", async () => {
    const database = await freshDb("adapter-province-good-production.db");
    await parseAndStore(database, "save-4b", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const province0 = await queryAll(
      database,
      "SELECT good, amount FROM province_good_production WHERE province_idx = 0 ORDER BY good",
    );
    expect(province0).toEqual([
      { good: "clay", amount: 13.19736 },
      { good: "fish", amount: 29.89448 },
      { good: "lumber", amount: 38.39616 },
      { good: "millet", amount: 9.59808 },
      { good: "wheat", amount: 24.69544 },
    ]);

    const province16777289 = await queryAll(
      database,
      "SELECT good, amount FROM province_good_production WHERE province_idx = 16777289 ORDER BY good",
    );
    expect(province16777289).toEqual([
      { good: "amber", amount: 10.89009 },
      { good: "fruit", amount: 8.47007 },
      { good: "livestock", amount: 7.26006 },
      { good: "wool", amount: 8.47007 },
    ]);
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

  it("populates locations.rank/market_idx/possible_tax/soldiers and cultures/religions with the save's own names and colors (specs/011-atlas-map-modes)", async () => {
    const database = await freshDb("adapter-atlas-map-modes.db");
    await parseAndStore(database, "save-18", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const loc1 = await queryAll(database, "SELECT * FROM locations WHERE idx = 1");
    expect(loc1[0]).toMatchObject({
      rank: "city",
      market_idx: 1,
      possible_tax: 48.04188,
      culture_idx: 1851,
      religion_idx: 15,
    });
    // Location 1 has no population.pop_stats block in the fixture at
    // all — soldiers must stay NULL, never a fabricated 0.
    expect(loc1[0].soldiers).toBeNull();

    const loc3975 = await queryAll(database, "SELECT * FROM locations WHERE idx = 3975");
    expect(loc3975[0]).toMatchObject({
      rank: "town",
      market_idx: 1,
      culture_idx: 884,
      religion_idx: 18,
    });
    expect(loc3975[0].possible_tax).toBeCloseTo(31.69176, 5);
    expect(loc3975[0].soldiers).toBeCloseTo(9.5, 5);

    const cultures = await queryAll(database, "SELECT * FROM cultures ORDER BY idx");
    expect(cultures).toEqual([
      // culture_group is always NULL for now (specs/012-firepower-tab's
      // documented, deferred gap — see the adapter's comment on this
      // INSERT) — a real column with no populated source yet, not a
      // fabricated value.
      {
        idx: 884,
        name: "polesian_culture",
        color_r: 166,
        color_g: 133,
        color_b: 133,
        culture_group: null,
      },
      {
        idx: 1851,
        name: "swedish",
        color_r: 0,
        color_g: 104,
        color_b: 165,
        culture_group: null,
      },
    ]);

    const religions = await queryAll(database, "SELECT * FROM religions ORDER BY idx");
    expect(religions).toEqual([
      { idx: 15, name: "lutheran", color_r: 0, color_g: 0, color_b: 178 },
      { idx: 18, name: "orthodox", color_r: 121, color_g: 53, color_b: 140 },
    ]);
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
      "SELECT key FROM raw_sections WHERE key IN ('metadata', 'countries', 'provinces', 'locations', 'war_manager', 'played_country', 'population', 'market_manager', 'culture_manager', 'religion_manager')",
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
      // 30474 + 15 (navy_heavy_ship Battle=12 + Attrition=3, added by
      // specs/012-firepower-tab to prove war_unit_losses' navy-category
      // rows are also folded into this pre-existing total — additive,
      // not a regression).
      attacker_casualties: 30489,
      defender_casualties: 53232,
    });
  });

  // specs/012-firepower-tab: war_unit_losses preserves the category-level
  // breakdown that the wars.attacker_casualties/defender_casualties sum
  // above collapses — needed for Navy Stats' damage given/taken.
  it("populates war_unit_losses with the per-category breakdown, including navy categories", async () => {
    const database = await freshDb("adapter-war-unit-losses.db");
    await parseAndStore(database, "save-war-losses", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const navyRow = await queryAll(
      database,
      `SELECT war_idx, side, category, battle, attrition, capture
       FROM war_unit_losses
       WHERE war_idx = 2030043139 AND category = 'navy_heavy_ship'`,
    );
    expect(navyRow).toEqual([
      {
        war_idx: 2030043139,
        side: "attacker",
        category: "navy_heavy_ship",
        battle: 12,
        attrition: 3,
        capture: null,
      },
    ]);

    const armyRowCount = await queryAll(
      database,
      `SELECT COUNT(*) as n FROM war_unit_losses WHERE war_idx = 2030043139 AND side = 'attacker'`,
    );
    // 6 army categories (light_infantry, heavy_infantry, light_cavalry,
    // heavy_cavalry, artillery, auxiliary) + 1 navy category added above.
    expect(Number(armyRowCount[0].n)).toBe(7);
  });

  it("populates markets from market_manager.database, including the no-center and no-goods edge cases (specs/007-production-trade-markets)", async () => {
    const database = await freshDb("adapter-markets.db");
    await parseAndStore(database, "save-13", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(database, "SELECT * FROM markets ORDER BY idx");
    expect(rows).toHaveLength(3);

    expect(rows.find((r) => r.idx === 1)).toMatchObject({
      center_location_idx: 1,
      member_count: 2,
      capacity: 50,
    });
    expect(rows.find((r) => r.idx === 2)).toMatchObject({
      center_location_idx: 3975,
      member_count: 1,
      capacity: 20,
    });
    // idx 3: no `center`, no `members`, no `goods` at all in the fixture
    // — a real, valid market (spec's own edge cases), never a fabricated
    // center/count rather than NULL.
    expect(rows.find((r) => r.idx === 3)).toMatchObject({
      center_location_idx: null,
      member_count: null,
      capacity: 5,
    });
  });

  it("populates market_goods with supply/demand decomposition, leaving unconfirmed fields NULL (specs/007-production-trade-markets FR-005/FR-006/FR-011)", async () => {
    const database = await freshDb("adapter-market-goods.db");
    await parseAndStore(database, "save-14", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(database, "SELECT * FROM market_goods ORDER BY market_idx, good");
    // market 1: clay + wool; market 2: amber; market 3: none at all.
    expect(rows).toHaveLength(3);
    expect(rows.some((r) => r.market_idx === 3)).toBe(false);

    const clay = rows.find((r) => r.market_idx === 1 && r.good === "clay");
    expect(clay).toMatchObject({
      price: 1.25,
      supply: 120.5,
      demand: 95.3,
      stockpile: 40.2,
      is_importing: null, // no `import` field on clay in the fixture
      is_exporting: 1,
      supply_raw_materials: 60.1,
      supply_buildings: 30.2,
      supply_trade: 15,
      demand_population: 50,
      demand_trade: 25, // demanded.Trade (20) + demanded.BurgherTrades (5)
      demand_building_upkeep: 10,
      demand_unit_upkeep: 8,
      demand_construction: 2.3,
    });

    // wool has no `supplied` block at all in the fixture — supply_trade
    // stays NULL, never a fabricated 0.
    const wool = rows.find((r) => r.market_idx === 1 && r.good === "wool");
    expect(wool).toMatchObject({
      is_importing: 1,
      is_exporting: null,
      supply_trade: null,
      demand_trade: 12, // 10 + 2
    });

    // amber has neither `production_supplied.Buildings` nor `supplied`
    // nor import/export flags — every one of those stays NULL.
    const amber = rows.find((r) => r.market_idx === 2 && r.good === "amber");
    expect(amber).toMatchObject({
      supply_buildings: null,
      supply_trade: null,
      is_importing: null,
      is_exporting: null,
      demand_trade: 2.5, // 2 + 0.5
    });
  });

  it("populates world_good_production directly from market_manager.produced_goods, not summed from market_goods (specs/007-production-trade-markets)", async () => {
    const database = await freshDb("adapter-world-goods.db");
    await parseAndStore(database, "save-16", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(database, "SELECT * FROM world_good_production ORDER BY good");
    expect(rows).toEqual([
      { good: "amber", total: 10.89009 },
      { good: "clay", total: 13.19736 },
      { good: "lumber", total: 38.39616 }, // present in produced_goods even though no market trades it
      { good: "tools", total: 4.5 }, // specs/009-world-goods-production: no matching last_month_produced anywhere -- the no-coverage fixture case
      { good: "wool", total: 8.47007 },
    ]);
  });

  it("populates ruler_history from rulerterm_manager joined against character_db, scoped to real Country-ruled-by-Character terms (specs/006-country-leaderboard Ruler History stretch goal)", async () => {
    const database = await freshDb("adapter-ruler-history.db");
    await parseAndStore(database, "save-17", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(
      database,
      "SELECT * FROM ruler_history WHERE nation_idx = 2025 ORDER BY start_date",
    );
    // Two real reigns for RUS (2025); the interregnum term between them
    // (ruler_type=Character but ruler.regency=interregnum, no
    // `characters` field at all) is excluded — no character to score.
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

    // SCA's (idx 3) single reign is scoped separately, never mixed with
    // RUS's rows.
    const scaRows = await queryAll(
      database,
      "SELECT * FROM ruler_history WHERE nation_idx = 3",
    );
    expect(scaRows).toEqual([
      {
        nation_idx: 3,
        start_date: "1500.5.20",
        regnal_number: 1,
        first_name_key: "name_test_ruler_c",
        nickname: null,
        adm: 100,
        dip: 100,
        mil: 100,
      },
    ]);

    // The two InternationalOrganization-ruled_type terms (one ruler_type
    // Country, one ruler_type Character with a real character=999) are
    // both excluded entirely — never surfacing as some other nation's
    // ruler row.
    const total = await queryAll(database, "SELECT COUNT(*) as n FROM ruler_history");
    expect(Number(total[0].n)).toBe(3);
  });

  // specs/010-societal-values-compass
  it("parses real societal_values axes into nation_societal_values and drops the -999 sentinel entirely", async () => {
    const database = await freshDb("adapter-societal-values.db");
    await parseAndStore(
      database,
      "save-societal-values",
      "rus-1628-minimal.eu5",
      toBytes(fixtureText),
    );
    const rows = await queryAll(
      database,
      "SELECT nation_idx, axis, value FROM nation_societal_values WHERE nation_idx = 2025 ORDER BY axis",
    );
    // The fixture's locked axes (absolutism_vs_liberalism=-999,
    // quality_vs_quantity=-999, added by specs/012-firepower-tab) must
    // produce no row at all — a missing row IS "not applicable"
    // (research.md), never a stored -999.
    expect(rows).toEqual([
      { nation_idx: 2025, axis: "aristocracy_vs_plutocracy", value: 67.5 },
      { nation_idx: 2025, axis: "centralization_vs_decentralization", value: -41.23 },
      { nation_idx: 2025, axis: "land_vs_naval", value: 62.4 },
      { nation_idx: 2025, axis: "offensive_vs_defensive", value: -18.9 },
    ]);

    const sentinelRows = await queryAll(
      database,
      "SELECT * FROM nation_societal_values WHERE nation_idx = 2025 AND axis IN ('absolutism_vs_liberalism', 'quality_vs_quantity')",
    );
    expect(sentinelRows).toEqual([]);
  });

  // specs/012-firepower-tab: the three military-doctrine axes
  // (land_vs_naval, offensive_vs_defensive, quality_vs_quantity) reuse
  // this exact same nation_societal_values pipeline — no new parsing.
  it("surfaces the three military-doctrine axes through the existing nation_societal_values pipeline", async () => {
    const database = await freshDb("adapter-military-doctrine-axes.db");
    await parseAndStore(
      database,
      "save-military-doctrine",
      "rus-1628-minimal.eu5",
      toBytes(fixtureText),
    );
    const rows = await queryAll(
      database,
      `SELECT axis, value FROM nation_societal_values
       WHERE nation_idx = 2025 AND axis IN ('land_vs_naval', 'offensive_vs_defensive', 'quality_vs_quantity')
       ORDER BY axis`,
    );
    expect(rows).toEqual([
      { axis: "land_vs_naval", value: 62.4 },
      { axis: "offensive_vs_defensive", value: -18.9 },
    ]);
  });

  // specs/012-firepower-tab: subunit_manager.database → regiments.
  it("populates regiments from subunit_manager.database, with strength NULL on navy rows", async () => {
    const database = await freshDb("adapter-regiments.db");
    await parseAndStore(database, "save-regiments", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(
      database,
      "SELECT idx, owner_idx, unit_type, morale, number, strength FROM regiments ORDER BY idx",
    );
    expect(rows).toEqual([
      {
        idx: 2000001,
        owner_idx: 2025,
        unit_type: "a_pikemen",
        morale: 2.5,
        number: 40,
        strength: 0.9,
      },
      {
        idx: 2000002,
        owner_idx: 2025,
        unit_type: "a_peasant_levy",
        morale: 1.2,
        number: 20,
        strength: 0.6,
      },
      {
        idx: 2000003,
        owner_idx: 2025,
        unit_type: "n_carrack",
        morale: 3.1,
        number: 2,
        strength: null, // navy rows never have a fabricated strength
      },
    ]);
  });

  // specs/012-firepower-tab: researched_advances (=yes flags only) →
  // nation_advances.
  it("populates nation_advances from researched_advances, one row per =yes flag", async () => {
    const database = await freshDb("adapter-nation-advances.db");
    await parseAndStore(database, "save-advances", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(
      database,
      "SELECT advance FROM nation_advances WHERE nation_idx = 2025 ORDER BY advance",
    );
    expect(rows.map((r) => r.advance)).toEqual([
      "fort_limit_1_advance",
      "marine_regiments",
      "military_administration",
      "naval_morale_advance_2",
      "ship_building_techniques_discovery",
      "unlock_footmen_advance",
      "unlock_pikemen_advance",
    ]);
  });

  // specs/012-firepower-tab: implemented_reforms/implemented_privileges
  // (flat lists, all entries currently active) → nation_reforms/
  // nation_privileges; implemented_laws (grouped by category, one active
  // choice per category) → nation_laws.
  it("populates nation_reforms, nation_privileges, and nation_laws (with law_category preserved)", async () => {
    const database = await freshDb("adapter-governance.db");
    await parseAndStore(database, "save-governance", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const reforms = await queryAll(
      database,
      "SELECT nation_idx, object, date FROM nation_reforms WHERE nation_idx = 2025",
    );
    expect(reforms).toEqual([
      { nation_idx: 2025, object: "weapons_quality_standards", date: "1400.1.1" },
    ]);

    const privileges = await queryAll(
      database,
      "SELECT nation_idx, object, date FROM nation_privileges WHERE nation_idx = 2025",
    );
    expect(privileges).toEqual([
      { nation_idx: 2025, object: "primacy_of_nobility", date: "1400.1.1" },
    ]);

    const laws = await queryAll(
      database,
      "SELECT nation_idx, law_category, object, date FROM nation_laws WHERE nation_idx = 2025 ORDER BY law_category",
    );
    expect(laws).toEqual([
      { nation_idx: 2025, law_category: "maritime_law", object: "navy_audits", date: "1400.1.1" },
      {
        nation_idx: 2025,
        law_category: "recruitment_law",
        object: "expanded_levies_policy",
        date: "1400.1.1",
      },
    ]);
  });

  // specs/012-firepower-tab: currency_data + country-record military
  // scalars → new nations columns; primary_culture → nations.primary_culture_idx.
  it("populates the 8 new nations military scalar columns and primary_culture_idx", async () => {
    const database = await freshDb("adapter-nation-scalars.db");
    await parseAndStore(database, "save-scalars", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = await queryAll(
      database,
      `SELECT manpower, sailors, monthly_manpower, monthly_sailors, army_tradition,
              navy_tradition, last_months_army_maintenance, last_months_navy_maintenance,
              primary_culture_idx
       FROM nations WHERE idx = 2025`,
    );
    expect(rows[0]).toMatchObject({
      manpower: 429.10362,
      sailors: 2.72637,
      monthly_manpower: 1.55,
      monthly_sailors: 0.12,
      army_tradition: 39.43998,
      navy_tradition: 1.02852,
      last_months_army_maintenance: 12.4,
      last_months_navy_maintenance: 8.1,
      primary_culture_idx: 884,
    });
  });

  // specs/013-diplomatic-relations-chord: diplomacy_manager was
  // previously in raw_sections only (never structured) — this proves
  // scripted_mutual/scripted_oneway (filtered to object=alliance/
  // guarantee/military_access/food_access/fleet_basing_rights),
  // royal_marriage, economic_support, and per-country rivals_2.list all
  // extract into diplomatic_relations, and relations.<target>.trust
  // extracts into nation_relation_trust. The fixture's royal_marriage
  // and economic_support blocks occur exactly once, so this also proves
  // toArray's single-occurrence normalization (research.md §4) for those
  // keys — without it, jomini would hand back a bare object instead of a
  // one-element array and a naive .map()/.forEach() over it would
  // silently parse zero rows; scripted_mutual/scripted_oneway now occur
  // 3 and 2 times respectively, covering the genuine multi-occurrence
  // array case jomini already groups on its own.
  it("populates diplomatic_relations and nation_relation_trust from diplomacy_manager", async () => {
    const database = await freshDb("adapter-diplomacy.db");
    await parseAndStore(database, "save-diplomacy", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const relations = await queryAll(
      database,
      "SELECT first_nation_idx, second_nation_idx, relation_type, start_date, amount, is_one_way FROM diplomatic_relations ORDER BY relation_type",
    );

    // scripted_mutual, object=alliance, first=2025 second=33556892 —
    // already in (first < second) order, unaffected by normalization.
    // is_one_way=0: alliance is exhaustively confirmed mutual-only
    // (research.md §8) — always scripted_mutual, never scripted_oneway.
    expect(relations).toContainEqual({
      first_nation_idx: 2025,
      second_nation_idx: 33556892,
      relation_type: "alliance",
      start_date: "1615.3.2",
      amount: null,
      is_one_way: 0,
    });

    // scripted_oneway, object=guarantee, first=1141 second=2025 —
    // is_one_way=1 (direction preserved, not min/max-normalized): every
    // guarantee in the real save came from scripted_oneway too, not just
    // the other treaty types.
    expect(relations).toContainEqual({
      first_nation_idx: 1141,
      second_nation_idx: 2025,
      relation_type: "guarantee",
      start_date: "1618.6.1",
      amount: null,
      is_one_way: 1,
    });

    // royal_marriage, first=2025 second=1961 — no start_date field on
    // this fixture entry, so it stays NULL, never fabricated. Symmetric
    // (is_one_way=0), min/max-normalized like before this feature
    // tracked direction at all.
    expect(relations).toContainEqual({
      first_nation_idx: 1961,
      second_nation_idx: 2025,
      relation_type: "royal_marriage",
      start_date: null,
      amount: null,
      is_one_way: 0,
    });

    // rivals_2.list: recorded under BOTH 2025's and 1141's own
    // per-country entries (a real mutual rivalry, same as the real
    // save) — must collapse to exactly one row, not two. Symmetric
    // (is_one_way=0).
    const rivalries = relations.filter((r) => r.relation_type === "rivalry");
    expect(rivalries).toHaveLength(1);
    expect(rivalries[0]).toMatchObject({
      first_nation_idx: 1141,
      second_nation_idx: 2025,
      start_date: "1620.1.1",
      is_one_way: 0,
    });

    // Post-ship, 2026-09-22 (explicit user request): the newly-widened
    // relation types, cross-checked against every distinct relation_type
    // object= value confirmed present in the real save this session —
    // all three are scripted_oneway in both the real save and this
    // fixture, so is_one_way=1 and first/second preserve the raw save's
    // own field order (no min/max normalization).
    expect(relations).toContainEqual({
      first_nation_idx: 2025,
      second_nation_idx: 1961,
      relation_type: "military_access",
      start_date: "1616.4.3",
      amount: null,
      is_one_way: 1,
    });
    expect(relations).toContainEqual({
      first_nation_idx: 33556892,
      second_nation_idx: 1961,
      relation_type: "fleet_basing_rights",
      start_date: "1617.5.4",
      amount: null,
      is_one_way: 1,
    });
    expect(relations).toContainEqual({
      first_nation_idx: 1141,
      second_nation_idx: 33556892,
      relation_type: "food_access",
      start_date: "1619.7.6",
      amount: null,
      is_one_way: 1,
    });
    // economic_support: its own top-level entry type (not a
    // scripted_mutual/scripted_oneway object=), same first/second/
    // start_date shape as royal_marriage — a one-directional grant by
    // nature (is_one_way=1, direction preserved), with the ducat amount
    // read from named_targets' flag=amount/target.identity (not
    // target.value, despite type=value).
    expect(relations).toContainEqual({
      first_nation_idx: 2025,
      second_nation_idx: 1141,
      relation_type: "economic_support",
      start_date: "1614.2.1",
      amount: 2500000,
      is_one_way: 1,
    });

    // Exactly 8 rows total: one per relationship instance above, no
    // duplicates, nothing extra.
    expect(relations).toHaveLength(8);

    // relations.<target>.trust under country 2025's own record — kept
    // directional (owner=2025, target=33556892), never averaged or
    // mirrored into the reverse direction at parse time. opinion_score
    // is the sum of every timed_biases.Opinion[]/Antagonism[] value on
    // that same entry: 30 + 20 + (-15) = 35 (research.md §9's derivation
    // — the save has no single stored "Opinion" scalar).
    const trust = await queryAll(
      database,
      "SELECT owner_nation_idx, target_nation_idx, trust, opinion_score FROM nation_relation_trust",
    );
    expect(trust).toEqual([
      { owner_nation_idx: 2025, target_nation_idx: 33556892, trust: 45.5, opinion_score: 35 },
    ]);
  });
});
