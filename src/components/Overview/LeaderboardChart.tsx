import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { NEUTRAL_COLOR } from "./mapLayers";
import type { LeaderboardSeriesPoint } from "./leaderboardData";
import "./LeaderboardChart.css";

export interface LeaderboardChartSeries {
  nationIdx: number;
  label: string;
  color: [number, number, number] | null;
  points: readonly LeaderboardSeriesPoint[];
}

interface LeaderboardChartProps {
  /** Post-ship, 2026-09-21: optional -- omit it when the caller already
   * shows a page-level title of its own (e.g. next to its country
   * search box) so the two don't duplicate. */
  title?: string;
  series: readonly LeaderboardChartSeries[];
  /** Post-ship, 2026-09-21 (Ruler History stretch goal): renders each
   * series as a step line (ECharts' `step: "end"`) instead of a
   * smooth/linear connection between points — correct for a value that
   * holds constant between real, discrete changes (a ruler's score
   * through their whole reign) rather than continuously varying like
   * population/economic base. Also switches the axis pointer to
   * `snap: false` (continuous, mouse-following) instead of the default
   * nearest-data-point snap — snapping picks whichever of the two
   * flanking points is closer in pixels, which for a step line is
   * wrong on one side of its own step boundary; continuous tracking
   * lets a custom `tooltipFormatter` (below) look up the value the step
   * line is actually drawing at the exact hovered x. */
  step?: boolean;
  /** Post-ship, 2026-09-21 (Ruler History): a fixed y-axis domain
   * instead of the default auto-scaled one — for a metric with a real,
   * known bound (adm+dip+mil, always 0-300), showing that full range
   * gives more context than auto-fitting to whatever this save's data
   * happens to span. */
  yAxisRange?: readonly [number, number];
  /** Post-ship, 2026-09-21 (Ruler History, explicit user request): a
   * fixed x-axis domain instead of the default auto-scaled one — Ruler
   * History is "deadset" to 1337 (the campaign's start year) through
   * the save's own current year, regardless of which countries happen
   * to be selected. */
  xAxisRange?: readonly [number, number];
  /** Post-ship, 2026-09-21 (Ruler History): overrides the default
   * "nearest point per series" tooltip content entirely. Receives
   * ECharts' own formatter `params` (the axis-trigger callback shape)
   * and returns the tooltip's HTML — used together with `step` so the
   * caller can look up the *correct* step-line value at the hovered x
   * from its own raw data, rather than trusting ECharts' nearest-point
   * pick (see `step`'s own doc comment above). */
  tooltipFormatter?: (params: unknown) => string;
}

function colorString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * specs/007-production-trade-markets research.md §3: retrofitted from a
 * hand-rolled SVG line chart onto ECharts via the shared
 * `useEChartsInstance` hook, as part of this app's charting-library
 * consolidation. `LeaderboardChartSeries`/`LeaderboardSeriesPoint`
 * (leaderboardData.ts) are unchanged — only the rendering internals
 * changed. ECharts' built-in `dataZoom` (wheel-zoom + drag-pan) replaces
 * the old custom zoom/pan math, and its axis `tooltip` replaces the old
 * per-mousemove nearest-point hit-test — both were the majority of the
 * file this replaces.
 */
export function LeaderboardChart({
  title,
  series,
  step,
  yAxisRange,
  xAxisRange,
  tooltipFormatter,
}: LeaderboardChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: {
        trigger: "axis",
        ...(tooltipFormatter ? { formatter: tooltipFormatter } : {}),
        // snap: false only for a step chart (see the `step` prop's own
        // doc comment) -- every other chart keeps ECharts' default
        // nearest-point snapping, which is the right behavior for a
        // smooth/continuous line.
        ...(step ? { axisPointer: { type: "line", snap: false } } : {}),
      },
      dataZoom: [{ type: "inside" }, { type: "slider" }],
      // scale: true (post-ship, 2026-09-21) -- an EU5 save's earliest
      // year is 1337, not 0; without it ECharts' "value" axis defaults
      // its min to 0, wasting most of the plot on thirteen unplotted
      // centuries. Mirrors yAxis's existing scale: true below.
      xAxis: xAxisRange
        ? { type: "value", name: "Year", min: xAxisRange[0], max: xAxisRange[1] }
        : { type: "value", name: "Year", scale: true },
      yAxis: yAxisRange
        ? { type: "value", min: yAxisRange[0], max: yAxisRange[1] }
        : { type: "value", scale: true },
      series: series.map((s) => ({
        type: "line",
        name: s.label,
        step: step ? "end" : undefined,
        // Neutral fallback color (spec FR-005) — never a fabricated
        // in-game color, matching feature 005's map rule.
        color: colorString(s.color ?? NEUTRAL_COLOR),
        data: s.points.map((p): [number, number] => [p.year, p.value]),
      })),
    }),
    [series, step, yAxisRange, xAxisRange, tooltipFormatter],
  );

  useEChartsInstance(containerRef, option);

  return (
    <div className="leaderboard-chart">
      {title && <p className="leaderboard-chart__title">{title}</p>}
      <div ref={containerRef} className="leaderboard-chart__canvas" />
    </div>
  );
}
