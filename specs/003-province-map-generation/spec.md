# Feature Specification: Province Map Generation

**Feature Branch**: `003-province-map-generation`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "Generate an accurate, real-world province/nation map asset for EU5 saves, as a one-time offline pipeline (not a runtime browser feature). We need a way to produce accurate map geometry (province shapes/boundaries, positioned correctly) sourced from the EU5 game's own install files (its map definition data, e.g. province bitmap/definition and position files), converted into a usable static format (e.g. GeoJSON or SVG) keyed by the same province IDs used in our save-file parser/schema (provinces.idx / locations.province_idx). This is a build-time/dev-tooling step run against a local EU5 install, producing a committed static asset in the repo — it does not need to run repeatedly per save load, and it is NOT about rendering the map in the UI yet (no coloring by nation, no overlays, no interactivity) — just outright generating the accurate map data/asset that a future Map tab feature (see specs/002-country-portfolio's placeholder 'Map' side-nav item) will consume. This should be scoped as its own feature, developed in parallel with the ongoing SQLite-to-DuckDB storage migration happening on this branch, and should not depend on or block that migration."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate the province geometry asset (Priority: P1) 🎯 MVP

A maintainer with a local EU5 game installation runs a one-time generation
step that reads the game's own map data files and produces a single
static geometry asset — the accurate shape and position of every
province in the game world — keyed by the same province identifier the
save-file parser already uses (`provinces.idx`). The asset is committed
to the repository so the running web app never has to regenerate it, and
so a later feature (the "Map" top-level app section, currently a
placeholder per `specs/002-db-technology-migration`) has something real
to render against.

**Why this priority**: This is the entire feature. Nothing else in this
spec exists independently of producing this asset — it is the P1 and
only user story.

**Independent Test**: Can be fully tested by running the generation step
against a real local EU5 installation and confirming the output asset
exists, is well-formed, and contains a geometry entry for every province
identifier the installation's map data defines.

**Acceptance Scenarios**:

1. **Given** a valid local EU5 installation path, **When** the maintainer
   runs the generation step, **Then** a single static geometry asset file
   is produced containing one geometry record per province defined in
   the game's map data.
2. **Given** the generated asset, **When** a province identifier from it
   is compared against the identifiers the save-file parser assigns to
   `provinces.idx` / `locations.province_idx`, **Then** they match — the
   asset can be joined against save data without a translation step.
3. **Given** the generated asset, **When** a province's geometry is
   inspected, **Then** its shape is recognizably proportional to that
   province's real position and extent on the in-game map (not a
   placeholder shape, not a single point).
4. **Given** the generation step has already produced a committed asset,
   **When** the web app starts up or a save is loaded, **Then** the
   generation step is not invoked again — the app only ever reads the
   already-generated asset (once a later feature wires it in).

---

### User Story 2 - Quick demo viewer for the generated asset (Priority: P2)

Once the asset exists, a maintainer wants to actually look at it in a
browser rather than only inspecting it with a GIS tool or raw JSON
dumps — a minimal page that loads the generated asset, draws every
province's borders, and lets the maintainer pan around and zoom in/out
to visually sanity-check coverage and shape accuracy across the whole
map, not just a handful of spot-checked provinces.

**Why this priority**: This is validation tooling for User Story 1, not
a second independent deliverable — it only exists to make Acceptance
Scenario 3 (shape accuracy) and Success Criterion SC-003 easier and more
thorough to check than a generic GIS viewer. It depends entirely on User
Story 1's output already existing, so it's P2, not P1.

**Independent Test**: Can be fully tested by opening the demo page (dev
server) with a real generated asset present, confirming province borders
render across the whole map, and confirming the view can be panned,
zoomed in, and zoomed back out.

**Acceptance Scenarios**:

1. **Given** a generated `provinces.topojson` asset, **When** the demo
   page loads, **Then** every province's border is drawn on screen (not
   just a subset), with no coloring/styling requirement beyond visible
   outlines.
2. **Given** the demo page is showing the map, **When** the maintainer
   drags/pans, **Then** the view moves accordingly and previously
   off-screen borders become visible.
3. **Given** the demo page is showing the map, **When** the maintainer
   zooms in, **Then** the borders remain visually correct (no distortion)
   and finer detail becomes visible.
