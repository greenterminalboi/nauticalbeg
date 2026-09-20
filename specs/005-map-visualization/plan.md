# Implementation Plan: Map Visualization

**Branch**: `005-map-visualization` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-map-visualization/spec.md`

## Summary

Replace the Map tab's "coming soon" placeholder with a real, interactive
map of the loaded save's world, backed by feature 003's generated
geometry (`public/map/provinces.topojson`/`locations.topojson`) and a
collapsible sidebar for switching between four layers: Political
(owner's in-game color), Location Population (per-location headcount),
RGO (raw good), and Control (controller + how firmly held). The
technical core is closing feature 003's documented location-join gap —
`locations` currently has no name column to match the geometry's
`properties.name` — by extracting a `name` field already present but
unused in the raw save, alongside three more previously-unextracted
per-location fields (`raw_material`, `controller`, `control`) and three
new per-nation color columns, all via additive (`ALTER TABLE ... ADD
COLUMN IF NOT EXISTS`) schema changes so saves kept before this feature
ships stay openable. Every location's per-layer data is loaded once per
save (one new query, `listMapLocationsArrow`) and held in memory
client-side; layer switches recolor from that same data with no further
query, per the 2026-09-19 clarify session. Rendering uses a `<canvas>`
with a hand-rolled linear projection and a small spatial-grid hit-test
index — no new rendering dependency, since the geometry is already a
flat, equirectangular-projected plane (003's contract) at a scale
(~28,573 locations) where an SVG-per-element approach risks the
responsiveness this feature's success criteria require.

## Technical Context

**Language/Version**: TypeScript (existing stack) — no change.

**Primary Dependencies**: No new dependency. Reuses `@duckdb/duckdb-wasm`
+ `apache-arrow` (existing query/decode path, same as `src/storage/
db.ts`), `topojson-client` (existing, decodes feature 003's assets),
`react`/`react-dom` (existing UI). Explicitly does **not** add a
geographic-projection or mapping library (`d3-geo`, Leaflet, Mapbox GL,
deck.gl) — research.md §8 explains why none is needed for this asset's
flat coordinate space at this feature's required layer set.

**Storage**: DuckDB (existing, via `@duckdb/duckdb-wasm`, OPFS-persisted
for kept saves). Extends the existing per-save schema: `locations` and
`nations` gain new columns (additive `ALTER TABLE`, research.md §6), and
one new join table `location_pops` is added (data-model.md).

**Testing**: `vitest` (existing), against the real trimmed fixture
`tests/fixtures/rus-1628-minimal.eu5` (constitution Principle II —
NON-NEGOTIABLE fixture+test requirement for every parser change).

**Target Platform**: Evergreen browsers (existing — no native install),
client-side/in-browser only; no server-side component is introduced.

**Project Type**: Single web application (existing `src/` tree) — no new
top-level project, no backend/service split.

**Performance Goals**: Initial map render within 3s of opening the tab
(spec SC-001); layer switch in under 1s with zero additional data
loading (spec SC-002, FR-017); pan/zoom/layer-switch stays responsive
across the save's full ~28,573-location set (spec SC-006, FR-013).

**Constraints**: No new heavy rendering/mapping dependency (constitution
Principle VII); heavy/blocking work must not freeze the UI thread
(Principle V) — the map's one-time data load and canvas draw are
expected to be light enough to stay on the main thread, consistent with
this codebase's existing post-DuckDB-migration precedent of running
queries on the main thread (`queries.ts`'s documented decision), but
implementation should confirm against the real fixture/full save rather
than assume; every layer must remain non-color-dependent identifiable
via tooltip/legend text (Principle VI).

**Scale/Scope**: ~28,573 locations per save (confirmed, research.md),
four map layers, one new query function, four extended/new database
objects (`locations` +4 columns, `nations` +3 columns, `location_pops`
new table).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design — still holds.*

| Principle | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | ✅ Pass | This feature only reads more fields from data already being parsed; nothing about save-file handling changes. No new server-side component. |
| II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE) | ✅ Pass (planned) | Every new field (`locations.name`/`raw_material`/`controller`/`control`, `nations.color_*`) gets extraction code in `1.3.11.ts` plus a fixture-backed regression test in `tests/parser/adapter.test.ts`, per research.md §11 — fixture coverage must be verified/extended before the corresponding test is written, tracked as an explicit task. |
| III. Explicit Format-Version Compatibility | ✅ Pass | No new version handling needed — this feature only extends the existing single `1.3.11` adapter with fields already confirmed present for that version (research.md). |
| IV. Accurate, Unembellished Representation | ✅ Pass | Every layer's value traces to a real raw save field (research.md §1-5); no field is invented, estimated, or interpolated. `NULL`/missing data always renders as an explicitly distinct neutral style (spec FR-009), never guessed. |
| V. Performance & Scalability for Large Saves | ✅ Pass (with a verify task) | The load-once/recolor-from-memory design (research.md §7) and canvas rendering (research.md §8) are chosen specifically to meet this; `tasks.md` includes an explicit verification step against a full real save, not just the trimmed fixture, before calling SC-006 done. |
| VI. Visualization Clarity & Accessibility | ✅ Pass (with a design constraint) | RGO's per-save color assignment (research.md §4) and every layer's tooltip (spec FR-010) are the non-color-dependent identification path this principle requires; quickstart.md's step 5 is a dedicated spot-check. |
| VII. Simplicity & Incremental Scope | ✅ Pass | No new dependency (research.md §8); reuses existing query/decode patterns (`apache-arrow`, `listProvincesArrow`'s join style) rather than inventing a new data-access shape; only one base layer active at a time (spec Assumptions) rather than building a multi-overlay compositing system nobody asked for yet. |
| VIII. Grounded AI Query Agent | N/A | This feature adds no agent-facing capability; the AI copilot (when built) could later read `listMapLocationsArrow`-backed data like any other query, but that's not in this feature's scope. |
| Technical Constraints — parsing/visualization decoupling | ✅ Pass | The map is purely a new consumer of the existing parsed/stored representation (`locations`/`nations`/`population` tables); no parsing logic lives in the rendering layer. |
| Technical Constraints — no Paradox asset redistribution | ✅ Pass | Reuses feature 003's already-approved, non-redistributed geometry asset; adds no new game-derived asset. |

**Gate result**: PASS, no exceptions needed — no Complexity Tracking
entries below.

## Project Structure

### Documentation (this feature)

```text
specs/005-map-visualization/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── map-data-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Existing single-project web app layout (no new top-level directory);
this feature touches the parser, storage, and one new UI area:

