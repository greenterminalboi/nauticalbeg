import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { loadSave } from "../../src/parser/load-save";
import {
  ensureTestSQLiteConfigured,
  TEST_VFS_NAME,
} from "../helpers/sqlite-test-env";

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
    ensureTestSQLiteConfigured();
  });

  it("reads, detects the version of, and parses a valid save, ending in onReady", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const callbacks = makeCallbacks();
    await loadSave(
      file,
      callbacks,
      new AbortController().signal,
      TEST_VFS_NAME,
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
      TEST_VFS_NAME,
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
      TEST_VFS_NAME,
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
      TEST_VFS_NAME,
    );

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith(
      "parse-failed",
      expect.any(String),
    );
  });

  it("calls neither onReady nor onError when cancelled before completion", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const callbacks = makeCallbacks();
    const controller = new AbortController();
    controller.abort();

    await loadSave(file, callbacks, controller.signal, TEST_VFS_NAME);

    expect(callbacks.onReady).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
