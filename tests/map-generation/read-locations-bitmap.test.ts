import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import { groupPixelsByColor } from "../../tools/map-generation/read-locations-bitmap";
import type { NamedLocation } from "../../tools/map-generation/types";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/map-generation/fixtures/sample.png",
);

const NAMED_LOCATIONS: NamedLocation[] = [
  { name: "alpha", color: [255, 0, 0] },
  { name: "beta", color: [0, 255, 0] },
  { name: "gamma", color: [0, 0, 255] },
];

function loadFixturePng() {
  const png = PNG.sync.read(readFileSync(FIXTURE_PATH));
  return { width: png.width, height: png.height, data: png.data };
}

describe("read-locations-bitmap groupPixelsByColor", () => {
  it("groups pixels by exact RGB color into one LocationPixelRegion per named location", () => {
    const regions = groupPixelsByColor(loadFixturePng(), NAMED_LOCATIONS);
    const byName = new Map(regions.map((r) => [r.name, r]));

    expect(byName.size).toBe(3);
    // alpha: contiguous 5x5 block, rows y=0..4 each with one run x=0..4
    const alpha = byName.get("alpha")!;
    expect(alpha.rows.size).toBe(5);
    expect(alpha.rows.get(0)).toEqual([{ xStart: 0, xEnd: 4 }]);
  });

  it("produces two separate pixel runs per row for the deliberately-disjoint gamma color", () => {
    const regions = groupPixelsByColor(loadFixturePng(), NAMED_LOCATIONS);
    const gamma = regions.find((r) => r.name === "gamma")!;

    // gamma paints x[0-2] and x[15-17] on rows y=5..7 — two disjoint blobs,
    // sharing the same color, checked downstream by trace-polygons (T010).
    expect(gamma.rows.size).toBe(3);
    for (const y of [5, 6, 7]) {
      expect(gamma.rows.get(y)).toEqual([
        { xStart: 0, xEnd: 2 },
        { xStart: 15, xEnd: 17 },
      ]);
    }
  });

  it("omits a named location whose color never appears in the bitmap", () => {
    const regions = groupPixelsByColor(loadFixturePng(), [
      ...NAMED_LOCATIONS,
      { name: "never-painted", color: [1, 2, 3] },
    ]);
    expect(regions.find((r) => r.name === "never-painted")).toBeUndefined();
  });
});
