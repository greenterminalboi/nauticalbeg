import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadSave, resumeSave } from "../../src/parser/load-save";
import * as db from "../../src/storage/db";
import { applySchema, closeSaveDatabase, openSaveDatabase, queryRows } from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

// This file is also tasks.md's T030 ("fixture-based tests ... for all
// three error kinds") — it lives here rather than a separate
// tests/parser/errors.test.ts because these error paths are just other
// branches of the same loadSave orchestration already under test above,
// not a separate concern worth a second fixture-loading setup.

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/rus-1628-minimal.eu5",
);
const fixtureBuffer = readFileSync(FIXTURE_PATH);

function makeCallbacks() {
  return {
    onProgress: vi.fn(),
    onReady: vi.fn(),
    onError: vi.fn(),
  };
}

describe("loadSave", () => {
  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  it("reads, detects the version of, and parses a valid save, ending in onReady", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const callbacks = makeCallbacks();
    await loadSave(
      file,
      callbacks,
      new AbortController().signal,
    );

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);
    const result = callbacks.onReady.mock.calls[0][0];
    expect(result.inGameDate).toBe("1628.8.14");
    expect(typeof result.saveId).toBe("string");

    // Progress must include at least the validating and parsing phases.
    const phases = callbacks.onProgress.mock.calls.map((c) => c[0]);
    expect(phases).toContain("validating");
    expect(phases).toContain("detecting-version");
    expect(phases).toContain("parsing");
  });

  it("reports not-a-save for a file with no recognizable header", async () => {
    const file = new File(["this is not a save file"], "random.txt");
    const callbacks = makeCallbacks();
    await loadSave(
      file,
      callbacks,
      new AbortController().signal,
    );

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      "not-a-save",
      expect.any(String),
    );
  });

  it("reports unsupported-version for a save with an unrecognized version", async () => {
    const text = fixtureBuffer
      .toString("utf-8")
      .replace('version="1.3.11"', 'version="9.9.9"');
    const file = new File([text], "future-version.eu5");
    const callbacks = makeCallbacks();
    await loadSave(
      file,
      callbacks,
      new AbortController().signal,
    );

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      "unsupported-version",
      expect.stringContaining("9.9.9"),
      "9.9.9",
    );
  });

  it("reports parse-failed for a save that is truncated mid-structure", async () => {
    // Cut off partway through the (still-open) `tags={` block inside
    // `countries={` — the file passes the FR-002 "looks like a save"
    // check (metadata is intact) and version detection succeeds, but
    // parsing the countries section hits end-of-input with an unclosed
    // brace and throws.
    const fullText = fixtureBuffer.toString("utf-8");
    const cutPoint = fullText.indexOf("tags={") + "tags={".length + 10;
    const truncated = fullText.slice(0, cutPoint);
    const file = new File([truncated], "truncated.eu5");
    const callbacks = makeCallbacks();
    await loadSave(
      file,
      callbacks,
      new AbortController().signal,
    );

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      "parse-failed",
      expect.any(String),
    );
  });

  it("deletes the abandoned database when parsing fails after it was created (quickstart scenario 8 finding)", async () => {
    // Found by actually running quickstart.md's scenario 8 (cancel
    // mid-parse) in a browser: a save that opens a database but never
    // reaches onReady — cancelled mid-parse, or (as reproduced here)
    // a genuine failure after that point — previously leaked that
    // database forever, since neither the FR-010 supersede-cleanup nor
    // the beforeunload cleanup ever runs for a save that was never
    // "ready" in the first place. A structurally truncated file (like
    // the test above) actually fails *before* a database is ever
    // created — jomini requires the whole document to be well-formed
    // even for detectVersion's single-field lookup — so this instead
    // forces the failure squarely after openSaveDatabase, in applySchema.
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const callbacks = makeCallbacks();

    vi.spyOn(db, "applySchema").mockRejectedValueOnce(
      new Error("simulated schema failure"),
    );
    const deleteSpy = vi.spyOn(db, "deleteSaveDatabase");

    await loadSave(
      file,
      callbacks,
      new AbortController().signal,
    );

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      "parse-failed",
      expect.stringContaining("simulated schema failure"),
    );
    expect(deleteSpy).toHaveBeenCalledWith(expect.any(String));

    vi.restoreAllMocks();
  });

  it("calls neither onReady nor onError when cancelled before completion", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const callbacks = makeCallbacks();
    const controller = new AbortController();
    controller.abort();

    await loadSave(
      file,
      callbacks,
      controller.signal,
    );

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});

// The fixture's own played_country doesn't resolve to a real nation
// (same issue tests/storage/queries.test.ts works around) — substituted
// here too so getPlayerNationOverview inside resumeSave has a player to
// find, rather than silently falling back to an empty tag.
const textWithRusAsPlayer = fixtureBuffer
  .toString("utf-8")
  .replace("country=1576", "country=2025");

describe("resumeSave", () => {
  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  it("reopens an already-parsed save by id without re-parsing, reporting the same shape as loadSave", async () => {
    const db = await openSaveDatabase("resume-1");
    await applySchema(db);
    await parseAndStore(db, "resume-1", "rus-1628-minimal.eu5", toBytes(textWithRusAsPlayer));
    await closeSaveDatabase(db);

    const callbacks = { onReady: vi.fn(), onError: vi.fn() };
    await resumeSave("resume-1", callbacks);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onReady).toHaveBeenCalledWith({
      saveId: "resume-1",
      inGameDate: "1628.8.14",
      playerNationTag: "RUS",
    });
  });

  it("adds a table added by schema.sql after this save was first kept, rather than crashing on resume (real bug: kept saves predating the wars table)", async () => {
    const dbHandle = await openSaveDatabase("resume-predates-wars");
    await applySchema(dbHandle);
    await parseAndStore(dbHandle, "resume-predates-wars", "rus-1628-minimal.eu5", toBytes(textWithRusAsPlayer));
    // Simulates a save kept before schema.sql had a `wars` table at all —
    // real kept saves from before that schema change hit exactly this
    // "Catalog Error: Table with name wars does not exist!" the moment
    // anything queried it, since resumeSave never used to reapply schema.
    await dbHandle.conn.query("DROP TABLE wars");
    await closeSaveDatabase(dbHandle);

    const callbacks = { onReady: vi.fn(), onError: vi.fn() };
    await resumeSave("resume-predates-wars", callbacks);

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onReady).toHaveBeenCalledTimes(1);

    // The table exists again (empty, since this save was never re-parsed
    // with the adapter that populates it) instead of the resumed session
    // crashing the first time something queries it.
    const resumed = await openSaveDatabase("resume-predates-wars");
    const rows = await queryRows(resumed, "SELECT * FROM wars");
    expect(rows).toHaveLength(0);
    await closeSaveDatabase(resumed);
  });

  it("reports parse-failed if the save has no data (e.g. parsing never actually ran)", async () => {
    const db = await openSaveDatabase("resume-empty");
    await applySchema(db);
    await closeSaveDatabase(db);

    const callbacks = { onReady: vi.fn(), onError: vi.fn() };
    await resumeSave("resume-empty", callbacks);

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith("parse-failed", expect.any(String));
  });
});
