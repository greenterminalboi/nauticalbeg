// Covers T034 (keepSave/forgetKeptSave/listKeptSave) and T035 (an unkept
// save's OPFS database actually being cleaned up on replace/teardown).
//
// Node/jsdom has no real OPFS, so `deleteSaveDatabase` no-ops in test
// mode (see db.ts's `configureDuckDBForTesting`) — the "database is
// actually removed from disk" half of T035 can only be verified by hand
// against a real browser (same documented gap as T025's worker/UI
// click-through). What *is* verified here, against real DuckDB state
// (not a shim), is the decision logic
// this bug was about: an unkept save gets `deleteSaveDatabase` invoked
// for it and a kept one doesn't, on both the "superseded by a new load"
// and "explicit cleanup" paths, plus the keep/forget/list bookkeeping
// itself (including the pointer surviving a simulated reload).
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as db from "../../src/storage/db";
import {
  applySchema,
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import {
  cleanupSaveIfNotKept,
  forgetKeptSave,
  keepSave,
  listKeptSave,
} from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/rus-1628-minimal.eu5",
);
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

async function seedSave(saveId: string): Promise<SaveDatabase> {
  const database = await openSaveDatabase(saveId);
  await applySchema(database);
  await parseAndStore(
    database,
    saveId,
    "rus-1628-minimal.eu5",
    toBytes(fixtureText),
  );
  return database;
}

describe("storage/queries: keep/forget/list and cleanup", () => {
  const openDbs: SaveDatabase[] = [];

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(async () => {
    for (const database of openDbs.splice(0)) {
      await closeSaveDatabase(database);
    }
    vi.restoreAllMocks();
  });

  it("keepSave makes the save discoverable via listKeptSave, surviving a simulated reload", async () => {
    const database = await seedSave("keep-1");
    openDbs.push(database);

    await keepSave(database, "keep-1");

    // "Simulated reload": listKeptSave takes no db handle and no
    // in-memory state from keepSave — it can only be relying on the
    // pointer it wrote, exactly as it would after a real page reload.
    const kept = await listKeptSave();
    expect(kept).toEqual({
      saveId: "keep-1",
      filename: "rus-1628-minimal.eu5",
      inGameDate: "1628.8.14",
    });
  });

  it("keeping a second save replaces the first, deleting the first's database", async () => {
    const first = await seedSave("keep-a");
    openDbs.push(first);
    await keepSave(first, "keep-a");

    const second = await seedSave("keep-b");
    openDbs.push(second);
    // keepSave always targets production OPFS for the previously-kept
    // save (there's no test-VFS equivalent of "a kept save"), so the
    // real deleteSaveDatabase would try to call navigator.storage here —
    // mock it rather than let it through.
    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase").mockResolvedValue(undefined);
    await keepSave(second, "keep-b");

    expect(deleteSpy).toHaveBeenCalledWith("keep-a");
    const kept = await listKeptSave();
    expect(kept?.saveId).toBe("keep-b");
  });

  it("forgetKeptSave deletes the database and clears the pointer so it's no longer offered", async () => {
    const database = await seedSave("keep-forget");
    openDbs.push(database);
    await keepSave(database, "keep-forget");

    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase").mockResolvedValue(undefined);
    await forgetKeptSave("keep-forget");

    expect(deleteSpy).toHaveBeenCalledWith("keep-forget");
    expect(await listKeptSave()).toBeNull();
  });

  it("cleanupSaveIfNotKept deletes an unkept save's database (the T035 bug)", async () => {
    const database = await seedSave("cleanup-unkept");
    openDbs.push(database);

    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase");
    await cleanupSaveIfNotKept("cleanup-unkept");

    expect(deleteSpy).toHaveBeenCalledWith("cleanup-unkept");
  });

  it("cleanupSaveIfNotKept leaves a kept save's database alone", async () => {
    const database = await seedSave("cleanup-kept");
    openDbs.push(database);
    await keepSave(database, "cleanup-kept");

    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase");
    await cleanupSaveIfNotKept("cleanup-kept");

    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it("cleanupSaveIfNotKept is a no-op if the database can no longer be opened", async () => {
    // Reproduces a real bug: forgetting the currently-loaded save
    // deletes its database, but beforeunload still fires
    // cleanupSaveIfNotKept on that same (now-gone) saveId afterward —
    // that must not throw. The real OPFS VFS fails fast (NotFoundError)
    // for a missing file (confirmed manually in Chrome); the in-memory
    // test VFS instead hangs on an actually-missing file, so the
    // failure is simulated directly here rather than fighting that.
    vi.spyOn(db, "openSaveDatabase").mockRejectedValueOnce(
      new Error("unable to open database file"),
    );

    await expect(
      cleanupSaveIfNotKept("never-existed"),
    ).resolves.toBeUndefined();
  });

  it("a failed keepSave write never touches a previously kept save (FR-014)", async () => {
    const first = await seedSave("keep-safe-a");
    openDbs.push(first);
    await keepSave(first, "keep-safe-a");
    const before = await listKeptSave();

    const second = await seedSave("keep-safe-b");
    openDbs.push(second);

    // Simulate a write failure (e.g. storage quota) on the *new* save's
    // own UPDATE — this must happen before the previous kept save is
    // ever touched, so a failure here can't corrupt it.
    vi.spyOn(second.conn, "query").mockRejectedValueOnce(
      new Error("simulated write failure"),
    );
    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase").mockResolvedValue(undefined);

    await expect(keepSave(second, "keep-safe-b")).rejects.toThrow(
      "simulated write failure",
    );

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(await listKeptSave()).toEqual(before);
  });
});