4. **Given** the demo page is zoomed in, **When** the maintainer zooms
   back out, **Then** the view returns to showing the whole map correctly
   (zoom is not one-directional/lossy).

---

### Edge Cases

- What happens when the supplied EU5 installation path is missing, wrong,
  or doesn't contain recognizable map data? The generation step MUST fail
  with a clear, actionable error rather than producing an empty or
  partial asset.
- What happens when the game's map data contains a province identifier
  that never appears in any save (e.g. a sea zone, wasteland, or region
  not currently reachable in play)? It MUST still be included in the
  asset — the pipeline generates from the game's map definition, not from
  any specific save, so it can't know in advance which identifiers a
  given save will use.
- What happens when a save-file province identifier (from a parsed save)
  has no matching entry in the generated asset (e.g. the save was made
  with a different game version than the installation used to generate
  the asset)? Out of scope for this feature to resolve at generation
  time; the generation step MUST report which identifiers it produced so
  a consuming feature can detect and handle a mismatch later.
- What happens to provinces whose in-game territory is non-contiguous
  (e.g. islands belonging to one province, exclaves)? Their geometry MUST
  represent all disjoint parts, not just one.
- What happens when the generation step is re-run after a game update
  changes the map (new provinces, changed borders)? Re-running MUST fully
  regenerate and overwrite the asset — it is not an incremental update.
- What happens when the demo page (User Story 2) is opened before any
  asset has been generated? It MUST show a clear "no asset found"
  message rather than a blank page or a silent failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The generation step MUST read province/map definition data
  directly from a local EU5 game installation supplied by the maintainer
  (e.g. a path to the install directory) — it MUST NOT depend on any save
  file as its geometry source.
- **FR-002**: The generation step MUST produce one geometry record per
  province defined in the game's map data, representing that province's
  real shape and position as defined by the game. It MUST also produce
  one geometry record per individual location (the finer-grained tiles
  provinces are built from) — a province's territory is a union of its
  member locations', not a separately-sourced shape.
- **FR-003**: Every province geometry record MUST be keyed by the same
  province identifier convention the save-file parser uses for
  `provinces.idx`/`provinces.name` (see `specs/001-save-import-overview`),
  so the asset can be joined against parsed save data without a
  translation or remapping step. Location geometry records MUST be keyed
  by the same name convention, though no equivalent save-side column
  exists yet to join against (see Assumptions).
- **FR-003a**: The generation step MUST produce two output files: one
  containing both the province and location layers together, and one
  containing only the location layer, for a consumer that wants the
  fine-grained layer without also loading province geometry.
- **FR-004**: The generation step MUST run as an offline, on-demand
  process invoked by a maintainer — it MUST NOT run automatically as part
  of loading the web app or parsing a save, and MUST NOT require network
  or server infrastructure beyond the maintainer's own machine.
- **FR-005**: The generation step MUST write its output as static asset
  file(s) suitable for committing to the repository, so the running
  application never needs to regenerate them and can simply read the
  committed files.
- **FR-006**: A province whose in-game territory is non-contiguous MUST
  have its geometry represent every disjoint part, not just one region.
- **FR-007**: The generation step MUST fail with a clear, actionable
  error (not a partial or silently-empty asset) when the supplied
  installation path is missing or does not contain recognizable map
  data.
- **FR-008**: The generation step MUST report the full set of province
  identifiers it produced (e.g. a count and/or list in its output or
  logs), so a later feature can detect a mismatch against a given save's
  identifiers rather than failing silently on lookup.
- **FR-009**: The generation step MUST be independently re-runnable at
  any time (e.g. after a game update changes the map) without requiring
  any change to the web application's runtime code, and each run MUST
  fully regenerate the asset rather than incrementally patching it.
- **FR-010**: This feature's work (the generation step, its output asset,
  and any tooling code it requires) MUST NOT modify or depend on the
  save-parsing worker, the storage layer (`src/storage/`), or the
  storage engine migration in progress on this branch — it is developed
  and testable in isolation from that work.
