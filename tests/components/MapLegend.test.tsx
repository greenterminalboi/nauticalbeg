import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MapLegend } from "../../src/components/Overview/MapLegend";
import type { LegendEntry } from "../../src/components/Overview/mapLayers";

function entries(count: number): LegendEntry[] {
  return Array.from({ length: count }, (_, i) => ({
    label: `good_${i}`,
    color: [i, i, i] as [number, number, number],
  }));
}

describe("MapLegend (specs/005-map-visualization FR-012)", () => {
  it("renders every entry with its label and swatch color", () => {
    render(
      <MapLegend title="RGO" entries={entries(3)} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    expect(screen.getByText("good_0")).toBeInTheDocument();
    expect(screen.getByText("good_1")).toBeInTheDocument();
    expect(screen.getByText("good_2")).toBeInTheDocument();
  });

  it("hides entries and the title when collapsed, but keeps a control to re-expand it", () => {
    render(
      <MapLegend title="RGO" entries={entries(3)} collapsed={true} onToggleCollapsed={vi.fn()} />,
    );
    expect(screen.queryByText("good_0")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /expand/i })).toBeInTheDocument();
  });

  it("calls onToggleCollapsed when the collapse/expand control is clicked", () => {
    const onToggleCollapsed = vi.fn();
    render(
      <MapLegend title="RGO" entries={entries(3)} collapsed={false} onToggleCollapsed={onToggleCollapsed} />,
    );
    screen.getByRole("button", { name: /collapse/i }).click();
    expect(onToggleCollapsed).toHaveBeenCalled();
  });

  // A single ever-taller column used to push the legend past the map's
  // own bottom edge once a layer had enough entries (RGO's ~50 raw
  // goods, reported against the real app). Widening into extra CSS
  // columns instead needs the panel's own width to actually grow with
  // entry count — see MapLegend.tsx's widthClassFor doc comment for why
  // this can't be left to CSS `columns` auto-sizing an auto-width panel.
  it("stays at the default (single-column-friendly) width for a small layer like Political", () => {
    const { container } = render(
      <MapLegend title="Political" entries={entries(6)} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    const panel = container.querySelector(".map-legend");
    expect(panel?.className).not.toMatch(/map-legend--wide/);
  });

  it("widens to a 2-column-capable width once a layer has more than a dozen entries", () => {
    const { container } = render(
      <MapLegend title="RGO" entries={entries(20)} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    const panel = container.querySelector(".map-legend");
    expect(panel?.className).toMatch(/map-legend--wide-2col/);
  });

  it("widens further to a 3-column-capable width for a large layer like RGO's full raw-good set", () => {
    const { container } = render(
      <MapLegend title="RGO" entries={entries(52)} collapsed={false} onToggleCollapsed={vi.fn()} />,
    );
    const panel = container.querySelector(".map-legend");
    expect(panel?.className).toMatch(/map-legend--wide-3col/);
  });

  it("doesn't apply a wide-width class while collapsed, even for a large entry count", () => {
    const { container } = render(
      <MapLegend title="RGO" entries={entries(52)} collapsed={true} onToggleCollapsed={vi.fn()} />,
    );
    const panel = container.querySelector(".map-legend");
    expect(panel?.className).not.toMatch(/map-legend--wide/);
  });
});
