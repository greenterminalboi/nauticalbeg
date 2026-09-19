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
import { listProvincesArrow } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/rus-1628-minimal.eu5",
);
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8").replace(
  "country=1576",
  "country=2025",
);

/** Decodes `listProvincesArrow`'s Arrow IPC buffer back into plain rows —
 * the same format Perspective's `worker.table()` consumes directly in
 * production (see ProvincesTab.tsx), but tests assert on plain values. */
function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listProvincesArrow (US2)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("returns each of the nation's locations with a name (from provinces.name) and development (FR-004)", async () => {
    db = await openSaveDatabase("provinces-basic.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listProvincesArrow(db, 2025));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("mazyr_province");
    expect(Number(rows[0].development)).toBeCloseTo(28.83884, 5);
  });

  it("returns zero rows for a nation with no provinces", async () => {
    db = await openSaveDatabase("provinces-empty.db");
    await applySchema(db);
    await parseAndStore(db, "save-2", "rus-1628-minimal.eu5", toBytes(fixtureText));

    // idx 1 (PIR) owns no locations in the fixture.
    const rows = decodeRows(await listProvincesArrow(db, 1));
    expect(rows).toEqual([]);
  });

  it("returns every matching row unconditionally — Perspective virtualizes rows itself, so no LIMIT/OFFSET applies here (decision 2026-09-18)", async () => {
    db = await openSaveDatabase("provinces-unpaginated.db");
    await applySchema(db);
    await parseAndStore(db, "save-3", "rus-1628-minimal.eu5", toBytes(fixtureText));

    // Synthesize 60 extra locations owned by RUS (2025) to confirm the
    // full set (well beyond the old 50-row page size) comes back at once.
    const rows: string[] = [];
    for (let i = 1000; i < 1060; i++) {
      rows.push(`(${i}, 2025, NULL, ${i})`);
    }
    await db.conn.query(
      `INSERT INTO locations (idx, owner_idx, province_idx, development) VALUES ${rows.join(",")}`,
    );

    const decoded = decodeRows(await listProvincesArrow(db, 2025));
    expect(decoded).toHaveLength(61);
  });

  it("falls back to a synthetic 'Location {idx}' name when a location has no matching province row", async () => {
    db = await openSaveDatabase("provinces-fallback-name.db");
    await applySchema(db);
    await parseAndStore(db, "save-4", "rus-1628-minimal.eu5", toBytes(fixtureText));
    await db.conn.query(
      "INSERT INTO locations (idx, owner_idx, province_idx, development) VALUES (9999, 2025, NULL, 5)",
    );

    const decoded = decodeRows(await listProvincesArrow(db, 2025));
    const fallback = decoded.find((row) => row.idx === 9999n || row.idx === 9999);
    expect(fallback?.name).toBe("Location 9999");
  });
});
