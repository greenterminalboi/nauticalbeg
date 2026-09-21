import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./LeaderboardTreemap.css";

export interface LeaderboardTreemapEntry {
  id: number | "other";
  label: string;
  color: [number, number, number] | null;
  value: number;
}

interface LeaderboardTreemapProps {
  title: string;
  entries: readonly LeaderboardTreemapEntry[];
}

function colorString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function formatShare(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * "Share of the world [metric]" treemap, per direct request: one box
 * per currently selected country existing as of the latest recorded
 * year, plus one grey "Other" box summing every other real country
 * that also reported a value that year — every box's area is its exact
 * share of that combined total (`LeaderboardTab.tsx` computes the
 * entries; this component only lays out and renders whatever it's
 * given).
 *
 * specs/007-production-trade-markets research.md §3: retrofitted from a
 * hand-rolled SVG treemap (`treemapLayout.ts`'s `squarify`) onto
 * ECharts' own `treemap` series, via the shared `useEChartsInstance`
 * hook. This was originally hand-rolled specifically because
 * Perspective's own Treemap plugin has no way to bind a literal RGB per
 * box — ECharts' `itemStyle.color` per data node does support exactly
 * that, confirmed before committing to this retrofit, so the original
 * blocker doesn't apply to ECharts.
 */
export function LeaderboardTreemap({ title, entries }: LeaderboardTreemapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const total = useMemo(
    () => entries.reduce((sum, e) => sum + Math.max(e.value, 0), 0),
    [entries],
  );

  const option = useMemo<EChartsOption | null>(() => {
    if (total <= 0) return null;
    return {
      tooltip: {
        formatter: (params: unknown) => {
          const info = Array.isArray(params) ? params[0] : params;
          const data = (info as { data?: { name?: string; value?: number } } | undefined)?.data;
          if (!data || typeof data.value !== "number") return "";
          return `${data.name} — ${data.value} (${formatShare(data.value, total)} of total)`;
        },
      },
      series: [
        {
          type: "treemap",
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          upperLabel: { show: false },
          label: { show: true, color: "#fff" },
          data: entries.map((e) => ({
            name: e.label,
            value: e.value,
            itemStyle: { color: colorString(e.color ?? NEUTRAL_COLOR) },
          })),
        },
      ],
    };
  }, [entries, total]);

  useEChartsInstance(containerRef, option);

  if (total <= 0) {
    return (
      <div className="leaderboard-treemap">
        <p className="leaderboard-treemap__title">{title}</p>
        <p>No data available for the latest recorded year.</p>
      </div>
    );
  }

  return (
    <div className="leaderboard-treemap">
      <p className="leaderboard-treemap__title">{title}</p>
      <div ref={containerRef} className="leaderboard-treemap__canvas" />
    </div>
  );
}
