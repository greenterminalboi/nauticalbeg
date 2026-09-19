# Research: Province Map Generation

All findings below were confirmed by directly inspecting a real local EU5
installation (`.../Steam/steamapps/common/Europa Universalis V/game/in_game/map_data/`,
via the CrossOver/Steam Windows prefix on this machine), not guessed from
memory of other Paradox titles' conventions. Numbers cited are exact counts
from that install.

## 1. What's actually in `map_data/`

| File | Size | Contents |
|---|---|---|
| `locations.png` | 16384×8192, 8-bit RGB, no alpha | One flat color per pixel; each distinct color is one location's territory. Equirectangular-shaped (2:1 aspect) and `default.map` sets `wrap_x = yes`, confirming it's a wrapping world bitmap, not an arbitrary texture. |
| `named_locations/00_default.txt` | 28,225 entries | `location_name = rrggbb` (hex color), e.g. `stockholm = dda910`. This is the color→name key for `locations.png`. |
| `location_templates.txt` | 28,573 entries | `location_name = { topography=... religion=... culture=... }`. The canonical list of location names and their static metadata. **348 more entries than `named_locations` has colors for** — some locations have no paintable color (see Edge Cases below). |
| `definitions.txt` | — | Hierarchical `region { area { province_name = { location location location ... } } }` tree. This is the location→province grouping, and `province_name` here (e.g. `uppland_province`) is exactly the string the save's own parser already captures as `provinces.database[idx].province_definition` (confirmed in `specs/001-save-import-overview/research-save-format.md`, `provinces` section) — stored today as `provinces.name` in our schema. |
| `adjacencies.csv` | — | Location-to-location adjacency (land/sea/strait). Not needed for province shapes; noted for a possible future feature, out of scope here. |
| `rivers.png`, `nodes.dat` | — | Rivers overlay and (most likely) trade-node graph data — `nodes.dat`'s size doesn't divide evenly by the location count under any plausible fixed-record size, so it isn't a per-location table. Not needed for province boundaries; out of scope. |

**Conclusion**: `locations.png` + `named_locations/00_default.txt` gives us
per-*location* pixel regions. `definitions.txt` gives us the
location→*province* grouping and each province's display name. Aggregating
per-location regions by their province gives exactly the geometry grain the
spec's Key Entities section calls for (one record per province, matching
`provinces.idx`/`provinces.name` in our schema).

## 2. Decision: key the output by province **name**, not by replicating a numeric `idx`

**Decision**: The generated GeoJSON keys each feature by the province's
name string (`uppland_province`, etc.) — the same value already stored in
`provinces.name` by the save parser (`src/parser/version-adapters/*.ts`,
sourced from the save's own `province_definition` field). It does **not**
attempt to assign or replicate the save's numeric `provinces.idx`.

**Rationale**: Nothing in the game's install files exposes an explicit
numeric ID for a province or location — no file pairs a name with a small
sequential integer. The save's numeric `idx` values are keys the game
itself assigns internally; replicating that order from file-declaration
order (e.g. "province N = the Nth entry in `definitions.txt`") would be a
guess, unverified, and silently wrong if the game doesn't enumerate them
in file order. A wrong guess here would be worse than no geometry at all —
it would silently mislabel provinces. The name string, by contrast, is
confirmed present and reliable on both sides (game files and parsed save),
so joining on name is a single, direct, zero-guesswork match — satisfying
spec FR-003 / SC-002's "no manual remapping" requirement without
depending on an unverified assumption about ID ordering.

**Alternatives considered**:
- *Replicate numeric `idx` by file order*: rejected — unverifiable from
  static files alone; would require parsing a real save and cross-checking
  against every province, which is an implementation-time validation this
  plan doesn't need to gate on, and the ordering isn't guaranteed stable
  across game patches anyway.
- *Ship a separate idx↔name lookup table generated some other way*:
  rejected as unnecessary complexity — `provinces.name` already exists in
  the schema and is populated by the parser today; consuming features can
  join geometry-by-name directly against it with one SQL join, no extra
  table needed.

## 3. Decision: output format is TopoJSON, projected equirectangular

**Decision**: Output is a single TopoJSON `Topology` file (one object,
`provinces`, holding one geometry per province). Pixel coordinates from
`locations.png` are converted to `[longitude, latitude]` via a straight
equirectangular projection: `lon = (x / 16384) * 360 - 180`,
`lat = 90 - (y / 8192) * 180`. Each province's geometry is a `Polygon` (or
`MultiPolygon` for provinces whose locations aren't all pixel-connected,
e.g. islands) before topology-building; after topology-building it's
whatever arc-reference shape `topojson-server` produces for it, which any
consumer decodes back to the same `Polygon`/`MultiPolygon` GeoJSON shape
via `topojson-client`.

