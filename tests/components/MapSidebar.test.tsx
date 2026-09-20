import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapSidebar } from "../../src/components/Overview/MapSidebar";
import type { MapLayer } from "../../src/components/Overview/mapLayers";

const LAYERS: MapLayer[] = [
  {
    id: "political",
    label: "Political",
    getFill: () => [0, 0, 0],
    getTooltipFields: () => [],
    getLegend: () => [],
  },
  {
    id: "population",
    label: "Location Population",
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
