# Contract: Generated Map Asset Schema

The contract between this feature (producer) and any future feature that
renders or queries the map (consumer, e.g. the "Map" tab in
`specs/002-country-portfolio`). See `data-model.md` for the full shape
and rationale; this document is the stable, minimal interface a consumer
can depend on without needing to know how the asset was generated.

## Files

- `public/map/provinces.topojson` — both `objects.provinces` and
  `objects.locations`, sharing arcs where their borders coincide.
- `public/map/locations.topojson` — `objects.locations` alone, for a
  consumer that only wants the fine-grained layer.

## Guarantees a consumer may rely on

1. Both files are always valid TopoJSON: a single `Topology` object with
   one or two `GeometryCollection`s under `objects`, as listed above.
   Decoding an object with `topojson-client`
   (`feature(topology, topology.objects.<key>)`) always yields a
   standard GeoJSON `FeatureCollection` whose features are `Polygon` or
   `MultiPolygon` geometries in `[longitude, latitude]` order (standard
   GeoJSON axis order), equirectangular-projected in the `[-180, 180]` /
   `[-90, 90]` range. **A consumer must decode via `topojson-client`
   before using the geometry** — the raw `arcs`/`arc`-index shape inside
   the file is not directly usable as GeoJSON.
2. Once decoded, a **province** feature's `properties.name` is a plain
   string that matches `provinces.name` values produced by the save
   parser (`src/parser/version-adapters/*.ts`, sourced from the save's
   `province_definition` field) for the same game version — join on this
   field directly; no lookup/remapping table is provided or needed (see
   research.md §2).
3. `properties.name` is unique *within* each object — unique across every
   province in `objects.provinces`, and independently unique across every
   location in `objects.locations` (both before decoding, on
   `geometries[]`, and after).
4. Top-level `properties.generated_from_game_version` identifies which
   game version's map data produced the file (a value the maintainer
   supplied via `--game-version`, `"unknown"` if they didn't — research.md
   §6), so a consumer can compare it against a loaded save's
   `save_meta.detected_version` and detect a mismatch (per constitution
   Principle III) instead of assuming they always match. `province_count`
   and `location_count` (both files carry both, even
   `locations.topojson`) give the total feature count in that run without
   needing to decode and count.
5. Neither file changes unless the generation command (see
   `cli-contract.md`) is re-run and its output is re-committed — nothing
   in the running web app regenerates or mutates them.

## Explicitly not guaranteed (out of scope for this feature)

- **No join exists for locations.** Unlike provinces, `schema.sql`'s
  `locations` table has no `name` column — only a numeric `idx`. A
  decoded `objects.locations` feature's `properties.name` cannot
  currently be joined against parsed save data at all. A future feature
  adding a `locations.name` column would close this gap (research.md
  §9); until then, a consumer can render location borders but not join
  them to save-derived data (ownership, development, etc.).
- No promise that every `provinces.name` a save produces has a matching
  feature in the asset (e.g. a save from a different game version than
  the asset was generated from) — a consumer MUST handle a lookup miss
  gracefully rather than assume 1:1 coverage.
- No styling, coloring, or rendering metadata (fill color, stroke, owner)
  — these assets are geometry only; ownership-based coloring is a future
  feature's responsibility, joined at query/render time against
  `provinces.owner_idx` (once locations have an equivalent join key,
  the same applies there).
- No guarantee of a specific coordinate precision/simplification level
  beyond "recognizably accurate" (spec SC-003) — exact simplification
  tolerance is an implementation detail that may change between
  regenerations without breaking this contract.
- TopoJSON vs. GeoJSON is a storage-encoding choice only (research.md
  §3) — it has no bearing on coloring, map modes, or any other
  properties-driven rendering a future feature adds. Those all operate
  on the decoded, standard-GeoJSON-shaped features from guarantee 1, so
  they'd work identically if these assets were ever regenerated as plain
  GeoJSON instead.
