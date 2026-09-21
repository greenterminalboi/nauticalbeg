import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import {
  SocietalCompassChart,
  type SocietalCompassPoint,
} from "../../src/components/Overview/SocietalCompassChart";
import * as chartHook from "../../src/components/Overview/charts/useEChartsInstance";

// specs/010-societal-values-compass: same mock-the-hook, assert-the-
// option approach as LeaderboardChart.test.tsx — the actual ECharts
// rendering isn't this app's code to test.
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

function point(overrides: Partial<SocietalCompassPoint> = {}): SocietalCompassPoint {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    x: 0.5,
    y: -0.3,
    axisCount: 1,
    colorRgb: [183, 136, 27],
    colorAxisValue: null,
    axisBreakdown: [{ axis: "aristocracy_vs_plutocracy", label: "Plutocracy", normalizedValue: 0.67 }],
    ...overrides,
  };
}

describe("SocietalCompassChart", () => {
  it("centers the chart with a shared, symmetric domain across both axes (post-ship: 'the compass isn't centered')", () => {
    render(<SocietalCompassChart points={[point({ x: 0.5, y: -0.2 })]} colorMode="country" />);
    const option = latestOption();
    const xAxis = option.xAxis as { min?: number; max?: number };
    const yAxis = option.yAxis as { min?: number; max?: number };
    expect(xAxis.min).toBe(-(xAxis.max ?? 0));
    expect(yAxis.min).toBe(-(yAxis.max ?? 0));
    // Both axes share the exact same bound -- a genuinely square,
    // centered domain, not independently auto-scaled per axis.
    expect(xAxis.max).toBe(yAxis.max);
  });

  it("renders exactly one scatter point per input point, at its own (x, y)", () => {
    const points = [point({ nationIdx: 1, x: 0.1, y: 0.2 }), point({ nationIdx: 2, x: -0.4, y: 0.1 })];
    render(<SocietalCompassChart points={points} colorMode="country" />);
    const series = latestOption().series as Array<{ data?: Array<{ value: number[] }> }>;
    expect(series[0].data).toHaveLength(2);
    expect(series[0].data![0].value).toEqual([0.1, 0.2]);
    expect(series[0].data![1].value).toEqual([-0.4, 0.1]);
  });

  it("the tooltip formatter includes the country name/tag and its per-axis breakdown (FR-009)", () => {
    render(<SocietalCompassChart points={[point()]} colorMode="country" />);
    const tooltip = latestOption().tooltip as { formatter?: (p: unknown) => string };
    const html = tooltip.formatter!({ data: point() });
    expect(html).toContain("Russia");
    expect(html).toContain("RUS");
    expect(html).toContain("Plutocracy");
  });

  it("shows a permanent tag label per dot by default (explicit user request)", () => {
    render(<SocietalCompassChart points={[point()]} colorMode="country" />);
    const series = latestOption().series as Array<{
      label?: { show?: boolean; formatter?: (p: { data: SocietalCompassPoint }) => string };
    }>;
    expect(series[0].label?.show).toBe(true);
    expect(series[0].label!.formatter!({ data: point() })).toBe("RUS");
  });

  it("suppresses permanent labels once the country count reaches 50 (FR-010)", () => {
    const many = Array.from({ length: 50 }, (_, i) => point({ nationIdx: i }));
    render(<SocietalCompassChart points={many} colorMode="country" />);
    const series = latestOption().series as Array<{ label?: { show?: boolean } }>;
    expect(series[0].label?.show).toBe(false);
  });

  it("colors each dot by the country's own color in the default mode", () => {
    render(<SocietalCompassChart points={[point()]} colorMode="country" />);
    const series = latestOption().series as Array<{
      itemStyle?: { color?: (p: { data: SocietalCompassPoint }) => string };
    }>;
    const colorFn = series[0].itemStyle!.color!;
    expect(colorFn({ data: point({ colorRgb: [10, 20, 30] }) })).toBe("rgb(10, 20, 30)");
    expect(colorFn({ data: point({ colorRgb: [200, 100, 0] }) })).toBe("rgb(200, 100, 0)");
  });

  it("colors by the chosen axis's normalized value in axis mode, independent of position (FR-013)", () => {
    render(<SocietalCompassChart points={[point()]} colorMode="axis" colorAxisLabel="Plutocracy" />);
    const series = latestOption().series as Array<{
      itemStyle?: { color?: (p: { data: SocietalCompassPoint }) => string };
    }>;
    const colorFn = series[0].itemStyle!.color!;
    const low = colorFn({ data: point({ colorAxisValue: -1 }) });
    const high = colorFn({ data: point({ colorAxisValue: 1 }) });
    expect(low).not.toBe(high);
  });

  it("draws a static axis-end reference (crosshair + 4 edge labels) independent of the plotted data (FR-014)", () => {
    render(<SocietalCompassChart points={[point()]} colorMode="country" />);
    const option = latestOption();
    const series = option.series as Array<{ markLine?: { data?: unknown[] } }>;
    expect(series[0].markLine?.data).toEqual(
      expect.arrayContaining([{ xAxis: 0 }, { yAxis: 0 }]),
    );
    const graphicElements = (option.graphic as { elements?: unknown[] }).elements;
    expect((graphicElements?.length ?? 0)).toBeGreaterThanOrEqual(4);
  });

  it("draws a full 16-point compass rose, one label per bearing, none derived from the plotted data", () => {
    render(<SocietalCompassChart points={[point()]} colorMode="country" />);
    const option = latestOption();
    const graphicElements = (option.graphic as { elements?: Array<{ style?: { text?: string } }> })
      .elements;
    expect(graphicElements).toHaveLength(16);
    const texts = graphicElements!.map((e) => e.style?.text);
    expect(texts).toContain("Centralization");
    expect(texts).toContain("Decentralization");
    expect(texts).toContain("Traditionalist\nSpiritualist");
    expect(texts).toContain("Innovative\nHumanist");
  });
});
