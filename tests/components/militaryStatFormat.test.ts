import { describe, expect, it } from "vitest";
import {
  formatBreakdownTooltip,
  formatRegimentBreakdownTooltip,
  formatUnitTypeName,
  toRomanAge,
} from "../../src/components/Overview/militaryStatFormat";

describe("toRomanAge (specs/012-firepower-tab)", () => {
  it("renders all six age tiers as their roman numeral", () => {
    expect(toRomanAge(1)).toBe("I");
    expect(toRomanAge(2)).toBe("II");
    expect(toRomanAge(3)).toBe("III");
    expect(toRomanAge(4)).toBe("IV");
    expect(toRomanAge(5)).toBe("V");
    expect(toRomanAge(6)).toBe("VI");
  });
});

describe("formatBreakdownTooltip (specs/012-firepower-tab)", () => {
  it("lists each matched source with its kind, readable name, and signed value", () => {
    const text = formatBreakdownTooltip({
      value: 0.1,
      isPartial: true,
      breakdown: [
        { sourceKind: "reform", sourceName: "weapons_quality_standards", value: 0.05 },
        { sourceKind: "privilege", sourceName: "primacy_of_nobility", value: 0.05 },
      ],
    });
    expect(text).toContain("Reform: weapons quality standards (+0.05)");
    expect(text).toContain("Privilege: primacy of nobility (+0.05)");
    expect(text).toContain("0.10");
  });

  it("explains an empty breakdown rather than showing a bare number", () => {
    const text = formatBreakdownTooltip({ value: 0, isPartial: true, breakdown: [] });
    expect(text).toMatch(/no matching source/i);
  });
});

describe("formatUnitTypeName (specs/012-firepower-tab post-ship)", () => {
  it("strips the a_/n_ save prefix and title-cases the rest", () => {
    expect(formatUnitTypeName("a_heavy_cavalrymen")).toBe("Heavy Cavalrymen");
    expect(formatUnitTypeName("n_carrack")).toBe("Carrack");
    expect(formatUnitTypeName("a_peasant_levy")).toBe("Peasant Levy");
  });
});

describe("formatRegimentBreakdownTooltip (specs/012-firepower-tab post-ship)", () => {
  it("lists each unit type's real headcount and regiment count, flagging levy types", () => {
    const text = formatRegimentBreakdownTooltip(
      [
        { unitType: "a_pikemen", displayCategory: "Infantry", isLevy: false, regimentCount: 1, totalNumber: 40 },
        { unitType: "a_peasant_levy", displayCategory: "Infantry", isLevy: true, regimentCount: 1, totalNumber: 20 },
      ],
      "regiment",
    );
    expect(text).toContain("Pikemen: 40 (1 regiment)");
    expect(text).toContain("Peasant Levy (levy): 20 (1 regiment)");
  });

  it("pluralizes the noun for a multi-regiment type", () => {
    const text = formatRegimentBreakdownTooltip(
      [{ unitType: "n_carrack", displayCategory: "Heavies", isLevy: false, regimentCount: 3, totalNumber: 6 }],
      "ship",
    );
    expect(text).toContain("Carrack: 6 (3 ships)");
  });

  it("says plainly when there are none, rather than an empty tooltip", () => {
    expect(formatRegimentBreakdownTooltip([], "regiment")).toMatch(/no regiments/i);
  });
});
