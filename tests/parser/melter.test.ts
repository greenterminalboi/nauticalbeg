import { beforeEach, describe, expect, it } from "vitest";
import { Jomini } from "jomini";
import { meltSave } from "../../src/parser/melter/melt";
import { ensureTestMelterConfigured, readFixture } from "../helpers/melter-test-env";

// Fixtures are generated from rus-1628-minimal.eu5 by
// tools/eu5-melter/src/bin/make-fixtures.rs (research R7).
const decoder = new TextDecoder();

async function parse(bytes: Uint8Array) {
  const parser = await Jomini.initialize();
  return parser.parseText(bytes, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
}

describe("meltSave", () => {
  beforeEach(() => {
    ensureTestMelterConfigured();
  });

  it.each(["rus-1628-minimal.bin.eu5", "rus-1628-minimal.zip.eu5", "rus-1628-minimal.ztext.eu5"])(
    "melts %s into the same document as the text fixture",
    async (fixture) => {
      const result = await meltSave(readFixture(fixture));
      expect(result.unknownTokenCount).toBe(0);
      expect(result.unknownLookupCount).toBe(0);
      expect(decoder.decode(result.text.subarray(0, 7))).toBe("SAV0200");

      const melted = await parse(result.text);
      const original = await parse(readFixture("rus-1628-minimal.eu5"));
      expect(melted.metadata).toEqual(original.metadata);
      expect(melted.countries).toEqual(original.countries);
      // subunit_manager carries `strength` — token 0x28de, which only
      // resolves to `strength` via the 1.3.11 override (research R4).
      expect(melted.subunit_manager).toEqual(original.subunit_manager);
      expect(JSON.stringify(melted.subunit_manager)).toContain('"strength"');
      expect(melted).toEqual(original);
    },
  );

  it("reports unknown tokens instead of failing", async () => {
    const result = await meltSave(readFixture("unknown-tokens.bin.eu5"));
    expect(result.unknownTokenCount).toBe(1);
    expect(decoder.decode(result.text)).toMatch(/__unknown_0x[0-9a-f]+=/);
  });

  it("reports progress while melting", async () => {
    const seen: number[] = [];
    await meltSave(readFixture("rus-1628-minimal.zip.eu5"), { onProgress: (p) => seen.push(p) });
    expect(seen.length).toBeGreaterThan(0);
    expect(Math.max(...seen)).toBeLessThanOrEqual(99);
  });

  it("aborts with an AbortError when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      meltSave(readFixture("rus-1628-minimal.zip.eu5"), { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it.each([
    ["damaged-truncated.zip.eu5", "damaged-save"],
    ["damaged-badzip.zip.eu5", "damaged-save"],
  ])("maps %s to %s", async (fixture, kind) => {
    await expect(meltSave(readFixture(fixture))).rejects.toMatchObject({ kind });
  });

  it("still works after a failed melt (instance is reset)", async () => {
    await expect(meltSave(readFixture("damaged-badzip.zip.eu5"))).rejects.toBeDefined();
    const result = await meltSave(readFixture("rus-1628-minimal.bin.eu5"));
    expect(result.unknownTokenCount).toBe(0);
  });
});