- **FR-011**: The feature MUST include a minimal demo page that loads
  the generated asset and renders every province's *and* every
  location's border, purely to validate User Story 1's output — it MUST
  NOT be wired into the
  shipped app's navigation/routing, styled per the app's design system,
  or treated as the production "Map" tab (that remains a future
  feature's responsibility per the Assumptions below).
- **FR-012**: The demo page MUST support panning and zooming (in and back
  out) over the rendered map, so a maintainer can inspect any region at
  any scale without the generation step being re-run.

### Key Entities *(include if feature involves data)*

- **Province geometry record**: One entry per in-game province. Carries
  the province's identifier (matching `provinces.idx`/`provinces.name`
  from the save schema), its shape (one or more bounded regions
  describing its real in-game extent — a union of its member locations'
  shapes), and a stable reference point (e.g. a center or label position)
  usable for placing a marker or label later.
- **Location geometry record**: One entry per in-game location, the
  finer-grained tiles provinces are built from. Same shape as a province
  geometry record, minus any notion of member locations of its own.
  Keyed by name (the only identifier the game's files expose for a
  location); no equivalent identifier exists yet on the save-schema side
  to join against (see Assumptions).
- **Generated map assets**: Two committed output files for one
  game-map version — one holding every province *and* location geometry
  record together, one holding only location geometry records. Consumed
  by future features (not this one) that render or query them.
- **EU5 installation (input)**: A local, maintainer-supplied copy of the
  game's own files containing its authoritative map/province definition
  data. Read-only input to this feature; never modified, never bundled
  or redistributed as part of this asset's generation output beyond the
  derived geometry itself.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running the generation step once against a valid local EU5
  installation produces a complete asset covering 100% of the
  province identifiers defined in that installation's map data.
- **SC-002**: Every province identifier in the generated asset matches
  the identifier convention already used by parsed save data, verified
  by successfully joining the asset against a real parsed save's
  `provinces` table with zero manual remapping.
- **SC-003**: A sample of provinces' generated shapes, visually compared
  against the game's own in-game map, are recognizable as the correct
  province in the correct location — not a schematic or placeholder.
- **SC-004**: Once generated and committed, loading or re-loading the web
  app triggers zero re-generation work — confirmed by the generation
  step never being invoked outside its own manual run.
- **SC-005**: Re-running the generation step from a clean installation
  copy produces a byte-reproducible or functionally-identical asset
  (same province count, same identifiers, equivalent geometry) —
  confirming the process is deterministic, not dependent on incidental
  machine state.
- **SC-006**: A maintainer can open the demo page and, within a couple of
  minutes of panning/zooming, visually confirm province border coverage
  and shape accuracy across the whole map — not just the handful of
  provinces a manual spot-check (SC-003) covers.

## Assumptions

- The maintainer running the generation step has legal access to a local
  EU5 game installation on their own machine; this feature reads from
  that installation but never redistributes the game's original files —
  only the derived geometry/identifier data it produces.
- The generated asset is stored as vector geometry (region boundaries
  keyed by identifier), not a raster image, so it can be scaled, styled,
  and queried by a later rendering feature without needing to re-derive
  shapes from a bitmap at runtime. The exact file format (e.g. GeoJSON)
  is a technical decision left to the implementation plan, not fixed
  here.
- This feature produces the asset and a minimal, unstyled demo viewer to
  validate it (borders + pan/zoom only, per User Story 2). Coloring by
  nation/owner, overlays, click-for-info interactivity, and any styling
  consistent with the app's actual design system are explicitly out of
  scope and belong to a future feature (the production "Map" section
  referenced in `specs/002-db-technology-migration`) — the demo page is
  throwaway validation tooling, not a first draft of that tab.
- The generation step is a developer/maintainer-facing tool, not an
  end-user-facing feature of the shipped web app — it has no UI of its
  own and is not run by players.
- One generated asset corresponds to one game-map version. Handling
  multiple simultaneous map versions (e.g. supporting saves from several
  incompatible game versions at once) is out of scope; re-running the
  generation step to produce a new asset when the map changes is the
  assumed workflow.
- This feature has no dependency on, and makes no changes to, the
  SQLite-to-DuckDB storage migration in progress elsewhere on this
  branch; the two are safe to develop in parallel.
- The save schema does not currently have a name column for individual
  locations (only a numeric `idx`) — only provinces do. Location geometry
  is generated and keyed by name anyway (the only identifier the game's
  files expose), but a consuming feature cannot yet join it against save
  data; that requires a future feature to add a `locations.name` column
  to the save parser's output. This feature does not add that column
  itself (FR-010's isolation from `src/storage/`).
