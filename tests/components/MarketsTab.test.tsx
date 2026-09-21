import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MarketsTab } from "../../src/components/Overview/MarketsTab";
import { MarketsSideNav, type MarketsView } from "../../src/components/Overview/MarketsSideNav";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";

// Same wholesale Perspective mock as MarketList.test.tsx/
// WorldGoodsOverview.test.tsx — MarketsTab composes both of those real
// components, so they need the same mock in scope here.
vi.mock("../../src/perspective/setup", () => ({
  getPerspectiveWorker: vi.fn(),
}));
vi.mock("@perspective-dev/react", () => ({
  PerspectiveViewer: vi.fn(() => <div data-testid="perspective-viewer" />),
}));

const fakeDb = {} as SaveDatabase;

function fakeArrowBuffer(): ArrayBuffer {
  return new ArrayBuffer(0);
}

function fakeTable(size: number) {
  return {
    size: vi.fn().mockResolvedValue(size),
    delete: vi.fn(),
  };
}

beforeEach(() => {
  vi.mocked(perspectiveSetup.getPerspectiveWorker).mockReset();
  vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
    table: vi.fn().mockImplementation(() => Promise.resolve(fakeTable(2))),
  } as never);
  vi.spyOn(queries, "listWorldGoodsArrow").mockResolvedValue(fakeArrowBuffer());
  vi.spyOn(queries, "listMarketsArrow").mockResolvedValue(fakeArrowBuffer());
});

// Mirrors FileLoader.tsx's exact gating JSX for the Markets block
// (`isReady && readDbRef.current ? <MarketsTab db={...} activeView={...} /> :
// <p>...`) — same idiom LeaderboardTab.test.tsx's `LeaderboardWithNav`
// wrapper uses for composition it doesn't own. MarketsTab itself always
// requires a real `db` (contracts/ui-components.md), so FR-010's no-save
// placeholder is FileLoader's own gate, not internal MarketsTab state;
// this wrapper verifies that exact gate without pulling in all of
// FileLoader's file-loading machinery.
function MarketsPageAsFileLoaderRendersIt({ db }: { db: SaveDatabase | null }) {
  return db ? (
    <MarketsTab db={db} activeView="worldGoods" />
  ) : (
    <p>Select a save file above to get started.</p>
  );
}

// specs/009-world-goods-production (post-ship follow-up): the view
// switch moved from MarketsTab's own top-of-content buttons into the
// shell's side nav — mirrors LeaderboardTab.test.tsx's LeaderboardWithNav.
function MarketsWithNav({ db }: { db: SaveDatabase }) {
  const [activeView, setActiveView] = useState<MarketsView>("worldGoods");
  return (
    <>
      <MarketsSideNav activeView={activeView} onSelectView={setActiveView} />
      <MarketsTab db={db} activeView={activeView} />
    </>
  );
}

describe("MarketsTab", () => {
  it("shows a placeholder, not blank/broken content, when no save is loaded (FR-010)", () => {
    render(<MarketsPageAsFileLoaderRendersIt db={null} />);

    expect(screen.getByText("Select a save file above to get started.")).toBeInTheDocument();
    expect(screen.queryByTestId("perspective-viewer")).not.toBeInTheDocument();
  });

  it("renders World Goods when activeView is worldGoods, not the Markets list (FR-001)", async () => {
    render(<MarketsTab db={fakeDb} activeView="worldGoods" />);

    await waitFor(() => expect(queries.listWorldGoodsArrow).toHaveBeenCalledWith(fakeDb));
    expect(queries.listMarketsArrow).not.toHaveBeenCalled();
  });

  it("renders the Markets list when activeView is markets, not World Goods (FR-001, FR-002)", async () => {
    render(<MarketsTab db={fakeDb} activeView="markets" />);

    await waitFor(() => expect(queries.listMarketsArrow).toHaveBeenCalledWith(fakeDb));
    expect(queries.listWorldGoodsArrow).not.toHaveBeenCalled();
  });

  it("MarketsSideNav switches MarketsTab between views end to end", async () => {
    render(<MarketsWithNav db={fakeDb} />);
    await waitFor(() => expect(queries.listWorldGoodsArrow).toHaveBeenCalledWith(fakeDb));
    expect(screen.getByRole("button", { name: "Global RGO Production" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Markets" }));
    await waitFor(() => expect(queries.listMarketsArrow).toHaveBeenCalledWith(fakeDb));
    expect(screen.getByRole("button", { name: "Markets" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Global RGO Production" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("leaves the market-detail section unrendered until a market is selected", async () => {
    render(<MarketsTab db={fakeDb} activeView="markets" />);

    await waitFor(() =>
      expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(1),
    );
    expect(screen.queryByTestId("markets-tab-detail")).not.toBeInTheDocument();
  });

  it("selecting a market renders MarketGoodsTable (User Story 2)", async () => {
    vi.spyOn(queries, "listMarketGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<MarketsTab db={fakeDb} activeView="markets" />);

    await waitFor(() =>
      expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(1),
    );

    const marketListProps = vi.mocked(PerspectiveViewer).mock.calls.at(-1)![0];
    marketListProps.onClick!({
      row: { idx: 7, name: "Location 7", member_count: 1, capacity: 50 },
      column_names: [],
      config: { filter: [] },
    });

    await screen.findByTestId("markets-tab-detail");
    expect(queries.listMarketGoodsArrow).toHaveBeenCalledWith(fakeDb, 7);
    // Post-ship, 2026-09-21: MarketGoodsTable is now read-only (no
    // per-good price chart to select into) -- just the second viewer.
    await waitFor(() => expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(2));
  });
});
