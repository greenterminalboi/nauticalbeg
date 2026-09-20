// specs/006-country-leaderboard treemap stretch goal: a squarified
// treemap layout (Bruls, Huizing, van Wijk) — one flat level, no
// nesting, which is all a "share of world total" box needs. Pure and
// framework-agnostic so it's unit-testable without rendering anything
// (mirrors mapHitTest.ts's precedent for pure geometry helpers in this
// codebase). Not Perspective's Treemap plugin: research confirmed (see
// this feature's tasks.md addendum) it has no way to bind an arbitrary
// literal RGB per box, the same gap that ruled it out for the line
// charts.

export interface TreemapInput {
  id: string | number;
  value: number;
}

export interface TreemapRect<T extends TreemapInput> {
  item: T;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function worstRatio(row: readonly number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  const max = Math.max(...row);
  const min = Math.min(...row);
  if (sum === 0 || min === 0) return Infinity;
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
}

/** Lays out one row of `count` items (by area, already scaled) against
 * the shorter side of `rect`, returning the remaining rect. */
function layoutRow<T extends TreemapInput>(
  rowItems: { item: T; area: number }[],
  rect: Rect,
  out: TreemapRect<T>[],
): Rect {
  const sum = rowItems.reduce((a, b) => a + b.area, 0);
  const horizontal = rect.width >= rect.height;
  if (horizontal) {
    const rowHeight = sum / rect.width;
    let cx = rect.x;
    for (const { item, area } of rowItems) {
      const w = area / rowHeight;
      out.push({ item, x: cx, y: rect.y, width: w, height: rowHeight });
      cx += w;
    }
    return { x: rect.x, y: rect.y + rowHeight, width: rect.width, height: rect.height - rowHeight };
  }
  const rowWidth = sum / rect.height;
  let cy = rect.y;
  for (const { item, area } of rowItems) {
    const h = area / rowWidth;
    out.push({ item, x: rect.x, y: cy, width: rowWidth, height: h });
    cy += h;
  }
  return { x: rect.x + rowWidth, y: rect.y, width: rect.width - rowWidth, height: rect.height };
}

/**
 * Squarified treemap: lays `items` (any positive-value set — order
 * doesn't matter, this sorts descending internally, which is what the
 * algorithm needs for good aspect ratios) into `width`x`height`
 * starting at `(x, y)`. Box area is exactly proportional to `value`
 * relative to the sum of all `items`' values. Zero/negative-value items
 * and an empty `items` list both return `[]` rather than dividing by
 * zero or producing degenerate rects.
 */
export function squarify<T extends TreemapInput>(
  items: readonly T[],
  x: number,
  y: number,
  width: number,
  height: number,
): TreemapRect<T>[] {
  const positive = items.filter((i) => i.value > 0);
  if (positive.length === 0 || width <= 0 || height <= 0) return [];

  const totalValue = positive.reduce((a, b) => a + b.value, 0);
  const scale = (width * height) / totalValue;
  const sorted = [...positive].sort((a, b) => b.value - a.value);
  let remaining = sorted.map((item) => ({ item, area: item.value * scale }));

  const out: TreemapRect<T>[] = [];
  let rect: Rect = { x, y, width, height };

  while (remaining.length > 0) {
    const side = Math.min(rect.width, rect.height);
    let row = [remaining[0]];
    let i = 1;
    while (i < remaining.length) {
      const candidate = [...row, remaining[i]];
      const rowAreas = row.map((r) => r.area);
      const candidateAreas = candidate.map((r) => r.area);
      if (worstRatio(candidateAreas, side) <= worstRatio(rowAreas, side)) {
        row = candidate;
        i++;
      } else {
        break;
      }
    }
    rect = layoutRow(row, rect, out);
    remaining = remaining.slice(row.length);
  }

  return out;
}
