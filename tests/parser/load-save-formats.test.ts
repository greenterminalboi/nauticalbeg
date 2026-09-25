// 015 — every save format goes through the full loadSave pipeline and must
// store exactly what the plain text save stores (spec FR-004/FR-013,
// Constitution Principle II). Fixtures are generated from
// rus-1628-minimal.eu5 by tools/eu5-melter/src/bin/make-fixtures.rs.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadSave } from "../../src/parser/load-save";
import * as melter from "../../src/parser/melter/melt";
import * as db from "../../src/storage/db";
import { closeSaveDatabase, openSaveDatabase, queryRows } from "../../src/storage/db";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { ensureTestMelterConfigured, readFixture } from "../helpers/melter-test-env";

function makeCallbacks() {
  return { onProgress: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
}

async function load(fixture: string) {
  const callbacks = makeCallbacks();
  const bytes = readFixture(fixture);
  await loadSave(new File([bytes], fixture), callbacks, new AbortController().signal);
  return callbacks;
}

/** Every table's rows, sorted, minus the per-load identity columns. */
async function snapshot(saveId: string): Promise<Record<string, unknown[]>> {
  const handle = await openSaveDatabase(saveId);
  try {
    const tables = await queryRows(
      handle,
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
    );
    const out: Record<string, unknown[]> = {};
    for (const { table_name } of tables as { table_name: string }[]) {
      const exclude = table_name === "save_meta" ? " EXCLUDE (id, filename, loaded_at)" : "";
      out[table_name] = await queryRows(handle, `SELECT *${exclude} FROM ${table_name} ORDER BY ALL`);
    }
    return out;
  } finally {
    await closeSaveDatabase(handle);
  }
}

describe("loadSave across save formats", () => {
  let textSnapshot: Record<string, unknown[]>;

  beforeAll(async () => {
    ensureTestDuckDBConfigured();
    ensureTestMelterConfigured();
    const callbacks = await load("rus-1628-minimal.eu5");
    expect(callbacks.onError).not.toHaveBeenCalled();
    textSnapshot = await snapshot(callbacks.onReady.mock.calls[0][0].saveId);
    // Sanity: the comparison below is meaningful only if the text load
    // actually filled tables, including regiment strength (research R4).
    expect(textSnapshot.regiments.length).toBeGreaterThan(0);
    expect(textSnapshot.regiments.some((r) => (r as { strength: unknown }).strength !== null)).toBe(true);
  });

  // US1 (compressed binary, the game's normal save) + uncompressed binary.
  // US2 (compressed text).
  it.each([
    ["rus-1628-minimal.zip.eu5", "compressed binary (kind 03)"],
    ["rus-1628-minimal.bin.eu5", "uncompressed binary (kind 01)"],
    ["rus-1628-minimal.ztext.eu5", "compressed text (kind 02)"],
  ])("%s — %s — stores exactly what the text save stores", async (fixture) => {
    const callbacks = await load(fixture);
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    const result = callbacks.onReady.mock.calls[0][0];
    expect(result.inGameDate).toBe("1628.8.14");
    expect(result.warnings).toBeUndefined();

    const phases = callbacks.onProgress.mock.calls.map((c) => c[0]);
    expect(phases).toContain("decompressing");
    expect(phases.indexOf("decompressing")).toBeLessThan(phases.indexOf("detecting-version"));

    expect(await snapshot(result.saveId)).toEqual(textSnapshot);
  });

  // US3: plain text saves never touch the melter.
  it("loads a plain text save without the melter or a decompressing phase", async () => {
    const meltSpy = vi.spyOn(melter, "meltSave");
    const callbacks = await load("rus-1628-minimal.eu5");
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    expect(callbacks.onProgress.mock.calls.map((c) => c[0])).not.toContain("decompressing");
    expect(meltSpy).not.toHaveBeenCalled();
    meltSpy.mockRestore();
  });

  // US4: distinct, actionable errors — and nothing left behind.
  it.each([
    ["damaged-truncated.zip.eu5", "damaged-save"],
    ["damaged-badzip.zip.eu5", "damaged-save"],
    ["unknown-kind.eu5", "unrecognized-format"],
  ])("%s → %s, leaving no database behind", async (fixture, kind) => {
    const openSpy = vi.spyOn(db, "openSaveDatabase");
    const callbacks = await load(fixture);
    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(kind, expect.any(String));
    // Rejected before a database was ever created.
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("reports binary-unavailable when the melter can't load, while text saves still work", async () => {
    melter.configureMelterAssetsForTesting(() => Promise.reject(new Error("404 tokens/eu5.flat")));
    try {
      const binary = await load("rus-1628-minimal.zip.eu5");
      expect(binary.onError).toHaveBeenCalledWith("binary-unavailable", expect.any(String));
      const text = await load("rus-1628-minimal.eu5");
      expect(text.onReady).toHaveBeenCalledTimes(1);
    } finally {
      ensureTestMelterConfigured();
    }
  });

  it("completes with a warning when the save has fields the token table doesn't know", async () => {
    const callbacks = await load("unknown-tokens.bin.eu5");
    expect(callbacks.onError).not.toHaveBeenCalled();
    const { warnings } = callbacks.onReady.mock.calls[0][0];
    expect(warnings).toEqual([
      expect.objectContaining({ kind: "unknown-tokens", count: 1, message: expect.stringContaining("1 field") }),
    ]);
  });

  // Found live in 015's browser check: a binary load superseded mid-melt
  // kept going, posted "Parsing save…" over the newer load, and left its
  // database behind. The melt blocks the Worker, so the cancel is only
  // seen afterwards — these simulate that with an abort fired from inside
  // a progress callback.
  it("goes silent and creates no database when cancelled during the melt", async () => {
    const controller = new AbortController();
    const callbacks = makeCallbacks();
    callbacks.onProgress.mockImplementation((phase: string) => {
      if (phase === "decompressing") controller.abort();
    });
    const openSpy = vi.spyOn(db, "openSaveDatabase");
    const bytes = readFixture("rus-1628-minimal.zip.eu5");
    await loadSave(new File([bytes], "cancel.eu5"), callbacks, controller.signal);
    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    const phases = callbacks.onProgress.mock.calls.map((c) => c[0]);
    expect(phases).not.toContain("parsing");
    openSpy.mockRestore();
  });

  it("stops at the next milestone, deletes its database, and never reports ready when cancelled mid-parse", async () => {
    const controller = new AbortController();
    const callbacks = makeCallbacks();
    callbacks.onProgress.mockImplementation((phase: string, percent: number | null) => {
      if (phase === "parsing" && percent !== null && percent > 0) controller.abort();
    });
    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase");
    const bytes = readFixture("rus-1628-minimal.zip.eu5");
    await loadSave(new File([bytes], "cancel.eu5"), callbacks, controller.signal);
    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(deleteSpy).toHaveBeenCalledTimes(1);
    const afterAbort = callbacks.onProgress.mock.calls.findIndex((c) => c[0] === "parsing" && (c[1] ?? 0) > 0);
    expect(callbacks.onProgress.mock.calls.length).toBe(afterAbort + 1);
    deleteSpy.mockRestore();
  });
});
