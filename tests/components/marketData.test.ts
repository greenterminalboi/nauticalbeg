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
  decodeMarketGoodPriceHistory,
  decodeMarketGoods,
  decodeMarkets,
  decodeWorldGoods,
} from "../../src/components/Overview/marketData";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

describe("marketData decode helpers", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function freshParsedDb(name: string, saveId: string): Promise<SaveDatabase> {
    db = await openSaveDatabase(name);
    await applySchema(db);
    await parseAndStore(db, saveId, "rus-1628-minimal.eu5", toBytes(fixtureText));
    return db;
  }

  it("decodeWorldGoods returns a plain object per good", async () => {
    await freshParsedDb("market-data-world-goods.db", "save-1");
    const goods = await decodeWorldGoods(db);
    expect(goods).toContainEqual({ good: "clay", total: 13.19736 });
  });

  it("decodeMarkets returns camelCase fields, including the no-resolvable-center fallback name", async () => {
    await freshParsedDb("market-data-markets.db", "save-2");
    const markets = await decodeMarkets(db);
    expect(markets.find((m) => m.idx === 1)).toMatchObject({
      name: "uppland_province",
      memberCount: 2,
      capacity: 50,
    });
    expect(markets.find((m) => m.idx === 3)).toMatchObject({
      name: "Market 3",
      memberCount: null,
    });
  });

  it("decodeMarketGoods converts is_importing/is_exporting to a real tri-state boolean, never coercing NULL to false", async () => {
    await freshParsedDb("market-data-goods.db", "save-3");
    const goods = await decodeMarketGoods(db, 1);

    const clay = goods.find((g) => g.good === "clay");
    expect(clay?.isExporting).toBe(true);
    expect(clay?.isImporting).toBeNull(); // fixture has no `import` field on clay

    const wool = goods.find((g) => g.good === "wool");
    expect(wool?.isImporting).toBe(true);
    expect(wool?.isExporting).toBeNull();
  });

  it("decodeMarketGoodPriceHistory returns points in date order with no fabricated points", async () => {
    await freshParsedDb("market-data-history.db", "save-4");
    const points = await decodeMarketGoodPriceHistory(db, 1, "clay");
    expect(points).toEqual([
      { date: "1628-06", price: 1.2 },
      { date: "1628-07", price: 1.22 },
      { date: "1628-08", price: 1.25 },
    ]);
  });
});
