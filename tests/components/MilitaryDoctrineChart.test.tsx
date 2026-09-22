import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EChartsOption } from "echarts";
import {
  MilitaryDoctrineChart,
  type MilitaryDoctrinePoint,
} from "../../src/components/Overview/MilitaryDoctrineChart";
import * as chartHook from "../../src/components/Overview/charts/useEChartsInstance";

// specs/012-firepower-tab post-ship redesign: same mock-the-hook,
// assert-the-option approach as SocietalCompassChart.test.tsx/
// LeaderboardChart.test.tsx — the actual ECharts rendering isn't this
// app's code to test.
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

function point(overrides: Partial<MilitaryDoctrinePoint> = {}): MilitaryDoctrinePoint {
  return {
    nationIdx: 2025,
    tag: "RUS",
    name: "Russia",
    colorRgb: [183, 136, 27],
    axes: [
      { axis: "land_vs_naval", value: 62.4 },
      { axis: "offensive_vs_defensive", value: -18.9 },
      { axis: "quality_vs_quantity", value: null },
    ],
    ...overrides,
  };
}

describe("MilitaryDoctrineChart (specs/012-firepower-tab post-ship: parallel-coordinates redesign)", () => {
  it("renders exactly one parallel-coordinates data item per country, one value per axis in a fixed order", () => {
    render(<MilitaryDoctrineChart points={[point()]} />);
    const series = latestOption().series as Array<{ data?: Array<{ value: unknown[] }> }>;
    expect(series[0].data).toHaveLength(1);
    // land_vs_naval, offensive_vs_defensive, quality_vs_quantity order —
    // the locked axis (null) is passed through as null, never a
    // fabricated centrist 0.
    expect(series[0].data![0].value).toEqual([62.4, -18.9, null]);
  });

  it("uses the real in-game map color for each country's line, falling back to neutral gray when absent", () => {
    const withColor = point({ colorRgb: [183, 136, 27] });
    const withoutColor = point({ nationIdx: 3, tag: "SCA", colorRgb: null });
    render(<MilitaryDoctrineChart points={[withColor, withoutColor]} />);
    const series = latestOption().series as Array<{ data?: Array<{ lineStyle: { color: string } }> }>;
    expect(series[0].data![0].lineStyle.color).toBe("rgb(183, 136, 27)");
    expect(series[0].data![1].lineStyle.color).toBe("rgb(200, 200, 200)"); // NEUTRAL_COLOR
  });

  it("confirms the real -100..+100 axis domain (not guessed) on all three parallel axes", () => {
    render(<MilitaryDoctrineChart points={[point()]} />);
    const parallelAxis = latestOption().parallelAxis as Array<{ min: number; max: number }>;
    expect(parallelAxis).toHaveLength(3);
    for (const axis of parallelAxis) {
      expect(axis.min).toBe(-100);
      expect(axis.max).toBe(100);
    }
  });

  it("labels each axis's two poles via the axisLabel formatter at the exact min/max, blank in between", () => {
    render(<MilitaryDoctrineChart points={[point()]} />);
    const parallelAxis = latestOption().parallelAxis as Array<{
      axisLabel: { formatter: (value: number) => string };
    }>;
    const [landVsNaval, offensiveVsDefensive, qualityVsQuantity] = parallelAxis;
    expect(landVsNaval.axisLabel.formatter(-100)).toBe("Land");
    expect(landVsNaval.axisLabel.formatter(100)).toBe("Naval");
    expect(landVsNaval.axisLabel.formatter(0)).toBe("");
    expect(offensiveVsDefensive.axisLabel.formatter(-100)).toBe("Offensive");
    expect(offensiveVsDefensive.axisLabel.formatter(100)).toBe("Defensive");
    expect(qualityVsQuantity.axisLabel.formatter(-100)).toBe("Quality");
    expect(qualityVsQuantity.axisLabel.formatter(100)).toBe("Quantity");
  });

  it("configures hover-highlight/fade-others via ECharts' per-item emphasis/blur state, not hand-rolled opacity", () => {
    render(<MilitaryDoctrineChart points={[point()]} />);
    const series = latestOption().series as Array<{
      emphasis: { focus: string; blurScope: string; lineStyle: { opacity: number } };
      blur: { lineStyle: { opacity: number } };
    }>;
    expect(series[0].emphasis.focus).toBe("self");
    expect(series[0].emphasis.blurScope).toBe("series");
    expect(series[0].emphasis.lineStyle.opacity).toBe(1);
    // ~20% per the spec ("fade all other lines to ~20% opacity").
    expect(series[0].blur.lineStyle.opacity).toBeCloseTo(0.15, 1);
  });

  it("the tooltip formatter shows the exact value and modifiers across all three axes for the hovered line", () => {
    render(<MilitaryDoctrineChart points={[point()]} />);
    const tooltip = latestOption().tooltip as {
      formatter: (params: unknown) => string;
      triggerOn: string;
    };
    expect(tooltip.triggerOn).toBe("mousemove|click"); // hover OR click, per spec
    const text = tooltip.formatter({
      data: {
        point: point(),
        value: [62.4, -18.9, null],
      },
    });
    expect(text).toContain("Russia (RUS)");
    expect(text).toContain("62.4");
    expect(text).toContain("-18.9");
    expect(text).toContain("not applicable"); // the locked quality_vs_quantity axis
  });

  it("renders a persistent color-key legend listing every country's tag, for identification without permanent on-chart labels", () => {
    const rus = point({ nationIdx: 2025, tag: "RUS", name: "Russia" });
    const sca = point({ nationIdx: 3, tag: "SCA", name: "Sweden" });
    render(<MilitaryDoctrineChart points={[rus, sca]} />);
    expect(screen.getByText("Russia (RUS)")).toBeInTheDocument();
    expect(screen.getByText("Sweden (SCA)")).toBeInTheDocument();
  });

  it("renders no legend when there are no applicable countries, never a fabricated entry", () => {
    render(<MilitaryDoctrineChart points={[]} />);
    expect(screen.queryByLabelText("Countries")).not.toBeInTheDocument();
  });
});
