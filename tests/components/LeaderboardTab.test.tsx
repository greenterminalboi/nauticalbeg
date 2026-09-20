import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { LeaderboardTab } from "../../src/components/Overview/LeaderboardTab";
import { LeaderboardSideNav } from "../../src/components/Overview/LeaderboardSideNav";
import * as leaderboardData from "../../src/components/Overview/leaderboardData";
import type {
  LeaderboardCountry,
  LeaderboardMetric,
} from "../../src/components/Overview/leaderboardData";
import type { SaveDatabase } from "../../src/storage/db";

// Mirrors how FileLoader.tsx actually composes these two: `activeMetric`
// lives in the shell (here, a tiny local wrapper), LeaderboardSideNav
// renders in the shell's `sidenav` grid area, LeaderboardTab just
// receives the current value as a prop.
function LeaderboardWithNav({ db }: { db: SaveDatabase }) {
  const [activeMetric, setActiveMetric] = useState<LeaderboardMetric>("population");
  return (
    <>
      <LeaderboardSideNav activeMetric={activeMetric} onSelectMetric={setActiveMetric} />
      <LeaderboardTab db={db} activeMetric={activeMetric} />
    </>
  );
}

const fakeDb = {} as SaveDatabase;

function makeCountries(overrides: Partial<LeaderboardCountry>[]): LeaderboardCountry[] {
  return overrides.map((o, i) => ({
    idx: i + 1,
    tag: `T${i + 1}`,
    name: null,
    color: null,
    isHumanPlayed: false,
    ...o,
  }));
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Always mocked by default (Treemap's data source, loaded regardless
  // of which view is active) — individual tests override as needed.
  vi.spyOn(leaderboardData, "loadLatestNationMetric").mockResolvedValue(new Map());
});

