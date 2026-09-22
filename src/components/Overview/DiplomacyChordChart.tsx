import { useEffect, useMemo, useRef, useState } from "react";
import type { EChartsOption } from "echarts";
import { useEChartsInstance } from "./charts/useEChartsInstance";
import { RELATION_TYPE_LEGEND, type ChordArc, type ChordEdge } from "./diplomacyData";
import type { HugboxCluster } from "./hugboxClustering";
import "./DiplomacyChordChart.css";

interface DiplomacyChordChartProps {
  arcs: readonly ChordArc[];
  edges: readonly ChordEdge[];
  /** `null` (Hugbox Detection off, spec FR-017): default relationship-
   * count arc order (FR-011), no boundaries. Non-null (spec FR-016):
   * each cluster's full members are grouped contiguous, its affiliates
   * placed immediately after, and a boundary bracket is drawn around
   * the full-member span. */
  hugboxClusters: readonly HugboxCluster[] | null;
}

/** spec FR-016: while Hugbox Detection is enabled, each cluster's full
 * members (core + promoted) sit contiguous on the circle with its
 * affiliates placed right after — countries in no cluster keep their
 * relative relationship-count order, appended after every clustered
 * country. */
function applyHugboxOrdering(
  arcs: readonly ChordArc[],
  clusters: readonly HugboxCluster[] | null,
): readonly ChordArc[] {
  if (!clusters || clusters.length === 0) return arcs;
  const arcByIdx = new Map(arcs.map((a) => [a.nationIdx, a]));
  const placed = new Set<number>();
  const ordered: ChordArc[] = [];
  for (const cluster of clusters) {
    for (const idx of cluster.fullMemberNationIdxs) {
      const arc = arcByIdx.get(idx);
      if (arc && !placed.has(idx)) {
        ordered.push(arc);
        placed.add(idx);
      }
    }
    for (const idx of cluster.affiliateNationIdxs) {
      const arc = arcByIdx.get(idx);
      if (arc && !placed.has(idx)) {
        ordered.push(arc);
        placed.add(idx);
      }
    }
  }
  for (const arc of arcs) {
    if (!placed.has(arc.nationIdx)) ordered.push(arc);
  }
  return ordered;
}

/** spec FR-014/FR-015: which cluster (if any) each visible country is a
 * full member or affiliate of, for styling. */
function clusterMembership(clusters: readonly HugboxCluster[] | null): {
  fullMemberOf: Map<number, number>;
  affiliateOf: Map<number, number>;
} {
  const fullMemberOf = new Map<number, number>();
  const affiliateOf = new Map<number, number>();
  for (const cluster of clusters ?? []) {
    for (const idx of cluster.fullMemberNationIdxs) fullMemberOf.set(idx, cluster.clusterId);
    for (const idx of cluster.affiliateNationIdxs) affiliateOf.set(idx, cluster.clusterId);
  }
  return { fullMemberOf, affiliateOf };
}

interface ArcLayout extends ChordArc {
  startAngle: number;
  endAngle: number;
  midAngle: number;
}

// Small angular gap between adjacent arcs, and where the first arc
// starts (12 o'clock) — cosmetic constants, not derived from data.
const GAP_ANGLE = 0.02;
const START_ANGLE = -Math.PI / 2;
// Explicit user request: use the full available canvas rather than
// capping to the shorter dimension — an elliptical layout (independent
// x/y radii) is fine, spec keeps arc length uniform per country either
// way (no development/population weighting in v1). Margin leaves room
// for the country-tag labels outside the node ring.
const RADIUS_MARGIN_RATIO = 0.14;

function layoutArcs(arcs: readonly ChordArc[]): ArcLayout[] {
  if (arcs.length === 0) return [];
  const anglePerArc = Math.max((2 * Math.PI - GAP_ANGLE * arcs.length) / arcs.length, 0.001);
  let cursor = START_ANGLE;
  return arcs.map((arc) => {
    const startAngle = cursor;
    const endAngle = cursor + anglePerArc;
    cursor = endAngle + GAP_ANGLE;
    return { ...arc, startAngle, endAngle, midAngle: (startAngle + endAngle) / 2 };
  });
}

