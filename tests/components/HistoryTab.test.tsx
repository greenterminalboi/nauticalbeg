import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HistoryTab } from "../../src/components/Overview/HistoryTab";
import { LeaderboardChart } from "../../src/components/Overview/LeaderboardChart";
import { RulerHistoryChart } from "../../src/components/Overview/RulerHistoryChart";
import * as leaderboardData from "../../src/components/Overview/leaderboardData";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";
import type { SaveDatabase } from "../../src/storage/db";

// The charts themselves are tested on their own; here we check which
// nations HistoryTab hands to each of them.
vi.mock("../../src/components/Overview/LeaderboardChart", () => ({
  LeaderboardChart: vi.fn(({ title, series }: { title: string; series: { label: string }[] }) => (
    <div data-testid="history-chart">
      {title}: {series.map((s) => s.label).join(",")}
    </div>
  )),
}));
vi.mock("../../src/components/Overview/RulerHistoryChart", () => ({
  RulerHistoryChart: vi.fn(({ selectedIdxs }: { selectedIdxs: number[] }) => (
    <div data-testid="ruler-chart">Rulers: {selectedIdxs.join(",")}</div>
  )),
}));

const fakeDb = {} as SaveDatabase;
const countries: LeaderboardCountry[] = [
  { idx: 1, tag: "RUS", name: "Russia", color: null, isHumanPlayed: true },
  { idx: 2, tag: "FRA", name: null, color: null, isHumanPlayed: false },
  { idx: 3, tag: "SWE", name: null, color: null, isHumanPlayed: false },
];
const point = [{ year: 1400, value: 5 }];
const history = new Map(
  [1, 2, 3].map((idx) => [
    idx,
    new Map<leaderboardData.LeaderboardMetric, typeof point>([
      ["population", point],
      ["economical_base", point],
      ["tax_base", point],
    ]),
  ]),
);

beforeEach(() => {
  vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(countries);
  vi.spyOn(leaderboardData, "loadNationHistory").mockResolvedValue(history);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(LeaderboardChart).mockClear();
  vi.mocked(RulerHistoryChart).mockClear();
});

describe("HistoryTab", () => {
  it("opens with only the selected nation on all four charts (FR-013, FR-014)", async () => {
    render(<HistoryTab db={fakeDb} nationIdx={1} />);
    await waitFor(() =>
      expect(screen.getAllByTestId("history-chart").map((c) => c.textContent)).toEqual([
        "Population: Russia",
        "Economic Base: Russia",
        "Tax Base: Russia",
      ]),
    );
    expect(screen.getByTestId("ruler-chart")).toHaveTextContent("Rulers: 1");
    expect(leaderboardData.loadNationHistory).toHaveBeenCalledWith(fakeDb, [1]);
  });

  it("adds a compared nation to every chart", async () => {
    render(<HistoryTab db={fakeDb} nationIdx={1} />);
    await screen.findByPlaceholderText("Add a country to compare…");
    fireEvent.focus(screen.getByPlaceholderText("Add a country to compare…"));
    fireEvent.click(screen.getByLabelText("FRA"));

    await waitFor(() =>
      expect(screen.getAllByTestId("history-chart")[0]).toHaveTextContent("Population: Russia,FRA"),
    );
    expect(screen.getByTestId("ruler-chart")).toHaveTextContent("Rulers: 1,2");
  });

  it("resets to just the newly selected nation when the nation selector changes", async () => {
    const { rerender } = render(<HistoryTab db={fakeDb} nationIdx={1} />);
    await screen.findByPlaceholderText("Add a country to compare…");
    fireEvent.focus(screen.getByPlaceholderText("Add a country to compare…"));
    fireEvent.click(screen.getByLabelText("FRA"));
    await waitFor(() => expect(screen.getByTestId("ruler-chart")).toHaveTextContent("Rulers: 1,2"));

    rerender(<HistoryTab db={fakeDb} nationIdx={3} />);
    await waitFor(() => expect(screen.getByTestId("ruler-chart")).toHaveTextContent("Rulers: 3"));
    expect(screen.getAllByTestId("history-chart")[0]).toHaveTextContent("Population: SWE");
  });
});
