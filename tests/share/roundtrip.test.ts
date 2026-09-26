// 017: a shared game must show exactly what the sharer sees (SC-003) and
// must not carry the file name or the raw save sections (SC-005).
import { beforeAll, describe, expect, it, vi } from "vitest";
import { loadSave } from "../../src/parser/load-save";
import { importSnapshot } from "../../src/parser/import-snapshot";
import { exportSnapshot } from "../../src/share/exportSnapshot";
import { decodeSnapshot, encodeSnapshot } from "../../src/share/snapshotFormat";
import { openSaveDatabase, queryRows, type SaveDatabase } from "../../src/storage/db";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { ensureTestMelterConfigured, readFixture } from "../helpers/melter-test-env";
import { createRequire } from "node:module";

// Same native apache-arrow instance the Node DuckDB bindings use (see duckdb-test-env.ts).
const arrow = createRequire(import.meta.url)("apache-arrow") as typeof import("apache-arrow");

async function tableNames(db: SaveDatabase): Promise<string[]> {
  const rows = await queryRows(
    db,
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' AND table_type = 'BASE TABLE' ORDER BY 1",
  );
  return rows.map((r) => String(r.table_name));
}

async function importContainer(container: Uint8Array) {
  const callbacks = { onProgress: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
  await importSnapshot(container, callbacks, new AbortController().signal);
  return callbacks;
}

describe("share export ↔ import round-trip", () => {
  let source: SaveDatabase;
  let container: Uint8Array;

  beforeAll(async () => {
    ensureTestDuckDBConfigured();
    ensureTestMelterConfigured();
    const callbacks = { onProgress: vi.fn(), onReady: vi.fn(), onError: vi.fn() };
    const bytes = readFixture("rus-1628-minimal.eu5");
    await loadSave(new File([bytes], "rus-1628-minimal.eu5"), callbacks, new AbortController().signal);
    expect(callbacks.onError).not.toHaveBeenCalled();
    source = await openSaveDatabase(callbacks.onReady.mock.calls[0][0].saveId);
    container = await exportSnapshot(source);
  });

  it("imports every displayed table identically, as a fresh unkept save called 'Shared game'", async () => {
    const callbacks = await importContainer(container);
    expect(callbacks.onError).not.toHaveBeenCalled();
    const { saveId, inGameDate } = callbacks.onReady.mock.calls[0][0];
    expect(inGameDate).toBeTruthy();
    const imported = await openSaveDatabase(saveId);

    const names = (await tableNames(source)).filter((t) => t !== "raw_sections" && t !== "save_meta");
    expect(names.length).toBeGreaterThan(10);
    for (const t of names) {
      const a = await queryRows(source, `SELECT * FROM ${t} ORDER BY ALL`);
      const b = await queryRows(imported, `SELECT * FROM ${t} ORDER BY ALL`);
      expect(b, t).toEqual(a);
    }

    const [meta] = await queryRows(imported, "SELECT id, filename, kept, in_game_date FROM save_meta");
    const [srcMeta] = await queryRows(source, "SELECT in_game_date FROM save_meta");
    expect(meta).toMatchObject({ id: saveId, filename: "Shared game", kept: 0, in_game_date: srcMeta.in_game_date });
  });

  it("never ships the raw save sections or the original file name (SC-005)", async () => {
    const { manifest } = decodeSnapshot(container);
    expect(manifest.tables.map((t) => t.name)).not.toContain("raw_sections");
    const [srcRaw] = await queryRows(source, "SELECT count(*) AS n FROM raw_sections");
    expect(Number(srcRaw.n)).toBeGreaterThan(0); // the fixture really has some to leave out
    expect(new TextDecoder().decode(container)).not.toContain("rus-1628-minimal.eu5");
  });

  it("refuses a snapshot with a table this version doesn't know", async () => {
    const { manifest, streams } = decodeSnapshot(container);
    const forged = encodeSnapshot(
      { ...manifest, tables: manifest.tables.map((t, i) => (i === 0 ? { ...t, name: "not_a_table" } : t)) },
      streams.map((s) => s.slice()),
    );
    const callbacks = await importContainer(forged);
    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith("share-incompatible", expect.any(String));
  });

  it("imports a snapshot from an older version that lacks a column, filling its schema default (NULL if none)", async () => {
    const { manifest, streams } = decodeSnapshot(container);
    const i = manifest.tables.findIndex((t) => t.name === "nations");
    const dropped = "is_player";
    const cols = manifest.tables[i].columns.filter((c) => c !== dropped);
    const narrowed = arrow.tableToIPC(arrow.tableFromIPC(streams[i]).select(cols), "stream");
    const forged = encodeSnapshot(
      { ...manifest, tables: manifest.tables.map((t, j) => (j === i ? { ...t, columns: cols, bytes: narrowed.length } : t)) },
      streams.map((s, j) => (j === i ? narrowed : s.slice())),
    );
    const callbacks = await importContainer(forged);
    expect(callbacks.onError).not.toHaveBeenCalled();
    const imported = await openSaveDatabase(callbacks.onReady.mock.calls[0][0].saveId);
    const [row] = await queryRows(imported, `SELECT count(*) AS n, count(${dropped}) AS nonnull FROM nations`);
    expect(Number(row.n)).toBe(manifest.tables[i].rows);
    // is_player is NOT NULL DEFAULT 0 in the schema, so BY NAME fills the default.
    expect(Number(row.nonnull)).toBe(Number(row.n));
  });

  it("reports damaged data as corrupt", async () => {
    const callbacks = await importContainer(container.slice(0, container.length - 10));
    expect(callbacks.onError).toHaveBeenCalledWith("share-corrupt", expect.any(String));
  });
});
