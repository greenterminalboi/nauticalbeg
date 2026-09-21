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
import { listGoodProductionByOwnerArrow, listWorldGoodsArrow } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listWorldGoodsArrow's has_production_coverage + listGoodProductionByOwnerArrow (World Goods production share)", () => {
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

  it("listWorldGoodsArrow's has_production_coverage is true for a good with last_month_produced data and false otherwise", async () => {
    await freshParsedDb("good-production-coverage.db", "save-1");
    const rows = decodeRows(await listWorldGoodsArrow(db));

    const byGood = new Map(rows.map((r) => [r.good, r]));
    // clay/wool/amber/lumber all have real last_month_produced data on
    // one of the fixture's two provinces (adapter.test.ts confirms this).
    for (const covered of ["clay", "wool", "amber", "lumber"]) {
      expect(byGood.get(covered)).toMatchObject({ has_production_coverage: true });
    }
    // "tools" (added to the fixture specifically for this case) has a
    // world total but no province ever reports producing it.
    expect(byGood.get("tools")).toMatchObject({ has_production_coverage: false });
  });

  it("listGoodProductionByOwnerArrow sums production per owning country, grouping unowned provinces under a NULL owner_idx", async () => {
    await freshParsedDb("good-production-by-owner.db", "save-2");

    // clay is produced only by province 0 (owner 3 / SCA).
    const clayRows = decodeRows(await listGoodProductionByOwnerArrow(db, "clay"));
    expect(clayRows).toEqual([{ owner_idx: 3, amount: 13.19736 }]);

    // wool is produced only by province 16777289 (owner 2025 / RUS).
    const woolRows = decodeRows(await listGoodProductionByOwnerArrow(db, "wool"));
    expect(woolRows).toEqual([{ owner_idx: 2025, amount: 8.47007 }]);

    // A good nobody produces returns an empty result, not a fabricated row.
    const noneRows = decodeRows(await listGoodProductionByOwnerArrow(db, "does_not_exist"));
    expect(noneRows).toEqual([]);
  });

  it("listGoodProductionByOwnerArrow groups an unowned province's production under owner_idx NULL", async () => {
    await freshParsedDb("good-production-unowned.db", "save-3");

    // Directly exercise the NULL-owner grouping path: an unowned
    // province producing a good the fixture doesn't otherwise cover.
    await db.conn.query(
      "INSERT INTO provinces (idx, name, owner_idx, capital_location_idx) VALUES (99, 'test_province', NULL, NULL)",
    );
    await db.conn.query(
      "INSERT INTO province_good_production (province_idx, good, amount) VALUES (99, 'silver', 42)",
    );

    const rows = decodeRows(await listGoodProductionByOwnerArrow(db, "silver"));
    expect(rows).toEqual([{ owner_idx: null, amount: 42 }]);
  });
});
