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
  title: string;
  series: readonly LeaderboardChartSeries[];
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
export function LeaderboardChart({ title, series }: LeaderboardChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const option = useMemo<EChartsOption>(
    () => ({
      tooltip: { trigger: "axis" },
      dataZoom: [{ type: "inside" }, { type: "slider" }],
      // scale: true (post-ship, 2026-09-21) -- an EU5 save's earliest
      // year is 1337, not 0; without it ECharts' "value" axis defaults
      // its min to 0, wasting most of the plot on thirteen unplotted
      // centuries. Mirrors yAxis's existing scale: true below.
      xAxis: { type: "value", name: "Year", scale: true },
      yAxis: { type: "value", scale: true },
      series: series.map((s) => ({
        type: "line",
        name: s.label,
        // Neutral fallback color (spec FR-005) — never a fabricated
        // in-game color, matching feature 005's map rule.
        color: colorString(s.color ?? NEUTRAL_COLOR),
        data: s.points.map((p): [number, number] => [p.year, p.value]),
      })),
    }),
    [series],
  );

  useEChartsInstance(containerRef, option);

  return (
    <div className="leaderboard-chart">
      <p className="leaderboard-chart__title">{title}</p>
      <div ref={containerRef} className="leaderboard-chart__canvas" />
    </div>
  );
}
