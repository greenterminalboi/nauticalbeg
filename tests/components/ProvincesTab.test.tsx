import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { tableFromArrays, tableToIPC } from "apache-arrow";
import { ProvincesTab } from "../../src/components/Overview/ProvincesTab";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";

// <perspective-viewer> is a real WASM/Web-Worker-backed custom element,
// and @perspective-dev/client's own Node build eagerly attempts to
// compile its WASM server on import (confirmed via a real failing test
// run under Vitest/Node — a genuinely broken code path there, not a
// jsdom quirk) — so both it and the widget are mocked wholesale here:
// assert this component builds the right Perspective `Table` and passes
// it through, not what the real packages do (that's covered by
// real-browser verification instead).
vi.mock("../../src/perspective/setup", () => ({
  getPerspectiveWorker: vi.fn(),
}));
vi.mock("@perspective-dev/react", () => ({
  PerspectiveViewer: vi.fn(() => <div data-testid="perspective-viewer" />),
}));

const fakeDb = {} as SaveDatabase;

function provincesArrow(rows: { idx: number; name: string; development: number; location_count: number }[]): ArrayBuffer {
  const table = tableFromArrays({
    idx: Int32Array.from(rows.map((r) => r.idx)),
    name: rows.map((r) => r.name),
    development: Float64Array.from(rows.map((r) => r.development)),
    tax_base: Float64Array.from(rows.map(() => 31.7)),
    soldiers: Float64Array.from(rows.map(() => 9.5)),
    population: Float64Array.from(rows.map(() => 2.03)),
    location_count: Int32Array.from(rows.map((r) => r.location_count)),
  });
  return tableToIPC(table).buffer as ArrayBuffer;
}

function fakeTable() {
  return { update: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
}

beforeEach(() => {
  vi.mocked(perspectiveSetup.getPerspectiveWorker).mockReset();
  vi.restoreAllMocks();
});

describe("ProvincesTab", () => {
  it("lists the nation's provinces with the province map-mode values as sortable columns (FR-015, FR-017)", async () => {
    const table = fakeTable();
    const workerTable = vi.fn().mockResolvedValue(table);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: workerTable } as never);
    vi.spyOn(queries, "listNationProvincesArrow").mockResolvedValue(
      provincesArrow([{ idx: 16777289, name: "mazyr_province", development: 28.8, location_count: 1 }]),
    );

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<ProvincesTab db={fakeDb} nationIdx={2025} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(queries.listNationProvincesArrow).toHaveBeenCalledWith(fakeDb, 2025);
    expect(workerTable).toHaveBeenCalledWith(
      {
        province: "string",
        development: "float",
        tax_base: "float",
        population: "float",
        soldiers: "float",
        locations: "integer",
      },
      { name: "provinces-2025" },
    );
    expect(table.update).toHaveBeenCalledWith([
      {
        province: "Mazyr Province",
        development: 28.8,
        tax_base: 31.7,
        population: 2.03,
        soldiers: 9.5,
        locations: 1,
      },
    ]);
    const props = vi.mocked(PerspectiveViewer).mock.calls.at(-1)![0];
    expect(props.client).toBe(table);
    // Perspective's own column headers do the sorting; this sets the order.
    expect(props.config).toMatchObject({
      columns: ["province", "development", "tax_base", "population", "soldiers", "locations"],
      sort: [["development", "desc"]],
    });
  });

  it("shows EmptyState when the nation owns no provinces", async () => {
    const workerTable = vi.fn();
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: workerTable } as never);
    vi.spyOn(queries, "listNationProvincesArrow").mockResolvedValue(provincesArrow([]));

    render(<ProvincesTab db={fakeDb} nationIdx={1} />);

    await waitFor(() => expect(screen.getByText("Nothing to show")).toBeInTheDocument());
    expect(screen.getByText("This nation has no provinces.")).toBeInTheDocument();
    expect(workerTable).not.toHaveBeenCalled();
  });

  it("re-fetches with a fresh table when nationIdx changes (FR-004)", async () => {
    const workerTable = vi.fn().mockImplementation(() => Promise.resolve(fakeTable()));
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: workerTable } as never);
    const spy = vi
      .spyOn(queries, "listNationProvincesArrow")
      .mockImplementation(async () => provincesArrow([{ idx: 1, name: "a", development: 1, location_count: 1 }]));

    const { rerender } = render(<ProvincesTab db={fakeDb} nationIdx={2025} />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(fakeDb, 2025));

    rerender(<ProvincesTab db={fakeDb} nationIdx={3} />);
    await waitFor(() => expect(spy).toHaveBeenCalledWith(fakeDb, 3));
    await waitFor(() => expect(workerTable).toHaveBeenCalledWith(expect.any(Object), { name: "provinces-3" }));
  });

  it("shows NotAvailableState when the query fails", async () => {
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: vi.fn() } as never);
    vi.spyOn(queries, "listNationProvincesArrow").mockRejectedValue(new Error("boom"));

    render(<ProvincesTab db={fakeDb} nationIdx={2025} />);

    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(screen.getByText("Not available for this save")).toBeInTheDocument();
  });
});
