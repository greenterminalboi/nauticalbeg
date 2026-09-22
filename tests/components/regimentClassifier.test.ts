import { describe, expect, it } from "vitest";
import { classifyRegiments } from "../../src/components/Overview/regimentClassifier";
import type { UnitTypeReferenceEntry, UnitTypeStats } from "../../src/components/Overview/unitTypeReference";

const STATS: UnitTypeStats = {
  maxStrength: 0,
  combatPower: 0,
  frontage: 0,
  combatSpeed: 0,
  initiative: 0,
  flankingAbility: 0,
  secureFlanksDefense: 0,
  moraleDamageTaken: 0,
  strengthDamageTaken: 0,
  moraleDamageDone: 0,
  strengthDamageDone: 0,
  foodStoragePerStrength: 0,
  foodConsumptionPerStrength: 0,
  movementSpeed: 0,
  unitWeight: 0,
  artilleryBarrage: 0,
};

const REFERENCE: Record<string, UnitTypeReferenceEntry> = {
  a_pikemen: { category: "army_heavy_infantry", displayCategory: "Infantry", age: 3, isLevy: false, stats: STATS },
  a_peasant_levy: { category: "army_light_infantry", displayCategory: "Infantry", age: 1, isLevy: true, stats: STATS },
  n_carrack: { category: "navy_heavy_ship", displayCategory: "Heavies", age: 3, isLevy: false, stats: STATS },
  n_galiot: { category: "navy_galley", displayCategory: "Galleys", age: 2, isLevy: false, stats: STATS },
};

describe("classifyRegiments (specs/012-firepower-tab)", () => {
  it("splits levy vs. regulars by the reference's isLevy flag and count-weights morale", () => {
    const result = classifyRegiments(
      [
        { unitType: "a_pikemen", regimentCount: 2, totalNumber: 40, avgMorale: 3 },
        { unitType: "a_peasant_levy", regimentCount: 1, totalNumber: 20, avgMorale: 1 },
      ],
      REFERENCE,
    );
    expect(result.totalRegimentCount).toBe(3);
    expect(result.totalNumber).toBe(60);
    // (3*2 + 1*1) / (2+1) = 7/3
    expect(result.weightedMorale).toBeCloseTo(7 / 3, 5);
    expect(result.regularsNumber).toBe(40);
    expect(result.levyNumber).toBe(20);
    expect(result.byCategory).toEqual({
      Infantry: { regimentCount: 3, totalNumber: 60 },
    });
  });

  it("buckets navy ships into their display category for per-class counts", () => {
    const result = classifyRegiments(
      [
        { unitType: "n_carrack", regimentCount: 1, totalNumber: 2, avgMorale: 3.1 },
        { unitType: "n_galiot", regimentCount: 1, totalNumber: 4, avgMorale: 2.1 },
      ],
      REFERENCE,
    );
    expect(result.byCategory).toEqual({
      Heavies: { regimentCount: 1, totalNumber: 2 },
      Galleys: { regimentCount: 1, totalNumber: 4 },
    });
  });

  it("excludes an unresolved unit_type from every total but reports it, never crashes or miscounts", () => {
    const result = classifyRegiments(
      [{ unitType: "a_some_future_unit", regimentCount: 5, totalNumber: 100, avgMorale: 2 }],
      REFERENCE,
    );
    expect(result.totalRegimentCount).toBe(0);
    expect(result.totalNumber).toBe(0);
    expect(result.weightedMorale).toBeNull();
    expect(result.unresolvedUnitTypes).toEqual(["a_some_future_unit"]);
  });

  it("returns a null weightedMorale rather than a fabricated 0 when there are no regiments", () => {
    const result = classifyRegiments([], REFERENCE);
    expect(result.weightedMorale).toBeNull();
    expect(result.totalRegimentCount).toBe(0);
  });

  it("byUnitType keeps each raw unit_type's own totals, sorted by size descending, for a composition breakdown", () => {
    const result = classifyRegiments(
      [
        { unitType: "a_peasant_levy", regimentCount: 1, totalNumber: 20, avgMorale: 1 },
        { unitType: "a_pikemen", regimentCount: 2, totalNumber: 40, avgMorale: 3 },
      ],
      REFERENCE,
    );
    expect(result.byUnitType).toEqual([
      { unitType: "a_pikemen", displayCategory: "Infantry", isLevy: false, regimentCount: 2, totalNumber: 40, stats: STATS, age: 3 },
      { unitType: "a_peasant_levy", displayCategory: "Infantry", isLevy: true, regimentCount: 1, totalNumber: 20, stats: STATS, age: 1 },
    ]);
  });
});
