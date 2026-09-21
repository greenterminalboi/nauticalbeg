import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { WorldGoodsPage } from "../../src/components/Overview/WorldGoodsPage";
import { ShareTreemap, type ShareTreemapEntry } from "../../src/components/Overview/ShareTreemap";
import * as marketData from "../../src/components/Overview/marketData";
import * as leaderboardData from "../../src/components/Overview/leaderboardData";
import type { SaveDatabase } from "../../src/storage/db";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";
import type { WorldGood } from "../../src/components/Overview/marketData";

vi.mock("../../src/components/Overview/ShareTreemap", () => ({
  ShareTreemap: vi.fn(() => <div data-testid="share-treemap" />),
}));

const fakeDb = {} as SaveDatabase;

function country(idx: number, tag: string, color: [number, number, number] | null = null): LeaderboardCountry {
  return { idx, tag, name: null, color, isHumanPlayed: false };
}

function good(name: string, total: number, hasProductionCoverage: boolean): WorldGood {
  return { good: name, total, hasProductionCoverage };
}

beforeEach(() => {
  vi.mocked(ShareTreemap).mockClear();
  vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue([]);
  vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([]);
});

describe("WorldGoodsPage", () => {
  it("defaults to wheat, scoping GoodSelect to only goods with a production-share breakdown (RGOs)", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([
      good("wheat", 100, true),
      good("clay", 13.2, true),
      good("tools", 4.5, false), // no coverage -- must not be offered
    ]);

    render(<WorldGoodsPage db={fakeDb} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "wheat" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "wheat" }));
    const list = within(screen.getByRole("list"));
    expect(list.getByRole("button", { name: "clay" })).toBeInTheDocument();
    expect(list.queryByRole("button", { name: "tools" })).not.toBeInTheDocument();
  });

  it("shows the selected good's world total next to the picker", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("wheat", 123.456, true)]);

    render(<WorldGoodsPage db={fakeDb} />);

    await waitFor(() => expect(screen.getByText("123.5")).toBeInTheDocument());
  });

  it("selecting a covered good renders ShareTreemap with one entry per producing country plus an unattributed bucket", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([
      good("wheat", 100, true),
      good("clay", 100, true),
    ]);
    vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue([
      { ownerIdx: 1, amount: 60 },
      { ownerIdx: 2, amount: 30 },
      { ownerIdx: null, amount: 10 }, // unowned province
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", [183, 136, 27]),
      country(2, "SCA", [10, 20, 30]),
    ]);

    render(<WorldGoodsPage db={fakeDb} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "wheat" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "wheat" }));
    fireEvent.click(within(screen.getByRole("list")).getByRole("button", { name: "clay" }));

    await waitFor(() => expect(screen.getByTestId("share-treemap")).toBeInTheDocument());
    const props = vi.mocked(ShareTreemap).mock.calls.at(-1)![0];
    const entries = props.entries as ShareTreemapEntry[];
    expect(entries).toHaveLength(3);
    expect(entries).toContainEqual({ id: 1, label: "RUS", color: [183, 136, 27], value: 60 });
    expect(entries).toContainEqual({ id: 2, label: "SCA", color: [10, 20, 30], value: 30 });
    expect(entries).toContainEqual(
      expect.objectContaining({ id: "unattributed", value: 10 }),
    );
  });

  it("an owner_idx not present in the Real-countries list also buckets into unattributed (non-Real owner)", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("wheat", 65, true)]);
    vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue([
      { ownerIdx: 1, amount: 60 },
      { ownerIdx: 99, amount: 5 }, // e.g. Pirates -- not in loadLeaderboardCountries' Real-only list
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", [183, 136, 27]),
    ]);

    render(<WorldGoodsPage db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("share-treemap")).toBeInTheDocument());
    const entries = vi.mocked(ShareTreemap).mock.calls.at(-1)![0].entries as ShareTreemapEntry[];
    expect(entries).toHaveLength(2);
    expect(entries).toContainEqual(expect.objectContaining({ id: "unattributed", value: 5 }));
  });

  it("a country with zero production of the good never appears (it's simply absent from the query result)", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("wheat", 60, true)]);
    vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue([
      { ownerIdx: 1, amount: 60 },
    ]);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue([
      country(1, "RUS", [183, 136, 27]),
      country(2, "SCA", [10, 20, 30]), // produces none of this good
    ]);

    render(<WorldGoodsPage db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("share-treemap")).toBeInTheDocument());
    const entries = vi.mocked(ShareTreemap).mock.calls.at(-1)![0].entries as ShareTreemapEntry[];
    expect(entries).toHaveLength(1);
    expect(entries.some((e) => e.id === 2)).toBe(false);
  });

  it("defaults the selection to the top 15 producers, folding the rest into one distinct 'other producers' bucket (FR-009)", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("iron", 210, true)]);
    const byOwner = Array.from({ length: 20 }, (_, i) => ({ ownerIdx: i + 1, amount: 20 - i }));
    vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue(byOwner);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(
      byOwner.map((o) => country(o.ownerIdx, `C${o.ownerIdx}`)),
    );

    render(<WorldGoodsPage db={fakeDb} />);

    await waitFor(() => expect(screen.getByTestId("share-treemap")).toBeInTheDocument());
    const entries = vi.mocked(ShareTreemap).mock.calls.at(-1)![0].entries as ShareTreemapEntry[];
    // 15 individual real producers + 1 "other producers" bucket for the
    // remaining 5, distinct from "unattributed" (there is none here).
    expect(entries).toHaveLength(16);
    expect(entries.filter((e) => typeof e.id === "number")).toHaveLength(15);
    const otherProducers = entries.find((e) => e.id === "other-producers");
    expect(otherProducers).toBeTruthy();
    // Amounts 5 down to 1 (the 16th-through-20th largest, i.e. the
    // smallest 5 of this descending series) sum to 15.
    expect(otherProducers!.value).toBe(15);
    expect(entries.some((e) => e.id === "unattributed")).toBe(false);
  });

  it("adding a country beyond the default top 15 via search breaks it out into its own box (on demand, mirrors Leaderboard's treemap)", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("iron", 210, true)]);
    const byOwner = Array.from({ length: 20 }, (_, i) => ({ ownerIdx: i + 1, amount: 20 - i }));
    vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue(byOwner);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(
      byOwner.map((o) => country(o.ownerIdx, `C${o.ownerIdx}`)),
    );

    render(<WorldGoodsPage db={fakeDb} />);
    await waitFor(() => expect(screen.getByTestId("share-treemap")).toBeInTheDocument());

    // C20 (ownerIdx 20, amount 1) is outside the default top 15 -- add it.
    // Exact accessible name (not a substring search) so it can't also
    // match "C2" or similar.
    fireEvent.focus(screen.getByPlaceholderText("Add country…"));
    fireEvent.click(screen.getByRole("checkbox", { name: "C20" }));

    await waitFor(() => {
      const entries = vi.mocked(ShareTreemap).mock.calls.at(-1)![0].entries as ShareTreemapEntry[];
      expect(entries).toContainEqual({ id: 20, label: "C20", color: null, value: 1 });
      // Other producers drops from 15 (5 countries: 16-20) to 14 (4
      // countries: 16-19), since C20 is now its own box.
      expect(entries.find((e) => e.id === "other-producers")).toMatchObject({ value: 14 });
    });
  });

  it("removing a default-selected country via search folds it back into 'other producers'", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("iron", 210, true)]);
    const byOwner = Array.from({ length: 20 }, (_, i) => ({ ownerIdx: i + 1, amount: 20 - i }));
    vi.spyOn(marketData, "decodeGoodProductionByOwner").mockResolvedValue(byOwner);
    vi.spyOn(leaderboardData, "loadLeaderboardCountries").mockResolvedValue(
      byOwner.map((o) => country(o.ownerIdx, `C${o.ownerIdx}`)),
    );

    render(<WorldGoodsPage db={fakeDb} />);
    await waitFor(() => expect(screen.getByTestId("share-treemap")).toBeInTheDocument());

    // C1 (ownerIdx 1, amount 20) is in the default top 15 -- remove it.
    // Exact accessible name (not a substring search) so it can't also
    // match "C10"-"C19".
    fireEvent.focus(screen.getByPlaceholderText("Add country…"));
    fireEvent.click(screen.getByRole("checkbox", { name: "C1" }));

    await waitFor(() => {
      const entries = vi.mocked(ShareTreemap).mock.calls.at(-1)![0].entries as ShareTreemapEntry[];
      expect(entries.some((e) => e.id === 1)).toBe(false);
      // Other producers grows from 15 (5 countries: 16-20) to 35
      // (6 countries: 16-20 plus C1's 20).
      expect(entries.find((e) => e.id === "other-producers")).toMatchObject({ value: 35 });
    });
  });

  it("shows a not-available message, never a picker or a treemap, when no good in the save has coverage", async () => {
    vi.spyOn(marketData, "decodeWorldGoods").mockResolvedValue([good("tools", 4.5, false)]);

    const { container } = render(<WorldGoodsPage db={fakeDb} />);

    await waitFor(() =>
      expect(container.querySelector(".world-goods-page__not-available")?.textContent).toMatch(
        /no.*breakdown available/i,
      ),
    );
    expect(screen.queryByTestId("share-treemap")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "tools" })).not.toBeInTheDocument();
  });
});
