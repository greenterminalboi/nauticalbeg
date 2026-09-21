import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import { LeaderboardTreemap, type LeaderboardTreemapEntry } from "../../src/components/Overview/LeaderboardTreemap";
import * as chartHook from "../../src/components/Overview/charts/useEChartsInstance";

// specs/007-production-trade-markets: retrofitted onto ECharts' treemap
// series via the shared useEChartsInstance hook — same mock-the-hook,
// assert-the-option approach as LeaderboardChart.test.tsx.
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

describe("LeaderboardTreemap", () => {
  it("builds one treemap data node per entry, with its exact value and literal RGB color", () => {
    const entries: LeaderboardTreemapEntry[] = [
      { id: 1, label: "RUS", color: [183, 136, 27], value: 60 },
      { id: 2, label: "SCA", color: [10, 20, 30], value: 30 },
      { id: "other", label: "Other", color: [200, 200, 200], value: 10 },
    ];
    render(<LeaderboardTreemap title="Population" entries={entries} />);

    const nodes = (latestOption()!.series as Array<{ data?: TreemapNode[] }>)[0].data!;
    expect(nodes).toHaveLength(3);
    expect(nodes).toEqual([
      { name: "RUS", value: 60, itemStyle: { color: "rgb(183, 136, 27)" } },
      { name: "SCA", value: 30, itemStyle: { color: "rgb(10, 20, 30)" } },
      { name: "Other", value: 10, itemStyle: { color: "rgb(200, 200, 200)" } },
    ]);
  });

  it("falls back to the neutral color for an entry with no confirmed color, never a fabricated one", () => {
    const entries: LeaderboardTreemapEntry[] = [{ id: 1, label: "SCA", color: null, value: 10 }];
    render(<LeaderboardTreemap title="Population" entries={entries} />);

    const nodes = (latestOption()!.series as Array<{ data?: TreemapNode[] }>)[0].data!;
    expect(nodes[0].itemStyle?.color).toBe("rgb(200, 200, 200)");
  });

  it("shows a no-data message instead of an empty chart when every entry has zero/negative value", () => {
    render(<LeaderboardTreemap title="Population" entries={[{ id: 1, label: "RUS", color: null, value: 0 }]} />);
    expect(screen.getByText(/No data available/)).toBeInTheDocument();
    // The chart hook is never handed an option with a fabricated series.
    expect(latestOption()).toBeNull();
  });

  it("formats the tooltip as country, value, and its share of the total", () => {
    const entries: LeaderboardTreemapEntry[] = [
      { id: 1, label: "RUS", color: [183, 136, 27], value: 75 },
      { id: 2, label: "SCA", color: [10, 20, 30], value: 25 },
    ];
    render(<LeaderboardTreemap title="Population" entries={entries} />);

    const tooltip = latestOption()!.tooltip as { formatter?: (params: unknown) => string };
    const text = tooltip.formatter!({ data: { name: "RUS", value: 75 } });
    expect(text).toContain("RUS");
    expect(text).toContain("75");
    expect(text).toContain("75.0%"); // 75 / (75 + 25) of total
  });

  it("renders the chart title as visible text", () => {
    const entries: LeaderboardTreemapEntry[] = [{ id: 1, label: "RUS", color: null, value: 10 }];
    render(<LeaderboardTreemap title="Population" entries={entries} />);
    expect(screen.getByText("Population")).toBeInTheDocument();
  });
});
