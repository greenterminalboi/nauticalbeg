import { describe, expect, it } from "vitest";
import { buildHitTestIndex, type HitTestPolygon } from "../../src/components/Overview/mapHitTest";

const SQUARE_A: HitTestPolygon = {
  name: "a",
  rings: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
  ],
};

const SQUARE_B: HitTestPolygon = {
  name: "b",
  rings: [
    [
      [20, 0],
      [30, 0],
      [30, 10],
      [20, 10],
      [20, 0],
    ],
  ],
};

// A single location split into two disjoint shapes — the MultiPolygon
// case specs/003-province-map-generation's tracer produces for a
// non-contiguous location.
const MULTI: HitTestPolygon = {
  name: "multi",
  rings: [
    [
      [0, 20],
      [5, 20],
      [5, 25],
      [0, 25],
      [0, 20],
    ],
    [
      [15, 20],
      [20, 20],
      [20, 25],
      [15, 25],
      [15, 20],
    ],
  ],
};

describe("mapHitTest buildHitTestIndex", () => {
  it("resolves a point inside a polygon to its name", () => {
    const index = buildHitTestIndex([SQUARE_A, SQUARE_B]);
    expect(index.resolve(5, 5)).toBe("a");
    expect(index.resolve(25, 5)).toBe("b");
  });

  it("resolves a point outside every polygon to null", () => {
    const index = buildHitTestIndex([SQUARE_A, SQUARE_B]);
    expect(index.resolve(15, 5)).toBeNull(); // gap between the two squares
    expect(index.resolve(-5, -5)).toBeNull(); // outside the whole bounds
    expect(index.resolve(1000, 1000)).toBeNull();
  });

  it("resolves a point in either disjoint ring of a MultiPolygon to the same name", () => {
    const index = buildHitTestIndex([SQUARE_A, SQUARE_B, MULTI]);
    expect(index.resolve(2, 22)).toBe("multi");
    expect(index.resolve(17, 22)).toBe("multi");
    expect(index.resolve(10, 22)).toBeNull(); // gap between multi's two rings
  });

  it("returns null for every query against an empty polygon list", () => {
    const index = buildHitTestIndex([]);
    expect(index.resolve(0, 0)).toBeNull();
  });

  it("still resolves correctly with a coarser explicit grid (fewer cells than polygons)", () => {
    const index = buildHitTestIndex([SQUARE_A, SQUARE_B, MULTI], { gridColumns: 1, gridRows: 1 });
    expect(index.resolve(5, 5)).toBe("a");
    expect(index.resolve(25, 5)).toBe("b");
    expect(index.resolve(17, 22)).toBe("multi");
  });

  it("resolves a point exactly on a shared edge consistently (no crash/ambiguity)", () => {
    const index = buildHitTestIndex([SQUARE_A, SQUARE_B]);
    // Boundary behavior of ray-casting is an implementation detail; the
    // contract this asserts is just "doesn't throw, returns a name or
    // null" — not a specific inside/outside classification.
    expect(() => index.resolve(10, 5)).not.toThrow();
    expect([null, "a", "b"]).toContain(index.resolve(10, 5));
  });
});