function colorString(r: number, g: number, b: number): string {
  return `rgb(${r}, ${g}, ${b})`;
}

// FR-010: a 0-100-ish thickness score -> a legible chord line width.
function widthForThickness(thickness: number): number {
  const clamped = Math.max(0, Math.min(100, thickness));
  return 1 + (clamped / 100) * 5;
}

function pairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

/** spec FR-004 design choice (a): a pair with 2+ simultaneous
 * relationship types gets 2+ separate, visually distinct parallel
 * chords, not one merged/striped chord — distinct `curveness` values
 * per edge in the same pair fan them out instead of drawing them on top
 * of each other. Every edge (including a lone one between a pair) gets
 * a nonzero base curve so chords read as bowed ribbons, matching a
 * conventional chord-diagram look rather than straight lines crossing
 * through the center. */
function assignCurveness(edges: readonly ChordEdge[]): Map<ChordEdge, number> {
  const groups = new Map<string, ChordEdge[]>();
  for (const edge of edges) {
    const key = pairKey(edge.firstNationIdx, edge.secondNationIdx);
    const group = groups.get(key) ?? [];
    group.push(edge);
    groups.set(key, group);
  }
  const curveness = new Map<ChordEdge, number>();
  const BASE = 0.25;
  const SPREAD = 0.12;
  for (const group of groups.values()) {
    const n = group.length;
    group.forEach((edge, i) => {
      curveness.set(edge, BASE + (i - (n - 1) / 2) * SPREAD);
    });
  }
  return curveness;
}

interface ChartGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

function geometryFor(width: number, height: number): ChartGeometry {
  return {
    cx: width / 2,
    cy: height / 2,
    rx: (width / 2) * (1 - RADIUS_MARGIN_RATIO),
    ry: (height / 2) * (1 - RADIUS_MARGIN_RATIO),
  };
}

function ellipsePoint(g: ChartGeometry, angle: number, rx: number, ry: number): { x: number; y: number } {
  return { x: g.cx + Math.cos(angle) * rx, y: g.cy + Math.sin(angle) * ry };
}

// Node circle radius shrinks as the country count grows so a dense save
// doesn't overlap circles, but never below a legible minimum.
function nodeRadiusFor(count: number): number {
  return Math.max(5, Math.min(13, 260 / Math.max(count, 1)));
}

interface EdgeTooltipDatum {
  source: string;
  target: string;
  firstNationIdx: number;
  secondNationIdx: number;
  relationType: ChordEdge["relationType"];
  startDate: string | null;
  score: number | null;
  opinionScore: number | null;
  amount: number | null;
  isOneWay: boolean;
}

/**
 * specs/013-diplomatic-relations-chord (research.md §2): a `custom`
 * series draws the visible arc bands (echarts has no native chord-
 * diagram series type), layered with a `graph` series (`layout: "none"`,
 * one invisible node pinned per arc's angular midpoint) that supplies
 * the chords as edges and, critically, the native `emphasis: { focus:
 * "adjacency" }` hover-isolate-and-fade behavior — the same mechanism
 * `MilitaryDoctrineChart.tsx` already validated, instead of hand-rolled
 * opacity bookkeeping. Hovering the arc itself bridges to that via
 * `dispatchAction({ type: "focusNodeAdjacency" })`/`"unfocusNodeAdjacency"`
 * (built-in echarts actions), since the `custom` series has no adjacency
 * concept of its own.
 *
 * All three series (graph nodes/edges, arc circles, Hugbox boundary)
 * are positioned from one `geometry` object computed once per option
 * build (from React's tracked container `size`) and closed over by
 * every `renderItem` — never re-measured independently via
 * `api.getWidth()/getHeight()` inside a callback. A real bug shipped
 * and got caught live (user-reported, specs/debug_images/"fix
 * this.png"): `api.getWidth()/getHeight()` and React's `size` state are
 * two genuinely independent measurements (a second ResizeObserver each)
 * that can disagree by a pixel or more, enough to visibly offset a
 * chord's endpoint from the node circle it should terminate exactly at.
 */
