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
import { listWarsArrow } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

/** Decodes `listWarsArrow`'s Arrow IPC buffer back into plain rows — the
 * same format Perspective's `worker.table()` consumes directly in
 * production (see WarsTab.tsx), but tests assert on plain values. */
function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries listWarsArrow (Encyclopedia Wars tab)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  it("joins attacker/defender display names from nations, most-recent war first", async () => {
    db = await openSaveDatabase("wars-basic.db");
    await applySchema(db);
    await parseAndStore(db, "save-1", "rus-1628-minimal.eu5", toBytes(fixtureText));

    const rows = decodeRows(await listWarsArrow(db));
    expect(rows).toHaveLength(2);

    // wars.idx is BIGINT (real war indices exceed INT32 — schema.sql's
    // comment has the finding), so DuckDB returns it as a JS BigInt via
    // Arrow, matching population.idx's existing precedent.
    // Ordered by start_date DESC — 1628.2.1 (the concluded civil war)
    // is later than 1627.12.13 (the ongoing war), so it comes first.
    expect(rows[0].idx).toBe(1879048200n);
    expect(rows[1].idx).toBe(2030043139n);

    const civilWar = rows[0];
    expect(civilWar.attacker).toBe("AAA13"); // no nations.name set — falls back to tag, per listNations' own convention
    expect(civilWar.defender).toBe("FRA");
    expect(civilWar.is_ongoing).toBe(false);
    expect(civilWar.duration_days).toBe(74);
    expect(civilWar.attacker_casualties).toBe(90);
    expect(civilWar.defender_casualties).toBe(0);
    expect(civilWar.war_type).toBe("CIVIL_WAR_NAME");

    const ongoingWar = rows[1];
    expect(ongoingWar.attacker).toBe("RUS");
    expect(ongoingWar.defender).toBe("PLC"); // first of original_defenders=[33556892, 1961]
    expect(ongoingWar.is_ongoing).toBe(true);
    expect(ongoingWar.end_date).toBeNull();
    expect(ongoingWar.duration_days).toBe(245);
    expect(ongoingWar.attacker_score).toBeNull();
    expect(Number(ongoingWar.defender_score)).toBe(8);
    // 30474 + 15 (navy_heavy_ship Battle=12 + Attrition=3, added by
    // specs/012-firepower-tab to prove war_unit_losses' navy-category
    // rows are also folded into this pre-existing total).
    expect(ongoingWar.attacker_casualties).toBe(30489);
    expect(ongoingWar.defender_casualties).toBe(53232);
  });

  it("falls back to 'Unknown' when a war references a country index absent from nations", async () => {
    db = await openSaveDatabase("wars-unknown-nation.db");
    await applySchema(db);
    await parseAndStore(db, "save-2", "rus-1628-minimal.eu5", toBytes(fixtureText));
    await db.conn.query(
      "INSERT INTO wars (idx, attacker_idx, defender_idx, start_date) VALUES (999, 424242, 434343, '1600.1.1')",
    );

    const rows = decodeRows(await listWarsArrow(db));
    const row = rows.find((r) => r.idx === 999n);
    expect(row?.attacker).toBe("Unknown");
    expect(row?.defender).toBe("Unknown");
  });
});
