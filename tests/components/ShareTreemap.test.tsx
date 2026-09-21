import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import { ShareTreemap, type ShareTreemapEntry } from "../../src/components/Overview/ShareTreemap";
import * as chartHook from "../../src/components/Overview/charts/useEChartsInstance";

// specs/007-production-trade-markets: retrofitted onto ECharts' treemap
// series via the shared useEChartsInstance hook — same mock-the-hook,
// assert-the-option approach as LeaderboardChart.test.tsx.
// specs/009-world-goods-production: renamed from LeaderboardTreemap, a
// mechanical rename, once a second feature needed the same generic
// "named, colored, valued entries" treemap.
// Post-ship, 2026-09-21: dropped its own `title` — whatever selected the
// entries (GoodSelect, the Leaderboard side nav) already shows that
// label, so this component no longer renders one.
vi.mock("../../src/components/Overview/charts/useEChartsInstance", () => ({
  useEChartsInstance: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(chartHook.useEChartsInstance).mockReset();
});

function latestOption(): EChartsOption | null {
  const calls = vi.mocked(chartHook.useEChartsInstance).mock.calls;
  return calls[calls.length - 1]?.[1] ?? null;
}

interface TreemapNode {
  name?: string;
  value?: number;
  itemStyle?: { color?: string };
}

describe("ShareTreemap", () => {
  it("builds one treemap data node per entry, with its exact value and literal RGB color", () => {
    const entries: ShareTreemapEntry[] = [
      { id: 1, label: "RUS", color: [183, 136, 27], value: 60 },
      { id: 2, label: "SCA", color: [10, 20, 30], value: 30 },
      { id: "other", label: "Other", color: [200, 200, 200], value: 10 },
    ];
    render(<ShareTreemap entries={entries} />);

    const nodes = (latestOption()!.series as Array<{ data?: TreemapNode[] }>)[0].data!;
    expect(nodes).toHaveLength(3);
    expect(nodes).toEqual([
      { name: "RUS", value: 60, itemStyle: { color: "rgb(183, 136, 27)" } },
      { name: "SCA", value: 30, itemStyle: { color: "rgb(10, 20, 30)" } },
      { name: "Other", value: 10, itemStyle: { color: "rgb(200, 200, 200)" } },
    ]);
  });

  it("falls back to the neutral color for an entry with no confirmed color, never a fabricated one", () => {
    const entries: ShareTreemapEntry[] = [{ id: 1, label: "SCA", color: null, value: 10 }];
    render(<ShareTreemap entries={entries} />);

    const nodes = (latestOption()!.series as Array<{ data?: TreemapNode[] }>)[0].data!;
    expect(nodes[0].itemStyle?.color).toBe("rgb(200, 200, 200)");
  });

  it("shows a no-data message instead of an empty chart when every entry has zero/negative value", () => {
    render(<ShareTreemap entries={[{ id: 1, label: "RUS", color: null, value: 0 }]} />);
    expect(screen.getByText(/No data available/)).toBeInTheDocument();
    // The chart hook is never handed an option with a fabricated series.
    expect(latestOption()).toBeNull();
  });

  it("formats the tooltip as label, value, and its share of the total", () => {
    const entries: ShareTreemapEntry[] = [
      { id: 1, label: "RUS", color: [183, 136, 27], value: 75 },
      { id: 2, label: "SCA", color: [10, 20, 30], value: 25 },
    ];
    render(<ShareTreemap entries={entries} />);

    const tooltip = latestOption()!.tooltip as { formatter?: (params: unknown) => string };
    const text = tooltip.formatter!({ data: { name: "RUS", value: 75 } });
    expect(text).toContain("RUS");
    expect(text).toContain("75");
    expect(text).toContain("75.0%"); // 75 / (75 + 25) of total
  });

  it("supports a string id for a non-numeric entry (e.g. an 'unattributed' bucket)", () => {
    const entries: ShareTreemapEntry[] = [
      { id: "unattributed", label: "Unattributed", color: null, value: 5 },
    ];
    render(<ShareTreemap entries={entries} />);
    const nodes = (latestOption()!.series as Array<{ data?: TreemapNode[] }>)[0].data!;
    expect(nodes[0]).toMatchObject({ name: "Unattributed", value: 5 });
  });
});