**Rationale**: Provinces tile the whole map edge-to-edge — most land
provinces share a border with a neighbor. Plain GeoJSON duplicates every
shared border's coordinates once per adjacent polygon; TopoJSON stores
each shared boundary once as an "arc" and has every bordering polygon
reference it, which typically shrinks a polygon mesh like this 3-5x. That
directly serves this feature's own soft constraint (Technical Context:
keep the committed asset "comfortably under the low tens of MB"). The
underlying projection choice is unaffected by this: TopoJSON is just a
storage encoding for geometry, decoded back to standard
`[longitude, latitude]` GeoJSON features at consumption time — coloring
by owner, map modes/overlays, and any other properties-driven rendering
happen after that decode and are completely unaffected by which encoding
the file used on disk.

**Alternatives considered**:
- *Plain GeoJSON `FeatureCollection`*: the original decision here (see
  prior revision) — rejected in favor of TopoJSON once file-size was
  weighed against provinces' near-total border-sharing; GeoJSON remains
  the *effective* interface every consumer sees post-decode, so nothing
  downstream is locked into TopoJSON specifically. Still the fallback if
  the topology-building step (§4) turns out to add more implementation
  risk than the size win is worth.
- *SVG*: rejected as the primary output — good for direct rendering but
  couples the asset to presentation (stroke/fill styling) rather than
  staying pure geometry; a future feature can trivially derive SVG paths
  from decoded GeoJSON, not vice versa.
- *Raw pixel coordinates (no projection)*: rejected — forces every future
  consumer to know and reapply the same projection math; doing it once
  here keeps the asset self-contained and standard.

## 4. Decision: pure JS/TS tooling, no native/binary dependencies

**Decision**: The generation script is TypeScript, run via `tsx` (new
devDependency), using `pngjs` (new devDependency, pure-JS PNG decoder) to
read `locations.png`. Boundary tracing (pixel region → polygon rings) is
hand-rolled (Moore-neighbor contour tracing), producing one raw
`Polygon`/`MultiPolygon` per province. Topology-building and
simplification are then handed to `topojson-server` (`topology()`) and
`topojson-simplify` (both new devDependencies, both pure-JS, by the same
author as `topojson-client`) rather than hand-rolled — **simplification
happens after topology-building, on the shared arcs**, not per-polygon
before it, so two adjacent provinces' shared border stays a single
consistent line instead of drifting apart into two slightly-different
simplified edges.

