import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MarketsTab } from "../../src/components/Overview/MarketsTab";
import * as queries from "../../src/storage/queries";
import * as marketData from "../../src/components/Overview/marketData";
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
// (`isReady && readDbRef.current ? <MarketsTab db={...} /> : <p>...`) —
// same idiom LeaderboardTab.test.tsx's `LeaderboardWithNav` wrapper uses
// for composition it doesn't own. MarketsTab itself always requires a
// real `db` (contracts/ui-components.md), so FR-010's no-save
// placeholder is FileLoader's own gate, not internal MarketsTab state;
// this wrapper verifies that exact gate without pulling in all of
// FileLoader's file-loading machinery.
function MarketsPageAsFileLoaderRendersIt({ db }: { db: SaveDatabase | null }) {
  return db ? <MarketsTab db={db} /> : <p>Select a save file above to get started.</p>;
}

describe("MarketsTab", () => {
  it("shows a placeholder, not blank/broken content, when no save is loaded (FR-010)", () => {
    render(<MarketsPageAsFileLoaderRendersIt db={null} />);

    expect(screen.getByText("Select a save file above to get started.")).toBeInTheDocument();
    expect(screen.queryByTestId("perspective-viewer")).not.toBeInTheDocument();
  });

  it("defaults to the World Goods view, not the Markets list (specs/009-world-goods-production FR-001)", async () => {
    render(<MarketsTab db={fakeDb} />);

    await waitFor(() => expect(queries.listWorldGoodsArrow).toHaveBeenCalledWith(fakeDb));
    expect(queries.listMarketsArrow).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "World Goods" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Markets" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("switching to the Markets view shows the market list, and switching back hides it (FR-001, FR-002)", async () => {
    render(<MarketsTab db={fakeDb} />);
    await waitFor(() => expect(queries.listWorldGoodsArrow).toHaveBeenCalledWith(fakeDb));

    fireEvent.click(screen.getByRole("button", { name: "Markets" }));
    await waitFor(() => expect(queries.listMarketsArrow).toHaveBeenCalledWith(fakeDb));
    expect(screen.getByRole("button", { name: "Markets" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "World Goods" }));
    expect(screen.getByRole("button", { name: "World Goods" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("leaves the market-detail section unrendered until a market is selected", async () => {
    render(<MarketsTab db={fakeDb} />);
    fireEvent.click(screen.getByRole("button", { name: "Markets" }));

    await waitFor(() =>
      expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(1),
    );
    expect(screen.queryByTestId("markets-tab-detail")).not.toBeInTheDocument();
  });

  it("selecting a market renders MarketGoodsTable (User Story 2), without yet revealing the chart hook point (Phase 5, not built)", async () => {
    vi.spyOn(queries, "listMarketGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<MarketsTab db={fakeDb} />);
    fireEvent.click(screen.getByRole("button", { name: "Markets" }));

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
    await waitFor(() => expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(2));
    expect(screen.queryByTestId("markets-tab-chart-placeholder")).not.toBeInTheDocument();
  });

  it("selecting a good within the selected market renders MarketGoodPriceChart (User Story 3)", async () => {
    vi.spyOn(queries, "listMarketGoodsArrow").mockResolvedValue(fakeArrowBuffer());
    vi.spyOn(marketData, "decodeMarketGoodPriceHistory").mockResolvedValue([
      { date: "1628-08", price: 1.25 },
    ]);

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<MarketsTab db={fakeDb} />);
    fireEvent.click(screen.getByRole("button", { name: "Markets" }));

    await waitFor(() => expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(1));
    // Identify MarketList's viewer by its columns, since re-renders mean
    // mock.calls' index doesn't reliably map to "the Nth mounted viewer".
    function latestCallWithColumn(column: string) {
      const calls = vi.mocked(PerspectiveViewer).mock.calls;
      for (let i = calls.length - 1; i >= 0; i--) {
        const columns = (calls[i][0].config as { columns?: string[] } | undefined)?.columns;
        if (columns?.includes(column)) return calls[i][0];
      }
      throw new Error(`no PerspectiveViewer call found with column "${column}"`);
    }

    latestCallWithColumn("member_count").onClick!({
      row: { idx: 7, name: "Location 7", member_count: 1, capacity: 50 },
      column_names: [],
      config: { filter: [] },
    });

    await waitFor(() => expect(screen.getAllByTestId("perspective-viewer")).toHaveLength(2));
    latestCallWithColumn("good").onClick!({
      row: { good: "clay", price: 1.25 },
      column_names: [],
      config: { filter: [] },
    });

    await screen.findByText("clay price history");
    expect(marketData.decodeMarketGoodPriceHistory).toHaveBeenCalledWith(fakeDb, 7, "clay");
  });
});
