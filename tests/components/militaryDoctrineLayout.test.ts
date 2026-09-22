import { describe, expect, it } from "vitest";
import {
  describeDoctrine,
  formatDoctrineLineTooltip,
} from "../../src/components/Overview/militaryDoctrineLayout";

describe("describeDoctrine (specs/012-firepower-tab post-ship: plain-language summary)", () => {
  it("combines a descriptor per axis past the neutral threshold, in axis order", () => {
    const text = describeDoctrine([
      { axis: "land_vs_naval", title: "Land vs. Naval", value: 80 }, // naval
      { axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", value: -60 }, // offensive
      { axis: "quality_vs_quantity", title: "Quality vs. Quantity", value: 90 }, // high-quantity
    ]);
    expect(text).toBe("Expect to fight a naval-focused, offensive and high-quantity military.");
  });

  it("drops an axis's descriptor when its score is within the neutral band (explicit user example: -25..25)", () => {
    const text = describeDoctrine([
      { axis: "land_vs_naval", title: "Land vs. Naval", value: 80 }, // naval
      { axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", value: 10 }, // neutral, dropped
      { axis: "quality_vs_quantity", title: "Quality vs. Quantity", value: 90 }, // high-quantity
    ]);
    expect(text).toBe("Expect to fight a naval-focused and high-quantity military.");
  });

  it("treats the exact ±25 boundary as still neutral (dropped)", () => {
    const text = describeDoctrine([{ axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", value: 25 }]);
    expect(text).toBe("Expect to fight a balanced, doctrine-neutral military.");
    const textNeg = describeDoctrine([{ axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", value: -25 }]);
    expect(textNeg).toBe("Expect to fight a balanced, doctrine-neutral military.");
  });

  it("picks the negative-pole descriptor below zero and the positive-pole descriptor above zero", () => {
    expect(
      describeDoctrine([{ axis: "land_vs_naval", title: "Land vs. Naval", value: -80 }]),
    ).toBe("Expect to fight a land-focused military.");
    expect(
      describeDoctrine([{ axis: "land_vs_naval", title: "Land vs. Naval", value: 80 }]),
    ).toBe("Expect to fight a naval-focused military.");
  });

  it("never fabricates a descriptor for a locked (-999 sentinel, already-null) axis", () => {
    const text = describeDoctrine([
      { axis: "land_vs_naval", title: "Land vs. Naval", value: null },
      { axis: "quality_vs_quantity", title: "Quality vs. Quantity", value: 90 },
    ]);
    expect(text).toBe("Expect to fight a high-quantity military.");
  });

  it("gives an honest balanced/neutral sentence rather than an empty one when nothing is applicable", () => {
    expect(describeDoctrine([])).toBe("Expect to fight a balanced, doctrine-neutral military.");
    expect(
      describeDoctrine([{ axis: "land_vs_naval", title: "Land vs. Naval", value: null }]),
    ).toBe("Expect to fight a balanced, doctrine-neutral military.");
  });

  it("joins exactly two descriptors with 'and', not an Oxford comma", () => {
    const text = describeDoctrine([
      { axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", value: -60 },
      { axis: "quality_vs_quantity", title: "Quality vs. Quantity", value: 90 },
    ]);
    expect(text).toBe("Expect to fight a offensive and high-quantity military.");
  });
});

describe("formatDoctrineLineTooltip (specs/012-firepower-tab post-ship)", () => {
  it("shows every axis's exact value (or 'not applicable') followed by the one-sentence doctrine description", () => {
    const text = formatDoctrineLineTooltip("Russia", "RUS", [
      { axis: "land_vs_naval", title: "Land vs. Naval", value: 62.4 },
      { axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", value: -18.9 },
      { axis: "quality_vs_quantity", title: "Quality vs. Quantity", value: null },
    ]);
    expect(text).toContain("Russia (RUS)");
    expect(text).toContain("Land vs. Naval: 62.4");
    expect(text).toContain("Offensive vs. Defensive: -18.9");
    expect(text).toContain("Quality vs. Quantity: not applicable");
    // -18.9 is within the neutral band and quality_vs_quantity is
    // inapplicable, so only the naval descriptor should appear.
    expect(text).toContain("Expect to fight a naval-focused military.");
  });
});
