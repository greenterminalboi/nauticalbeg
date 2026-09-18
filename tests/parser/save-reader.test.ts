import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { readFileAsBytes, type ReadProgress } from "../../src/parser/save-reader";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/rus-1628-minimal.eu5",
);
const fixtureBuffer = readFileSync(FIXTURE_PATH);
const fixtureBytes = new Uint8Array(
  fixtureBuffer.buffer,
  fixtureBuffer.byteOffset,
  fixtureBuffer.byteLength,
);

describe("readFileAsBytes", () => {
  it("reads a File's full contents, matching a direct read", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const bytes = await readFileAsBytes(file);
    expect(bytes).toEqual(fixtureBytes);
  });

  it("reports progress that ends at the file's total size", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const progressEvents: ReadProgress[] = [];
    await readFileAsBytes(file, (p: ReadProgress) => progressEvents.push({ ...p }));

    expect(progressEvents.length).toBeGreaterThan(0);
    for (const event of progressEvents) {
      expect(event.totalBytes).toBe(file.size);
    }
    expect(progressEvents[progressEvents.length - 1].bytesRead).toBe(file.size);
  });

  it("stops and rejects when the signal is already aborted", async () => {
    const file = new File([fixtureBuffer], "rus-1628-minimal.eu5");
    const controller = new AbortController();
    controller.abort();
    await expect(
      readFileAsBytes(file, undefined, controller.signal),
    ).rejects.toThrow();
  });

  it("assembles multiple small chunks into byte-identical output", async () => {
    const content = new Uint8Array(50).map((_, i) => i);
    const file = new File([content], "chunked.bin");
    const progressEvents: ReadProgress[] = [];
    // Chunk size 7 forces 8 chunks (7*7 + 1) for a 50-byte file.
    const bytes = await readFileAsBytes(
      file,
      (p: ReadProgress) => progressEvents.push({ ...p }),
      undefined,
      7,
    );
    expect(bytes).toEqual(content);
    expect(progressEvents.length).toBe(8);
  });
});
