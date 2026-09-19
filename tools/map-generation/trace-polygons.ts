// Traces a run-length-encoded pixel region into raw polygon rings, and
// unions several LocationPixelRegions into one combined region (for
// building a province's geometry from its member locations).
//
// Tracing method: for every filled pixel, each of its four edges is a
// boundary edge exactly when the neighboring pixel across that edge is
// NOT filled. Walking those boundary edges (each filled pixel contributes
// edges in a consistent clockwise direction in image space) traces one
// closed loop per disjoint connected region automatically — no separate
// connected-component labeling pass needed, and disjoint blobs naturally
// become separate loops (research.md §6's non-contiguous-province case).
//
// At a vertex touched by two diagonally-adjacent filled pixels with both
// diagonal neighbors empty (a "checkerboard" pinch point), more than one
// boundary edge can leave the same vertex — confirmed to occur in the
// real ~28k-location bitmap (a naive single-successor walk hit an
// infinite loop there). Resolved by always taking the most-clockwise
// available turn relative to the incoming direction (the standard
// boundary-following rule) and tracking visited *edges*, not visited
// *vertices* — a shared vertex may legitimately belong to two different
// loops, but a given directed edge belongs to exactly one.
//
// Every traced ring is treated as its own exterior-only polygon (no hole
// nesting/winding detection) — sufficient for this feature's stated edge
// cases (non-contiguous provinces), not for a province with a literal
// lake-shaped hole in it.

import type { LocationPixelRegion, PixelRing, PixelRun, RawPolygon } from "./types";

export function unionPixelRegions(regions: LocationPixelRegion[]): Map<number, PixelRun[]> {
  const merged = new Map<number, PixelRun[]>();

  for (const region of regions) {
    for (const [y, runs] of region.rows) {
      const existing = merged.get(y) ?? [];
      merged.set(y, mergeRuns([...existing, ...runs]));
    }
  }

  return merged;
}

function mergeRuns(runs: PixelRun[]): PixelRun[] {
  const sorted = [...runs].sort((a, b) => a.xStart - b.xStart);
  const result: PixelRun[] = [];
  for (const run of sorted) {
    const last = result[result.length - 1];
    if (last && run.xStart <= last.xEnd + 1) {
      last.xEnd = Math.max(last.xEnd, run.xEnd);
    } else {
      result.push({ ...run });
    }
  }
  return result;
}

type Dir = "up" | "right" | "down" | "left";

interface Edge {
  from: string;
  to: string;
  dir: Dir;
}

// For each incoming direction, the order in which to try outgoing
// directions at the next vertex: sharpest-clockwise-turn first, then
// straight, then the widest turn, then a full reversal (a dead end).
const TURN_PRIORITY: Record<Dir, Dir[]> = {
  right: ["down", "right", "up", "left"],
  down: ["left", "down", "right", "up"],
  left: ["up", "left", "down", "right"],
  up: ["right", "up", "left", "down"],
};

function edgeId(e: Pick<Edge, "from" | "to">): string {
  return `${e.from}->${e.to}`;
}

export function traceRegionToPolygons(rows: Map<number, PixelRun[]>): RawPolygon[] {
  function isSet(x: number, y: number): boolean {
    const runs = rows.get(y);
    if (!runs) return false;
    return runs.some((r) => x >= r.xStart && x <= r.xEnd);
  }

  const key = (x: number, y: number) => `${x},${y}`;
  const edgesFromVertex = new Map<string, Edge[]>();
  const addEdge = (from: string, to: string, dir: Dir) => {
    const list = edgesFromVertex.get(from) ?? [];
    list.push({ from, to, dir });
    edgesFromVertex.set(from, list);
  };

  for (const [y, runs] of rows) {
    for (const run of runs) {
      for (let x = run.xStart; x <= run.xEnd; x++) {
        if (!isSet(x, y - 1)) addEdge(key(x, y), key(x + 1, y), "right");
        if (!isSet(x + 1, y)) addEdge(key(x + 1, y), key(x + 1, y + 1), "down");
        if (!isSet(x, y + 1)) addEdge(key(x + 1, y + 1), key(x, y + 1), "left");
        if (!isSet(x - 1, y)) addEdge(key(x, y + 1), key(x, y), "up");
      }
    }
  }

  const visitedEdges = new Set<string>();
  const polygons: RawPolygon[] = [];

  for (const edgesAtVertex of edgesFromVertex.values()) {
    for (const startEdge of edgesAtVertex) {
      if (visitedEdges.has(edgeId(startEdge))) continue;

      const ring: PixelRing = [];
      let current = startEdge;
      let closed = false;

      // A well-formed region has exactly as many edges as vertices in
      // each loop; this bound only guards against an unexpected
      // malformed input (e.g. a single dangling edge) looping forever.
      const maxSteps = edgesFromVertex.size * 4 + 4;
      for (let step = 0; step < maxSteps; step++) {
        visitedEdges.add(edgeId(current));
        const [xs, ys] = current.from.split(",");
        ring.push([Number(xs), Number(ys)]);

        const candidates = edgesFromVertex.get(current.to) ?? [];
        const ordered = [...candidates].sort(
          (a, b) => TURN_PRIORITY[current.dir].indexOf(a.dir) - TURN_PRIORITY[current.dir].indexOf(b.dir),
        );

        // Walk candidates in clockwise-turn priority order; the first one
        // that either closes this ring or is still unvisited wins. An
        // already-visited, non-closing candidate belongs to a different
        // loop that shares this vertex (a pinch point) — skip it.
        let next: Edge | undefined;
        for (const candidate of ordered) {
          if (candidate.from === startEdge.from && candidate.to === startEdge.to) {
            closed = true;
            break;
          }
          if (!visitedEdges.has(edgeId(candidate))) {
            next = candidate;
            break;
          }
        }
        if (closed) break;
        if (!next) break; // dead end — malformed input, discard this ring
        current = next;
      }

      if (closed && ring.length >= 4) {
        ring.push(ring[0]); // close the ring
        polygons.push([ring]);
      }
    }
  }

  return polygons;
}
