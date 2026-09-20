import { useMemo, useState } from "react";
import { NEUTRAL_COLOR } from "./mapLayers";
import { squarify, type TreemapInput } from "./treemapLayout";
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

const WIDTH = 640;
const HEIGHT = 300;
const MIN_LABEL_WIDTH = 44;
const MIN_LABEL_HEIGHT = 22;

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
 * given). Hand-rolled SVG for the same reason as `LeaderboardChart.tsx`
 * — Perspective's own Treemap plugin has no way to bind a literal RGB
 * per box (research confirmed in this feature's tasks.md addendum),
 * only a numeric gradient or an auto-assigned category palette.
 */
export function LeaderboardTreemap({ title, entries }: LeaderboardTreemapProps) {
  const [hoverId, setHoverId] = useState<LeaderboardTreemapEntry["id"] | null>(null);

  const total = useMemo(() => entries.reduce((sum, e) => sum + Math.max(e.value, 0), 0), [entries]);

  const rects = useMemo(() => {
    const items: (TreemapInput & { entry: LeaderboardTreemapEntry })[] = entries.map((e) => ({
      id: e.id,
      value: e.value,
      entry: e,
    }));
    return squarify(items, 0, 0, WIDTH, HEIGHT);
  }, [entries]);

  if (rects.length === 0) {
    return (
      <div className="leaderboard-treemap">
        <p className="leaderboard-treemap__title">{title}</p>
        <p>No data available for the latest recorded year.</p>
      </div>
    );
  }

  const hovered = rects.find((r) => r.item.entry.id === hoverId) ?? null;

  return (
    <div className="leaderboard-treemap">
      <p className="leaderboard-treemap__title">{title}</p>
      <svg className="leaderboard-treemap__svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
        {rects.map(({ item, x, y, width, height }) => {
          const [r, g, b] = item.entry.color ?? NEUTRAL_COLOR;
          const showLabel = width >= MIN_LABEL_WIDTH && height >= MIN_LABEL_HEIGHT;
          return (
            <g
              key={item.id}
              onMouseEnter={() => setHoverId(item.entry.id)}
              onMouseLeave={() => setHoverId(null)}
            >
              <rect
                className="leaderboard-treemap__box"
                x={x}
                y={y}
                width={width}
                height={height}
                fill={`rgb(${r}, ${g}, ${b})`}
                stroke={hoverId === item.entry.id ? "#fff" : undefined}
              >
                {/* Native accessible name (screen readers / AT), kept
                    alongside the visible on-chart tooltip below —
                    constitution Principle VI: text identification
                    independent of the visual hover affordance. */}
                <title>
                  {item.entry.label} — {item.entry.value} ({formatShare(item.entry.value, total)} of total)
                </title>
              </rect>
              {showLabel && (
                <text className="leaderboard-treemap__label" x={x + 4} y={y + 14}>
                  {item.entry.label}
                </text>
              )}
            </g>
          );
        })}
        {hovered &&
          (() => {
            const { item, x, y, width, height } = hovered;
            const text = `${item.entry.label} — ${item.entry.value} (${formatShare(item.entry.value, total)} of total)`;
            const boxWidth = text.length * 5.5 + 12;
            const boxHeight = 20;
            const cx = x + width / 2;
            const flipLeft = cx + boxWidth / 2 > WIDTH;
            const tooltipX = flipLeft ? WIDTH - boxWidth - 2 : Math.max(cx - boxWidth / 2, 2);
            const tooltipY = y > boxHeight + 8 ? y - boxHeight - 4 : y + height + 4;
            return (
              <g className="leaderboard-treemap__tooltip" pointerEvents="none">
                <rect x={tooltipX} y={tooltipY} width={boxWidth} height={boxHeight} rx={3} />
                <text x={tooltipX + 6} y={tooltipY + boxHeight / 2 + 4}>
                  {text}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
