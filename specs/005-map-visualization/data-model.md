# Phase 1 Data Model: Map Visualization

This feature extends two existing `src/storage/schema.sql` tables
(`locations`, `nations`), adds one new join table
(`location_pops`), and introduces two client-side (not persisted)
shapes: the loaded-once-per-save in-memory map dataset (research.md §7)
and the spatial hit-test index (research.md §9). Every new column traces
to a raw save field confirmed in research.md — no invented/guessed
fields.

## `locations` (extended)

Existing columns (`idx`, `owner_idx`, `province_idx`, `development`)
unchanged. New columns, populated during parsing (research.md §1, §4,
§5):

| Field | Type | Notes |
|---|---|---|
| `name` | text, nullable | From `metadata.compatibility.locations[idx - 1]` — a save-embedded array of every location's name, in save-idx order (research.md §1's final, adopted design). **This is the join key** against the generated map geometry's `properties.name` (the same convention `provinces.name` already uses). `NULL` when the save has no `metadata.compatibility.locations` block at all (unconfirmed whether this ever happens for a real save — handled safely either way, research.md §1). |
| `raw_material` | text, nullable | From `locations.locations[idx].raw_material` (e.g. `"clay"`). `NULL` for locations with no producible good (open sea, wasteland). Drives the RGO layer (spec FR-014). |
| `controller_idx` | integer, nullable (logically REFERENCES `nations.idx`) | From `locations.locations[idx].controller`. May differ from `owner_idx` during occupation/contested control (spec FR-016). Drives the Control layer's coloring. |
| `control` | double, nullable | From `locations.locations[idx].control`. Modulates the Control layer's shading strength (research.md §5). |

Added via `ALTER TABLE locations ADD COLUMN IF NOT EXISTS ...`
alongside the existing `CREATE TABLE IF NOT EXISTS`, applied on every
open (research.md §6) — not just table creation — so a save kept before
this feature shipped gains the columns (as `NULL` for its existing rows)
instead of failing with a missing-column error the first time a map
query runs.

## `nations` (extended)

Existing columns unchanged. New columns, from
`countries.database[idx].color.rgb` (research.md §3):

| Field | Type | Notes |
|---|---|---|
| `color_r` | integer, nullable | 0-255. From `countries.database[idx].color.rgb[0]`. |
| `color_g` | integer, nullable | 0-255. From `countries.database[idx].color.rgb[1]`. |
| `color_b` | integer, nullable | 0-255. From `countries.database[idx].color.rgb[2]`. |

All three `NULL` together when the country has no confirmed color (some
rebel/dead/unplayed tag slots) — the Political/Control layers' existing
neutral-style fallback applies (spec FR-009), never a fabricated color.
Also added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (research.md
§6).

## `location_pops` (new join table)

One row per (location, population-group) pair — the materialized form of
each location's `population.pops` list (research.md §2). Exists because
a location can reference many pop groups and DuckDB has no native
list-valued foreign key; this is simpler to index/query than an UNNEST
join at read time.

| Field | Type | Notes |
|---|---|---|
| `location_idx` | integer (logically REFERENCES `locations.idx`) | The owning location. |
| `pop_idx` | bigint (logically REFERENCES `population.idx`) | One entry from that location's `population.pops` list. Same `BIGINT` sizing as `population.idx` itself (schema.sql's existing comment on why). |

Populated by the adapter alongside `locations` during parsing: for each
location record, insert one `location_pops` row per ID in its
`population.pops` list. No `ALTER TABLE` needed (this is a wholly new
table — a plain `CREATE TABLE IF NOT EXISTS` suffices, unlike the
column additions above).

Index: `CREATE INDEX IF NOT EXISTS idx_location_pops_location ON
location_pops(location_idx);` (the map's per-location population-sum
query path).

## Query: `listMapLocationsArrow` (new, `src/storage/queries.ts`)

Returns one Arrow IPC row per location with everything all four layers
need, in the style of the existing `listProvincesArrow`/`listWarsArrow`
(joins + `COALESCE` fallbacks, no pagination — the caller loads the
whole result once per research.md §7):

