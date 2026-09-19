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

/**
 * Regression test originally written for a real hang found via manual
 * Chrome testing during 002's US2 implementation, back when this project
 * used wa-sqlite: two concurrent `queryRows` calls against the same
 * connection (triggered in practice by React StrictMode's dev-mode
 * double-invoke of a tab component's data-fetching effect) corrupted
 * wa-sqlite's Asyncify state badly enough to freeze the tab entirely.
 * After the 2026-09-18 DuckDB migration, a real-browser spike confirmed
 * DuckDB-Wasm tolerates concurrent plain queries fine — but `db.ts`'s
 * per-connection queue (`withConnectionQueue`) was kept anyway as cheap
 * insurance against the untested case (concurrent *prepared statements*
 * on one connection) — see that file's comment. This test asserts the
 * queue still actually serializes calls, not just that nothing crashes
 * in this particular test environment.
 */
describe("db.ts connection queue (regression)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("never runs two conn.query calls concurrently against the same connection", async () => {
    db = await openSaveDatabase("connection-queue.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    let inFlight = 0;
    let maxConcurrent = 0;
    const original = db.conn.query.bind(db.conn);
    db.conn.query = async (...args: Parameters<typeof original>) => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      try {
        return await original(...args);
      } finally {
        inFlight--;
      }
    };

    const [nations, provinces, meta] = await Promise.all([
      queryRows(db, "SELECT * FROM nations"),
      queryRows(db, "SELECT * FROM locations"),
      queryRows(db, "SELECT * FROM save_meta"),
    ]);

    expect(maxConcurrent).toBe(1);
    // Sanity: the calls still actually ran and returned real data, not
    // just "didn't crash because they never ran."
    expect(nations.length).toBeGreaterThan(0);
    expect(provinces.length).toBeGreaterThan(0);
    expect(meta.length).toBe(1);
  });
});
