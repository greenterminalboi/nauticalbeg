import { useMemo, useRef } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { NEUTRAL_COLOR } from "./mapLayers";
import "./SocietalCompassChart.css";

export interface SocietalCompassPoint {
  nationIdx: number;
  tag: string;
  name: string;
  x: number;
  y: number;
  /** 0 => no applicable axes (spec FR-015); the caller decides whether
   * to omit such a country entirely or pass it through so it can be
   * rendered/labeled distinctly. This component never treats it as a
   * genuinely centrist position. */
  axisCount: number;
  /** The country's real in-game map color (spec FR-004-style rule: no
   * fabricated color) — null falls back to the shared neutral gray, same
   * convention as every other chart in this app. */
  colorRgb: [number, number, number] | null;
  colorAxisValue: number | null;
  axisBreakdown: Array<{ axis: string; label: string; normalizedValue: number }>;
}

interface SocietalCompassChartProps {
  points: readonly SocietalCompassPoint[];
  colorMode: "country" | "axis";
  /** Required when colorMode === "axis"; used only for the tooltip's
   * axis label, since colorAxisValue is already resolved per point. */
  colorAxisLabel?: string;
}

// specs/010-societal-values-compass FR-013: a colorblind-safe diverging
// pair (Okabe-Ito blue/orange) for the "color by axis" gradient mode,
// interpolated by each point's own normalized colorAxisValue.
const AXIS_COLOR_LOW: [number, number, number] = [0, 114, 178];
const AXIS_COLOR_HIGH: [number, number, number] = [230, 159, 0];

function colorString([r, g, b]: readonly [number, number, number]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

function lerpColor(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * clamped),
    Math.round(a[1] + (b[1] - a[1]) * clamped),
    Math.round(a[2] + (b[2] - a[2]) * clamped),
  ];
}

function pointColor(point: SocietalCompassPoint, colorMode: "country" | "axis"): string {
  if (colorMode === "axis" && point.colorAxisValue !== null) {
    // colorAxisValue is already normalized to -1.0..+1.0 (compassPosition.ts);
    // map to 0..1 for the gradient.
    return colorString(lerpColor(AXIS_COLOR_LOW, AXIS_COLOR_HIGH, (point.colorAxisValue + 1) / 2));
  }
  return colorString(point.colorRgb ?? NEUTRAL_COLOR);
}

// Plain static values, not CSS custom properties — ECharts' SVG
// renderer sets these as raw presentation attributes, matching this
// codebase's existing convention (mapLayers.ts's NEUTRAL_COLOR etc.) of
// static color constants rather than var() inside chart options.
const AXIS_LINE_COLOR = "#c4c6ce"; // tokens.css --color-outline-variant

function AXIS_END_LABEL_STYLE(
  text: string,
  align: "left" | "right" | "center",
  verticalAlign: "top" | "bottom" | "middle",
) {
  return {
    text,
    fontSize: 11,
    fontWeight: 600 as const,
    fill: "#43474d", // tokens.css --color-on-surface-variant
    opacity: 0.7,
    align,
    verticalAlign,
    lineHeight: 14,
  };
}

/** Post-ship correction (explicit user request): a circular "wheel"
 * placement put labels at awkward in-between spots along an arc.
 * Snapping to whichever straight chart edge (top/bottom/left/right) is
 * closest reads far better — this projects the bearing's direction
 * outward onto the bounding square (scaling by 1/max(|sin|,|cos|) so
 * whichever axis dominates hits exactly ±radius, the other lands
 * wherever that same ray crosses it) rather than a fixed-radius circle.
 * A bearing exactly on a diagonal (45/135/225/315) lands exactly on a
 * corner, which is the correct answer when both edges are equidistant. */
function bearingToEdgePercent(bearingDeg: number, radius: number): { left: number; top: number } {
  const rad = (bearingDeg * Math.PI) / 180;
  const ux = Math.sin(rad);
  const uy = Math.cos(rad);
  const scale = 1 / Math.max(Math.abs(ux), Math.abs(uy));
  return {
    left: 50 + ux * scale * radius,
    top: 50 - uy * scale * radius,
  };
}

/** Post-ship correction (explicit user request: left/top labels were
 * bleeding into the tinted plot area): grow the text away from center
 * in BOTH dimensions, not just whichever one the label's edge nominally
 * "belongs" to. A label near a corner (e.g. bearing 225, tied between
 * the left and bottom edges) has only ~1% clearance in each direction
 * on its own; centering the text on the untied axis ate into that
 * margin. Anchoring every label at its own outer corner instead — align
 * away from center horizontally AND vertically whenever the position
 * isn't dead-on the middle of that axis — keeps the whole text block
 * outside the plot regardless of how close to a corner it sits. */
