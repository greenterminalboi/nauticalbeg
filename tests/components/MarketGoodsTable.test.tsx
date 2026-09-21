import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MarketGoodsTable } from "../../src/components/Overview/MarketGoodsTable";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";

// Same wholesale mock as MarketList.test.tsx.
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

describe("MarketGoodsTable", () => {
  it("loads a market's per-good breakdown, scoped to the selected market (FR-004, FR-005)", async () => {
    const table = fakeTable(2);
    const workerTable = vi.fn().mockResolvedValue(table);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: workerTable,
    } as never);
    vi.spyOn(queries, "listMarketGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<MarketGoodsTable db={fakeDb} marketId={1} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(queries.listMarketGoodsArrow).toHaveBeenCalledWith(fakeDb, 1);
    expect(workerTable).toHaveBeenCalledWith(expect.any(ArrayBuffer), { name: "market_goods" });

    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    expect(props.client).toBe(table);
    expect(props.config).toMatchObject({ sort: [["good", "asc"]] });
    const columns = (props.config as { columns?: string[] } | undefined)?.columns;
    expect(columns).toEqual(
      expect.arrayContaining([
        "good",
        "price",
        "supply",
        "demand",
        "stockpile",
        "is_importing",
        "is_exporting",
        "supply_raw_materials",
        "supply_buildings",
        "supply_trade",
        "demand_population",
        "demand_trade",
        "demand_building_upkeep",
        "demand_unit_upkeep",
        "demand_construction",
      ]),
    );
    // Post-ship, 2026-09-21: read-only, no row selection -- the thing
    // selecting a good used to reveal (a per-good price chart) was
    // removed entirely.
    expect(props.onClick).toBeUndefined();
  });

  it("re-queries when the selected market changes", async () => {
    const table = fakeTable(1);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listMarketGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { rerender } = render(<MarketGoodsTable db={fakeDb} marketId={1} />);
    await waitFor(() => expect(queries.listMarketGoodsArrow).toHaveBeenCalledWith(fakeDb, 1));

    rerender(<MarketGoodsTable db={fakeDb} marketId={2} />);
    await waitFor(() => expect(queries.listMarketGoodsArrow).toHaveBeenCalledWith(fakeDb, 2));
  });

  it("shows EmptyState (not a zero-value grid) when the market trades no goods at all (FR-006)", async () => {
    const table = fakeTable(0);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listMarketGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    render(<MarketGoodsTable db={fakeDb} marketId={3} />);

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
    expect(table.delete).toHaveBeenCalledWith({ lazy: true });
  });

  it("shows NotAvailableState when the query fails", async () => {
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn(),
    } as never);
    vi.spyOn(queries, "listMarketGoodsArrow").mockRejectedValue(new Error("boom"));

    render(<MarketGoodsTable db={fakeDb} marketId={1} />);

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByText("Not available for this save")).toBeInTheDocument();
  });
});
