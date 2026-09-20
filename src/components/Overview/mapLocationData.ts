// specs/005-map-visualization data-model.md: the decoded, in-memory form
// of `listMapLocationsArrow`'s result, keyed by location `name` — the
// join key against the generated map geometry's decoded
// `properties.name` (research.md §1: sourced at parse time from the
// save's own `metadata.compatibility.locations` array, not the sparse
// per-location `name` override field). Loaded once per save (research.md
// §7/FR-017); every map layer reads from this same object, never
// re-queries.
import { tableFromIPC } from "apache-arrow";
import { listMapLocationsArrow } from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";

export interface MapLocationRow {
  idx: number;
  name: string;
  ownerIdx: number | null;
  ownerColor: [number, number, number] | null;
  ownerName: string;
  controllerIdx: number | null;
  controllerColor: [number, number, number] | null;
  controllerName: string;
  control: number | null;
  rawMaterial: string | null;
  totalPopulation: number;
}

export type MapLocationDataset = Map<string, MapLocationRow>;

function rgbOrNull(
  r: unknown,
  g: unknown,
  b: unknown,
): [number, number, number] | null {
  return typeof r === "number" && typeof g === "number" && typeof b === "number"
    ? [r, g, b]
    : null;
}

/** Decodes `listMapLocationsArrow`'s Arrow IPC buffer directly via
 * `apache-arrow` (same direct-decode approach `src/storage/db.ts` itself
 * uses) — no Perspective involved, since the map needs per-location
 * keyed access for canvas coloring, not a tabular grid. A row with no
 * `name` can never match a geometry feature (the join key), so it's
 * skipped — this is now rare (the compatibility-array-sourced name
 * covers effectively every location), unlike the earlier per-location
 * override field it replaced. */
export async function loadMapLocationDataset(db: SaveDatabase): Promise<MapLocationDataset> {
  const buffer = await listMapLocationsArrow(db);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();

  const dataset: MapLocationDataset = new Map();
  for (const row of rows) {
    const r = row.toJSON();
    if (typeof r.name !== "string") continue;

    dataset.set(r.name, {
      idx: typeof r.idx === "number" ? r.idx : -1,
      name: r.name,
      ownerIdx: typeof r.owner_idx === "number" ? r.owner_idx : null,
      ownerColor: rgbOrNull(r.owner_color_r, r.owner_color_g, r.owner_color_b),
      ownerName: String(r.owner_name),
      controllerIdx: typeof r.controller_idx === "number" ? r.controller_idx : null,
      controllerColor: rgbOrNull(r.controller_color_r, r.controller_color_g, r.controller_color_b),
      controllerName: String(r.controller_name),
      control: typeof r.control === "number" ? r.control : null,
      rawMaterial: typeof r.raw_material === "string" ? r.raw_material : null,
      totalPopulation: typeof r.total_population === "number" ? r.total_population : 0,
    });
  }
  return dataset;
}
