import { describe, expect, it } from "vitest";
import { buildArmyHeadToHeadRows, buildNavyHeadToHeadRows } from "../../src/components/Overview/headToHeadRows";
import type { ArmyStatsTableRow } from "../../src/components/Overview/ArmyStatsTable";
import type { NavyStatsTableRow } from "../../src/components/Overview/NavyStatsTable";
import { ZERO_UNIT_TYPE_STATS } from "../helpers/unitTypeStatsFixture";

function armyRow(overrides: Partial<ArmyStatsTableRow> = {}): ArmyStatsTableRow {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    colorRgb: [183, 136, 27],
    morale: 1.85,
    discipline: { value: 0.1, isPartial: true, breakdown: [] },
    tactics: { value: 0, isPartial: true, breakdown: [] },
    manpower: 429.1,
    regimentCount: 2,
    armyMaintenanceCost: 12.4,
    levySize: 20,
    regularsSize: 40,
    fortLimit: { value: 0.1, isPartial: true, breakdown: [] },
    siegeAbility: { value: 0, isPartial: true, breakdown: [] },
    fortDefense: { value: 0, isPartial: true, breakdown: [] },
    armyTradition: 39.44,
    ageArtillery: 1,
    ageInfantry: 4,
    ageCavalry: 1,
    ageSupply: 1,
    regimentBreakdown: [
      { unitType: "a_pikemen", displayCategory: "Infantry", isLevy: false, regimentCount: 1, totalNumber: 40, stats: ZERO_UNIT_TYPE_STATS, age: 1 },
    ],
    ...overrides,
  };
}

function navyRow(overrides: Partial<NavyStatsTableRow> = {}): NavyStatsTableRow {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    colorRgb: [183, 136, 27],
    damageGiven: null,
    damageTaken: 15,
    sailors: 2.7,
    shipLevies: 0,
    shipRegulars: 2,
    heavyShipCount: 2,
    lightShipCount: 0,
    transportCount: 0,
    galleyCount: 0,
    navyTradition: 1.0,
    ageHeavies: 1,
    ageTransports: 1,
    ageLights: 1,
    ageGalleys: 1,
    heavyShipBreakdown: [
      { unitType: "n_carrack", displayCategory: "Heavies", isLevy: false, regimentCount: 1, totalNumber: 2, stats: ZERO_UNIT_TYPE_STATS, age: 1 },
    ],
    lightShipBreakdown: [],
    transportBreakdown: [],
    galleyBreakdown: [],
    ...overrides,
  };
}

describe("buildArmyHeadToHeadRows (specs/012-firepower-tab post-ship)", () => {
  it("includes all 16 Army Stats fields (Monthly Manpower removed by explicit user request), with real breakdown tooltips on the 5 computed stats", () => {
    const a = armyRow();
    const b = armyRow({ nationIdx: 3, tag: "SCA", morale: 1.2, regimentCount: 5 });
    const rows = buildArmyHeadToHeadRows(a, b);
    expect(rows).toHaveLength(16);
    expect(rows.find((r) => r.label === "Monthly Manpower")).toBeUndefined();
    const morale = rows.find((r) => r.label === "Morale");
    expect(morale?.aDisplay).toBe("1.85");
    expect(morale?.bDisplay).toBe("1.20");
    const discipline = rows.find((r) => r.label === "Discipline");
    expect(discipline?.aTooltip).toBeDefined();
  });
});

describe("buildNavyHeadToHeadRows (specs/012-firepower-tab post-ship)", () => {
  it("includes all 14 Navy Stats fields (Monthly Sailors removed by explicit user request), with — (not 0) for a null damageGiven", () => {
    const a = navyRow();
    const b = navyRow({ nationIdx: 33556892, tag: "PLC", damageGiven: 15, damageTaken: null });
    const rows = buildNavyHeadToHeadRows(a, b);
    expect(rows).toHaveLength(14);
    expect(rows.find((r) => r.label === "Monthly Sailors")).toBeUndefined();
    const damageGiven = rows.find((r) => r.label === "Damage Given");
    expect(damageGiven?.aDisplay).toBe("—");
    expect(damageGiven?.bDisplay).toBe("15");
  });
});
