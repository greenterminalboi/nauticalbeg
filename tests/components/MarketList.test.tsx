import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarketList } from "../../src/components/Overview/MarketList";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";

// Same wholesale mock as WorldGoodsOverview.test.tsx/ProvincesTab.test.tsx.
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
});

describe("MarketList", () => {
  it("loads markets into a Perspective table sorted by name (FR-002, FR-003)", async () => {
    const table = fakeTable(2);
    const workerTable = vi.fn().mockResolvedValue(table);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: workerTable,
    } as never);
    vi.spyOn(queries, "listMarketsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<MarketList db={fakeDb} selectedMarketId={null} onSelectMarket={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(queries.listMarketsArrow).toHaveBeenCalledWith(fakeDb);
    expect(workerTable).toHaveBeenCalledWith(expect.any(ArrayBuffer), { name: "markets" });

    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    expect(props.client).toBe(table);
    expect(props.config).toMatchObject({
      sort: [["name", "asc"]],
      columns: ["idx", "name", "member_count", "capacity"],
    });
  });

  it("a market with an unresolvable center still renders — the neutral fallback name (`Market <idx>`) is display data from listMarketsArrow, not something this component filters or fabricates", async () => {
    const table = fakeTable(1);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listMarketsArrow").mockResolvedValue(fakeArrowBuffer());

    render(<MarketList db={fakeDb} selectedMarketId={null} onSelectMarket={vi.fn()} />);

    // size() === 1 (a single market, e.g. one with member_count === 1,
    // spec's "a market whose member-location count is exactly one is
    // still valid" edge case) renders the grid, not an empty state.
    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(screen.queryByText("Nothing to show")).not.toBeInTheDocument();
  });

  it("calls onSelectMarket with the clicked row's idx (row-selection-to-callback, research.md's flagged risk)", async () => {
    const table = fakeTable(1);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listMarketsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    const onSelectMarket = vi.fn();
    render(<MarketList db={fakeDb} selectedMarketId={null} onSelectMarket={onSelectMarket} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());

    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    expect(props.onClick).toBeInstanceOf(Function);
    // Simulates the "perspective-click" Custom Event's detail shape:
    // `row` is the clicked row's full View.to_json() result, keyed by
    // every column in this viewer's config.columns (including `idx`,
    // deliberately included for exactly this purpose).
    props.onClick!({
      row: { idx: 42, name: "Location 42", member_count: 3, capacity: 100 },
      column_names: [],
      config: { filter: [] },
    });

    expect(onSelectMarket).toHaveBeenCalledWith(42);
  });

  it("ignores a click whose row has no usable idx", async () => {
    const table = fakeTable(1);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listMarketsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    const onSelectMarket = vi.fn();
    render(<MarketList db={fakeDb} selectedMarketId={null} onSelectMarket={onSelectMarket} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    props.onClick!({ row: { idx: undefined }, column_names: [], config: { filter: [] } });

    expect(onSelectMarket).not.toHaveBeenCalled();
  });

  it("shows EmptyState when the save has no recorded markets", async () => {
    const table = fakeTable(0);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listMarketsArrow").mockResolvedValue(fakeArrowBuffer());

    render(<MarketList db={fakeDb} selectedMarketId={null} onSelectMarket={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
    expect(screen.getByText("This save has no recorded markets.")).toBeInTheDocument();
    expect(table.delete).toHaveBeenCalledWith({ lazy: true });
  });

  it("shows NotAvailableState when the query fails", async () => {
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn(),
    } as never);
    vi.spyOn(queries, "listMarketsArrow").mockRejectedValue(new Error("boom"));

    render(<MarketList db={fakeDb} selectedMarketId={null} onSelectMarket={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByText("Not available for this save")).toBeInTheDocument();
  });
});
