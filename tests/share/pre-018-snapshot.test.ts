// specs/018 research.md R13: a share link made before 018 has none of the
// new tables or nation columns. It must still open, and every new section
// must say "not available", never show a fabricated zero.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { loadSave } from "../../src/parser/load-save";
import { importSnapshot } from "../../src/parser/import-snapshot";
import { exportSnapshot } from "../../src/share/exportSnapshot";
import { decodeSnapshot, encodeSnapshot } from "../../src/share/snapshotFormat";
import { openSaveDatabase } from "../../src/storage/db";
import { getCountryCard, listNationEstates, listSubjectRelations } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { ensureTestMelterConfigured, readFixture } from "../helpers/melter-test-env";

const arrow = createRequire(import.meta.url)("apache-arrow") as typeof import("apache-arrow");

const NEW_TABLES = new Set(["loans", "nation_estates", "subject_relations"]);
const NEW_NATION_COLUMNS = new Set(["government_power", "prestige", "monthly_income"]);

describe("a share link made before 018", () => {
  let pre018: Uint8Array;

  beforeAll(async () => {
    ensureTestDuckDBConfigured();
    ensureTestMelterConfigured();
    const callbacks = { onProgress: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
    await loadSave(new File([readFixture("rus-1628-minimal.eu5")], "rus.eu5"), callbacks, new AbortController().signal);
    const source = await openSaveDatabase(callbacks.onReady.mock.calls[0][0].saveId);
    const { manifest, streams } = decodeSnapshot(await exportSnapshot(source));

    const tables = [];
    const kept = [];
    for (const [i, t] of manifest.tables.entries()) {
      if (NEW_TABLES.has(t.name)) continue;
      if (t.name === "nations") {
        const cols = t.columns.filter((c) => !NEW_NATION_COLUMNS.has(c));
        const narrowed = arrow.tableToIPC(arrow.tableFromIPC(streams[i]).select(cols), "stream");
        tables.push({ ...t, columns: cols, bytes: narrowed.length });
        kept.push(narrowed);
      } else {
        tables.push(t);
        kept.push(streams[i].slice());
      }
    }
    pre018 = encodeSnapshot({ ...manifest, tables }, kept);
  });

  it("opens, and every 018 section says its data isn't available", async () => {
    const callbacks = { onProgress: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
    await importSnapshot(pre018, callbacks, new AbortController().signal);
    expect(callbacks.onError).not.toHaveBeenCalled();
    const db = await openSaveDatabase(callbacks.onReady.mock.calls[0][0].saveId);

    const card = await getCountryCard(db, 2025);
    expect(card.available.loans).toBe(false);
    expect(card.totalDebt).toBeNull();
    expect(card.governmentPower).toBeNull();
    expect(card.prestige).toBeNull();
    expect(card.monthlyIncome).toBeNull();
    // Data that already existed before 018 still shows.
    expect(card.treasury).toBe(5493.12008);

    expect(await listNationEstates(db, 2025)).toEqual({ available: false, rows: [] });
    expect((await listSubjectRelations(db)).available).toBe(false);
  });
});
