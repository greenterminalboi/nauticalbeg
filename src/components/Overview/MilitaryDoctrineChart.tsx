import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { NEUTRAL_COLOR } from "./mapLayers";
import { formatDoctrineLineTooltip, type DoctrineAxisReading } from "./militaryDoctrineLayout";
import "./MilitaryDoctrineChart.css";

export type MilitaryDoctrineAxis = "land_vs_naval" | "offensive_vs_defensive" | "quality_vs_quantity";

export interface MilitaryDoctrinePoint {
  nationIdx: number;
  tag: string;
  name: string;
  colorRgb: [number, number, number] | null;
  /** null value = the -999 "not applicable" sentinel, already filtered
   * out at the query layer — this component never draws a fabricated
   * value for it; the polyline simply doesn't cross that axis at a real
   * point (spec FR-002). */
  axes: Array<{ axis: MilitaryDoctrineAxis; value: number | null }>;
}

interface MilitaryDoctrineChartProps {
  points: readonly MilitaryDoctrinePoint[];
}

// Confirmed real save range (not a guess — e.g. 62.4, -18.9, 99.88381
// all seen directly in the real save this session), same domain the
// three strip plots this chart replaces already used.
const AXIS_MIN = -100;
const AXIS_MAX = 100;

// Same "second-named term is the positive pole" convention
// axisConfig.json establishes for the Societal Values Compass (e.g.
// aristocracy_vs_plutocracy: positive = Plutocracy) — positive pole
// (second-named) sits at the axis's top (AXIS_MAX).
const AXIS_META: ReadonlyArray<{ axis: MilitaryDoctrineAxis; title: string; negative: string; positive: string }> = [
  { axis: "land_vs_naval", title: "Land vs. Naval", negative: "Land", positive: "Naval" },
  { axis: "offensive_vs_defensive", title: "Offensive vs. Defensive", negative: "Offensive", positive: "Defensive" },
  { axis: "quality_vs_quantity", title: "Quality vs. Quantity", negative: "Quality", positive: "Quantity" },
];

function colorString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

interface ParallelDataPoint {
  value: [number | null, number | null, number | null];
  point: MilitaryDoctrinePoint;
  lineStyle: { color: string };
}

function asDataPoint(data: unknown): ParallelDataPoint | undefined {
  return data && typeof data === "object" && "point" in data ? (data as ParallelDataPoint) : undefined;
}

/**
 * specs/012-firepower-tab post-ship redesign (explicit user request): a
 * single ECharts `parallel` (parallel-coordinates) chart replaces the
 * original three independent strip-plot rows — one polyline per
 * country, crossing all three axes at its own value, so a country can
 * be visually tracked across axes (e.g. "is this land-heavy country
 * also offensive and quality-focused?") in a way three separate rows
 * never allowed. Reuses each country's real in-game map color
 * (Constitution Principle VI: no fabricated color), and ECharts'
 * built-in per-item `emphasis`/`blur` state model provides the
 * hover-highlight-and-fade-others interaction natively for this series
 * type (confirmed against the installed echarts version's own source:
 * every parallel-series line element gets `toggleHoverEmphasis` wired
 * unconditionally) — no hand-rolled opacity/state bookkeeping needed.
 * A country missing an axis (the raw -999 sentinel, already filtered to
 * `null` upstream) simply has no vertex at that axis; ECharts' parallel
 * view skips a `null`/`NaN` dimension when building the polyline's
 * points rather than plotting a fabricated centrist value there.
 */
export function MilitaryDoctrineChart({ points }: MilitaryDoctrineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const option = useMemo<EChartsOption>(() => {
    const data: ParallelDataPoint[] = points.map((point) => ({
      value: AXIS_META.map((m) => point.axes.find((a) => a.axis === m.axis)?.value ?? null) as [
        number | null,
        number | null,
        number | null,
      ],
      point,
      lineStyle: { color: point.colorRgb ? colorString(point.colorRgb) : colorString(NEUTRAL_COLOR) },
    }));

    // Loosely typed here (rather than EChartsOption["series"] directly):
    // `blur` is a real, supported per-series state at runtime for every
    // chart type (confirmed via the installed echarts version's own
    // ParallelView source — it reads emphasis/blur/select generically),
    // but this version's shipped .d.ts only types `emphasis` on
    // `ParallelSeriesOption`.
    const parallelSeries: Record<string, unknown> = {
      type: "parallel",
      lineStyle: { width: 1.5, opacity: 0.55 },
      emphasis: {
        focus: "self",
        blurScope: "series",
        lineStyle: { width: 3, opacity: 1 },
      },
      blur: { lineStyle: { opacity: 0.15 } },
      data,
    };

    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove|click",
        formatter: (params: unknown) => {
          const dp = asDataPoint((params as { data?: unknown }).data);
          if (!dp) return "";
          const axes: DoctrineAxisReading[] = AXIS_META.map((m, i) => ({
            axis: m.axis,
            title: m.title,
            value: dp.value[i],
          }));
          return formatDoctrineLineTooltip(dp.point.name, dp.point.tag, axes);
        },
      },
      parallelAxis: AXIS_META.map((m, i) => ({
        dim: i,
        min: AXIS_MIN,
        max: AXIS_MAX,
        interval: 100, // ticks at exactly -100, 0, 100 — labels below swap the two ends for the pole names
        axisLabel: {
          formatter: (value: number) => (value === AXIS_MIN ? m.negative : value === AXIS_MAX ? m.positive : ""),
          fontWeight: 600 as const,
        },
      })),
      parallel: {
        left: "8%",
        right: "8%",
        top: "8%",
        bottom: "8%",
        parallelAxisDefault: { nameLocation: "end", nameGap: 20 },
      },
      series: [parallelSeries],
    } as unknown as EChartsOption;
  }, [points]);

  useEChartsInstance(containerRef, option);

  return (
    <div className="military-doctrine-chart">
      <div ref={containerRef} className="military-doctrine-chart__canvas" />
      {points.length > 0 && (
        <ul className="military-doctrine-chart__legend" aria-label="Countries">
          {points.map((p) => {
            const [r, g, b] = p.colorRgb ?? NEUTRAL_COLOR;
            return (
              <li key={p.nationIdx} className="military-doctrine-chart__legend-item">
                <span
                  className="military-doctrine-chart__legend-swatch"
                  style={{ background: `rgb(${r}, ${g}, ${b})` }}
                  aria-hidden="true"
                />
                {p.name} ({p.tag})
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
