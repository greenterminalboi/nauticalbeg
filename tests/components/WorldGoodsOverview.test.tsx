import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { WorldGoodsOverview } from "../../src/components/Overview/WorldGoodsOverview";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";

// Same wholesale mock as ProvincesTab.test.tsx/WarsTab: <perspective-viewer>
// is a real WASM/Web-Worker-backed custom element that doesn't run under
// Vitest/Node, so both it and the worker client are mocked — this
// component's own logic (building the right Perspective Table, wiring
// the viewer's config, empty/error states) is what's under test here.
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

describe("WorldGoodsOverview", () => {
  it("loads world goods into a Perspective table sorted by total descending, with the coverage marker column (FR-002, FR-005)", async () => {
    // Includes a zero-production good — spec's Edge Cases says it must
    // still appear, which this component satisfies simply by never
    // filtering `listWorldGoodsArrow`'s rows itself.
    const table = fakeTable(2);
    const workerTable = vi.fn().mockResolvedValue(table);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: workerTable,
    } as never);
    vi.spyOn(queries, "listWorldGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<WorldGoodsOverview db={fakeDb} selectedGood={null} onSelectGood={vi.fn()} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(queries.listWorldGoodsArrow).toHaveBeenCalledWith(fakeDb);
    expect(workerTable).toHaveBeenCalledWith(expect.any(ArrayBuffer), { name: "world-goods" });

    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    expect(props.client).toBe(table);
    expect(props.config).toMatchObject({
      sort: [["total", "desc"]],
      columns: ["good", "total", "has_production_coverage"],
    });
  });

  it("calls onSelectGood with the clicked row's good and its has_production_coverage flag", async () => {
    const table = fakeTable(1);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listWorldGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    const onSelectGood = vi.fn();
    render(<WorldGoodsOverview db={fakeDb} selectedGood={null} onSelectGood={onSelectGood} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    props.onClick!({
      row: { good: "clay", total: 13.19736, has_production_coverage: true },
      column_names: [],
      config: { filter: [] },
    });
    expect(onSelectGood).toHaveBeenCalledWith("clay", true);

    props.onClick!({
      row: { good: "tools", total: 4.5, has_production_coverage: false },
      column_names: [],
      config: { filter: [] },
    });
    expect(onSelectGood).toHaveBeenCalledWith("tools", false);
  });

  it("ignores a click whose row has no usable good", async () => {
    const table = fakeTable(1);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listWorldGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    const onSelectGood = vi.fn();
    render(<WorldGoodsOverview db={fakeDb} selectedGood={null} onSelectGood={onSelectGood} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    props.onClick!({ row: { good: undefined }, column_names: [], config: { filter: [] } });

    expect(onSelectGood).not.toHaveBeenCalled();
  });

  it("shows EmptyState when the save has no recorded goods production", async () => {
    const table = fakeTable(0);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listWorldGoodsArrow").mockResolvedValue(fakeArrowBuffer());

    render(<WorldGoodsOverview db={fakeDb} selectedGood={null} onSelectGood={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
    expect(screen.getByText("This save has no recorded goods production.")).toBeInTheDocument();
    expect(table.delete).toHaveBeenCalledWith({ lazy: true });
  });

  it("shows NotAvailableState when the query fails", async () => {
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn(),
    } as never);
    vi.spyOn(queries, "listWorldGoodsArrow").mockRejectedValue(new Error("boom"));

    render(<WorldGoodsOverview db={fakeDb} selectedGood={null} onSelectGood={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByText("Not available for this save")).toBeInTheDocument();
  });
});
