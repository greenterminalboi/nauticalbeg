import { describe, expect, it } from "vitest";
import { computeCompassPosition } from "../../src/components/Overview/compassPosition";

describe("computeCompassPosition (specs/010-societal-values-compass)", () => {
  it("returns axisCount 0 and never a fabricated centrist position when no axes are applicable", () => {
    const result = computeCompassPosition([]);
    expect(result.axisCount).toBe(0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.breakdown).toEqual([]);
  });

  it("excludes an axis absent from the readings entirely, never treating it as a centrist 0 (FR-005)", () => {
    // One real reading plus a second axis that simply isn't present
    // (the shape a not-yet-unlocked axis takes once the -999 sentinel
    // has already been filtered out at ingest — research.md).
    const withOneAxis = computeCompassPosition([
      { axis: "aristocracy_vs_plutocracy", value: 100 },
    ]);
    // A single fully-positive axis at its own angle should point in
    // exactly that axis's own direction — the mean of one term is
    // itself, not diluted toward the origin by an axis that was never
    // there.
    expect(withOneAxis.axisCount).toBe(1);
    expect(Math.hypot(withOneAxis.x, withOneAxis.y)).toBeCloseTo(1, 5);
  });

  it("divides by the count of applicable axes (mean vector, FR-006), not the raw sum", () => {
    // Two axes at the same angle (180 degrees apart is irrelevant here —
    // same angle) should average to the same magnitude as either alone,
    // not double it.
    const oneAxis = computeCompassPosition([
      { axis: "aristocracy_vs_plutocracy", value: 100 },
    ]);
    const sameAxisTwice = computeCompassPosition([
      { axis: "aristocracy_vs_plutocracy", value: 100 },
      { axis: "serfdom_vs_free_subjects", value: 100 },
    ]);
    // Two different axes at different angles: the mean's magnitude must
    // stay bounded (<=1), proving this is a mean, not an accumulating sum.
    expect(Math.hypot(sameAxisTwice.x, sameAxisTwice.y)).toBeLessThanOrEqual(1 + 1e-9);
    expect(sameAxisTwice.axisCount).toBe(2);
    expect(oneAxis.axisCount).toBe(1);
  });

  it("ignores an axis key that isn't part of the compass config (e.g. a military-doctrine axis)", () => {
    const result = computeCompassPosition([
      { axis: "quality_vs_quantity", value: 100 },
    ]);
    expect(result.axisCount).toBe(0);
  });

  it("labels each breakdown entry by whichever pole the normalized value leans toward", () => {
    const positive = computeCompassPosition([
      { axis: "aristocracy_vs_plutocracy", value: 100 },
    ]);
    expect(positive.breakdown[0].label).toBe("Plutocracy");

    const negative = computeCompassPosition([
      { axis: "aristocracy_vs_plutocracy", value: -100 },
    ]);
    expect(negative.breakdown[0].label).toBe("Aristocracy");
  });
});
