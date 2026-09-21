import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { RulerHistoryChart } from "../../src/components/Overview/RulerHistoryChart";
import { LeaderboardChart } from "../../src/components/Overview/LeaderboardChart";
import { LeaderboardRankingTable } from "../../src/components/Overview/LeaderboardRankingTable";
import * as leaderboardData from "../../src/components/Overview/leaderboardData";
import * as queries from "../../src/storage/queries";
import type { SaveDatabase } from "../../src/storage/db";
import type { LeaderboardCountry, RulerHistoryPoint } from "../../src/components/Overview/leaderboardData";

vi.mock("../../src/components/Overview/LeaderboardChart", async () => {
  const actual = await vi.importActual<typeof import("../../src/components/Overview/LeaderboardChart")>(
    "../../src/components/Overview/LeaderboardChart",
  );
  return { ...actual, LeaderboardChart: vi.fn(() => <div data-testid="leaderboard-chart" />) };
});
vi.mock("../../src/components/Overview/LeaderboardRankingTable", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/components/Overview/LeaderboardRankingTable")
  >("../../src/components/Overview/LeaderboardRankingTable");
  return { ...actual, LeaderboardRankingTable: vi.fn(() => <div data-testid="ranking-table" />) };
});

const fakeDb = {} as SaveDatabase;

function country(idx: number, tag: string, isHumanPlayed: boolean): LeaderboardCountry {
  return { idx, tag, name: null, color: null, isHumanPlayed };
}

function point(
  year: number,
  score: number,
  overrides: Partial<RulerHistoryPoint> = {},
): RulerHistoryPoint {
  return {
    year,
    regnalNumber: 1,
    firstNameKey: null,
    nickname: null,
    adm: score / 3,
    dip: score / 3,
    mil: score / 3,
    score,
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(LeaderboardChart).mockClear();
  vi.mocked(LeaderboardRankingTable).mockClear();
  vi.spyOn(queries, "getSaveMeta").mockResolvedValue({
    filename: "test.eu5",
    detectedVersion: "1.3.11",
    inGameDate: "1450.1.1",
    kept: false,
  });
});

