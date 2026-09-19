import { describe, expect, it } from "vitest";
import {
  traceRegionToPolygons,
  unionPixelRegions,
} from "../../tools/map-generation/trace-polygons";
import type { LocationPixelRegion, PixelRun } from "../../tools/map-generation/types";

function rectRows(x0: number, x1: number, y0: number, y1: number): Map<number, PixelRun[]> {
  const rows = new Map<number, PixelRun[]>();
  for (let y = y0; y <= y1; y++) rows.set(y, [{ xStart: x0, xEnd: x1 }]);
  return rows;
}

describe("trace-polygons traceRegionToPolygons", () => {
  it("traces a single contiguous 5x5 pixel region into one Polygon with a closed ring", () => {
    const rows = rectRows(0, 4, 0, 4); // matches fixture's alpha block
    const polygons = traceRegionToPolygons(rows);

    expect(polygons).toHaveLength(1); // one Polygon, not a MultiPolygon
    expect(polygons[0]).toHaveLength(1); // no holes
    const ring = polygons[0][0];
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed ring
    // 5x5 square perimeter = 20 unit edges = 20 distinct vertices + 1 closing repeat
    expect(ring).toHaveLength(21);
  });

  it("traces a deliberately-disjoint same-color region (fixture's gamma) into a MultiPolygon with two ring groups", () => {
    const rows = new Map<number, PixelRun[]>();
    for (const y of [5, 6, 7]) {
      rows.set(y, [
        { xStart: 0, xEnd: 2 },
        { xStart: 15, xEnd: 17 },
      ]);
    }
    const polygons = traceRegionToPolygons(rows);

    expect(polygons).toHaveLength(2); // MultiPolygon: two disjoint blobs
    for (const polygon of polygons) {
      expect(polygon).toHaveLength(1); // no holes in either blob
      const ring = polygon[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      // each 3x3 blob: perimeter = 12 unit edges = 12 vertices + 1 closing repeat
      expect(ring).toHaveLength(13);
    }
  });
});

describe("trace-polygons traceRegionToPolygons pinch points", () => {
  it("keeps two diagonally-touching single-pixel regions as two separate loops (confirmed against the real ~28k-location bitmap, where a naive single-successor walk hit an infinite loop at exactly this kind of shared-vertex ambiguity)", () => {
    const rows = new Map<number, PixelRun[]>([
      [0, [{ xStart: 0, xEnd: 0 }]], // pixel (0,0)
      [1, [{ xStart: 1, xEnd: 1 }]], // pixel (1,1) — shares only corner (1,1) with (0,0)
    ]);

    const polygons = traceRegionToPolygons(rows);

    expect(polygons).toHaveLength(2);
    for (const polygon of polygons) {
      const ring = polygon[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      expect(ring).toHaveLength(5); // unit-square perimeter: 4 edges + closing repeat
    }
  });
});

describe("trace-polygons unionPixelRegions", () => {
  it("unions two adjacent, differently-colored locations into one contiguous region", () => {
    const alpha: LocationPixelRegion = { name: "alpha", rows: rectRows(0, 4, 0, 4) };
    const beta: LocationPixelRegion = { name: "beta", rows: rectRows(5, 9, 0, 4) };

    const unioned = unionPixelRegions([alpha, beta]);
    const polygons = traceRegionToPolygons(unioned);

    // alpha (x0-4) + beta (x5-9) touch at x=4/5 — one contiguous 10x5 region
    expect(polygons).toHaveLength(1);
    const ring = polygons[0][0];
    // 10x5 rectangle perimeter = 2*(10+5) = 30 unit edges = 30 vertices + 1 closing repeat
    expect(ring).toHaveLength(31);
  });

  it("keeps non-adjacent locations as separate polygons after union (province-level MultiPolygon)", () => {
    const gammaBlob1: LocationPixelRegion = { name: "gamma", rows: rectRows(0, 2, 5, 7) };
    const gammaBlob2: LocationPixelRegion = { name: "gamma", rows: rectRows(15, 17, 5, 7) };

    const unioned = unionPixelRegions([gammaBlob1, gammaBlob2]);
    const polygons = traceRegionToPolygons(unioned);

    expect(polygons).toHaveLength(2);
  });
});
