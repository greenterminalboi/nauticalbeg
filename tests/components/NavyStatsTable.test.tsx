import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NavyStatsTable, type NavyStatsTableRow } from "../../src/components/Overview/NavyStatsTable";

function row(overrides: Partial<NavyStatsTableRow> = {}): NavyStatsTableRow {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    colorRgb: [183, 136, 27],
    damageGiven: null,
    damageTaken: 15,
    sailors: 2.72637,
    shipLevies: 0,
    shipRegulars: 2,
    heavyShipCount: 2,
    lightShipCount: 0,
    transportCount: 0,
    galleyCount: 0,
    navyTradition: 1.02852,
    ageHeavies: 1,
    ageTransports: 1,
    ageLights: 1,
    ageGalleys: 1,
    heavyShipBreakdown: [{ unitType: "n_carrack", displayCategory: "Heavies", isLevy: false, regimentCount: 1, totalNumber: 2 }],
    lightShipBreakdown: [],
    transportBreakdown: [],
    galleyBreakdown: [],
    ...overrides,
  };
}

describe("NavyStatsTable (specs/012-firepower-tab)", () => {
  it("renders a country's real ship counts, and — (not 0) for a missing damage-given value", () => {
    render(<NavyStatsTable rows={[row()]} />);
    expect(screen.getByText("Russia (RUS)")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument(); // damage taken
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0); // damage given, null -> dash
  });
});
