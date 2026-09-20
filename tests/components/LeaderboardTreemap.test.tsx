import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LeaderboardTreemap, type LeaderboardTreemapEntry } from "../../src/components/Overview/LeaderboardTreemap";

describe("LeaderboardTreemap", () => {
  it("renders one box per entry, sized by value, with real colors and the Other bucket's own grey", () => {
    const entries: LeaderboardTreemapEntry[] = [
      { id: 1, label: "RUS", color: [183, 136, 27], value: 60 },
      { id: 2, label: "SCA", color: [10, 20, 30], value: 30 },
      { id: "other", label: "Other", color: [200, 200, 200], value: 10 },
    ];
    const { container } = render(<LeaderboardTreemap title="Population" entries={entries} />);

    const boxes = container.querySelectorAll(".leaderboard-treemap__box");
    expect(boxes).toHaveLength(3);

    const fills = Array.from(boxes).map((b) => b.getAttribute("fill"));
    expect(fills).toContain("rgb(183, 136, 27)");
    expect(fills).toContain("rgb(10, 20, 30)");
    expect(fills).toContain("rgb(200, 200, 200)");

    // Areas proportional to value: RUS (60) has twice SCA's (30) area.
    const areaOf = (fill: string) => {
      const box = Array.from(boxes).find((b) => b.getAttribute("fill") === fill)!;
      return Number(box.getAttribute("width")) * Number(box.getAttribute("height"));
    };
    expect(areaOf("rgb(183, 136, 27)")).toBeCloseTo(2 * areaOf("rgb(10, 20, 30)"), 1);
  });

  it("falls back to the neutral color for an entry with no confirmed color, never a fabricated one", () => {
    const entries: LeaderboardTreemapEntry[] = [{ id: 1, label: "SCA", color: null, value: 10 }];
    const { container } = render(<LeaderboardTreemap title="Population" entries={entries} />);
    const box = container.querySelector(".leaderboard-treemap__box")!;
    expect(box.getAttribute("fill")).toBe("rgb(200, 200, 200)");
  });

  it("shows a no-data message instead of an empty box when every entry has zero/negative value", () => {
    render(<LeaderboardTreemap title="Population" entries={[{ id: 1, label: "RUS", color: null, value: 0 }]} />);
    expect(screen.getByText(/No data available/)).toBeInTheDocument();
  });

  it("shows a hover tooltip with the country, value, and its share of the total — not just the native title", () => {
    const entries: LeaderboardTreemapEntry[] = [
      { id: 1, label: "RUS", color: [183, 136, 27], value: 75 },
      { id: 2, label: "SCA", color: [10, 20, 30], value: 25 },
    ];
    const { container } = render(<LeaderboardTreemap title="Population" entries={entries} />);

    expect(container.querySelector(".leaderboard-treemap__tooltip")).toBeNull();

    const rusBox = Array.from(container.querySelectorAll(".leaderboard-treemap__box")).find(
      (b) => b.getAttribute("fill") === "rgb(183, 136, 27)",
    )!;
    fireEvent.mouseEnter(rusBox.closest("g")!);

    const tooltip = container.querySelector(".leaderboard-treemap__tooltip");
    expect(tooltip).toBeTruthy();
    expect(tooltip!.textContent).toContain("RUS");
    expect(tooltip!.textContent).toContain("75");
    expect(tooltip!.textContent).toContain("75.0%"); // 75 / (75 + 25) of total

    fireEvent.mouseLeave(rusBox.closest("g")!);
    expect(container.querySelector(".leaderboard-treemap__tooltip")).toBeNull();
  });
});
