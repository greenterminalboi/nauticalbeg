import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverviewCard } from "../../src/components/Overview/OverviewCard";
import type { NationOverview } from "../../src/storage/queries";

const overview: NationOverview = {
  idx: 2025,
  tag: "RUS",
  name: "Russia",
  treasury: 5493.12008,
  stability: 27.27082,
  governmentType: "monarchy",
  atWar: true,
  totalDevelopment: 28.83884,
  provinceCount: 1,
  derived: new Set(["atWar", "totalDevelopment", "provinceCount"]),
};

describe("OverviewCard", () => {
  it("renders the nation's identity, date, and all six FR-006 stats", () => {
    render(<OverviewCard overview={overview} inGameDate="1628.8.14" />);

    expect(screen.getByText("Russia")).toBeInTheDocument();
    expect(screen.getByText("1628.8.14")).toBeInTheDocument();
    expect(screen.getByText("5,493.1")).toBeInTheDocument(); // treasury
    expect(screen.getByText("27.3")).toBeInTheDocument(); // stability
    expect(screen.getByText("monarchy")).toBeInTheDocument();
    expect(screen.getByText("28.8")).toBeInTheDocument(); // totalDevelopment
    expect(screen.getByText("1")).toBeInTheDocument(); // provinceCount
    expect(screen.getByText("At War")).toBeInTheDocument();
  });

  it("marks derived stats as computed and leaves raw stats unmarked (FR-007)", () => {
    render(<OverviewCard overview={overview} inGameDate="1628.8.14" />);

    const derivedLabels = ["Total Development", "Provinces", "War Status"];
    const rawLabels = ["Treasury", "Stability", "Government"];

    for (const label of derivedLabels) {
      const dt = screen.getByText(label).closest("dt");
      expect(dt).not.toBeNull();
      expect(dt).toHaveTextContent("computed");
    }

    for (const label of rawLabels) {
      const dt = screen.getByText(label).closest("dt");
      expect(dt).not.toBeNull();
      expect(dt).not.toHaveTextContent("computed");
    }
  });

  it("shows 'At Peace' and no war marker text issue when the nation isn't at war", () => {
    render(<OverviewCard overview={{ ...overview, atWar: false }} inGameDate="1628.8.14" />);
    expect(screen.getByText("At Peace")).toBeInTheDocument();
  });
});