**Rationale**: Matches this project's existing preference for
dependency-light, pure-JS tooling (no native bindings like GDAL, which
would complicate cross-platform maintainer setup for a tool only a
developer runs occasionally). Boundary tracing is a standard,
well-understood algorithm worth hand-rolling and testing directly against
this exact pixel-region input (per Principle II's fixture-first spirit,
applied here by analogy even though this isn't save-format parsing);
topology-building and arc simplification are not — they're exactly what
`topojson-server`/`topojson-simplify` exist for, and hand-rolling
arc-deduplication correctly (so shared borders are byte-identical, not
just visually close) would be a significant, easy-to-get-subtly-wrong
undertaking for no real benefit over the maintained library.

**Alternatives considered**:
- *Python + Pillow/GDAL/Shapely*: rejected — introduces a second language
  and toolchain into a project that is otherwise 100% TypeScript/Node,
  for a one-time internal tool.
- *A full GIS/vectorization library (e.g. potrace via WASM)*: rejected as
  premature — the input is simple flat-color regions (not photographic
  imagery needing edge detection), so a direct color-based contour trace
  is simpler and more accurate for this exact input shape.
- *Hand-rolled Douglas-Peucker simplification on each traced polygon
  independently* (the original plan, before the GeoJSON→TopoJSON switch
  in §3): rejected — simplifying each province's boundary independently,
  before deduplicating shared arcs, risks two neighboring provinces'
  supposedly-shared border ending up as two slightly different simplified
  lines, leaving visible slivers/overlaps at every province boundary.

## 5. Where the tool and its output live

**Decision**: New top-level `tools/map-generation/` directory for the
script (outside `src/`, since it's a Node-only CLI never bundled into the
browser app — keeps ARCHITECTURE.md's `src/` module-boundary diagram
undisturbed). Output written to `public/map/provinces.topojson` — Vite's
default `public/` directory is served as-is and is the natural home for a
static asset a future browser feature will `fetch()` at runtime.

**Rationale**: No existing `src/` module owns "read external game files
and emit a static asset" — it isn't parsing (that's save files), storage,
or UI. A sibling top-level tool directory, matching the existing
`tests/fixtures` pattern of keeping non-runtime material out of `src/`,
avoids stretching an existing module's stated responsibility.

## 6. Edge cases confirmed against the real install

- **348 locations with no named color** (28,573 in `location_templates.txt`
  vs 28,225 in `named_locations/00_default.txt`): these can't be painted
  from `locations.png` and MUST be skipped from geometry generation, with
  their names collected and reported per spec FR-008 (not silently
  dropped) — likely non-paintable/administrative entries (per the
  spec-approved edge case: identifiers present in game data that don't
  correspond to a real save-visible province don't need to block
  generation).
- **Non-contiguous provinces** (islands, exclaves): confirmed necessary by
  inspection — `definitions.txt` groups locations into provinces purely by
  name list, with no guarantee those locations are pixel-adjacent in
  `locations.png`. Output uses `MultiPolygon` wherever a province's
  constituent location regions aren't all connected.
- **Game version drift**: the generated asset embeds a game version and a
  generation timestamp in the `Topology`'s top-level `properties`, so a
  future consuming feature can detect a mismatch against a loaded save's
  `detected_version` (per constitution Principle III) rather than
  assuming the asset always matches. **Implementation update**: no
  plain-text version marker was found anywhere in the real install
  (`binaries/checksum.txt` is a hash, not a version string; `eu5.exe` and
  its `.manifest` are binary/Windows-assembly metadata, not worth
  scraping). `generated_from_game_version` is supplied by the maintainer
  via an optional `--game-version <string>` CLI flag instead (default:
  `"unknown"`) — see `contracts/cli-contract.md`. This is more robust
  than file-scraping anyway: it works identically regardless of platform
  or how a given install exposes its version.

## 7. Decision: the demo viewer is a second, unbundled Vite HTML entry, hand-rolled pan/zoom

**Decision**: `tools/map-generation/demo/index.html` (+ a small
`main.ts`) is served by Vite's existing dev server as a second page
(`/tools/map-generation/demo/index.html`, or an equivalently simple dev
URL) — not added to the production build's entry points, not wired into
the React app's routing. It `fetch()`es `/map/provinces.topojson`,
decodes it with `topojson-client`'s `feature()`, and renders every
province as one SVG `<path>` (multiple subpaths for a `MultiPolygon`).
Since the projection (research.md §3) is already a linear
equirectangular mapping, screen coordinates are computed directly —
`px = (lon + 180) / 360 * viewWidth`, `py = (90 - lat) / 180 * viewHeight`
— with no map-projection library needed. Pan/zoom is a hand-rolled
pointer-drag + wheel handler updating a single SVG `<g transform="...">`
(translate + scale), clamped to sane min/max zoom.

**Rationale**: This is explicitly framed as "just a quick demo" (not the
production Map tab), so the goal is the least code that satisfies User
Story 2's borders + pan + zoom + zoom-back-out acceptance scenarios.
Skipping a projection library is valid *specifically* because the
coordinates are already linear lon/lat (research.md §3's choice pays off
twice); skipping a pan/zoom library (e.g. d3-zoom) is valid because pan
(drag→translate) and zoom (wheel→scale, clamped) are a small, well-known
amount of code, and adding a whole library for it would be more
than what "quick demo" calls for. Keeping it a separate, unbundled HTML
entry (rather than a route inside the real app) matches spec.md's
explicit framing: throwaway validation tooling, not a first draft of the
real Map tab (which will need actual design/interaction work this demo
deliberately skips).

**Alternatives considered**:
- *d3-geo + d3-zoom*: rejected for this demo specifically — correct and
  more capable, but overkill for "quick demo," and would need to become
  a real dependency choice (deciding versions, bundle impact) that's more
  appropriately made by the future Map-tab feature once it has real
  requirements (zoom limits tied to actual UI, projection choice tied to
  actual visual design), not pre-committed here.
- *Canvas rendering instead of SVG*: rejected — at ~3,300 provinces, SVG
  DOM size is a non-issue, and SVG gives crisp vector borders at any zoom
  level for free (a "shape accuracy" check, this demo's whole purpose,
  benefits directly from not re-rasterizing on zoom).
- *A route inside the real React app (e.g. wired into the "Map"
  placeholder tab)*: rejected — spec.md is explicit that this isn't the
  production Map tab; wiring it into the app's actual navigation would
  blur that line and create real-app code this feature doesn't own
  fixing/maintaining long-term.

## 8. Constitution: asset redistribution

The constitution's Technical Constraints bar redistributing Paradox's
copyrighted game assets, with reference assets expected to be "sourced
from data the user's own game installation/save provides" (read as:
per-user, not baked into the shared build). This feature's output —
vector province *boundaries* and *names* derived from the game's map
data — is committed to the repository and shipped to all users of the
built app, per an explicit decision by the project owner made when this
feature was scoped: derived geometric/positional facts (polygon outlines,
analogous to real-world administrative boundary data) are treated as
distinct from the copyrighted textures/art the constraint exists to
guard against, and are committed intentionally. This is recorded here
and in `plan.md`'s Complexity Tracking as a documented, accepted
exception rather than a silent deviation.

