import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  applySchema,
  closeSaveDatabase,
  configureChunkSizeForTesting,
  insertRows,
  openSaveDatabase,
  queryRows,
  type SaveDatabase,
} from "../../src/storage/db";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";

const PRODUCTION_CHUNK_SIZE = 50_000;

/**
 * Regression coverage for `insertRows`' chunking (added alongside a real
 * user report: the loading screen sat motionless for a long stretch on
 * a real save with a very large `market_good_price_history` table, with
 * no way to tell from outside whether one giant `insertArrowTable` call
 * was still working or stuck). Confirms chunking a row set larger than
 * one chunk both lands every row correctly and reports real,
 * monotonically increasing "inserted so far" progress — not just that
 * the feature doesn't crash.
 *
 * Uses `configureChunkSizeForTesting` (a test-only seam, same idiom as
 * `configureArrowForTesting`/`configureDuckDBForTesting`) rather than
 * the real 50,000-row production chunk size: an earlier version of this
 * test inserted 120,000 real rows to see multi-chunk behavior, which
 * added enough real CPU/memory load under full-suite parallelism to
 * push several unrelated, already-marginal tests over their own
 * timeouts (confirmed: every one of them passed cleanly in isolation).
 * Always reset back to the production value afterward — this is
 * module-level state shared across whatever else runs in the same
 * worker process.
 */
describe("db.ts insertRows chunking", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    configureChunkSizeForTesting(PRODUCTION_CHUNK_SIZE);
    if (db) await closeSaveDatabase(db);
  });

  it("splits a row set larger than one chunk into multiple insertArrowTable calls, landing every row with no loss or duplication", async () => {
    configureChunkSizeForTesting(3);
    db = await openSaveDatabase("insert-rows-chunking.db");
    await applySchema(db);

    // 10 rows at chunk size 3 -> chunks of [3, 3, 3, 1], against
    // market_good_price_history (no PK/uniqueness constraint to fight,
    // and already the table this was found on).
    const totalRows = 10;
    const rows: Array<[number, string, string, number]> = Array.from({ length: totalRows }, (_, i) => [
      1,
      "clay",
      "1628-01",
      i,
    ]);

    const chunkCalls: Array<[number, number]> = [];
    await insertRows(
      db,
      "INSERT INTO market_good_price_history (market_idx, good, date, price) VALUES (?1, ?2, ?3, ?4)",
      rows,
      (inserted, total) => chunkCalls.push([inserted, total]),
    );

    const countRows = await queryRows(db, "SELECT COUNT(*) as n FROM market_good_price_history");
    expect(Number(countRows[0].n)).toBe(totalRows);

    // Real, monotonically increasing progress -- 4 chunks (3, 3, 3, 1),
    // every call reporting the same real total.
    expect(chunkCalls).toEqual([
      [3, totalRows],
      [6, totalRows],
      [9, totalRows],
      [10, totalRows],
    ]);
  });

  it("a row set smaller than one chunk still calls onChunk exactly once, with the full count", async () => {
    configureChunkSizeForTesting(50);
    db = await openSaveDatabase("insert-rows-chunking-small.db");
    await applySchema(db);

    const rows: Array<[number, string, string, number]> = [
      [1, "clay", "1628-01", 1.1],
      [1, "clay", "1628-02", 1.2],
    ];
    const chunkCalls: Array<[number, number]> = [];
    await insertRows(
      db,
      "INSERT INTO market_good_price_history (market_idx, good, date, price) VALUES (?1, ?2, ?3, ?4)",
      rows,
      (inserted, total) => chunkCalls.push([inserted, total]),
    );

    expect(chunkCalls).toEqual([[2, 2]]);
  });
});
