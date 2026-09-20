import { useId, useMemo, useRef, useState } from "react";
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

interface Domain {
  minYear: number;
  maxYear: number;
  minValue: number;
  maxValue: number;
}

const WIDTH = 640;
const HEIGHT = 300;
const PADDING = { top: 16, right: 16, bottom: 36, left: 72 };
const TICK_COUNT = 6;
const MIN_ZOOM_YEARS = 2; // never zoom in past a ~2-year window
const ZOOM_STEP = 0.85;

function fullDomainOf(series: readonly LeaderboardChartSeries[]): Domain {
  let minY = Infinity;
  let maxY = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.year < minY) minY = p.year;
      if (p.year > maxY) maxY = p.year;
      if (p.value < minV) minV = p.value;
      if (p.value > maxV) maxV = p.value;
    }
  }
  if (!Number.isFinite(minY)) {
    return { minYear: 0, maxYear: 1, minValue: 0, maxValue: 1 };
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }
  // A flat single-value series would otherwise divide by zero below.
  if (minV === maxV) {
    minV -= 1;
    maxV += 1;
  }
  return { minYear: minY, maxYear: maxY, minValue: minV, maxValue: maxV };
}

/** Evenly-spaced tick values across [min, max], `count` of them. */
function ticksFor(min: number, max: number, count: number): number[] {
  if (min === max) return [min];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

/** Per direct request: every 100 years of visible range halves the
 * x-axis tick count (fewer `<text>` elements to render), never below 2
 * so the range's ends stay legible. */
function xTickCountFor(yearSpan: number): number {
  const halvings = Math.floor(Math.max(yearSpan, 0) / 100);
  return Math.max(2, Math.round(TICK_COUNT / 2 ** halvings));
}

/** Nearest point to `year` within `points` (sorted ascending by year,
 * per contracts/leaderboard-data-contract.md's `ORDER BY ... year`) via
 * binary search — O(log n) instead of scanning every point, since the
 * hover hit-test below runs on every `mousemove`, potentially against
 * thousands of points across many selected countries. */
function nearestPointIndex(points: readonly LeaderboardSeriesPoint[], year: number): number {
  if (points.length === 0) return -1;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].year < year) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].year - year) < Math.abs(points[lo].year - year)) {
    return lo - 1;
  }
  return lo;
}

function formatYear(year: number): string {
  return String(Math.round(year));
}