## 9. Decision: generate the locations layer too, as a second output file plus a second object in the first

**Decision**: Provinces aren't a separate kind of thing from locations —
a province *is* a named union of locations (research.md §1's
`definitions.txt` grouping). Since the pipeline already computes a
`LocationPixelRegion` for all 28,573 real locations before unioning them
into provinces (research.md §4), tracing each one individually (no
union step) is nearly free. Two outputs result:

- `public/map/provinces.topojson`: **both** `objects.provinces` and
  `objects.locations`, built in a single `topojson-server` `topology()`
  call so the two layers share arcs — most province borders are unions
  of location borders, so this also comes out smaller than building them
  separately (confirmed against the real install: the combined file is
  ~16MB, barely larger than the ~15MB locations-only file below, even
  though it carries both layers).
- `public/map/locations.topojson`: `objects.locations` alone, for a
  consumer that only wants the fine-grained layer without also loading
  province geometry.

Each is a real, separate `topology()` build (not one derived from the
other by filtering) — simpler and more robust than pruning unused arcs
after the fact, and the cost of building it twice is negligible for a
one-time offline run.

**The join gap**: provinces are keyed by name because the save schema
already exposes `provinces.name` (research.md §2). Locations have no
equivalent — `schema.sql`'s `locations` table has only a numeric `idx`,
no name column, because no feature has needed one yet (constitution
Principle VII). This feature generates location geometry keyed by name
anyway (the same convention as provinces, and the only identifier the
game's own files expose), but **a consumer cannot currently join it
against save data** — that requires a future feature to add a
`locations.name` column to the save parser's output, which is out of
scope here per FR-010's isolation from `src/storage/`. Documented
explicitly (`contracts/map-asset-schema.md`) rather than silently
shipping an unjoinable layer as if it were already usable.

**Alternatives considered**:
- *Locations only, no provinces*: rejected — provinces are what the
  existing schema can actually join against today; dropping them would
  make this feature's SC-002 (real join-ability) untestable.
- *Derive `locations.topojson` from the combined file by filtering out
  `objects.provinces` and pruning now-unused arcs*: rejected — TopoJSON
  doesn't make "drop an object and compact the arc array" a cheap/simple
  operation, and building it fresh is just as correct with far less code.
