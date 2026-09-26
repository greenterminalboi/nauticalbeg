import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NavyCompositionView } from "../../src/components/Overview/NavyCompositionView";
import type { NavyProfile } from "../../src/components/Overview/firepowerData";
import type { RegimentBreakdownEntry } from "../../src/components/Overview/militaryStatFormat";

function ship(unitType: string, displayCategory: string, totalNumber: number): RegimentBreakdownEntry {
  return {
    unitType,
    displayCategory,
    isLevy: false,
    regimentCount: 1,
    totalNumber,
    age: 2,
    stats: {} as RegimentBreakdownEntry["stats"],
  } as RegimentBreakdownEntry;
}

function profile(overrides: Partial<NavyProfile> = {}): NavyProfile {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    colorRgb: [183, 136, 27],
    damageGiven: 120,
    damageTaken: 45,
    sailors: 2.72637,
    shipLevies: 0,
    shipRegulars: 3,
    heavyShipCount: 2,
    lightShipCount: 1,
    transportCount: 0,
    galleyCount: 0,
    navyTradition: 1.02852,
    ageHeavies: 2,
    ageTransports: 1,
    ageLights: 2,
    ageGalleys: 1,
    heavyShipBreakdown: [ship("n_carrack", "Heavies", 2)],
    lightShipBreakdown: [ship("n_caravel", "Lights", 1)],
    transportBreakdown: [],
    galleyBreakdown: [],
    ...overrides,
  };
}

describe("NavyCompositionView (specs/018 FR-019)", () => {
  it("groups the nation's ships by class, with each ship type listed", () => {
    render(<NavyCompositionView row={profile()} />);
    const classes = screen.getByRole("region", { name: "Fleet" });
    expect(within(classes).getByText("Heavy Ships").closest("div")).toHaveTextContent("2");
    expect(within(classes).getByText("Light Ships").closest("div")).toHaveTextContent("1");
    expect(within(classes).getByText("Galleys").closest("div")).toHaveTextContent("0");

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/Carrack.*Heavies/);
    expect(rows[1]).toMatch(/Caravel.*Lights/);
  });

  it("says so when the nation has no ships", () => {
    render(<NavyCompositionView row={null} />);
    expect(screen.getByText("This nation has no ships.")).toBeInTheDocument();
  });
});
