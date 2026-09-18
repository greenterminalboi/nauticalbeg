import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applySchema,
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import {
  ensureTestSQLiteConfigured,
  TEST_VFS_NAME,
} from "../helpers/sqlite-test-env";
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
  const rows: Array<Record<string, unknown>> = [];
  await db.sqlite3.exec(db.handle, sql, (row, columns) => {
    const record: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      record[col] = row[i];
    });
    rows.push(record);
  });
  return rows;
}

describe("version-adapters/1.3.11 parseAndStore", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestSQLiteConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function freshDb(name: string): Promise<SaveDatabase> {
    db = await openSaveDatabase(name, TEST_VFS_NAME);
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
      "SELECT key FROM raw_sections WHERE key IN ('metadata', 'countries', 'provinces', 'locations', 'war_manager', 'played_country')",
    );
    expect(rows).toHaveLength(0);
  });

  it("populates war_participants and correctly identifies RUS as at war", async () => {
    const database = await freshDb("adapter-war.db");
    await parseAndStore(database, "save-7", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rusAtWar = await queryAll(
      database,
      "SELECT EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = 2025 AND status = 'Active') as at_war",
    );
    expect(rusAtWar[0].at_war).toBe(1);

    const declinedNotAtWar = await queryAll(
      database,
      "SELECT EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = 220 AND status = 'Active') as at_war",
    );
    expect(declinedNotAtWar[0].at_war).toBe(0);
  });
});
