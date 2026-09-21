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
import { listSocietalValuesArrow } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listSocietalValuesArrow (specs/010-societal-values-compass)", () => {
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

  it("listSocietalValuesArrow returns only real, alive countries' applicable axes, never a -999 row", async () => {
    await freshParsedDb("societal-values.db", "save-1");
    const rows = decodeRows(await listSocietalValuesArrow(db));

    const rusRows = rows.filter((r) => r.nation_idx === 2025);
    expect(rusRows.sort((a, b) => String(a.axis).localeCompare(String(b.axis)))).toEqual([
      { nation_idx: 2025, axis: "aristocracy_vs_plutocracy", value: 67.5 },
      { nation_idx: 2025, axis: "centralization_vs_decentralization", value: -41.23 },
    ]);
    // No row anywhere holds the raw -999 sentinel.
    expect(rows.some((r) => r.value === -999)).toBe(false);
  });
});
