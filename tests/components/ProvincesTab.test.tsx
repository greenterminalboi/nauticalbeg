import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProvincesTab } from "../../src/components/Overview/ProvincesTab";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";

// <perspective-viewer> is a real WASM/Web-Worker-backed custom element,
// and @perspective-dev/client's own Node build eagerly attempts to
// compile its WASM server on import (confirmed via a real failing test
// run under Vitest/Node — a genuinely broken code path there, not a
// jsdom quirk) — so both it and the widget are mocked wholesale here,
// the same way any complex external dependency would be: assert this
// component builds the right Perspective `Table` and passes it through,
// not what the real packages do (that's covered by real-browser
// verification instead).
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

describe("ProvincesTab", () => {
  it("loads the nation's provinces into a Perspective table and renders the viewer (FR-004)", async () => {
    const table = fakeTable(2);
    const workerTable = vi.fn().mockResolvedValue(table);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: workerTable,
    } as never);
    vi.spyOn(queries, "listProvincesArrow").mockResolvedValue(fakeArrowBuffer());

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<ProvincesTab db={fakeDb} nationIdx={2025} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(queries.listProvincesArrow).toHaveBeenCalledWith(fakeDb, 2025);
    expect(workerTable).toHaveBeenCalledWith(expect.any(ArrayBuffer), { name: "provinces-2025" });
    const props = vi.mocked(PerspectiveViewer).mock.calls[0][0];
    expect(props.client).toBe(table);
  });

  it("shows EmptyState when the nation controls zero provinces (Acceptance Scenario 4)", async () => {
    const table = fakeTable(0);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn().mockResolvedValue(table),
    } as never);
    vi.spyOn(queries, "listProvincesArrow").mockResolvedValue(fakeArrowBuffer());

    render(<ProvincesTab db={fakeDb} nationIdx={1} />);

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
    expect(screen.getByText("This nation has no provinces.")).toBeInTheDocument();
    expect(table.delete).toHaveBeenCalledWith({ lazy: true });
  });

  it("re-fetches with a fresh table when nationIdx changes (FR-003)", async () => {
    const workerTable = vi.fn().mockImplementation(() => Promise.resolve(fakeTable(1)));
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: workerTable,
    } as never);
    const spy = vi.spyOn(queries, "listProvincesArrow").mockResolvedValue(fakeArrowBuffer());

    const { rerender } = render(<ProvincesTab db={fakeDb} nationIdx={2025} />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(fakeDb, 2025));

    rerender(<ProvincesTab db={fakeDb} nationIdx={3} />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(fakeDb, 3));
    expect(workerTable).toHaveBeenCalledWith(expect.any(ArrayBuffer), { name: "provinces-3" });
  });

  it("shows NotAvailableState when the query fails", async () => {
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({
      table: vi.fn(),
    } as never);
    vi.spyOn(queries, "listProvincesArrow").mockRejectedValue(new Error("boom"));

    render(<ProvincesTab db={fakeDb} nationIdx={2025} />);

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByText("Not available for this save")).toBeInTheDocument();
  });
});
