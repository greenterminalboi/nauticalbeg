import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ArmyStatsTable, type ArmyStatsTableRow } from "../../src/components/Overview/ArmyStatsTable";
import { ZERO_UNIT_TYPE_STATS } from "../helpers/unitTypeStatsFixture";

function row(overrides: Partial<ArmyStatsTableRow> = {}): ArmyStatsTableRow {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    colorRgb: [183, 136, 27],
    morale: 1.85,
    discipline: {
      value: 0.1,
      isPartial: true,
      breakdown: [
        { sourceKind: "reform", sourceName: "weapons_quality_standards", value: 0.05 },
        { sourceKind: "privilege", sourceName: "primacy_of_nobility", value: 0.05 },
      ],
    },
    tactics: { value: 0, isPartial: true, breakdown: [] },
    manpower: 429.1,
    regimentCount: 2,
    armyMaintenanceCost: 12.4,
    levySize: 20,
    regularsSize: 40,
    fortLimit: {
      value: 0.1,
      isPartial: true,
      breakdown: [{ sourceKind: "advance", sourceName: "fort_limit_1_advance", value: 0.1 }],
    },
    siegeAbility: { value: 0, isPartial: true, breakdown: [] },
    fortDefense: { value: 0, isPartial: true, breakdown: [] },
    armyTradition: 39.44,
    ageArtillery: 1,
    ageInfantry: 4,
    ageCavalry: 1,
    ageSupply: 1,
    regimentBreakdown: [
      { unitType: "a_pikemen", displayCategory: "Infantry", isLevy: false, regimentCount: 1, totalNumber: 40, stats: ZERO_UNIT_TYPE_STATS, age: 1 },
      { unitType: "a_peasant_levy", displayCategory: "Infantry", isLevy: true, regimentCount: 1, totalNumber: 20, stats: ZERO_UNIT_TYPE_STATS, age: 1 },
    ],
    ...overrides,
  };
}

describe("ArmyStatsTable (specs/012-firepower-tab)", () => {
  it("renders one row per country with its real stats and roman-numeral ages", () => {
    render(<ArmyStatsTable rows={[row()]} />);
    expect(screen.getByText("Russia (RUS)")).toBeInTheDocument();
    expect(screen.getByText("1.9")).toBeInTheDocument(); // morale, formatted to 1 decimal
    expect(screen.getByText("IV")).toBeInTheDocument(); // ageInfantry
    expect(screen.getAllByText("I")).toHaveLength(3); // ageArtillery/ageCavalry/ageSupply
  });

  it("marks the five computed stats as partial totals with a visible marker, not color alone", () => {
    render(<ArmyStatsTable rows={[row()]} />);
    expect(screen.getAllByText("*")).toHaveLength(5);
    expect(screen.getByText(/Partial total/)).toBeInTheDocument();
  });

  it("shows an instant hover popover with the source breakdown on mouseenter (not a native title, which was reported as not showing anything)", () => {
    const { container } = render(<ArmyStatsTable rows={[row()]} />);
    expect(container.querySelector(".hover-tooltip")).not.toBeInTheDocument();

    const disciplineTrigger = container.querySelectorAll(".army-stats-table__value--hoverable")[0];
    fireEvent.mouseEnter(disciplineTrigger);
    const tooltip = container.querySelector(".hover-tooltip");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip?.textContent).toContain("weapons quality standards");
    expect(tooltip?.textContent).toContain("primacy of nobility");

    fireEvent.mouseLeave(disciplineTrigger);
    expect(container.querySelector(".hover-tooltip")).not.toBeInTheDocument();
  });

  it("decomposes the Regiments count on hover into its real unit-type breakdown", () => {
    const { container } = render(<ArmyStatsTable rows={[row()]} />);
    // DOM order: Discipline, Tactics, Regiments, Fort Limit, Siege
    // Ability, Fort Defense are the 6 hoverable cells; Regiments is 3rd.
    const regimentsTrigger = container.querySelectorAll(".army-stats-table__value--hoverable")[2];
    fireEvent.mouseEnter(regimentsTrigger);
    const tooltip = container.querySelector(".hover-tooltip");
    expect(tooltip?.textContent).toContain("Pikemen: 40 (1 regiment)");
    expect(tooltip?.textContent).toContain("Peasant Levy (levy): 20 (1 regiment)");
  });

  it("sorts by a clicked column, both directions, with every header a real clickable button (post-ship, explicit user request)", () => {
    const rus = row({ nationIdx: 2025, tag: "RUS", morale: 1.85 });
    const sca = row({ nationIdx: 3, tag: "SCA", morale: 5.2 });
    render(<ArmyStatsTable rows={[rus, sca]} />);

    function countryOrder(): string[] {
      return screen.getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    }
    // Original order: RUS first.
    expect(countryOrder()[0]).toContain("RUS");

    const moraleHeader = screen.getByRole("button", { name: /Morale/ });
    fireEvent.click(moraleHeader);
    expect(countryOrder()[0]).toContain("RUS"); // 1.85 < 5.2, ascending

    fireEvent.click(moraleHeader);
    expect(countryOrder()[0]).toContain("SCA"); // descending now
  });
});