function textAnchorFor(left: number, top: number): {
  align: "left" | "right" | "center";
  verticalAlign: "top" | "bottom" | "middle";
} {
  const align = left < 50 ? "right" : left > 50 ? "left" : "center";
  const verticalAlign = top < 50 ? "bottom" : top > 50 ? "top" : "middle";
  return { align, verticalAlign };
}

// specs/010-societal-values-compass, post-ship correction (explicit
// user request): a very light tint per quadrant, in the classic
// political-compass 4-color convention (politicalcompass.org-style):
// authoritarian-left = red, authoritarian-right = blue,
// libertarian-left = green, libertarian-right = yellow. Applied at low
// opacity so it reads as a background hint, not a competing fill color
// for the dots themselves.
const QUADRANT_TINTS = {
  topLeft: "rgba(220, 50, 50, 0.06)", // authoritarian-left (State Collective) -> red
  topRight: "rgba(50, 90, 220, 0.06)", // authoritarian-right (Authoritarian Right) -> blue
  bottomLeft: "rgba(60, 170, 80, 0.06)", // libertarian-left (Libertarian Collective) -> green
  bottomRight: "rgba(230, 190, 30, 0.08)", // libertarian-right (Market Libertarian) -> yellow
} as const;

// specs/010-societal-values-compass, post-ship correction (explicit
// user request): a full 16-point ideological compass rose, replacing
// the earlier 4/8-direction scheme. One entry per named pole at its
// exact compass bearing (0deg = North/top, clockwise) — matches
// axisConfig.json's angleDegrees via `bearing = angleDegrees + 90`
// (derived from that formula's own y-negation: a pole stored at
// angleDegrees lands on-screen at bearing angleDegrees+90, verified
// against every axis in this feature's implementation notes). Two
// bearings (22.5/202.5) carry two axes each, since the user grouped
// them there together; every other bearing carries exactly one.
const POLE_WHEEL: ReadonlyArray<{ bearing: number; label: string }> = [
  { bearing: 0, label: "Centralization" },
  { bearing: 22.5, label: "Traditionalist, Spiritualist" },
  { bearing: 45, label: "Absolutism, Aristocracy" },
  { bearing: 67.5, label: "Individualism" },
  { bearing: 90, label: "Capital Economy" },
  { bearing: 112.5, label: "Belligerent" },
  { bearing: 135, label: "Free Subjects, Free Trade" },
  { bearing: 157.5, label: "Outward" },
  { bearing: 180, label: "Decentralization" },
  { bearing: 202.5, label: "Innovative, Humanist" },
  { bearing: 225, label: "Liberalism, Plutocracy" },
  { bearing: 247.5, label: "Communalism" },
  { bearing: 270, label: "Traditional Economy" },
  { bearing: 292.5, label: "Conciliatory" },
  { bearing: 315, label: "Serfdom, Mercantilism" },
  { bearing: 337.5, label: "Inward" },
];

// specs/010-societal-values-compass FR-010: past this many countries, a
// permanent label per dot piles into an unreadable smear — labels
// become hover-only beyond this point (matters once a user adds many
// countries to the default player-only view via AddCountryInput).
const PERMANENT_LABEL_LIMIT = 50;

// Post-ship correction (explicit user request): no size-metric toggle
// anymore — every dot renders at this fixed pixel size.
const FIXED_SYMBOL_SIZE = 14;

/** ECharts passes its own `CallbackDataParams` shape (data typed as an
 * opaque `OptionDataItem | null`) to symbolSize/itemStyle/label/tooltip
 * callbacks — this narrows it back to the point object this chart puts
 * into `series.data`. */
function asPoint(data: unknown): SocietalCompassPoint | undefined {
  return data && typeof data === "object" && "nationIdx" in data
    ? (data as SocietalCompassPoint)
    : undefined;
}

function formatBreakdown(point: SocietalCompassPoint): string {
  if (point.axisBreakdown.length === 0) return "No applicable Societal Values yet";
  return point.axisBreakdown
    .map((b) => `${b.label} ${(Math.abs(b.normalizedValue) * 100).toFixed(0)}%`)
    .join("<br/>");
}

/** Post-ship correction (explicit user request: "the compass isn't
 * centered"): a shared, symmetric range across both axes — computed
 * from the actual data's spread (still FR-008's auto-scale, just forced
 * symmetric and shared) — keeps the ideological origin dead-center
 * regardless of whether the plotted countries happen to skew toward one
 * side. A small floor avoids a degenerate all-zero domain when every
 * plotted country has zero applicable axes' worth of signal. */
function sharedSymmetricMax(points: readonly SocietalCompassPoint[]): number {
  let max = 0.1;
  for (const p of points) {
    max = Math.max(max, Math.abs(p.x), Math.abs(p.y));
  }
  return max * 1.15; // headroom so edge dots/labels aren't clipped
}

