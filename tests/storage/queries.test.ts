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
import { getPlayerNationOverview, getSaveMeta } from "../../src/storage/queries";
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
// Same swap used in adapter.test.ts's player-flag test — the fixture's
// real played_country doesn't resolve to a nation in the trimmed tags
// table, so these query tests need the same substitution to have an
// actual player nation to query.
const textWithRusAsPlayer = fixtureText.replace("country=1576", "country=2025");

describe("storage/queries against a real parsed save", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestSQLiteConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("getSaveMeta returns the parsed date/version/filename", async () => {
    db = await openSaveDatabase("queries-save-meta.db", TEST_VFS_NAME);
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const meta = await getSaveMeta(db);
    expect(meta).toEqual({
      filename: "rus-1628-minimal.eu5",
      detectedVersion: "1.3.11",
      inGameDate: "1628.8.14",
      kept: false,
    });
  });

  it("getPlayerNationOverview returns RUS's real stats with the right fields marked derived", async () => {
    db = await openSaveDatabase("queries-overview.db", TEST_VFS_NAME);
    await applySchema(db);
    await parseAndStore(db, "save-2", "rus-1628-minimal.eu5", toBytes(textWithRusAsPlayer));

    const overview = await getPlayerNationOverview(db);
    expect(overview.tag).toBe("RUS");
    expect(overview.name).toBe("Russia");
    expect(overview.treasury).toBeCloseTo(5493.12008, 5);
    expect(overview.stability).toBeCloseTo(27.27082, 5);
    expect(overview.governmentType).toBe("monarchy");
    expect(overview.atWar).toBe(true);
    expect(overview.totalDevelopment).toBeCloseTo(28.83884, 5);
    expect(overview.provinceCount).toBe(1);
    expect(overview.derived).toEqual(
      new Set(["atWar", "totalDevelopment", "provinceCount"]),
    );
  });

  it("getPlayerNationOverview throws a clear error when no nation is flagged as the player", async () => {
    db = await openSaveDatabase("queries-no-player.db", TEST_VFS_NAME);
    await applySchema(db);
    // The unmodified fixture's played_country doesn't match any nation.
    await parseAndStore(db, "save-3", "rus-1628-minimal.eu5", toBytes(fixtureText));

    await expect(getPlayerNationOverview(db)).rejects.toThrow(
      /no player nation/i,
    );
  });
});
