import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LocationsTab } from "../../src/components/Overview/LocationsTab";
import { LOCATION_TERRAIN } from "../../src/components/Overview/locationTerrain";
import * as queries from "../../src/storage/queries";
import * as perspectiveSetup from "../../src/perspective/setup";
import type { SaveDatabase } from "../../src/storage/db";
import type { LocationRow } from "../../src/storage/queries";

// Perspective's WASM can't load under jsdom (see ProvincesTab.test.tsx).
vi.mock("../../src/perspective/setup", () => ({ getPerspectiveWorker: vi.fn() }));
vi.mock("@perspective-dev/react", () => ({
  PerspectiveViewer: vi.fn(() => <div data-testid="perspective-viewer" />),
}));

const fakeDb = {} as SaveDatabase;

function location(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    idx: 3975,
    name: "mazyr",
    provinceName: "mazyr_province",
    controllerName: "RUS",
    control: 0.43119,
    rawMaterial: "wool",
    population: 2.02742,
    development: 28.83884,
    rank: "town",
    marketName: "frankfurt_an_der_oder",
    taxBase: 31.69176,
    soldiers: 9.5,
    cultureName: "polesian_culture",
    religionName: "orthodox",
    ...overrides,
  };
}

function fakeTable() {
  return { update: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.mocked(perspectiveSetup.getPerspectiveWorker).mockReset();
});

describe("LocationsTab", () => {
  it("lists every owned location with the location map-mode values, readable, as sortable columns (FR-016, FR-017)", async () => {
    const table = fakeTable();
    const workerTable = vi.fn().mockResolvedValue(table);
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: workerTable } as never);
    vi.spyOn(queries, "listNationLocations").mockResolvedValue([location()]);

    const { PerspectiveViewer } = await import("@perspective-dev/react");
    render(<LocationsTab db={fakeDb} nationIdx={2025} />);

    await waitFor(() => expect(screen.getByTestId("perspective-viewer")).toBeInTheDocument());
    expect(workerTable).toHaveBeenCalledWith(expect.objectContaining({ location: "string", control: "float" }), {
      name: "locations-2025",
    });
    expect(table.update).toHaveBeenCalledWith([
      {
        location: "Mazyr",
        province: "Mazyr Province",
        terrain: LOCATION_TERRAIN.mazyr ? expect.any(String) : null,
        rank: "Town",
        development: 28.83884,
        population: 2.02742,
        tax_base: 31.69176,
        soldiers: 9.5,
        control: expect.closeTo(43.119, 6),
        controller: "RUS",
        raw_good: "Wool",
        market: "Frankfurt An Der Oder",
        culture: "Polesian Culture",
        religion: "Orthodox",
      },
    ]);
    const props = vi.mocked(PerspectiveViewer).mock.calls.at(-1)![0];
    expect(props.config).toMatchObject({
      columns: expect.arrayContaining(["location", "terrain", "control"]),
      sort: [["development", "desc"]],
    });
  });

  it("keeps missing values empty rather than inventing them (FR-027)", async () => {
    const table = fakeTable();
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: vi.fn().mockResolvedValue(table) } as never);
    vi.spyOn(queries, "listNationLocations").mockResolvedValue([
      location({ name: null, rank: null, cultureName: null, control: null, development: null }),
    ]);

    render(<LocationsTab db={fakeDb} nationIdx={2025} />);
    await waitFor(() => expect(table.update).toHaveBeenCalled());
    expect(table.update.mock.calls[0][0][0]).toMatchObject({
      location: "Location 3975",
      terrain: null,
      rank: null,
      culture: null,
      control: null,
      development: null,
    });
  });

  it("shows EmptyState when the nation owns no locations", async () => {
    vi.mocked(perspectiveSetup.getPerspectiveWorker).mockResolvedValue({ table: vi.fn() } as never);
    vi.spyOn(queries, "listNationLocations").mockResolvedValue([]);
    render(<LocationsTab db={fakeDb} nationIdx={1} />);
    await waitFor(() => expect(screen.getByText("This nation has no locations.")).toBeInTheDocument());
  });
});