/**
 * specs/010-societal-values-compass: the codebase's first ECharts
 * `scatter` series, built on the same shared `useEChartsInstance` hook
 * and `option`-in-`useMemo` pattern as `LeaderboardChart`. Item-trigger
 * tooltip (not axis-trigger, since points aren't ordered along an axis)
 * with a custom formatter reading each point's own pre-computed
 * `axisBreakdown` — mirrors `RulerHistoryChart`'s "look up the real
 * value from our own data, not ECharts' default pick" pattern.
 */
export function SocietalCompassChart({ points, colorMode, colorAxisLabel }: SocietalCompassChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const option = useMemo<EChartsOption>(() => {
    const showPermanentLabels = points.length > 0 && points.length < PERMANENT_LABEL_LIMIT;
    const bound = sharedSymmetricMax(points);
    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const point = asPoint((params as { data?: unknown }).data);
          if (!point) return "";
          const header = `${point.name} (${point.tag})`;
          const axisLine =
            colorMode === "axis" && colorAxisLabel && point.colorAxisValue !== null
              ? `${colorAxisLabel}: ${(point.colorAxisValue * 100).toFixed(0)}%<br/>`
              : "";
          return `${header}<br/>${axisLine}${formatBreakdown(point)}`;
        },
      },
      // Post-ship correction (explicit user request): shrink the plot
      // area (and therefore the tinted quadrant backgrounds, which fill
      // it exactly) well inside the container, so the 16-point compass
      // labels below have genuine blank space to sit in rather than
      // overlapping the colored areas.
      grid: { left: "18%", right: "18%", top: "18%", bottom: "18%" },
      xAxis: { type: "value", min: -bound, max: bound, axisLabel: { show: false } },
      yAxis: { type: "value", min: -bound, max: bound, axisLabel: { show: false } },
      // specs/010-societal-values-compass FR-014 (User Story 3): a
      // static, decorative axis-end reference — never derived from the
      // loaded save's data (percentage positioning, not data
      // coordinates), so it reads identically regardless of which
      // countries are plotted.
      graphic: {
        elements: POLE_WHEEL.map(({ bearing, label }) => {
          // Post-ship correction (explicit user request): sit just
          // outside the tinted plot area's own edge (grid margin is
          // 18%, i.e. 32 units out from center), not out near the
          // container's outer edge — 33 clears it with a small gap.
          const { left, top } = bearingToEdgePercent(bearing, 33);
          const { align, verticalAlign } = textAnchorFor(left, top);
          return {
            type: "text",
            left: `${left}%`,
            top: `${top}%`,
            style: AXIS_END_LABEL_STYLE(label.replace(", ", "\n"), align, verticalAlign),
          };
        }),
      },
      series: [
        {
          type: "scatter",
          // Faint crosshair through the ideological origin — the only
          // per-axis line ECharts draws in data coordinates (unlike the
          // axis-end labels above), so it stays anchored at (0, 0)
          // regardless of the auto-scaled range.
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { type: "dashed", color: AXIS_LINE_COLOR },
            data: [{ xAxis: 0 }, { yAxis: 0 }],
          },
          // Post-ship correction: a very light quadrant tint (data
          // coordinates, so it stays anchored to the ideological origin
          // regardless of the auto-scaled, centered domain above).
          markArea: {
            silent: true,
            data: [
              [{ coord: [0, bound], itemStyle: { color: QUADRANT_TINTS.topLeft } }, { coord: [-bound, 0] }],
              [{ coord: [0, bound], itemStyle: { color: QUADRANT_TINTS.topRight } }, { coord: [bound, 0] }],
              [{ coord: [0, -bound], itemStyle: { color: QUADRANT_TINTS.bottomLeft } }, { coord: [-bound, 0] }],
              [{ coord: [0, -bound], itemStyle: { color: QUADRANT_TINTS.bottomRight } }, { coord: [bound, 0] }],
            ],
          },
          // Post-ship correction (explicit user request): the
          // population/total-development size toggle was removed —
          // every dot renders at the same fixed size.
          symbolSize: FIXED_SYMBOL_SIZE,
          itemStyle: {
            color: (params: { data?: unknown }) => {
              const point = asPoint(params.data);
              return point ? pointColor(point, colorMode) : colorString(NEUTRAL_COLOR);
            },
          },
          label: showPermanentLabels
            ? {
                show: true,
                formatter: (params: { data?: unknown }) => asPoint(params.data)?.tag ?? "",
                position: "top",
                fontSize: 10,
                fontWeight: 600 as const,
              }
            : { show: false },
          data: points.map((p) => ({ value: [p.x, p.y], ...p })),
        },
      ],
    };
  }, [points, colorMode, colorAxisLabel]);

  useEChartsInstance(containerRef, option);

  return (
    <div className="societal-compass-chart">
      <div ref={containerRef} className="societal-compass-chart__canvas" />
    </div>
  );
}
