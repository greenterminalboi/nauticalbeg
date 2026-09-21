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
  listMarketGoodsArrow,
  listMarketsArrow,
  listWorldGoodsArrow,
} from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listWorldGoodsArrow + listMarketsArrow + listMarketGoodsArrow (Markets page)", () => {
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

  it("listWorldGoodsArrow returns every good's world-wide production total, sorted by good, plus its has_production_coverage flag (specs/009-world-goods-production)", async () => {
    await freshParsedDb("markets-world-goods.db", "save-1");
    const rows = decodeRows(await listWorldGoodsArrow(db));

    expect(rows).toEqual([
      { good: "amber", total: 10.89009, has_production_coverage: true },
      { good: "clay", total: 13.19736, has_production_coverage: true },
      { good: "lumber", total: 38.39616, has_production_coverage: true },
      { good: "tools", total: 4.5, has_production_coverage: false },
      { good: "wool", total: 8.47007, has_production_coverage: true },
    ]);
  });

  it("listMarketsArrow derives a display name from the center location (not its province), plus the current owner of that location", async () => {
    await freshParsedDb("markets-list.db", "save-2");
    const rows = decodeRows(await listMarketsArrow(db));

    expect(rows).toHaveLength(3);

    // idx 1: center=1 -> location 1 -> metadata.compatibility.locations[0]
    // = "stockholm". Location 1's owner is nation 3 (SCA).
    expect(rows.find((r) => r.idx === 1)).toMatchObject({
      name: "stockholm",
      member_count: 2,
      capacity: 50,
      owner_idx: 3,
      owner_name: "SCA",
    });

    // idx 2: center=3975 -> location 3975 ->
    // metadata.compatibility.locations[3974] = "mazyr". A market with
    // exactly one member location is a valid market, not an error state.
    // Location 3975's owner is nation 2025 (RUS).
    expect(rows.find((r) => r.idx === 2)).toMatchObject({
      name: "mazyr",
      member_count: 1,
      capacity: 20,
      owner_idx: 2025,
      owner_name: "RUS",
    });

    // idx 3: no `center` at all in the fixture -> the neutral
    // 'Market 3' fallback, never a fabricated location name, and no
    // owner to resolve.
    expect(rows.find((r) => r.idx === 3)).toMatchObject({
      name: "Market 3",
      member_count: null,
      capacity: 5,
      owner_idx: null,
      owner_name: "Unknown",
    });
  });

  it("listMarketGoodsArrow returns only the goods a market actually trades, with an empty result for a market that trades none", async () => {
    await freshParsedDb("markets-goods.db", "save-3");

    const market1Goods = decodeRows(await listMarketGoodsArrow(db, 1));
    expect(market1Goods.map((r) => r.good).sort()).toEqual(["clay", "wool"]);

    const clay = market1Goods.find((r) => r.good === "clay");
    expect(clay).toMatchObject({
      price: 1.25,
      supply: 120.5,
      demand: 95.3,
      stockpile: 40.2,
      is_exporting: 1,
      is_importing: null,
    });

    // Market 3 has no `goods` sub-object at all in the fixture — an
    // empty result set, not zero-value rows for every known good
    // (FR-006).
    const market3Goods = decodeRows(await listMarketGoodsArrow(db, 3));
    expect(market3Goods).toEqual([]);
  });
});
