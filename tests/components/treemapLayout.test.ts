import { describe, expect, it } from "vitest";
import { squarify, type TreemapInput } from "../../src/components/Overview/treemapLayout";

function totalArea(rects: { width: number; height: number }[]): number {
  return rects.reduce((sum, r) => sum + r.width * r.height, 0);
}

function overlaps(a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean {
  const EPS = 1e-9;
  return (
    a.x < b.x + b.width - EPS &&
    a.x + a.width - EPS > b.x &&
    a.y < b.y + b.height - EPS &&
    a.y + a.height - EPS > b.y
  );
}

describe("treemapLayout squarify", () => {
  it("returns an empty layout for an empty item list", () => {
    expect(squarify([], 0, 0, 100, 100)).toEqual([]);
  });

  it("excludes zero/negative-value items (never a degenerate/negative-area box)", () => {
    const items: TreemapInput[] = [
      { id: "a", value: 10 },
      { id: "b", value: 0 },
      { id: "c", value: -5 },
    ];
    const rects = squarify(items, 0, 0, 100, 100);
    expect(rects).toHaveLength(1);
    expect(rects[0].item.id).toBe("a");
  });

  it("gives a single item the entire bounding box", () => {
    const rects = squarify([{ id: "a", value: 42 }], 0, 0, 200, 100);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toMatchObject({ x: 0, y: 0, width: 200, height: 100 });
  });

  it("splits box area exactly proportional to value, tiling the full bounding box with no overlaps", () => {
    const items: TreemapInput[] = [
      { id: "a", value: 50 },
      { id: "b", value: 30 },
      { id: "c", value: 20 },
    ];
    const rects = squarify(items, 0, 0, 100, 100);
    expect(rects).toHaveLength(3);

    // Total area conserved (tiles the full 100x100 box).
    expect(totalArea(rects)).toBeCloseTo(100 * 100, 5);

    // Each box's area is proportional to its value's share of the total.
    const total = 50 + 30 + 20;
    for (const r of rects) {
      const expectedArea = (r.item.value / total) * 100 * 100;
      expect(r.width * r.height).toBeCloseTo(expectedArea, 5);
    }

    // No two boxes overlap.
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(overlaps(rects[i], rects[j])).toBe(false);
      }
    }

    // Every box stays within the bounding box.
    for (const r of rects) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-9);
      expect(r.y).toBeGreaterThanOrEqual(-1e-9);
      expect(r.x + r.width).toBeLessThanOrEqual(100 + 1e-9);
      expect(r.y + r.height).toBeLessThanOrEqual(100 + 1e-9);
    }
  });

  it("positions the layout at a non-zero (x, y) origin", () => {
    const rects = squarify([{ id: "a", value: 1 }], 10, 20, 50, 50);
    expect(rects[0]).toMatchObject({ x: 10, y: 20, width: 50, height: 50 });
  });

  it("handles many items (e.g. one per selected country plus an Other bucket) without error", () => {
    const items: TreemapInput[] = Array.from({ length: 25 }, (_, i) => ({
      id: i,
      value: Math.random() * 100 + 1,
    }));
    const rects = squarify(items, 0, 0, 640, 300);
    expect(rects).toHaveLength(25);
    expect(totalArea(rects)).toBeCloseTo(640 * 300, 2);
  });

  // Regression: layoutRow's row orientation used to consume the
  // already-shorter side each row instead of the longer one, so a
  // dominant "Other" box followed by several smaller countries degenerated
  // into a stack of full-width slivers (all sharing x=0) rather than a 2D
  // mosaic — exactly the real "Other" + selected-countries shape.
  it("produces a genuine 2D mosaic, not a stack of full-width slivers, for one dominant item plus several smaller ones", () => {
    const items: TreemapInput[] = [
      { id: "other", value: 60 },
      { id: "a", value: 20 },
      { id: "b", value: 12 },
      { id: "c", value: 8 },
    ];
    const rects = squarify(items, 0, 0, 640, 300);
    const distinctXStarts = new Set(rects.map((r) => Math.round(r.x)));
    // A degenerate stacked-sliver layout has every box starting at x=0.
    expect(distinctXStarts.size).toBeGreaterThan(1);
  });

  it("matches the classic Bruls/Huizing/van Wijk squarify example's shape ([6,6,4,3,2,2,1] on 6x4): a genuine multi-row/column mosaic", () => {
    const items: TreemapInput[] = [6, 6, 4, 3, 2, 2, 1].map((value, i) => ({ id: i, value }));
    const rects = squarify(items, 0, 0, 6, 4);
    const distinctXStarts = new Set(rects.map((r) => Math.round(r.x * 100)));
    const distinctYStarts = new Set(rects.map((r) => Math.round(r.y * 100)));
    // A real mosaic varies along both axes — a degenerate layout only
    // ever varies along one (e.g. every box at x=0, stacked by y).
    expect(distinctXStarts.size).toBeGreaterThan(1);
    expect(distinctYStarts.size).toBeGreaterThan(1);
  });
});
