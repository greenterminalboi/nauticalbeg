import { useId, useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import "./PopulationPie.css";

export interface PieSlice {
  key: string;
  label: string;
  size: number;
  color: [number, number, number] | null;
}

export interface FoldedSlice extends PieSlice {
  /** 0..1 of the whole pie. */
  share: number;
  isOther: boolean;
}

const OTHER_COLOR: [number, number, number] = [154, 156, 163];
const UNKNOWN_COLOR: [number, number, number] = [116, 119, 126];
const MIN_SHARE = 0.02;
const MAX_SLICES = 8;

/**
 * specs/018 research.md R5: slices under 2% of the population fold into
 * one "Other" slice, and at most 8 slices show (the 7 largest plus
 * Other), so a nation with dozens of minority cultures still reads.
 * `fold = false` lists every group: estates and social classes are small
 * fixed sets the owner wants shown in full (2026-09-26).
 */
export function foldSlices(slices: readonly PieSlice[], fold = true): FoldedSlice[] {
  const positive = slices.filter((s) => s.size > 0);
  const total = positive.reduce((n, s) => n + s.size, 0);
  if (total <= 0) return [];
  const sorted = [...positive].sort((a, b) => b.size - a.size);
  if (!fold) return sorted.map((s) => ({ ...s, share: s.size / total, isOther: false }));
  let kept = sorted.filter((s) => s.size / total >= MIN_SHARE);
  if (kept.length > MAX_SLICES || (kept.length === MAX_SLICES && kept.length < sorted.length)) {
    kept = kept.slice(0, MAX_SLICES - 1);
  }
  const keptKeys = new Set(kept.map((s) => s.key));
  const rest = sorted.filter((s) => !keptKeys.has(s.key));
  const folded: FoldedSlice[] = kept.map((s) => ({ ...s, share: s.size / total, isOther: false }));
  if (rest.length > 0) {
    const size = rest.reduce((n, s) => n + s.size, 0);
    folded.push({
      key: "__other__",
      label: `Other (${rest.length} ${rest.length === 1 ? "group" : "groups"})`,
      size,
      color: OTHER_COLOR,
      share: size / total,
      isOther: true,
    });
  }
  return folded;
}

function rgb(color: [number, number, number] | null): string {
  const [r, g, b] = color ?? UNKNOWN_COLOR;
  return `rgb(${r}, ${g}, ${b})`;
}

function formatShare(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/**
 * One of Overview's four population pies (specs/018 FR-011). The legend
 * lists every slice by name and share, so no slice relies on color alone
 * and the legend doubles as the table view. Shares, not raw pop sizes,
 * are shown: the save's pop `size` unit isn't confirmed.
 */
export function PopulationPie({
  title,
  slices,
  fold = true,
}: {
  title: string;
  slices: readonly PieSlice[];
  fold?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const folded = useMemo(() => foldSlices(slices, fold), [slices, fold]);

  const option = useMemo<EChartsOption | null>(() => {
    if (folded.length === 0) return null;
    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const data = (params as { data?: { name?: string; share?: number } }).data;
          return data?.share === undefined ? "" : `${data.name}: ${formatShare(data.share)} of the population`;
        },
      },
      series: [
        {
          type: "pie",
          radius: ["42%", "78%"],
          avoidLabelOverlap: true,
          label: { show: false },
          labelLine: { show: false },
          // 2px gap between slices. A light outline color rather than the
          // vellum surface: the game's clergy color is near-white and would
          // otherwise have no edge against the card.
          itemStyle: { borderColor: "#c4c6ce", borderWidth: 2 },
          emphasis: { scale: true, scaleSize: 4 },
          data: folded.map((s) => ({
            name: s.label,
            value: s.size,
            share: s.share,
            itemStyle: { color: rgb(s.color) },
          })),
        },
      ],
    };
  }, [folded]);

  useEChartsInstance(containerRef, option);

  return (
    <figure className="population-pie" aria-labelledby={titleId}>
      <figcaption id={titleId} className="population-pie__title">
        {title}
      </figcaption>
      {folded.length === 0 ? (
        <p className="population-pie__empty">No population data</p>
      ) : (
        <div className="population-pie__body">
          <div ref={containerRef} className="population-pie__chart" aria-hidden="true" />
          <ul className="population-pie__legend">
            {folded.map((s) => (
              <li key={s.key} className="population-pie__legend-item">
                <span className="population-pie__swatch" style={{ background: rgb(s.color) }} aria-hidden="true" />
                <span className="population-pie__label">{s.label}</span>
                <span className="population-pie__share">{formatShare(s.share)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </figure>
  );
}