```text
src/
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts          # extended: +locations.name/raw_material/controller/control,
│                                #           +nations.color_r/g/b, +location_pops rows
├── storage/
│   ├── schema.sql              # extended: ALTER TABLE additions + new location_pops table
│   └── queries.ts              # extended: + listMapLocationsArrow
└── components/
    └── Overview/                # flat — no subdirectories anywhere in this
                                  # tree today (EncyclopediaNav.tsx, SideNav.tsx,
                                  # ProvincesTab.tsx etc. all sit directly here);
                                  # this feature follows that convention rather
                                  # than introducing the first nested folder
        ├── FileLoader.tsx      # extended: activeSection === "map" renders MapTab, not the placeholder
        ├── tabs.ts              # unchanged (AppSection already has "map")
        ├── MapTab.tsx           # top-level Map tab: owns loaded dataset + active layer state
        ├── MapTab.css
        ├── MapCanvas.tsx        # canvas render + pan/zoom + hit-testing (research.md §8-9)
        ├── MapCanvas.css
        ├── MapSidebar.tsx       # collapsible layer list (spec User Story 2)
        ├── MapSidebar.css
        ├── MapLegend.tsx        # per-layer legend (spec FR-012)
        ├── MapLegend.css
        ├── mapLayers.ts         # MapLayer definitions: coloring rule + legend per layer (data-model.md)
        ├── mapLocationData.ts   # decode listMapLocationsArrow → MapLocationDataset (data-model.md)
        └── mapHitTest.ts        # spatial grid + point-in-polygon (research.md §9)

tests/
├── parser/
│   └── adapter.test.ts         # extended: new field assertions (constitution Principle II)
├── storage/
│   └── map-locations.test.ts   # new: listMapLocationsArrow + kept-save ALTER-TABLE compatibility
└── components/
    ├── mapHitTest.test.ts      # hit-testing — pure-function tests, no real canvas needed (research.md §9)
    ├── mapLayers.test.ts        # per-layer coloring/RGO color-assignment — pure-function tests
    └── MapSidebar.test.tsx      # collapse/expand + layer-selection callback (spec User Story 2)
```

**Structure Decision**: Follows the existing `Overview/<Feature>Tab.tsx`
flat-file pattern (`ProvincesTab.tsx`, `WarsTab.tsx`, `EncyclopediaNav.tsx`)
exactly — no new nested directory, matching every other multi-file area in
this tree. `MapTab` is wired in at `FileLoader.tsx`'s existing
`activeSection === "map"` branch, replacing `<ComingSoonPlaceholder
feature="Map" />` — the same integration point already reserved for this
feature by the nav work in feature 002. The sidebar (`MapSidebar.tsx`) is
owned by `MapTab`, not rendered as a `FileLoader`-level sibling like
`EncyclopediaNav`/`CountryViewerNav`, since it's specific to the map view
rather than a save-wide section selector.

## Complexity Tracking

*No violations — Constitution Check above passed with no exceptions
needed.*
