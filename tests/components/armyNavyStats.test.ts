import { describe, expect, it } from "vitest";
import {
  computeArmyStats,
  computeNavyStats,
  type NationDamageRow,
  type NationMilitaryScalars,
  type NationRegimentSummaryRow,
  type NationSocietalValueRow,
  type NationSourceRow,
} from "../../src/components/Overview/armyNavyStats";

// Real data lifted directly from tests/fixtures/rus-1628-minimal.eu5
// (nation_idx 2025 / RUS) — same values the parser/adapter tests assert
// on, so this test exercises the reduction against genuine save-shaped
// data, not synthetic placeholders.
const RUS_REGIMENTS: NationRegimentSummaryRow[] = [
  { nationIdx: 2025, unitType: "a_pikemen", regimentCount: 1, totalNumber: 40, avgMorale: 2.5 },
  { nationIdx: 2025, unitType: "a_peasant_levy", regimentCount: 1, totalNumber: 20, avgMorale: 1.2 },
];
const RUS_ADVANCES: NationSourceRow[] = [
  "fort_limit_1_advance",
  "marine_regiments",
  "military_administration",
  "naval_morale_advance_2",
  "ship_building_techniques_discovery",
  "unlock_footmen_advance",
  "unlock_pikemen_advance",
].map((sourceName) => ({ nationIdx: 2025, sourceKind: "advance" as const, sourceName }));
const RUS_GOVERNANCE: NationSourceRow[] = [
  { nationIdx: 2025, sourceKind: "reform", sourceName: "weapons_quality_standards" },
  { nationIdx: 2025, sourceKind: "privilege", sourceName: "primacy_of_nobility" },
  { nationIdx: 2025, sourceKind: "law", sourceName: "expanded_levies_policy" },
  { nationIdx: 2025, sourceKind: "law", sourceName: "navy_audits" },
];
const RUS_SOCIETAL_VALUES: NationSocietalValueRow[] = [
  { nationIdx: 2025, axis: "aristocracy_vs_plutocracy", value: 67.5 }, // not extreme (< 99)
];
const RUS_SCALARS: NationMilitaryScalars[] = [
  {
    nationIdx: 2025,
    manpower: 429.10362,
    sailors: 2.72637,
    monthlyManpower: 1.55,
    monthlySailors: 0.12,
    armyTradition: 39.43998,
    navyTradition: 1.02852,
    lastMonthsArmyMaintenance: 12.4,
    lastMonthsNavyMaintenance: 8.1,
  },
];

