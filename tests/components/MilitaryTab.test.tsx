import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MilitaryTab } from "../../src/components/Overview/MilitaryTab";
import * as firepowerData from "../../src/components/Overview/firepowerData";
import * as leaderboardData from "../../src/components/Overview/leaderboardData";
import * as societalValuesData from "../../src/components/Overview/societalValuesData";
import type { SaveDatabase } from "../../src/storage/db";

// The three views are tested on their own; here we check MilitaryTab
// hands each of them exactly the selected nation.
vi.mock("../../src/components/Overview/MilitaryDoctrineChart", () => ({
  MilitaryDoctrineChart: ({ points }: { points: { name: string }[] }) => (
    <div data-testid="doctrine">Doctrine: {points.map((p) => p.name).join(",")}</div>
  ),
}));
vi.mock("../../src/components/Overview/ArmyCompositionView", () => ({
  ArmyCompositionView: ({ row }: { row: { name: string } }) => <div data-testid="army">Army: {row.name}</div>,
}));
vi.mock("../../src/components/Overview/NavyCompositionView", () => ({
  NavyCompositionView: ({ row }: { row: { name: string } | null }) => (
    <div data-testid="navy">Navy: {row ? row.name : "none"}</div>
  ),
}));

const fakeDb = {} as SaveDatabase;
const RUS = { idx: 2025, tag: "RUS", name: "Russia", color: null, isHumanPlayed: true };
const FRA = { idx: 1141, tag: "FRA", name: null, color: null, isHumanPlayed: false };

beforeEach(() => {
  vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([RUS, FRA]);
  vi.spyOn(societalValuesData, "decodeSocietalValuesByNation").mockResolvedValue(new Map());
  vi.spyOn(firepowerData, "buildDoctrinePoints").mockImplementation((idxs) =>
    idxs.map((idx) => ({ nationIdx: idx, tag: "", name: idx === 2025 ? "Russia" : "FRA", colorRgb: null, axes: [] })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MilitaryTab", () => {
  it("shows army composition, naval composition and doctrine for the selected nation only (FR-018 to FR-020)", async () => {
    const army = vi.spyOn(firepowerData, "loadArmyProfiles").mockResolvedValue([{ name: "Russia" } as never]);
    const navy = vi.spyOn(firepowerData, "loadNavyProfiles").mockResolvedValue([{ name: "Russia" } as never]);

    render(<MilitaryTab db={fakeDb} nationIdx={2025} />);

    expect(await screen.findByTestId("army")).toHaveTextContent("Army: Russia");
    expect(screen.getByTestId("navy")).toHaveTextContent("Navy: Russia");
    expect(screen.getByTestId("doctrine")).toHaveTextContent("Doctrine: Russia");
    expect(army.mock.calls[0][1]).toEqual([2025]);
    expect(navy.mock.calls[0][1]).toEqual([2025]);
    expect(firepowerData.buildDoctrinePoints).toHaveBeenCalledWith([2025], expect.anything(), expect.anything());
  });

  it("says so when the nation has no army, and passes no navy row when it has no ships", async () => {
    vi.spyOn(firepowerData, "loadArmyProfiles").mockResolvedValue([]);
    vi.spyOn(firepowerData, "loadNavyProfiles").mockResolvedValue([]);
    render(<MilitaryTab db={fakeDb} nationIdx={1141} />);
    expect(await screen.findByText("This nation has no army regiments.")).toBeInTheDocument();
    expect(screen.getByTestId("navy")).toHaveTextContent("Navy: none");
  });

  it("reloads for a newly selected nation", async () => {
    const army = vi.spyOn(firepowerData, "loadArmyProfiles").mockResolvedValue([]);
    vi.spyOn(firepowerData, "loadNavyProfiles").mockResolvedValue([]);
    const { rerender } = render(<MilitaryTab db={fakeDb} nationIdx={2025} />);
    await waitFor(() => expect(army).toHaveBeenCalledTimes(1));
    rerender(<MilitaryTab db={fakeDb} nationIdx={1141} />);
    await waitFor(() => expect(army.mock.calls.at(-1)![1]).toEqual([1141]));
  });
});
