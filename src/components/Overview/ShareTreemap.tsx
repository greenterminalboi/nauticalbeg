import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./ShareTreemap.css";

export interface ShareTreemapEntry {
  id: number | string;
  label: string;
  color: [number, number, number] | null;
  value: number;
}

interface ShareTreemapProps {
  entries: readonly ShareTreemapEntry[];
}

function colorString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function formatShare(value: number, total: number): string {
  if (total <= 0) return "0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

/**
 * A generic "share of a total" treemap: one box per entry, sized by
 * its share of the combined total of every entry's (non-negative)
 * value — the caller computes `entries` (including any "everything
 * else" bucket, e.g. Leaderboard's "Other" or World Goods'
 * "Unattributed"/"Other producers"); this component only lays out and
 * renders whatever it's given.
 *
 * specs/007-production-trade-markets research.md §3: originally
 * `LeaderboardTreemap`, retrofitted from a hand-rolled SVG treemap
 * (`treemapLayout.ts`'s `squarify`) onto ECharts' own `treemap` series
 * via the shared `useEChartsInstance` hook — hand-rolled originally
 * because Perspective's own Treemap plugin has no way to bind a
 * literal RGB per box, which ECharts' `itemStyle.color` per data node
 * does support.
 *
 * specs/009-world-goods-production research.md: renamed from
 * `LeaderboardTreemap` once a second, unrelated feature (a good's
 * production share by country) needed the exact same "named, colored,
 * valued entries" shape — the component had no Leaderboard-specific
 * logic to begin with, so this is a mechanical rename, not a rewrite.
 */
export function ShareTreemap({ entries }: ShareTreemapProps) {
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
          // Post-ship, 2026-09-21: a "boxier" layout (closer to square
          // boxes rather than thin slivers) plus a subtle drop shadow
          // per box, on the user's explicit request to make this look
          // better -- squareRatio: 1 is ECharts' own literal "aim for
          // square" setting for its squarified layout algorithm.
          squareRatio: 1,
          breadcrumb: { show: false },
          upperLabel: { show: false },
          label: { show: true, color: "#fff" },
          itemStyle: {
            borderRadius: 4,
            borderWidth: 2,
            borderColor: "rgba(0, 0, 0, 0.25)",
            shadowBlur: 8,
            shadowColor: "rgba(0, 0, 0, 0.35)",
            shadowOffsetX: 2,
            shadowOffsetY: 2,
          },
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
      <div className="share-treemap">
        <p className="share-treemap__empty">No data available.</p>
      </div>
    );
  }

  return (
    <div className="share-treemap">
      <div ref={containerRef} className="share-treemap__canvas" />
    </div>
  );
}
