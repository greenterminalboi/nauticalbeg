import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import { LeaderboardChart, type LeaderboardChartSeries } from "../../src/components/Overview/LeaderboardChart";
import * as chartHook from "../../src/components/Overview/charts/useEChartsInstance";
import { NEUTRAL_COLOR } from "../../src/components/Overview/mapLayers";

// specs/007-production-trade-markets: retrofitted onto ECharts via the
// shared useEChartsInstance hook — same mock-the-hook, assert-the-option
// approach as MarketGoodPriceChart.test.tsx, since the actual zoom/pan/
// tooltip/axis rendering is now ECharts' own, not this app's code to
// test.
vi.mock("../../src/components/Overview/charts/useEChartsInstance", () => ({
  useEChartsInstance: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(chartHook.useEChartsInstance).mockReset();
});

function latestOption(): EChartsOption {
  const calls = vi.mocked(chartHook.useEChartsInstance).mock.calls;
  return calls[calls.length - 1][1]!;
}

const series: LeaderboardChartSeries[] = [
  {
    nationIdx: 1,
    label: "RUS",
    color: [183, 136, 27],
    points: Array.from({ length: 10 }, (_, i) => ({ year: 1337 + i * 10, value: i * 5 })),
  },
];

describe("LeaderboardChart", () => {
  it("builds one ECharts line series per input series, with its exact points, in the same order", () => {
    render(<LeaderboardChart title="Population" series={series} />);

    const option = latestOption();
    const echartsSeries = option.series as Array<{ name?: string; data?: unknown[] }>;
    expect(echartsSeries).toHaveLength(1);
    expect(echartsSeries[0].name).toBe("RUS");
    expect(echartsSeries[0].data).toEqual(series[0].points.map((p) => [p.year, p.value]));
  });

  it("uses the series' literal RGB color, not an auto-assigned palette color (FR-005)", () => {
    render(<LeaderboardChart title="Population" series={series} />);

    const echartsSeries = latestOption().series as Array<{ color?: string }>;
    expect(echartsSeries[0].color).toBe("rgb(183, 136, 27)");
  });

  it("falls back to the neutral color for a series with no confirmed color, never a fabricated one", () => {
    const noColorSeries: LeaderboardChartSeries[] = [
      { nationIdx: 2, label: "Unknown", color: null, points: [{ year: 1400, value: 1 }] },
    ];
    render(<LeaderboardChart title="Population" series={noColorSeries} />);

    const echartsSeries = latestOption().series as Array<{ color?: string }>;
    expect(echartsSeries[0].color).toBe(`rgb(${NEUTRAL_COLOR.join(", ")})`);
  });

  it("re-derives the option when the series data changes", () => {
    const { rerender } = render(<LeaderboardChart title="Population" series={series} />);
    const firstOption = latestOption();

    const changedSeries: LeaderboardChartSeries[] = [
      { ...series[0], points: [{ year: 1337, value: 999 }] },
    ];
    rerender(<LeaderboardChart title="Population" series={changedSeries} />);
    const secondOption = latestOption();

    expect(secondOption).not.toBe(firstOption);
    expect((secondOption.series as Array<{ data?: unknown[] }>)[0].data).toEqual([[1337, 999]]);
  });

  it("renders the chart title as visible text", () => {
    const { getByText } = render(<LeaderboardChart title="Population" series={series} />);
    expect(getByText("Population")).toBeInTheDocument();
  });

  it("defaults to no step (undefined) and auto-scaled axes when step/yAxisRange/xAxisRange aren't passed", () => {
    render(<LeaderboardChart title="Population" series={series} />);

    const option = latestOption();
    const echartsSeries = option.series as Array<{ step?: unknown }>;
    expect(echartsSeries[0].step).toBeUndefined();
    expect(option.yAxis).toMatchObject({ type: "value", scale: true });
    expect(option.xAxis).toMatchObject({ type: "value", scale: true });
  });

  it("renders each series as step: 'end' when step is true (Ruler History stretch goal)", () => {
    render(<LeaderboardChart title="Ruler History" series={series} step />);

    const echartsSeries = latestOption().series as Array<{ step?: string }>;
    expect(echartsSeries[0].step).toBe("end");
  });

  it("uses a fixed y-axis domain when yAxisRange is passed, instead of auto-scaling", () => {
    render(<LeaderboardChart title="Ruler History" series={series} yAxisRange={[0, 300]} />);

    expect(latestOption().yAxis).toMatchObject({ type: "value", min: 0, max: 300 });
  });

  it("uses a fixed x-axis domain when xAxisRange is passed, instead of auto-scaling (Ruler History's 'deadset' 1337-current-year range)", () => {
    render(<LeaderboardChart title="Ruler History" series={series} xAxisRange={[1337, 1628]} />);

    expect(latestOption().xAxis).toMatchObject({ type: "value", min: 1337, max: 1628 });
  });
});
