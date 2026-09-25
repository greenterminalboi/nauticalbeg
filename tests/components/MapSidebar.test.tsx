import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MapSidebar } from "../../src/components/Overview/MapSidebar";
import type { MapLayer } from "../../src/components/Overview/mapLayers";

const LAYERS: MapLayer[] = [
  {
    id: "political",
    label: "Political",
    grain: "location",
    getFill: () => [0, 0, 0],
    getTooltipFields: () => [],
    getLegend: () => [],
  },
  {
    id: "population",
    label: "Location Population",
    grain: "location",
    getFill: () => [0, 0, 0],
    getTooltipFields: () => [],
    getLegend: () => [],
  },
];

describe("MapSidebar (specs/005-map-visualization US2)", () => {
  it("lists every layer and marks the active one", () => {
    render(
      <MapSidebar
        layers={LAYERS}
        activeLayerId="political"
        onSelectLayer={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^Political$/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /^Location Population$/ })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("calls onSelectLayer with the clicked layer's id", () => {
    const onSelectLayer = vi.fn();
    render(
      <MapSidebar
        layers={LAYERS}
        activeLayerId="political"
        onSelectLayer={onSelectLayer}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );
    screen.getByRole("button", { name: /^Location Population$/ }).click();
    expect(onSelectLayer).toHaveBeenCalledWith("population");
  });

  it("hides the layer list when collapsed, but keeps a control to re-expand it", () => {
    render(
      <MapSidebar
        layers={LAYERS}
        activeLayerId="political"
        onSelectLayer={vi.fn()}
        collapsed={true}
        onToggleCollapsed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Political$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand/i })).toBeInTheDocument();
  });

  it("calls onToggleCollapsed when the collapse/expand control is clicked", () => {
    const onToggleCollapsed = vi.fn();
    render(
      <MapSidebar
        layers={LAYERS}
        activeLayerId="political"
        onSelectLayer={vi.fn()}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
      />,
    );
    screen.getByRole("button", { name: /collapse/i }).click();
    expect(onToggleCollapsed).toHaveBeenCalled();
  });
});

// specs/014-country-province-map-modes US1: layers grouped by grain.
function stubLayer(id: string, label: string, grain: MapLayer["grain"]): MapLayer {
  return { id, label, grain, getFill: () => [0, 0, 0], getTooltipFields: () => [], getLegend: () => [] };
}

const GROUPED_LAYERS: MapLayer[] = [
  stubLayer("political", "Political", "location"),
  stubLayer("provinceDevelopment", "Province Development", "province"),
  stubLayer("countryTreasury", "Country Treasury", "country"),
  stubLayer("countryStability", "Country Stability", "country"),
];

describe("MapSidebar grain sections (specs/014-country-province-map-modes US1)", () => {
  function renderGrouped(activeLayerId: string, onSelectLayer = vi.fn()) {
    render(
      <MapSidebar
        layers={GROUPED_LAYERS}
        activeLayerId={activeLayerId}
        onSelectLayer={onSelectLayer}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );
    return onSelectLayer;
  }

  it("renders Location, Province and Country section headings in that order", () => {
    renderGrouped("political");
    const headings = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-expanded") && b.className.includes("section"))
      .map((b) => b.textContent?.replace(/[▾▸]/g, "").trim());
    expect(headings).toEqual(["Location", "Province", "Country"]);
  });

  it("does not render a section with no layers", () => {
    render(
      <MapSidebar
        layers={[stubLayer("political", "Political", "location")]}
        activeLayerId="political"
        onSelectLayer={vi.fn()}
        collapsed={false}
        onToggleCollapsed={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^Province$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Country$/ })).not.toBeInTheDocument();
  });

  it("collapsing one section hides only that section's layers", () => {
    renderGrouped("political");
    const provinceHeader = screen.getByRole("button", { name: /^Province$/ });
    expect(provinceHeader).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(provinceHeader);
    expect(provinceHeader).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^Province Development$/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Political$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Country Treasury$/ })).toBeInTheDocument();
  });

  it("collapsing a section never changes the active layer", () => {
    const onSelectLayer = renderGrouped("countryTreasury");
    fireEvent.click(screen.getByRole("button", { name: /^Country$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Location$/ }));
    expect(onSelectLayer).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Country$/ }));
    expect(screen.getByRole("button", { name: /^Country Treasury$/ })).toHaveAttribute("aria-current", "page");
  });

  it("selecting a Country layer calls onSelectLayer with its id", () => {
    const onSelectLayer = renderGrouped("political");
    fireEvent.click(screen.getByRole("button", { name: /^Country Stability$/ }));
    expect(onSelectLayer).toHaveBeenCalledWith("countryStability");
  });
});