describe("computeArmyStats (specs/012-firepower-tab)", () => {
  it("sums only the matched modifier sources for a real country, marking every computed stat partial", () => {
    const [rus] = computeArmyStats(RUS_REGIMENTS, RUS_ADVANCES, RUS_GOVERNANCE, RUS_SOCIETAL_VALUES, RUS_SCALARS);
    expect(rus.nationIdx).toBe(2025);
    // weapons_quality_standards (reform, +0.05) + primacy_of_nobility
    // (privilege, +0.05); the societal-value discipline source
    // (aristocracy_vs_plutocracy) doesn't apply since 67.5 isn't extreme.
    expect(rus.discipline.value).toBe(0.1);
    expect(rus.discipline.breakdown.sort((a, b) => a.sourceName.localeCompare(b.sourceName))).toEqual([
      { sourceKind: "privilege", sourceName: "primacy_of_nobility", value: 0.05 },
      { sourceKind: "reform", sourceName: "weapons_quality_standards", value: 0.05 },
    ]);
    // fort_limit_1_advance is the only matching fort_limit_modifier
    // source in this data.
    expect(rus.fortLimit.value).toBe(0.1);
    expect(rus.fortLimit.breakdown).toEqual([
      { sourceKind: "advance", sourceName: "fort_limit_1_advance", value: 0.1 },
    ]);
    // No matching sources at all for tactics/siege_ability/global_defensive
    // in this data — still a real 0, marked partial, never omitted, and
    // an empty breakdown (not fabricated entries).
    expect(rus.tactics).toEqual({ value: 0, isPartial: true, breakdown: [] });
    expect(rus.siegeAbility).toEqual({ value: 0, isPartial: true, breakdown: [] });
    expect(rus.fortDefense).toEqual({ value: 0, isPartial: true, breakdown: [] });
  });

  it("computes real morale/manpower/levy-regulars figures from regiment and scalar data", () => {
    const [rus] = computeArmyStats(RUS_REGIMENTS, RUS_ADVANCES, RUS_GOVERNANCE, RUS_SOCIETAL_VALUES, RUS_SCALARS);
    expect(rus.regimentCount).toBe(2);
    // (2.5*1 + 1.2*1) / 2
    expect(rus.morale).toBeCloseTo(1.85, 5);
    expect(rus.regularsSize).toBe(40); // a_pikemen, not levy
    expect(rus.levySize).toBe(20); // a_peasant_levy
    expect(rus.manpower).toBeCloseTo(429.10362, 5);
    expect(rus.armyMaintenanceCost).toBe(12.4);
    expect(rus.armyTradition).toBeCloseTo(39.43998, 5);
  });

  it("computes the unlocked (not merely fielded) age per category, defaulting to age 1 when nothing is advance-gated", () => {
    const [rus] = computeArmyStats(RUS_REGIMENTS, RUS_ADVANCES, RUS_GOVERNANCE, RUS_SOCIETAL_VALUES, RUS_SCALARS);
    // unlock_footmen_advance (a_footmen, age 1) + unlock_pikemen_advance
    // (a_pikemen, age 4) are both researched — the higher wins, and this
    // is "unlocked," not merely "fielded": the country's actual fielded
    // regiments are a_pikemen/a_peasant_levy, not a_footmen, yet
    // a_footmen's unlock still counts.
    expect(rus.ageInfantry).toBe(4);
    // No Cavalry/Artillery/Supply unlock advances are researched in this
    // data — default baseline age 1 (documented assumption).
    expect(rus.ageCavalry).toBe(1);
    expect(rus.ageArtillery).toBe(1);
    expect(rus.ageSupply).toBe(1);
  });

  it("omits a nation with zero army regiments entirely, never a fabricated zeroed row (spec FR-012)", () => {
    const results = computeArmyStats(
      // navy-only (n_-prefixed) — filtered out before classification, so
      // this nation has zero *army* regiments even though this row exists.
      [{ nationIdx: 2025, unitType: "n_carrack", regimentCount: 1, totalNumber: 2, avgMorale: 3.1 }],
      [],
      [],
      [],
      [],
    );
    expect(results).toEqual([]);
  });

  it("excludes an unresolved unit_type's regiments from the country entirely rather than crashing", () => {
    const results = computeArmyStats(
      [{ nationIdx: 2025, unitType: "a_totally_unknown_future_unit", regimentCount: 3, totalNumber: 60, avgMorale: 2 }],
      [],
      [],
      [],
      [],
    );
    // Unresolved -> classification collapses to zero regiments -> omitted.
    expect(results).toEqual([]);
  });
});

describe("computeNavyStats (specs/012-firepower-tab)", () => {
  const RUS_NAVY_REGIMENTS: NationRegimentSummaryRow[] = [
    { nationIdx: 2025, unitType: "n_carrack", regimentCount: 1, totalNumber: 2, avgMorale: 3.1 },
  ];
  const RUS_DAMAGE: NationDamageRow[] = [{ nationIdx: 2025, direction: "taken", totalDamage: 15 }];

  it("filters to navy-only rows, ignoring an army regiment for the same nation", () => {
    const mixedRows: NationRegimentSummaryRow[] = [
      ...RUS_NAVY_REGIMENTS,
      { nationIdx: 2025, unitType: "a_pikemen", regimentCount: 1, totalNumber: 40, avgMorale: 2.5 },
    ];
    const [rus] = computeNavyStats(mixedRows, [], RUS_SCALARS, RUS_DAMAGE);
    expect(rus.heavyShipCount).toBe(2); // n_carrack's totalNumber (ship count), not regiment rows
    expect(rus.shipRegulars).toBe(2);
    expect(rus.shipLevies).toBe(0);
  });

  it("reports damageTaken/damageGiven from listNavyDamageArrow's rows, null when absent (not a fabricated 0)", () => {
    const [rus] = computeNavyStats(RUS_NAVY_REGIMENTS, [], RUS_SCALARS, RUS_DAMAGE);
    expect(rus.damageTaken).toBe(15);
    expect(rus.damageGiven).toBeNull();
  });

  it("computes navy age columns from unlocked advances, never depending on Army Stats' governance tables", () => {
    const [rus] = computeNavyStats(RUS_NAVY_REGIMENTS, [], RUS_SCALARS, RUS_DAMAGE);
    // None of RUS's fixture-derived advances unlock a ship type ->
    // default baseline age 1 for every navy category.
    expect(rus.ageHeavies).toBe(1);
    expect(rus.ageTransports).toBe(1);
    expect(rus.ageLights).toBe(1);
    expect(rus.ageGalleys).toBe(1);
  });

  it("omits a nation with zero navy regiments entirely (spec FR-012)", () => {
    const results = computeNavyStats(
      [{ nationIdx: 2025, unitType: "a_pikemen", regimentCount: 1, totalNumber: 40, avgMorale: 2.5 }],
      [],
      [],
      [],
    );
    expect(results).toEqual([]);
  });
});