export function DiplomacyChordChart({ arcs, edges, hugboxClusters }: DiplomacyChordChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => setSize({ width: container.clientWidth, height: container.clientHeight });
    update();
    if (typeof ResizeObserver !== "function") return; // jsdom test environment — size stays whatever the initial layout gives it
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const arcLayout = useMemo(
    () => layoutArcs(applyHugboxOrdering(arcs, hugboxClusters)),
    [arcs, hugboxClusters],
  );
  const curveness = useMemo(() => assignCurveness(edges), [edges]);
  const { affiliateOf } = useMemo(() => clusterMembership(hugboxClusters), [hugboxClusters]);
  const clusterBoundaries = useMemo(() => {
    if (!hugboxClusters || hugboxClusters.length === 0) return [];
    const arcByNationIdx = new Map(arcLayout.map((a) => [a.nationIdx, a]));
    return hugboxClusters
      .map((cluster) => {
        const memberArcs = cluster.fullMemberNationIdxs
          .map((idx) => arcByNationIdx.get(idx))
          .filter((a): a is ArcLayout => a !== undefined);
        if (memberArcs.length === 0) return null;
        const startAngle = Math.min(...memberArcs.map((a) => a.startAngle));
        const endAngle = Math.max(...memberArcs.map((a) => a.endAngle));
        return { clusterId: cluster.clusterId, startAngle, endAngle };
      })
      .filter((b): b is { clusterId: number; startAngle: number; endAngle: number } => b !== null);
  }, [hugboxClusters, arcLayout]);

  const option = useMemo<EChartsOption | null>(() => {
    if (!size || size.width === 0 || size.height === 0 || arcLayout.length === 0) return null;
    const geometry = geometryFor(size.width, size.height);

    // Invisible anchor nodes the `graph` series' edges actually connect
    // to — echarts terminates an edge (and any arrow symbol on it) at
    // the node's own `symbolSize` boundary, not at its coordinate point.
    // Sized to match the visible circle's diameter (not a small fixed
    // value) so edges/arrows stop right at the circle's edge — a real
    // bug found live (user-reported, "on hover it should show the
    // dependency arrow"): with a small fixed symbolSize, the arrowhead
    // rendered correctly but landed deep inside the much bigger visible
    // circle, completely hidden behind it once nodes were fixed to
    // always paint above edges.
    const nodeDiameter = nodeRadiusFor(arcLayout.length) * 2;
    const graphNodes = arcLayout.map((arc) => {
      const p = ellipsePoint(geometry, arc.midAngle, geometry.rx, geometry.ry);
      return {
        id: String(arc.nationIdx),
        name: arc.name ?? arc.tag,
        x: p.x,
        y: p.y,
        symbolSize: nodeDiameter,
        fixed: true,
        itemStyle: { opacity: 0 },
        label: { show: false },
      };
    });

    const graphEdges = edges.map((edge) => {
      const style = RELATION_TYPE_LEGEND[edge.relationType];
      const tooltipDatum: EdgeTooltipDatum = {
        source: String(edge.firstNationIdx),
        target: String(edge.secondNationIdx),
        firstNationIdx: edge.firstNationIdx,
        secondNationIdx: edge.secondNationIdx,
        relationType: edge.relationType,
        startDate: edge.startDate,
        score: edge.score,
        opinionScore: edge.opinionScore,
        amount: edge.amount,
        isOneWay: edge.isOneWay,
      };
      return {
        ...tooltipDatum,
        // Explicit user request: an arrowhead distinguishes a one-way
        // relation (military access, food access, fleet basing rights,
        // guarantee, economic support — all confirmed one-way against
        // the real save, research.md) from a mutual one (alliance,
        // royal marriage, rivalry — no arrow). `symbol`/`symbolSize` are
        // [source-end, target-end]; direction runs first -> second.
        symbol: edge.isOneWay ? ["none", "arrow"] : ["none", "none"],
        symbolSize: edge.isOneWay ? [0, 8] : [0, 0],
        lineStyle: {
          color: style.color,
          type: style.dashPattern,
          width: widthForThickness(edge.thickness),
          curveness: curveness.get(edge) ?? 0.25,
          opacity: 0.5,
        },
      };
    });

    // Loosely typed here (same precedent as MilitaryDoctrineChart.tsx's
    // own `blur` workaround): `graph`'s `emphasis.focus`/`blur` and
    // `custom`'s `renderItem` are all real, supported options at
    // runtime, but this version's shipped series-option unions don't
    // compose cleanly through `EChartsOption["series"]`'s array-or-
    // single-item type — the final cast below is the same shape every
    // other chart in this app already uses for this exact reason.
    const graphSeries: Record<string, unknown> = {
      type: "graph",
      layout: "none",
      data: graphNodes,
      edges: graphEdges,
      emphasis: {
        focus: "adjacency",
        lineStyle: { opacity: 1 },
      },
      blur: {
        lineStyle: { opacity: 0.08 },
      },
      // Explicit user request: chords must never render above node
      // circles, including while a chord is in its hovered/emphasis
      // state (echarts' emphasis handling can otherwise bump a single
      // element's paint order past a same-zlevel series' own z — a
      // separate `zlevel` is a real, independent canvas/paint layer, so
      // this holds regardless of any per-element z bump within it).
      z: 5,
      zlevel: 0,
    };

    const customSeries: Record<string, unknown> = {
      type: "custom",
      // Real bug hit live: `custom` series defaults to
      // `coordinateSystem: "cartesian2d"` (confirmed in the installed
      // echarts version's own source) and throws `xAxis "0" not found`
      // without this — this chart deliberately has no axes at all,
      // `renderItem` computes raw pixel positions itself.
      coordinateSystem: "none",
      data: arcLayout,
      // `geometry` is the SAME object the `graph` series' node x/y above
      // were computed from — deliberately not re-measured via
      // `api.getWidth()/getHeight()` here. Real bug found live (user-
      // reported, specs/debug_images/"fix this.png"): those two calls
      // and React's `size` state are measured independently (a second,
      // separate ResizeObserver each), and can disagree by a pixel or
      // more, especially right after mount — enough to visibly offset a
      // chord's endpoint from the node circle it should terminate
      // exactly at. Closing over one shared `geometry` guarantees both
      // series agree, always.
      renderItem: (params: { dataIndex: number }) => {
        const g = geometry;
        const arc = arcLayout[params.dataIndex];
        if (!arc) return { type: "group", children: [] };
        // spec FR-014/FR-015: an affiliate (1 alliance tie into a
        // cluster) is visually distinct from a full member — dimmed,
        // not enclosed in that cluster's boundary bracket.
        const isAffiliate = affiliateOf.has(arc.nationIdx);
        const nodeRadius = nodeRadiusFor(arcLayout.length);
        const center = ellipsePoint(g, arc.midAngle, g.rx, g.ry);
        // Country tag label, positioned radially just outside the node
        // circle and rotated along the radius — flipped on the left
        // half so it reads left-to-right instead of upside down
        // (explicit user request).
        const flip = Math.cos(arc.midAngle) < 0;
        const labelRotation = flip ? arc.midAngle + Math.PI : arc.midAngle;
        const labelPoint = ellipsePoint(
          g,
          arc.midAngle,
          g.rx + nodeRadius + 8,
          g.ry + nodeRadius + 8,
        );
        return {
          type: "group",
          children: [
            {
              type: "circle",
              shape: { cx: center.x, cy: center.y, r: nodeRadius },
              style: {
                fill: colorString(arc.colorR, arc.colorG, arc.colorB),
                opacity: isAffiliate ? 0.45 : 1,
                stroke: "#ffffff",
                lineWidth: 1,
              },
            },
            {
              type: "text",
              x: labelPoint.x,
              y: labelPoint.y,
              rotation: -labelRotation,
              style: {
                text: arc.tag,
                fill: "#2a2a2a",
                fontSize: 10,
                align: flip ? "right" : "left",
                verticalAlign: "middle",
              },
            },
          ],
        };
      },
      z: 10,
      zlevel: 1,
    };

    // spec FR-015: a boundary bracket enclosing each detected cluster's
    // full-member arc span, drawn as its own `custom` series (a sampled
    // `polyline` tracing the ellipse, since zrender has no elliptical-
    // arc-segment shape) so it layers independently of the node/edge
    // series above without needing a combined, discriminated data array.
    const BOUNDARY_SAMPLES = 24;
    const boundarySeries: Record<string, unknown> = {
      type: "custom",
      coordinateSystem: "none",
      silent: true,
      data: clusterBoundaries,
      renderItem: (params: { dataIndex: number }) => {
        const g = geometry; // same shared geometry as the other two series — see the arc series' comment above
        const boundary = clusterBoundaries[params.dataIndex];
        if (!boundary) return { type: "group", children: [] };
        const pad = 0.06;
        const nodeRadius = nodeRadiusFor(arcLayout.length);
        const bx = g.rx + nodeRadius + 14;
        const by = g.ry + nodeRadius + 14;
        const start = boundary.startAngle - pad;
        const end = boundary.endAngle + pad;
        const points: [number, number][] = [];
        for (let i = 0; i <= BOUNDARY_SAMPLES; i++) {
          const angle = start + ((end - start) * i) / BOUNDARY_SAMPLES;
          const p = ellipsePoint(g, angle, bx, by);
          points.push([p.x, p.y]);
        }
        return {
          type: "polyline",
          shape: { points },
          style: {
            stroke: "#2a2a2a",
            lineWidth: 2,
            fill: "none",
          },
        };
      },
      z: 11,
      zlevel: 1,
    };

    return {
      tooltip: {
        trigger: "item",
        triggerOn: "mousemove",
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; data?: unknown };
          if (p.dataType !== "edge") return "";
          const d = p.data as EdgeTooltipDatum;
          const first = arcLayout.find((a) => a.nationIdx === d.firstNationIdx);
          const second = arcLayout.find((a) => a.nationIdx === d.secondNationIdx);
          const firstLabel = first ? `${first.name ?? first.tag} (${first.tag})` : String(d.firstNationIdx);
          const secondLabel = second ? `${second.name ?? second.tag} (${second.tag})` : String(d.secondNationIdx);
          // Explicit user request: the tooltip itself also states
          // direction in words, not just the arrowhead — "->" for a
          // one-way relation (first grants to second, research.md),
          // "<->" for a mutual one.
          const arrow = d.isOneWay ? "→" : "↔";
          const lines = [
            `${firstLabel} ${arrow} ${secondLabel}`,
            RELATION_TYPE_LEGEND[d.relationType].label,
          ];
          if (d.startDate) lines.push(`Since ${d.startDate}`);
          if (d.score !== null) lines.push(`Trust: ${d.score.toFixed(1)}`);
          if (d.opinionScore !== null) lines.push(`Opinion: ${d.opinionScore.toFixed(0)}`);
          if (d.amount !== null) lines.push(`Economic support: ${Math.round(d.amount).toLocaleString()} ducats`);
          return lines.join("<br/>");
        },
      },
      series: [graphSeries, customSeries, boundarySeries],
    } as unknown as EChartsOption;
  }, [arcLayout, edges, curveness, size, affiliateOf, clusterBoundaries]);

  const chartRef = useEChartsInstance(containerRef, option);

  // spec FR-005: hovering an arc (the `custom` series, which has no
  // native adjacency concept) forwards to the `graph` series' built-in
  // focusNodeAdjacency/unfocusNodeAdjacency actions. Both series share
  // the same data order (arcLayout), so a custom-series dataIndex is
  // also the matching graph node's dataIndex.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const handleOver = (params: unknown) => {
      const p = params as { seriesType?: string; dataIndex?: number };
      if (p.seriesType === "custom" && typeof p.dataIndex === "number") {
        chart.dispatchAction({ type: "focusNodeAdjacency", seriesIndex: 0, dataIndex: p.dataIndex });
      }
    };
    const handleOut = (params: unknown) => {
      const p = params as { seriesType?: string };
      if (p.seriesType === "custom") {
        chart.dispatchAction({ type: "unfocusNodeAdjacency", seriesIndex: 0 });
      }
    };
    chart.on("mouseover", handleOver);
    chart.on("mouseout", handleOut);
    return () => {
      chart.off("mouseover", handleOver);
      chart.off("mouseout", handleOut);
    };
  }, [chartRef, option]);

  return (
    <div className="diplomacy-chord-chart">
      <div ref={containerRef} className="diplomacy-chord-chart__canvas" />
    </div>
  );
}
