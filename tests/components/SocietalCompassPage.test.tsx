import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SocietalCompassPage } from "../../src/components/Overview/SocietalCompassPage";
import { SocietalCompassChart } from "../../src/components/Overview/SocietalCompassChart";
import * as leaderboardData from "../../src/components/Overview/leaderboardData";
import * as societalValuesData from "../../src/components/Overview/societalValuesData";
import type { SaveDatabase } from "../../src/storage/db";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";

vi.mock("../../src/components/Overview/SocietalCompassChart", () => ({
  SocietalCompassChart: vi.fn(() => <div data-testid="societal-compass-chart" />),
}));

const fakeDb = {} as SaveDatabase;

function country(
  idx: number,
  tag: string,
  name: string | null = null,
  isHumanPlayed = false,
): LeaderboardCountry {
  return { idx, tag, name, color: [10, 20, 30], isHumanPlayed };
}

beforeEach(() => {
  vi.mocked(SocietalCompassChart).mockClear();
});

describe("SocietalCompassPage", () => {
  it("lands on the player's own country only, not every country in the save (post-ship: explicit user request)", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(2025, "RUS", null, true),
      country(3, "SCA", null, false),
      country(4, "MER", null, false),
      country(5, "PIR", null, false),
      country(6, "AAA", null, false),
      country(7, "BBB", null, false),
    ]);
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(
      new Map([
        [2025, [{ axis: "aristocracy_vs_plutocracy", value: 100 }]],
        [3, [{ axis: "aristocracy_vs_plutocracy", value: 100 }]],
      ]),
    );

    render(<SocietalCompassPage db={fakeDb} />);

    await waitFor(() => expect(SocietalCompassChart).toHaveBeenCalled());
    const points = vi.mocked(SocietalCompassChart).mock.calls.at(-1)![0].points;
    expect(points).toHaveLength(1);
    expect(points[0].nationIdx).toBe(2025);
  });

  it("excludes a selected country with zero applicable axes entirely, never plotting it as centrist (FR-015)", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(2025, "RUS", null, true),
      country(3, "SCA", null, true),
    ]);
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(
      new Map([[2025, [{ axis: "aristocracy_vs_plutocracy", value: 100 }]]]),
      // SCA (idx 3) has no entry at all -- zero applicable axes.
    );

    render(<SocietalCompassPage db={fakeDb} />);

    await waitFor(() => expect(SocietalCompassChart).toHaveBeenCalled());
    const points = vi.mocked(SocietalCompassChart).mock.calls.at(-1)![0].points;
    expect(points).toHaveLength(1);
    expect(points[0].nationIdx).toBe(2025);
  });

  it("colors each point by the country's own map color by default", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(2025, "RUS", null, true),
    ]);
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(
      new Map([[2025, [{ axis: "aristocracy_vs_plutocracy", value: 100 }]]]),
    );

    render(<SocietalCompassPage db={fakeDb} />);
    await waitFor(() => expect(SocietalCompassChart).toHaveBeenCalled());

    const points = vi.mocked(SocietalCompassChart).mock.calls.at(-1)![0].points;
    expect(points[0].colorRgb).toEqual([10, 20, 30]);
  });

  it("adding a country via the search input plots it too", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(2025, "RUS", null, true),
      country(3, "SCA", "Scandinavia", false),
    ]);
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(
      new Map([
        [2025, [{ axis: "aristocracy_vs_plutocracy", value: 100 }]],
        [3, [{ axis: "aristocracy_vs_plutocracy", value: -100 }]],
      ]),
    );

    render(<SocietalCompassPage db={fakeDb} />);
    await waitFor(() => expect(SocietalCompassChart).toHaveBeenCalled());
    expect(vi.mocked(SocietalCompassChart).mock.calls.at(-1)![0].points).toHaveLength(1);

    fireEvent.focus(screen.getByPlaceholderText("Search countries…"));
    fireEvent.click(screen.getByText("Scandinavia"));

    await waitFor(() => {
      const points = vi.mocked(SocietalCompassChart).mock.calls.at(-1)![0].points;
      expect(points.map((p) => p.nationIdx).sort((a, b) => a - b)).toEqual([3, 2025]);
    });
  });

  it("shows an explicit message when no selected country has any applicable axis yet", async () => {
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(2025, "RUS", null, true),
    ]);
    vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(new Map());

    render(<SocietalCompassPage db={fakeDb} />);

    await waitFor(() =>
      expect(
        screen.getByText(/none of the selected countries have an applicable/i),
      ).toBeInTheDocument(),
    );
  });
});