function formatValue(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return value.toFixed(0);
  if (abs >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function clampDomain(domain: Domain, full: Domain): Domain {
  let { minYear, maxYear, minValue, maxValue } = domain;
  const yearSpan = Math.min(maxYear - minYear, full.maxYear - full.minYear);
  const valueSpan = Math.min(maxValue - minValue, full.maxValue - full.minValue);
  if (minYear < full.minYear) {
    minYear = full.minYear;
    maxYear = minYear + yearSpan;
  }
  if (maxYear > full.maxYear) {
    maxYear = full.maxYear;
    minYear = maxYear - yearSpan;
  }
  if (minValue < full.minValue) {
    minValue = full.minValue;
    maxValue = minValue + valueSpan;
  }
  if (maxValue > full.maxValue) {
    maxValue = full.maxValue;
    minValue = maxValue - valueSpan;
  }
  return { minYear, maxYear, minValue, maxValue };
}

/**
 * specs/006-country-leaderboard research.md §7: a generic hand-rolled
 * SVG line chart — one `<path>` per series, stroked with that series'
 * exact RGB (spec FR-005), not an auto-assigned palette color, which is
 * the one requirement neither the app's existing Perspective charting
 * nor a canvas approach (feature 005's map choice) fits as directly at
 * this feature's much smaller scale. No knowledge of "population" vs
 * "wealth" specifics — `title` and `series` are the only inputs, reused
 * for every graph `LeaderboardTab` renders.
 *
 * Zoom/pan: mouse wheel zooms in/out centered on the cursor; click-drag
 * pans once zoomed in. Both are implemented against a local `zoomDomain`
 * override (null = fully zoomed out, showing `fullDomain`) rather than
 * an external dependency — the same hand-rolled-over-off-the-shelf
 * reasoning as the chart itself (research.md §7).
 */
export function LeaderboardChart({ title, series }: LeaderboardChartProps) {
  const [hoverIndex, setHoverIndex] = useState<{ seriesIdx: number; pointIdx: number } | null>(
    null,
  );
  const [zoomDomain, setZoomDomain] = useState<Domain | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startDomain: Domain } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const clipId = useId();

  const fullDomain = useMemo(() => fullDomainOf(series), [series]);
  const domain = zoomDomain ?? fullDomain;

  const innerWidth = WIDTH - PADDING.left - PADDING.right;
  const innerHeight = HEIGHT - PADDING.top - PADDING.bottom;

  function x(year: number): number {
    if (domain.maxYear === domain.minYear) return PADDING.left;
    return PADDING.left + ((year - domain.minYear) / (domain.maxYear - domain.minYear)) * innerWidth;
  }
  function y(value: number): number {
    if (domain.maxValue === domain.minValue) return HEIGHT - PADDING.bottom;
    return (
      PADDING.top + (1 - (value - domain.minValue) / (domain.maxValue - domain.minValue)) * innerHeight
    );
  }
  function yearAtSvgX(px: number): number {
    return domain.minYear + ((px - PADDING.left) / innerWidth) * (domain.maxYear - domain.minYear);
  }
  function valueAtSvgY(py: number): number {
    return domain.minValue + (1 - (py - PADDING.top) / innerHeight) * (domain.maxValue - domain.minValue);
  }

  function toSvgPoint(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * WIDTH,
      y: ((clientY - rect.top) / rect.height) * HEIGHT,
    };
  }

  function pathFor(points: readonly LeaderboardSeriesPoint[]): string {
    return points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.year)},${y(p.value)}`).join(" ");
  }

  function handleWheel(e: React.WheelEvent<SVGSVGElement>) {
    e.preventDefault();
    const { x: px, y: py } = toSvgPoint(e.clientX, e.clientY);
    const anchorYear = yearAtSvgX(px);
    const anchorValue = valueAtSvgY(py);
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

    const fullYearSpan = fullDomain.maxYear - fullDomain.minYear;
    const fullValueSpan = fullDomain.maxValue - fullDomain.minValue;
    const minYearSpan = Math.min(MIN_ZOOM_YEARS, fullYearSpan);

    let yearSpan = (domain.maxYear - domain.minYear) * factor;
    yearSpan = Math.min(Math.max(yearSpan, minYearSpan), fullYearSpan);
    let valueSpan = (domain.maxValue - domain.minValue) * factor;
    valueSpan = Math.min(valueSpan, fullValueSpan);

    if (yearSpan >= fullYearSpan && valueSpan >= fullValueSpan) {
      setZoomDomain(null);
      return;
    }

    const yearFrac = (anchorYear - domain.minYear) / (domain.maxYear - domain.minYear || 1);
    const valueFrac = (anchorValue - domain.minValue) / (domain.maxValue - domain.minValue || 1);
    const next: Domain = {
      minYear: anchorYear - yearFrac * yearSpan,
      maxYear: anchorYear - yearFrac * yearSpan + yearSpan,
      minValue: anchorValue - valueFrac * valueSpan,
      maxValue: anchorValue - valueFrac * valueSpan + valueSpan,
    };
    setZoomDomain(clampDomain(next, fullDomain));
  }

  function handleMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startDomain: domain };
    setIsDragging(true);
  }

  // A pixel-radius threshold in SVG user-space units (the viewBox is a
  // fixed 640x300 regardless of rendered size) — a mouse position this
  // far from every point counts as "not hovering," clearing the tooltip
  // rather than always snapping to whatever's nearest.
  const HOVER_RADIUS_SQ = 15 * 15;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (dragRef.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const dxSvg = ((e.clientX - dragRef.current.startX) / rect.width) * WIDTH;
      const dySvg = ((e.clientY - dragRef.current.startY) / rect.height) * HEIGHT;
      const { startDomain } = dragRef.current;
      const yearSpan = startDomain.maxYear - startDomain.minYear;
      const valueSpan = startDomain.maxValue - startDomain.minValue;
      const dYear = -(dxSvg / innerWidth) * yearSpan;
      const dValue = (dySvg / innerHeight) * valueSpan;
      const next: Domain = {
        minYear: startDomain.minYear + dYear,
        maxYear: startDomain.maxYear + dYear,
        minValue: startDomain.minValue + dValue,
        maxValue: startDomain.maxValue + dValue,
      };
      setZoomDomain(clampDomain(next, fullDomain));
      return;
    }

    // Hover hit-test: one shared handler for every series/point instead
    // of an onMouseEnter closure per `<circle>` (research.md-style
    // perf note — with a few dozen countries × ~293 years, that was
    // thousands of freshly-allocated closures on every render). Narrows
    // each series to its nearest-by-year point via binary search
    // (nearestPointIndex) before measuring actual screen distance, so
    // this stays cheap even at full scale.
    const { x: px, y: py } = toSvgPoint(e.clientX, e.clientY);
    const cursorYear = yearAtSvgX(px);
    // Three primitives, not a nullable object — a `let obj: T | null`
    // reassigned only inside forEach's callback defeats TypeScript's
    // control-flow narrowing across the closure boundary.
    let bestSeriesIdx = -1;
    let bestPointIdx = -1;
    let bestDistSq = Infinity;
    series.forEach((s, seriesIdx) => {
      const pointIdx = nearestPointIndex(s.points, cursorYear);
      if (pointIdx === -1) return;
      const p = s.points[pointIdx];
      const dx = x(p.year) - px;
      const dy = y(p.value) - py;
      const distSq = dx * dx + dy * dy;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestSeriesIdx = seriesIdx;
        bestPointIdx = pointIdx;
      }
    });
    if (bestSeriesIdx !== -1 && bestDistSq <= HOVER_RADIUS_SQ) {
      setHoverIndex({ seriesIdx: bestSeriesIdx, pointIdx: bestPointIdx });
    } else {
      setHoverIndex(null);
    }
  }

  function endDrag() {
    dragRef.current = null;
    setIsDragging(false);
  }

  const isZoomed = zoomDomain !== null;
  const xTicks = ticksFor(domain.minYear, domain.maxYear, xTickCountFor(domain.maxYear - domain.minYear));
  const yTicks = ticksFor(domain.minValue, domain.maxValue, TICK_COUNT);

  return (
    <div className="leaderboard-chart">
      <div className="leaderboard-chart__header">
        <p className="leaderboard-chart__title">{title}</p>
        {isZoomed && (
          <button
            type="button"
            className="leaderboard-chart__reset-zoom"
            onClick={() => setZoomDomain(null)}
          >
            Reset zoom
          </button>
        )}
      </div>
      <svg
        ref={svgRef}
        className={
          isDragging ? "leaderboard-chart__svg leaderboard-chart__svg--dragging" : "leaderboard-chart__svg"
        }
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={title}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={() => {
          endDrag();
          setHoverIndex(null);
        }}
      >
        <defs>
          {/* Confines every plotted line/point to the axes' inner
              rectangle — without this, zooming/panning past a series'
              actual data range draws its path/points outside the axis
              box, overlapping the tick labels and chart border. */}
          <clipPath id={clipId}>
            <rect x={PADDING.left} y={PADDING.top} width={innerWidth} height={innerHeight} />
          </clipPath>
        </defs>
        {yTicks.map((v) => (
          <g key={`y-${v}`}>
            <line
              className="leaderboard-chart__gridline"
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={y(v)}
              y2={y(v)}
            />
            <text className="leaderboard-chart__axis-label" x={PADDING.left - 8} y={y(v) + 4} textAnchor="end">
              {formatValue(v)}
            </text>
          </g>
        ))}
        {xTicks.map((yr) => (
          <text
            key={`x-${yr}`}
            className="leaderboard-chart__axis-label"
            x={x(yr)}
            y={HEIGHT - PADDING.bottom + 16}
            textAnchor="middle"
          >
            {formatYear(yr)}
          </text>
        ))}
        <line
          className="leaderboard-chart__axis"
          x1={PADDING.left}
          y1={PADDING.top}
          x2={PADDING.left}
          y2={HEIGHT - PADDING.bottom}
        />
        <line
          className="leaderboard-chart__axis"
          x1={PADDING.left}
          y1={HEIGHT - PADDING.bottom}
          x2={WIDTH - PADDING.right}
          y2={HEIGHT - PADDING.bottom}
        />
        <g clipPath={`url(#${clipId})`}>
          {series.map((s, seriesIdx) => {
            // Neutral fallback color (spec FR-005) — never a fabricated
            // in-game color, matching feature 005's map rule.
            const [r, g, b] = s.color ?? NEUTRAL_COLOR;
            return (
              <g key={s.nationIdx}>
                <path
                  className="leaderboard-chart__line"
                  d={pathFor(s.points)}
                  stroke={`rgb(${r}, ${g}, ${b})`}
                  fill="none"
                />
                {/* No onMouseEnter/onMouseLeave/<title> per point on
                    purpose — see handleMouseMove's doc comment. Hover
                    is detected once, SVG-wide, instead of via a
                    freshly-allocated closure and an accessible-name
                    element per circle (thousands of both at full
                    scale). The on-chart tooltip below still satisfies
                    constitution Principle VI (text identification
                    independent of color) for whichever point is
                    currently hovered. */}
                {s.points.map((p, pointIdx) => (
                  <circle
                    key={p.year}
                    className="leaderboard-chart__point"
                    cx={x(p.year)}
                    cy={y(p.value)}
                    r={
                      hoverIndex?.seriesIdx === seriesIdx && hoverIndex.pointIdx === pointIdx
                        ? 4
                        : 2
                    }
                    fill={`rgb(${r}, ${g}, ${b})`}
                  />
                ))}
              </g>
            );
          })}
        </g>
        {hoverIndex &&
          (() => {
            const s = series[hoverIndex.seriesIdx];
            const p = s?.points[hoverIndex.pointIdx];
            if (!s || !p) return null;
            const text = `${s.label} — ${p.year}: ${p.value}`;
            const px = x(p.year);
            const py = y(p.value);
            // Rough width estimate so the box doesn't get clipped —
            // flips to the left of the point once it'd overflow the
            // chart's right edge, and stays below the top edge.
            const boxWidth = text.length * 5.5 + 12;
            const boxHeight = 20;
            const flipLeft = px + 10 + boxWidth > WIDTH - PADDING.right;
            const boxX = flipLeft ? px - 10 - boxWidth : px + 10;
            const boxY = Math.max(py - boxHeight - 8, 2);
            return (
              <g className="leaderboard-chart__tooltip" pointerEvents="none">
                <rect x={boxX} y={boxY} width={boxWidth} height={boxHeight} rx={3} />
                <text x={boxX + 6} y={boxY + boxHeight / 2 + 4}>
                  {text}
                </text>
              </g>
            );
          })()}
      </svg>
    </div>
  );
}