describe("RulerHistoryChart", () => {
  it("defaults selection to every human-played country, like LeaderboardTab's own graph (spec FR-008)", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", true),
      country(2, "FRA", false),
    ]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([
        [1, [point(1337, 190)]],
        [2, [point(1337, 250)]],
      ]),
    );

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() =>
      expect(leaderboardData.loadRulerHistory).toHaveBeenCalledWith(fakeDb, [1]),
    );
    const props = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0];
    expect(props.series).toHaveLength(1);
    expect(props.series[0]).toMatchObject({ nationIdx: 1, label: "RUS" });
  });

  it("falls back to a non-empty default when no country is human-played (spec FR-008)", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", false),
      country(2, "FRA", false),
    ]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(new Map());

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(leaderboardData.loadRulerHistory).toHaveBeenCalled());
    const [, calledIdxs] = vi.mocked(leaderboardData.loadRulerHistory).mock.calls[0];
    expect(calledIdxs.length).toBeGreaterThan(0);
  });

  it("adding a country via the standard search input refetches its ruler history and adds it to the selection", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", true),
      country(2, "FRA", false),
    ]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([
        [1, [point(1337, 190)]],
        [2, [point(1337, 250)]],
      ]),
    );

    render(<RulerHistoryChart db={fakeDb} />);
    await waitFor(() =>
      expect(leaderboardData.loadRulerHistory).toHaveBeenCalledWith(fakeDb, [1]),
    );

    fireEvent.focus(screen.getByPlaceholderText("Search countries…"));
    fireEvent.click(screen.getByRole("checkbox", { name: "FRA" }));

    await waitFor(() =>
      expect(leaderboardData.loadRulerHistory).toHaveBeenLastCalledWith(fakeDb, [1, 2]),
    );
    const series = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0].series;
    expect(series.map((s) => s.nationIdx).sort()).toEqual([1, 2]);
  });

  it("removing a country via the standard search input drops it from the selection and its series", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", true),
      country(2, "SCA", true),
    ]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([
        [1, [point(1337, 190)]],
        [2, [point(1337, 250)]],
      ]),
    );

    render(<RulerHistoryChart db={fakeDb} />);
    await waitFor(() =>
      expect(leaderboardData.loadRulerHistory).toHaveBeenCalledWith(fakeDb, [1, 2]),
    );

    fireEvent.focus(screen.getByPlaceholderText("Search countries…"));
    fireEvent.click(screen.getByRole("checkbox", { name: "SCA" }));

    await waitFor(() =>
      expect(leaderboardData.loadRulerHistory).toHaveBeenLastCalledWith(fakeDb, [1]),
    );
    const series = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0].series;
    expect(series.some((s) => s.nationIdx === 2)).toBe(false);
  });

  it("passes step, a fixed 0-300 y-axis range, and a fixed [1337, current year] x-axis range to LeaderboardChart", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([country(1, "RUS", true)]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([[1, [point(1337, 190)]]]),
    );
    // getSaveMeta mocked to 1450.1.1 in beforeEach -> ceil(~1450.0) = 1450.

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());
    const props = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0];
    expect(props.step).toBe(true);
    expect(props.yAxisRange).toEqual([0, 300]);
    expect(props.xAxisRange).toEqual([1337, 1450]);
  });

  it("the x-axis range stays [1337, current year] regardless of which countries are selected (deadset, not auto-scaled)", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", true),
      country(2, "FRA", false),
    ]);
    // RUS's earliest reign is 1500, well after 1337 -- the x-axis must
    // still start at 1337, not auto-scale up to 1500.
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([[1, [point(1500, 190)]]]),
    );

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());
    expect(vi.mocked(LeaderboardChart).mock.calls.at(-1)![0].xAxisRange).toEqual([1337, 1450]);
  });

  it("extends the last ruler's score to the save's current date, past their own reign-start point", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([country(1, "RUS", true)]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([[1, [point(1337, 190), point(1400, 90)]]]),
    );
    // getSaveMeta mocked to 1450.1.1 in beforeEach.

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());
    const points = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0].series[0].points;
    expect(points).toHaveLength(3);
    expect(points[2]).toEqual({ year: 1450, value: 90 });
  });

  it("a selected country with no scored ruler terms at all is simply absent from series, never a fabricated one", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", true),
      country(2, "SCA", true),
    ]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(new Map([[1, [point(1337, 190)]]]));

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());
    const series = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0].series;
    expect(series).toHaveLength(1);
    expect(series.some((s) => s.nationIdx === 2)).toBe(false);
  });

  it("the tooltip formatter looks up the ruler actually reigning at the hovered x (step value), resolves their real name, and falls back to a regnal label for an unresolvable key", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([country(1, "RUS", true)]);
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([
        [
          1,
          [
            // name_birger is a real key in the generated rulerNames.json
            // (confirmed against the game's own install: "Birger").
            point(1337, 190, { regnalNumber: 7, firstNameKey: "name_birger", nickname: null }),
            point(1400, 90, { regnalNumber: 1, firstNameKey: "name_not_a_real_key", nickname: "Ladulas" }),
          ],
        ],
      ]),
    );

    render(<RulerHistoryChart db={fakeDb} />);
    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());
    const formatter = vi.mocked(LeaderboardChart).mock.calls.at(-1)![0].tooltipFormatter!;

    // Hovering in 1370 (between the two reigns) must show ruler #1
    // (Birger VII), the step's actual value there -- not "nearest
    // point," which could otherwise pick ruler #2's point at 1400.
    const midReign = formatter([{ axisValue: 1370 }]);
    expect(midReign).toContain("Birger VII");
    expect(midReign).toContain("190.0");

    // Hovering at 1400 exactly (or after) shows ruler #2's own values --
    // an unresolvable name key falls back to a regnal-number label,
    // never a fabricated name, but the real nickname still shows.
    const secondReign = formatter([{ axisValue: 1420 }]);
    expect(secondReign).toContain("Ruler #1");
    expect(secondReign).toContain('"Ladulas"');
    expect(secondReign).toContain("90.0");

    // Hovering before any reign started shows nothing for this nation.
    const beforeAnyReign = formatter([{ axisValue: 1300 }]);
    expect(beforeAnyReign).not.toContain("RUS");
  });

  it("the Ranking view shows time-weighted average and current ruler skill, viewable through a tab", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([country(1, "RUS", true)]);
    // Ruler A: score 100 for years [1337, 1400) = 63 years. Ruler B:
    // score 200 for [1400, 1450 (current)) = 50 years. Weighted average
    // = (100*63 + 200*50) / 113 ≈ 144.25; current (last) score = 200.
    vi.spyOn(leaderboardData, "loadRulerHistory").mockResolvedValue(
      new Map([[1, [point(1337, 100), point(1400, 200)]]]),
    );

    render(<RulerHistoryChart db={fakeDb} />);
    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Ranking" }));
    await waitFor(() => expect(screen.getByTestId("ranking-table")).toBeInTheDocument());
    expect(screen.queryByTestId("leaderboard-chart")).not.toBeInTheDocument();

    const props = vi.mocked(LeaderboardRankingTable).mock.calls.at(-1)![0];
    expect(props.title).toBe("Avg Ruler Skill");
    expect(props.secondaryTitle).toBe("Current Ruler Skill");
    expect(props.entries).toHaveLength(1);
    expect(props.entries[0].value).toBeCloseTo(144.25, 1);
    expect(props.entries[0].secondaryValue).toBe(200);

    // Switching back to Graph restores the chart.
    fireEvent.click(screen.getByRole("button", { name: "Graph" }));
    await waitFor(() => expect(screen.getByTestId("leaderboard-chart")).toBeInTheDocument());
    expect(screen.queryByTestId("ranking-table")).not.toBeInTheDocument();
  });

  it("shows an empty state, never a chart, when the save has no real countries at all", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([]);
    const loadRulerHistory = vi.spyOn(leaderboardData, "loadRulerHistory");

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
    expect(screen.queryByTestId("leaderboard-chart")).not.toBeInTheDocument();
    expect(loadRulerHistory).not.toHaveBeenCalled();
  });

  it("shows an error message when loading fails", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockRejectedValue(new Error("boom"));

    render(<RulerHistoryChart db={fakeDb} />);

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });
});
