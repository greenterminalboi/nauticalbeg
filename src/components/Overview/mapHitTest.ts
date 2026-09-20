// specs/005-map-visualization research.md §9: resolves a pointer
// position to a location name (the join key against MapLocationDataset —
// research.md §1) without checking every one of a save's ~28,573 decoded
// polygons on every pointer move. Pure functions, no canvas dependency —
// built once per save load, alongside mapLocationData.ts's dataset, and
// reused by MapCanvas.tsx.

/** One location's geometry, already flattened to a list of rings (a
 * `MultiPolygon`'s separate outer rings, or a `Polygon`'s single ring —
 * this project's generated locations don't have interior holes, per
 * specs/003-province-map-generation, so every ring is treated as
 * independently fillable, not subtracted from another). */
export interface HitTestPolygon {
  name: string;
  rings: Array<Array<[number, number]>>;
}

export interface HitTestIndex {
  resolve(x: number, y: number): string | null;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function ringBounds(ring: Array<[number, number]>): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function polygonBounds(polygon: HitTestPolygon): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of polygon.rings) {
    const b = ringBounds(ring);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

/** Standard even-odd ray-casting point-in-polygon test against one ring. */
function pointInRing(x: number, y: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(x: number, y: number, polygon: HitTestPolygon): boolean {
  return polygon.rings.some((ring) => pointInRing(x, y, ring));
}

/** Builds a uniform grid over every polygon's bounding box, sized so the
 * average cell holds roughly one polygon (research.md §9's "avoid
 * checking every polygon on every pointer move," without a full
 * spatial-index library). `gridColumns`/`gridRows` are exposed for
 * tests; production callers should omit them and take the computed
 * default. */
export function buildHitTestIndex(
  polygons: HitTestPolygon[],
  options?: { gridColumns?: number; gridRows?: number },
): HitTestIndex {
  if (polygons.length === 0) {
    return { resolve: () => null };
  }

  const bounds = polygons.reduce<Bounds>(
    (acc, polygon) => {
      const b = polygonBounds(polygon);
      return {
        minX: Math.min(acc.minX, b.minX),
        minY: Math.min(acc.minY, b.minY),
        maxX: Math.max(acc.maxX, b.maxX),
        maxY: Math.max(acc.maxY, b.maxY),
      };
    },
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  );

  const side = Math.max(1, Math.ceil(Math.sqrt(polygons.length)));
  const columns = options?.gridColumns ?? side;
  const rows = options?.gridRows ?? side;
  const width = Math.max(bounds.maxX - bounds.minX, Number.EPSILON);
  const height = Math.max(bounds.maxY - bounds.minY, Number.EPSILON);

  const cellOf = (x: number, y: number): [number, number] => {
    const col = Math.min(columns - 1, Math.max(0, Math.floor(((x - bounds.minX) / width) * columns)));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(((y - bounds.minY) / height) * rows)));
    return [col, row];
  };

  const grid = new Map<string, HitTestPolygon[]>();
  const cellKey = (col: number, row: number): string => `${col}:${row}`;

  for (const polygon of polygons) {
    const b = polygonBounds(polygon);
    const [colMin, rowMin] = cellOf(b.minX, b.minY);
    const [colMax, rowMax] = cellOf(b.maxX, b.maxY);
    for (let col = colMin; col <= colMax; col++) {
      for (let row = rowMin; row <= rowMax; row++) {
        const key = cellKey(col, row);
        const bucket = grid.get(key);
        if (bucket) bucket.push(polygon);
        else grid.set(key, [polygon]);
      }
    }
  }

  return {
    resolve(x: number, y: number): string | null {
      if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
        return null;
      }
      const [col, row] = cellOf(x, y);
      const bucket = grid.get(cellKey(col, row));
      if (!bucket) return null;
      for (const polygon of bucket) {
        if (pointInPolygon(x, y, polygon)) return polygon.name;
      }
      return null;
    },
  };
}
