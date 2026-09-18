import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { detectVersion, looksLikeSaveFile } from "../../src/parser/version-detect";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/fixtures/rus-1628-minimal.eu5",
);
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");
const fixtureBytes = toBytes(fixtureText);

describe("looksLikeSaveFile", () => {
  it("recognizes the real fixture's header", () => {
    expect(looksLikeSaveFile(fixtureBytes)).toBe(true);
  });

  it("rejects an arbitrary text file", () => {
    expect(looksLikeSaveFile(toBytes("just some random text file"))).toBe(false);
  });
});

describe("detectVersion", () => {
  it("detects the version from the real fixture (1.3.11)", async () => {
    await expect(detectVersion(fixtureBytes)).resolves.toBe("1.3.11");
  });

  it("still detects the version from a well-formed leading slice of the fixture", async () => {
    // Mirrors the real streaming case: version-detect only ever sees an
    // early slice of a much larger file, with everything after `metadata`
    // truncated — but jomini requires the whole given document to be
    // well-formed, so the slice must end cleanly (not mid-block).
    const metadataEnd = fixtureText.indexOf("}\ncountries=");
    const leadingChunk = fixtureText.slice(0, metadataEnd + 1);
    await expect(detectVersion(toBytes(leadingChunk))).resolves.toBe("1.3.11");
  });

  it("rejects malformed input rather than silently returning null", async () => {
    // jomini needs a structurally valid document even to extract one
    // field — this ensures detectVersion doesn't swallow that error (see
    // its doc comment for why: collapsing "corrupted" into "no version
    // found" would misreport real corruption as just an unrecognized
    // version, per load-save.ts's error categorization).
    await expect(
      detectVersion(toBytes("not a save file at all")),
    ).rejects.toThrow();
  });
});
