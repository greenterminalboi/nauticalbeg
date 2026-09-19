# Data Model: Province Map Generation

This feature has no database involvement (see `research.md` §5 and
`plan.md`'s Constitution Check — explicitly isolated from `src/storage/`).
Its "data model" is the shape of the intermediate values the pipeline
computes and the shape of its two output files (research.md §9).

## Pipeline intermediate entities

- **NamedLocation**: `{ name: string; color: [r: number, g: number, b: number] }`
  Parsed from `named_locations/00_default.txt`. One per paintable location
  (28,225 in the reference install — see research.md §6 for the 348
  unpaintable locations excluded here).

- **LocationPixelRegion**: `{ name: string; pixels: Set<[x: number, y: number]> }` (conceptually — implementation may use a more memory-efficient representation, e.g. a run-length row/column set, given ~134M source pixels)
  The set of `locations.png` pixels matching one `NamedLocation`'s color.
  Produced by a single pass over the bitmap grouping pixels by exact color.

- **ProvinceGrouping**: `{ name: string; locationNames: string[] }`
  Parsed from `definitions.txt`'s `region { area { province = { loc loc ... } } }`
  tree — flattened to province name → member location names, discarding the
  region/area nesting (not needed by this feature; it exists in `definitions.txt`
  for the game's own UI grouping, not for province identity).

- **ProvinceGeometry**: `{ name: string; rings: Ring[][] }` where a `Ring`
  is a closed sequence of `[x: number, y: number]` pixel coordinates.
  Produced by unioning every member location's `LocationPixelRegion` for a
  `ProvinceGrouping` and tracing the outer (and, if present, inner/hole)
  boundary of the resulting combined region. One or more disjoint ring
  groups per province becomes a `MultiPolygon`; exactly one becomes a
  `Polygon` (see research.md §6, non-contiguous provinces).

- **LocationGeometry**: `{ name: string; rings: Ring[][] }` — same shape
  as `ProvinceGeometry`, but produced by tracing one `LocationPixelRegion`
  directly, with no union step (a location has no members of its own).
  Every one of the ~28.5k real, painted locations gets one of these
  (research.md §9).

## Output entities: the two generated assets

Both files are TopoJSON `Topology` objects sharing the same per-province
and per-location `Feature` shape below. `topojson-server`'s `topology()`
(research.md §4) rewrites each feature's `geometry` into arc references
but leaves `properties` and the top-level metadata bag untouched — a
consumer decoding either file via `topojson-client`'s `feature()` gets
back exactly the shapes shown here.

**File 1: `public/map/provinces.topojson`** — both layers, one
`Topology`, built in a single `topology()` call so they share arcs
(research.md §9):

```jsonc
{
  "type": "Topology",
  "properties": {
    "generated_from_game_version": "string — supplied via --game-version (research.md §6); \"unknown\" if omitted",
    "generated_at": "string — ISO 8601 timestamp of the generation run",
    "source_bitmap_width": 16384,
    "source_bitmap_height": 8192,
    "province_count": 0, // number of provinces actually produced
    "location_count": 0, // number of locations actually produced
    "skipped_location_names": [] // locations excluded per research.md §6, for FR-008 reporting
  },
  "objects": {
    "provinces": {
      "type": "GeometryCollection",
      "geometries": [
        {
          "type": "Polygon | MultiPolygon",
          "properties": {
            "name": "string — matches provinces.name / province_definition in the save schema",
            "location_count": 0 // number of member locations aggregated into this shape
          },
          "arcs": [] // arc-index references, per TopoJSON spec — resolved by topojson-client back to [longitude, latitude] rings, equirectangular-projected per research.md §3
        }
      ]
    },
    "locations": {
      "type": "GeometryCollection",
      "geometries": [
        {
          "type": "Polygon | MultiPolygon",
          "properties": {
            "name": "string — the game's own location name; no equivalent save-schema column exists yet (research.md §9's join gap)"
          },
          "arcs": [] // may reference the SAME arc indices as a province geometry above, where a border is shared
        }
      ]
    }
  },
  "arcs": [] // shared coordinate sequences, deduplicated across both objects
}
```

**File 2: `public/map/locations.topojson`** — `objects.locations` alone,
same per-location shape as above, built as its own independent
`topology()` call (not derived from File 1 — research.md §9).

**Validation rules** (enforced by the pipeline before writing either
file, per spec FR-007):

- `properties.name` MUST be unique *within* each object (`provinces`,
  `locations`) — a duplicate province name and a duplicate location name
  are both rejected, independently of each other.
- Every geometry MUST resolve (via `topojson-client`'s `feature()`) to a
  non-empty `Polygon`/`MultiPolygon` — a province or location with zero
  paintable pixels is reported in `skipped_location_names`'s spirit but
  as an omission, not written as an empty/degenerate geometry.
- Both files MUST be valid TopoJSON — verified by decoding every object
  back to GeoJSON via `topojson-client` as the pipeline's final step
  before considering the run successful (this doubles as the "is it
  well-formed" check and the "does every feature still carry its `name`
  after topology-building" check).

## Relationship to the existing save schema (read-only, at consumption time — not part of this feature)

```text
provinces.name (schema.sql)  ──join by exact string──►  decoded provinces.topojson feature: objects.provinces properties.name
```

A future consuming feature decodes the file with `topojson-client`
(`feature(topology, topology.objects.provinces)` → a standard GeoJSON
`FeatureCollection`) before doing anything else with it — the join above
happens against that decoded, ordinary-GeoJSON shape, exactly as it would
have against a plain GeoJSON file.

**No equivalent join exists for locations yet** — `schema.sql`'s
`locations` table has no `name` column (only `idx`), so
`objects.locations`' `properties.name` values (in either file) cannot
currently be joined against parsed save data. A future feature adding
that column is what would close this gap (research.md §9); this feature
generates the geometry ahead of that need but does not itself modify
`src/storage/`.

No schema change, no new table, and no code in `src/storage/` is touched
by this feature — this relationship is documentation for whichever future
feature consumes the assets (the "Map" tab), not something this feature
implements.