| Column | Source | Used by |
|---|---|---|
| `idx` | `locations.idx` | Informational (not the join key — see `name` below) |
| `name` | `locations.name` | Join key against decoded map geometry's `properties.name` (every layer); primary display name |
| `owner_idx` | `locations.owner_idx` | Political layer identity; tooltip |
| `owner_color_r/g/b` | `nations.color_*` (joined on `owner_idx`) | Political layer fill |
| `owner_name` | `COALESCE(nations.name, nations.tag, 'Unknown')` (joined on `owner_idx`) | Tooltip (existing `listWarsArrow` fallback convention) |
| `controller_idx` | `locations.controller_idx` | Control layer identity; tooltip |
| `controller_color_r/g/b` | `nations.color_*` (joined on `controller_idx`) | Control layer fill |
| `controller_name` | `COALESCE(nations.name, nations.tag, 'Unknown')` (joined on `controller_idx`) | Tooltip |
| `control` | `locations.control` | Control layer shading strength; tooltip |
| `raw_material` | `locations.raw_material` | RGO layer identity + fill; tooltip |
| `total_population` | `SUM(population.size)` via `location_pops` (research.md §2) | Location Population layer shading; tooltip |

Two `LEFT JOIN`s to `nations` are needed (once for `owner_idx`, once for
`controller_idx`, aliased separately) — the same double-join pattern
`listWarsArrow` already uses for `attacker`/`defender`.

## Client-side: `MapLocationDataset` (in-memory, not persisted)

The decoded, in-memory form of `listMapLocationsArrow`'s result
(`apache-arrow`'s `tableFromIPC`, research.md §7), keyed by location
`name` (research.md §1) for O(1) lookup when coloring/hit-testing a
decoded geometry feature. A row with no `name` can never match a
geometry feature and is skipped when building the dataset:

```ts
interface MapLocationRow {
  idx: number; // informational only — not used to key the dataset or join geometry
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

type MapLocationDataset = Map<string, MapLocationRow>;
```

Loaded once per save when the Map tab first opens; every layer switch
reads from this same `Map`, never re-queries (spec FR-017).

## Client-side: `MapLayer` (in-memory, not persisted)

The four supported modes (spec Key Entities: Map Layer), each a real
object implementing a shared interface — not a plain string enum, since
each mode needs its own coloring rule, legend, and tooltip logic, some
with per-save memoized state (e.g. RGO's color assignment, research.md
§4):

```ts
interface MapLayer {
  id: string;
  label: string;
  getFill(row: MapLocationRow, dataset: MapLocationDataset): [number, number, number];
  getTooltipFields(row: MapLocationRow): { label: string; value: string }[];
  getLegend(dataset: MapLocationDataset): { color: [number, number, number]; label: string }[];
}
```

`MAP_LAYERS: MapLayer[]` is the registry each user story appends its
entry to, in sidebar display order.

## Client-side: spatial hit-test index (in-memory, not persisted)

A uniform grid over each decoded location polygon's bounding box
(research.md §9), built once per save load alongside `MapLocationDataset`,
used to resolve a pointer position to a location `name` for FR-010's
hover/select detail without checking every polygon on every pointer
move.

## Relationships

```text
nations (extended: +color_r/g/b)
  ↑ owner_idx, controller_idx (two distinct FKs)
locations (extended: +name [now the real join key, sourced from
           metadata.compatibility.locations], +raw_material,
           +controller_idx, +control)
  ↑ name — join key against public/map/*.topojson's properties.name
           (unchanged asset — no geometry-side change was needed)

locations
  ↑ location_idx
location_pops (new)
  → pop_idx
population (unchanged, from feature 004)
```

## Out of scope for this data model

- No new columns on `provinces` — the Political/Control/RGO/Population
  layers all render at location granularity now that the join gap is
  closed (spec Assumptions); provinces remain available for whatever
  already uses them (`listProvincesArrow`) but this feature doesn't
  extend that table.
- No change to `public/map/*.topojson` or `tools/map-generation/` — the
  join closes entirely on the save-parsing side (research.md §1); an
  earlier attempt that did change the geometry asset was reverted.
- No persistence of the decoded `MapLocationDataset`/spatial index
  beyond the browser tab's session — reloading the save re-derives both,
  consistent with the rest of the app's session-scoped derived state.