describe("LeaderboardTab", () => {
  it("defaults selection to every human-played country (spec FR-008)", async () => {
    const countries = makeCountries([
      { idx: 1, tag: "RUS", isHumanPlayed: true },
      { idx: 2, tag: "SCA", isHumanPlayed: true },
      { idx: 3, tag: "FRA", isHumanPlayed: false },
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(countries);
    vi.spyOn(leaderboardData, "loadNationHistory").mockResolvedValue(new Map());

    render(<LeaderboardTab db={fakeDb} activeMetric="population" />);

    await waitFor(() =>
      expect(leaderboardData.loadNationHistory).toHaveBeenCalledWith(fakeDb, [1, 2]),
    );

    // Open the search overlay to inspect selection state: every human-
    // played country's checkbox is checked, the non-human-played one is
    // not.
    fireEvent.click(screen.getByRole("button", { name: "Search countries" }));
    expect((screen.getByLabelText("RUS") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("SCA") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("FRA") as HTMLInputElement).checked).toBe(false);
  });

  it("falls back to a non-empty default when no country is human-played (spec FR-008)", async () => {
    const countries = makeCountries([
      { idx: 1, tag: "RUS", isHumanPlayed: false },
      { idx: 2, tag: "SCA", isHumanPlayed: false },
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(countries);
    vi.spyOn(leaderboardData, "loadNationHistory").mockResolvedValue(new Map());

    render(<LeaderboardTab db={fakeDb} activeMetric="population" />);

    await waitFor(() => expect(leaderboardData.loadNationHistory).toHaveBeenCalled());
    const [, calledIdxs] = vi.mocked(leaderboardData.loadNationHistory).mock.calls[0];
    expect(calledIdxs.length).toBeGreaterThan(0);
  });

  it("toggling a country via the search overlay adds it to the shared selection (spec FR-004, FR-006)", async () => {
    const countries = makeCountries([
      { idx: 1, tag: "RUS", isHumanPlayed: true },
      { idx: 2, tag: "FRA", isHumanPlayed: false },
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(countries);
    vi.spyOn(leaderboardData, "loadNationHistory").mockResolvedValue(new Map());

    render(<LeaderboardTab db={fakeDb} activeMetric="population" />);
    await waitFor(() =>
      expect(leaderboardData.loadNationHistory).toHaveBeenCalledWith(fakeDb, [1]),
    );

    fireEvent.click(screen.getByRole("button", { name: "Search countries" }));
    fireEvent.click(screen.getByLabelText("FRA"));

    await waitFor(() =>
      expect(leaderboardData.loadNationHistory).toHaveBeenLastCalledWith(fakeDb, [1, 2]),
    );
  });

  it("defaults to the Graph view, and switching pages via the side nav updates it", async () => {
    const countries = makeCountries([{ idx: 1, tag: "RUS", isHumanPlayed: true }]);
    const history = new Map([
      [
        1,
        new Map([
          ["population", [{ year: 1400, value: 5 }]],
          ["economical_base", [{ year: 1400, value: 10 }]],
          ["tax_base", [{ year: 1400, value: 99 }]],
        ]),
      ],
    ]) as Awaited<ReturnType<typeof leaderboardData.loadNationHistory>>;
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(countries);
    vi.spyOn(leaderboardData, "loadNationHistory").mockResolvedValue(history);

    const { container } = render(<LeaderboardWithNav db={fakeDb} />);
    // Graph is the default view (no Ranking/Treemap click needed).
    await waitFor(() => expect(container.querySelector(".leaderboard-chart__svg")).toBeTruthy());
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    // Side nav lists all three metrics.
    expect(screen.getByRole("button", { name: "Population" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Economic Base" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tax Base" })).toBeInTheDocument();

    // Switch to the Ranking view to inspect values via visible text
    // (the chart no longer carries per-point <title> elements for
    // performance — see LeaderboardChart.tsx's handleMouseMove doc
    // comment — so the ranking table is the reliable way to assert
    // "which metric is currently showing").
    fireEvent.click(screen.getByRole("button", { name: "Ranking" }));
    const populationTable = await screen.findByRole("table", { name: "Population ranking" });
    expect(populationTable).toHaveTextContent("5.00");

    // Switching metric via the side nav updates the still-active Ranking view.
    fireEvent.click(screen.getByRole("button", { name: "Economic Base" }));
    const economicBaseTable = await screen.findByRole("table", { name: "Economic Base ranking" });
    expect(economicBaseTable).toHaveTextContent("10.0");
    expect(screen.queryByRole("table", { name: "Population ranking" })).not.toBeInTheDocument();
  });

  it("Treemap view shows one box per selected country plus a grey Other box summing every unselected real country's latest value", async () => {
    const countries = makeCountries([
      { idx: 1, tag: "RUS", color: [183, 136, 27], isHumanPlayed: true },
      { idx: 2, tag: "FRA", color: [10, 20, 30], isHumanPlayed: false },
      { idx: 3, tag: "SCA", color: [1, 2, 3], isHumanPlayed: false },
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(countries);
    vi.spyOn(leaderboardData, "loadNationHistory").mockResolvedValue(new Map());
    // RUS is selected (is_human_played); FRA and SCA are not — their
    // latest values (7 + 3 = 10) must combine into one "Other" box.
    vi.spyOn(leaderboardData, "loadLatestNationMetric").mockResolvedValue(
      new Map([
        [1, 40],
        [2, 7],
        [3, 3],
      ]),
    );

    const { container } = render(<LeaderboardTab db={fakeDb} activeMetric="population" />);
    fireEvent.click(await screen.findByRole("button", { name: "Treemap" }));

    await waitFor(() =>
      expect(container.querySelectorAll(".leaderboard-treemap__box")).toHaveLength(2),
    );
    const boxes = Array.from(container.querySelectorAll(".leaderboard-treemap__box"));
    const fills = boxes.map((b) => b.getAttribute("fill"));
    expect(fills).toContain("rgb(183, 136, 27)"); // RUS, its real color
    expect(fills).toContain("rgb(200, 200, 200)"); // Other, neutral grey

    // RUS's box (value 40) is exactly 4x Other's box (value 10) in area.
    const areaOf = (fill: string) => {
      const b = boxes.find((box) => box.getAttribute("fill") === fill)!;
      return Number(b.getAttribute("width")) * Number(b.getAttribute("height"));
    };
    expect(areaOf("rgb(183, 136, 27)")).toBeCloseTo(4 * areaOf("rgb(200, 200, 200)"), 1);
  });
});
