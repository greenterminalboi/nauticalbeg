import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { HeadToHeadTable, type HeadToHeadCountry, type HeadToHeadRow } from "../../src/components/Overview/HeadToHeadTable";

const RUS: HeadToHeadCountry = { nationIdx: 2025, tag: "RUS", name: "Russia", colorRgb: [183, 136, 27] };
const PLC: HeadToHeadCountry = { nationIdx: 33556892, tag: "PLC", name: "Poland-Lithuania", colorRgb: null };

describe("HeadToHeadTable (specs/012-firepower-tab post-ship)", () => {
  it("renders both country headers and every stat row", () => {
    const rows: HeadToHeadRow[] = [
      { label: "Morale", aValue: 1.9, bValue: 1.2, aDisplay: "1.9", bDisplay: "1.2" },
    ];
    render(<HeadToHeadTable countryA={RUS} countryB={PLC} rows={rows} />);
    expect(screen.getByText("Russia (RUS)")).toBeInTheDocument();
    expect(screen.getByText("Poland-Lithuania (PLC)")).toBeInTheDocument();
    expect(screen.getByText("Morale")).toBeInTheDocument();
    expect(screen.getByText("1.9")).toBeInTheDocument();
    expect(screen.getByText("1.2")).toBeInTheDocument();
  });

  it("visually emphasizes the larger raw value, neither when either side is null", () => {
    const rows: HeadToHeadRow[] = [
      { label: "Manpower", aValue: 429.1, bValue: 100, aDisplay: "429.1", bDisplay: "100.0" },
      { label: "No data", aValue: null, bValue: 50, aDisplay: "—", bDisplay: "50.0" },
    ];
    render(<HeadToHeadTable countryA={RUS} countryB={PLC} rows={rows} />);
    const manpowerA = screen.getByText("429.1");
    const manpowerB = screen.getByText("100.0");
    expect(manpowerA.className).toContain("--larger");
    expect(manpowerB.className).not.toContain("--larger");

    const noDataA = screen.getByText("—");
    const noDataB = screen.getByText("50.0");
    expect(noDataA.className).not.toContain("--larger");
    expect(noDataB.className).not.toContain("--larger"); // null on the other side -> no comparison drawn
  });
});
