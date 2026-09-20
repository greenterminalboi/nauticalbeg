# Tasks: Map Visualization

**Input**: Design documents from `/specs/005-map-visualization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/map-data-contract.md, quickstart.md (all present)

**Tests**: Included. Every new/changed field in `src/parser/version-adapters/1.3.11.ts` and `src/storage/schema.sql` gets a fixture-backed regression test per constitution Principle II (NON-NEGOTIABLE — a parser change without one is rejected in review), and every rendering-layer coloring/hit-testing rule gets a pure-function test per plan.md's Constitution Check (Principle VI/V notes) — these aren't optional here, same convention `specs/003-province-map-generation/tasks.md` used "by analogy."

**Organization**: This spec has five user stories in priority order. Phase 3 (US1, Political) is the MVP: the first real, user-visible layer. Phase 4 (US2, sidebar) turns "one hardcoded layer" into "a switchable set of layers" — it explicitly depends on US1 existing (spec's own "Why this priority" note). Phases 5-7 (US3 Population, US4 RGO, US5 Control) each add exactly one more layer definition on top of the sidebar mechanism US2 built; none of them touch schema/parser/query code, since Foundational already extracts and loads every column every layer needs (research.md §7's "load once" decision made this possible: splitting the *rendering* per story stays a genuine independent increment without re-touching the same query/adapter file four times).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[US1]**-**[US5]**: Which user story a task belongs to
- Paths are repo-relative, per `plan.md`'s Project Structure section

---

## Phase 1: Setup

**Purpose**: Confirm the ground this feature builds on before touching any code.

- [X] T001 Verify `tests/fixtures/rus-1628-minimal.eu5` actually retains `locations.locations.*.name`/`raw_material`/`controller`/`control` and `countries.database.*.color` for at least one sampled entry each (research.md §11) — inspect it the same way `npm run schema-map` inspects a real save, or parse it directly and print the relevant paths. If any field was stripped during trimming, extend the fixture now (re-derive from the same source save used to build it, keeping it minimal) before any task below depends on it being present.

**Checkpoint**: The fixture this feature's tests rely on is confirmed to carry every field research.md cites, or has been extended so it does.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything every layer needs — schema, parser extraction, the one save-wide query, the in-memory dataset it decodes into, the Map tab's entry point, and the generic (layer-agnostic) canvas/pan-zoom/hit-testing engine. No layer is selectable yet after this phase (`MAP_LAYERS` starts empty) — that's User Story 1's job.

**⚠️ CRITICAL**: No user story task below can start until this phase is complete.

### Tests for Foundational ⚠️ (write first; confirm each fails before its paired implementation task)

- [X] T002 [P] Write failing tests in `tests/parser/adapter.test.ts` asserting that, after parsing the fixture, a real location row has non-null `name`, `raw_material`, `controller_idx`, and `control`, and a real nation row has non-null `color_r`/`color_g`/`color_b` matching the fixture's raw `color.rgb` values (research.md §1, §3, §4, §5; constitution Principle II).
- [X] T003 [P] Write failing tests in `tests/storage/map-locations.test.ts`: (a) `listMapLocationsArrow` returns one row per location with every column from data-model.md's query table, correctly joined for both `owner_idx` and `controller_idx`; (b) opening a database whose `locations`/`nations` tables were created *without* this feature's new columns (simulate the pre-005 schema) still opens successfully after the additive schema step runs, with the new columns present and `NULL` rather than raising a missing-column error (research.md §6).

### Implementation for Foundational

- [X] T004 Add `ALTER TABLE locations ADD COLUMN IF NOT EXISTS name TEXT;` / `raw_material TEXT` / `controller_idx INTEGER` / `control DOUBLE`, `ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_r INTEGER` / `color_g INTEGER` / `color_b INTEGER`, a new `CREATE TABLE IF NOT EXISTS location_pops (location_idx INTEGER, pop_idx BIGINT)`, and the `idx_locations_name`/`idx_locations_controller`/`idx_location_pops_location` indexes to `src/storage/schema.sql`, applied on every open per research.md §6 (data-model.md has the full field list). Partially satisfies T003(b).
- [X] T005 In `src/parser/version-adapters/1.3.11.ts`, extract `locations.locations[idx].name` (handling both the plain-string and `{name: {...}}` renamed-location shapes — research.md §1's `asLocationNameOrNull`), `.raw_material`, `.controller`, and `.control` into the `locations` insert, and `countries.database[idx].color.rgb` (research.md §3's `asRgbOrNull`) into the `nations` insert. Depends on T004. Makes T002 pass.
- [X] T006 In the same adapter file, add a loop over each location's `population.pops` list, inserting one `location_pops` row per pop-record ID (research.md §2). Depends on T004.
- [X] T007 Implement `listMapLocationsArrow(db, )` in `src/storage/queries.ts` per `contracts/map-data-contract.md`'s query (two `LEFT JOIN`s to `nations` — once for `owner_idx`, once for `controller_idx` — plus `location_pops`/`population` joined and `SUM`med for `total_population`, `GROUP BY locations.idx`), following `listWarsArrow`'s existing double-join style. Depends on T004, T006. Makes T003(a) pass.
- [X] T008 [P] Implement `src/components/Overview/mapLocationData.ts`: the `MapLocationRow`/`MapLocationDataset` types (data-model.md) and a loader that calls `listMapLocationsArrow`, decodes the Arrow IPC buffer via `apache-arrow`'s `tableFromIPC` (same direct-decode approach `src/storage/db.ts` already uses), and returns a `Map<string, MapLocationRow>` keyed by `name`.
- [X] T009 [P] Implement `src/components/Overview/mapHitTest.ts`: a uniform grid built once from a set of decoded `{ name, geometry }` features' bounding boxes, and a `resolve(x, y): string | null` point-in-polygon lookup restricted to the grid cell(s) under `(x, y)` (research.md §9) — pure functions, no canvas dependency.
- [X] T010 [P] Write pure-function tests for `mapHitTest.ts` in `tests/components/mapHitTest.test.ts`, using small synthetic polygons (a handful of non-overlapping shapes with known bounds) to verify correct grid bucketing and point-in-polygon resolution, including a point outside every polygon resolving to `null`.
- [X] T011 Implement `src/components/Overview/mapLayers.ts`: the `MapLayer` type (`id`, `label`, `getFill(row): [number, number, number] | null`, `getLegend(dataset): LegendEntry[]`, `getTooltipFields(row): {label, value}[]` — data-model.md) and an initially-empty `MAP_LAYERS: MapLayer[]` registry that each user story below appends one entry to.
- [X] T012 [P] Implement `src/components/Overview/MapLegend.tsx` + `MapLegend.css`: a presentational component rendering whatever `LegendEntry[]` the active `MapLayer` supplies (spec FR-012) — no layer-specific logic of its own.
- [X] T013 [P] Implement `src/components/Overview/MapCanvas.tsx` + `MapCanvas.css`: canvas setup, the linear equirectangular-to-pixel transform (research.md §8), pan/zoom interaction, and a generic draw loop that fills each decoded location polygon using the active `MapLayer`'s `getFill`, plus pointer-move/click handling delegating to `mapHitTest.ts` to surface the hovered/selected location's name to a callback prop (spec FR-010). Depends on T009.
- [X] T014 Implement `src/components/Overview/MapTab.tsx` + `MapTab.css`: on mount, fetch and decode `public/map/locations.topojson` via `topojson-client`, call `mapLocationData.ts`'s loader once (T008), hold `activeLayer` state (starts `null`/first-available once `MAP_LAYERS` is non-empty), render `MapCanvas` + `MapLegend` when data is ready, and render the existing `EmptyState` component (matching other tabs' convention) when no save is loaded (spec Edge Cases). Depends on T007, T008, T011, T012, T013.
- [X] T015 Wire `MapTab` into `src/components/Overview/FileLoader.tsx`: replace `{activeSection === "map" && <ComingSoonPlaceholder feature="Map" />}` with `{activeSection === "map" && <MapTab db={readDbRef.current} />}`, matching `ProvincesTab`'s existing `db` prop convention. Depends on T014.

**Checkpoint**: Schema, parser, query, in-memory dataset, canvas/pan-zoom, and hit-testing are all in place and tested; the Map tab is reachable and no longer a placeholder, but shows no colored layer yet (`MAP_LAYERS` is empty). User Story 1 makes it show something.

---

## Phase 3: User Story 1 - View the Political Map (Priority: P1) 🎯 MVP

**Goal**: Opening the Map tab shows every owned location filled with its owning country's real in-game color, with a name+owner tooltip and a neutral style for unowned/no-data locations.

**Independent Test**: Load a save, open the Map tab, confirm every owned location is colored with its owner's real color (spot-checked against the raw save data), unowned locations look distinctly neutral, and hovering/selecting a location shows its name and owner.

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] Write a pure-function test in `tests/components/mapLayers.test.ts` for the political layer's `getFill`/`getTooltipFields`: a row with an `ownerColor` returns that exact RGB; a row with no owner or no owner color returns the shared neutral "no data" constant, never a fabricated color.

### Implementation for User Story 1

- [X] T017 [US1] Add the `"political"` entry to `MAP_LAYERS` in `mapLayers.ts`: `getFill` returns `row.ownerColor` or the neutral constant, `getTooltipFields` returns `[{label: "Location", value: row.name}, {label: "Owner", value: row.ownerName}]`, `getLegend` returns a static "colored by owning country" note. Register it as the first/default entry. Makes T016 pass.
- [X] T018 [US1] In `MapTab.tsx`, default `activeLayer` to the `"political"` entry once `MAP_LAYERS` is non-empty (`mapLayers.ts` T017).

**Checkpoint**: The Map tab now renders a real, owner-colored political map (spec SC-001, SC-003) — independently demoable even though the sidebar/layer-switcher doesn't exist yet.

---

## Phase 4: User Story 2 - Switch Map Layers via a Collapsible Sidebar (Priority: P2)

**Goal**: A collapsible sidebar lists the available map layers (currently just Political), indicates the active one, lets the user switch, and collapses/expands without disturbing the map's current pan/zoom position.

**Independent Test**: Expand the sidebar, confirm it lists Political as active, collapse it, confirm the map view expands and stays exactly where it was, re-expand it, confirm it's still there and still functional.

### Tests for User Story 2 ⚠️

- [X] T019 [P] [US2] Write a component test in `tests/components/MapSidebar.test.tsx` (mirroring `tests/components/SideNav.test.tsx`'s pattern): renders one row per `MAP_LAYERS` entry, marks the active one, calls an `onSelectLayer` callback on click, and a collapse/expand toggle hides/shows the layer list without unmounting/remounting the map region.

### Implementation for User Story 2

- [X] T020 [US2] Implement `src/components/Overview/MapSidebar.tsx` + `MapSidebar.css`: collapsible panel listing `MAP_LAYERS`, active-layer indicator, `onSelectLayer` callback, collapse/expand toggle (spec FR-003/FR-004). Makes T019 pass.
- [X] T021 [US2] Wire `MapSidebar` into `MapTab.tsx` alongside `MapCanvas`/`MapLegend`: selecting a layer updates `activeLayer` and re-renders `MapCanvas`'s fill from the already-loaded `MapLocationDataset` with no new fetch (spec FR-017); confirm `MapCanvas`'s pan/zoom state (T013) survives both a layer switch and a sidebar collapse/expand untouched (spec FR-011, SC-002, SC-005).

**Checkpoint**: Sidebar expand/collapse and layer switching work end-to-end. Still only one real layer to switch to, but the mechanism spec User Story 2 asked for is fully proven.

---

## Phase 5: User Story 3 - View Location Population (Priority: P3)

**Goal**: A "Location Population" layer shades every location by its population, with a legend explaining the scale and a tooltip showing the exact figure.

**Independent Test**: Switch to Location Population from the sidebar, confirm shading varies sensibly across locations (a dense location visibly different from a sparse one) even when one location's population is far larger than the rest, and confirm the tooltip shows a location's population.

### Tests for User Story 3 ⚠️

- [X] T022 [P] [US3] Write a pure-function test in `tests/components/mapLayers.test.ts` for the population layer's shading scale: given a small set of `total_population` values including one extreme outlier, confirm the resulting shades for the non-outlier values remain visually distinguishable from each other (i.e. the scale is outlier-resistant — e.g. log- or quantile-normalized — not a raw linear min-max that would collapse them all near one end), per spec's Edge Cases.

### Implementation for User Story 3

- [X] T023 [US3] Add the `"population"` entry to `MAP_LAYERS` in `mapLayers.ts`: `getFill` shades by `row.totalPopulation` through the outlier-resistant scale (T022), `getTooltipFields` includes the population figure, `getLegend` describes the scale. Makes T022 pass.

**Checkpoint**: Location Population is selectable from the sidebar and renders correctly (spec User Story 3's Independent Test) alongside Political, without touching either's code.

---

## Phase 6: User Story 4 - View the RGO (Raw Goods) Map (Priority: P4)

**Goal**: An "RGO" layer colors every location by its assigned raw good, with each distinct good getting a visibly distinct, legend-mapped color, and a neutral style for locations with no raw good.

**Independent Test**: Switch to RGO, confirm every location with a raw good is colored consistently with its legend entry, two different goods never collide on the same color, and a location with no raw good renders neutrally.

### Tests for User Story 4 ⚠️

- [X] T024 [P] [US4] Write a pure-function test in `tests/components/mapLayers.test.ts` for the RGO color-assignment function: given a set of distinct raw-good names, assigns each a distinct color, deterministically (the same input list, in the same order, always produces the same color for the same name — research.md §4's golden-angle HSL approach), and never assigns the neutral "no data" color to a real good.

### Implementation for User Story 4

- [X] T025 [US4] Add the `"rgo"` entry to `MAP_LAYERS` in `mapLayers.ts`: a color-assignment function over the loaded dataset's distinct `rawMaterial` values (T024), `getFill` returns that good's color or the neutral constant when `rawMaterial` is null, `getTooltipFields` includes the raw good name, `getLegend` lists every distinct good with its assigned color. Makes T024 pass.

**Checkpoint**: RGO is selectable from the sidebar and renders correctly (spec User Story 4's Independent Test).

---

## Phase 7: User Story 5 - View Country Control (Priority: P5)

**Goal**: A "Control" layer colors every location by its current controller (which may differ from its Political-layer owner) and visually fades locations under only partial control, with a tooltip showing controller + control level.

**Independent Test**: Switch to Control, confirm a fully-controlled location renders solidly in its controller's color, a partially-controlled one (if present in the loaded save) renders visibly faded relative to a full-control location, and the tooltip shows controller + control level.

### Tests for User Story 5 ⚠️

- [X] T026 [P] [US5] Write a pure-function test in `tests/components/mapLayers.test.ts` for the control-shading blend: `control = 1` (or the field's observed maximum) returns the controller's color at full strength; a low `control` value returns a visibly faded blend toward the neutral "no data" style; no `controllerIdx` returns the neutral style outright.

### Implementation for User Story 5

- [X] T027 [US5] Add the `"control"` entry to `MAP_LAYERS` in `mapLayers.ts`: `getFill` blends `row.controllerColor` by `row.control` (T026), `getTooltipFields` includes controller name + control level, `getLegend` explains the full-vs-partial-control gradient. Makes T026 pass.

**Checkpoint**: All five user stories are independently functional and selectable from one sidebar.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Validate the whole feature together, at real scale, against the constitution's explicit gates.

**Note (2026-09-20, post-Foundational correction — twice)**: T001-T027
above were originally built against a join-key design that turned out to
be wrong; the *first* attempted fix was also found wrong once tested
against the real running app. See research.md §1's full revision for the
complete history. Summary:

1. **Original (wrong)**: `locations.name` populated from the save's
   `locations.locations.*.name` field — present on only 7 of 28,573
   locations. Not usable as a join key.
2. **First fix attempt (also wrong)**: `locations.idx` matched against a
   new `properties.idx` baked into the map geometry, computed by
   `tools/map-generation/generate.ts` (specs/003-province-map-generation,
   briefly reopened) from `map_data/location_templates.txt`'s file
   order. Looked strong in aggregate (~83% raw_material match) but was
   **directly falsified** by real, visible bugs in the running app — sea
   tiles rendered with owner colors, countries appeared to own land that
   wasn't theirs. The static install file's order doesn't reliably match
   an old loaded save's numbering (game-version drift). Fully reverted:
   `tools/map-generation/` and the committed geometry assets are back to
   their pre-003-reopening state.
3. **Final fix (adopted)**: `locations.name`, populated from the save's
   own `metadata.compatibility.locations[idx - 1]` array — embedded in
   the save at creation time, immune to the version-drift problem that
   broke attempt 2. Validated at 99.92% raw_material match and 100%
   end-to-end resolution against the real save. The join is name-based
   again (like provinces already work); no change to
   `tools/map-generation/` or the geometry assets was needed at all.

`src/parser/version-adapters/1.3.11.ts`, `src/storage/queries.ts`,
`mapLocationData.ts`, `MapCanvas.tsx`, `mapHitTest.ts`, and
`mapLayers.ts` all reflect the final design. All corrected code passes
the same tests T001-T027 already established (extended, not replaced) —
see research.md §1, data-model.md, and contracts/map-data-contract.md
for the corrected design; no task renumbering was needed since both
corrections were within-scope fixes, not new work.

- [X] T028 [P] Run `quickstart.md` steps 1-3 (adapter/query/kept-save-compatibility tests, geometry-join spot-check) and confirm all pass. **Result**: all pass — 168/168 tests (`npx vitest run --fileParallelism=false`), `tsc -b` clean, `npm run build` succeeds. Geometry-join spot-check (step 3) confirmed 100% of the real save's 28,573 locations resolve a matching geometry `name` via `metadata.compatibility.locations` (see research.md §1).
- [X] T029 Run `quickstart.md` step 4 manually against a real, full save (not just the trimmed fixture) to verify SC-001/SC-002/SC-005/SC-006 hold at real scale (~28,573 locations) — plan.md's Constitution Check flagged this as required before treating Principle V as satisfied, since the trimmed fixture alone can't validate full-scale responsiveness. **Result**: verified the full parser → schema → query pipeline end-to-end against the real save at `/Users/halda/Downloads/Russia (Melted).eu5` (642MB) — parses successfully, `listMapLocationsArrow` returns all 28,573 rows with real names (100%), with owner color (57%), raw good (73%), controller (57%), and population (73%) coverage reflecting genuine save data sparsity (unowned wasteland, no producible good, etc.), not join failure. Spot-checked `gulf_of_danzig` (correctly `owner_idx: null` — a sea zone) and `verona` (correctly `owner_name: "VEN"`, `raw_material: "wine"` — Venice's real historical possession, the actual identity behind the original "VEN owns a gulf" bug report). Browser-level pan/zoom/layer-switch responsiveness (SC-002/SC-005/SC-006) could not be directly observed in this environment (no browser available to the implementing agent) — the data-layer pipeline those criteria depend on is confirmed correct and complete at full scale; a human should do a final visual pass in a real browser before calling this feature done.
- [X] T030 [P] Run `quickstart.md` step 5 (accessibility spot-check across all four layers, constitution Principle VI) and record the manual verification note the constitution's Development Workflow requires for any PR touching a visualization. **Result**: code-level check confirmed — every layer's `getTooltipFields` returns a text label independent of color for every rendered location (owner name, population figure, raw good name, or controller name + control percentage), and `MapLegend` renders a text label alongside every color swatch, so color is never the sole signal (spec Edge Cases, constitution Principle VI). Visual/contrast verification (e.g. actually reading the rendered legend/tooltip text against the canvas backdrop) was not done in-browser in this environment — same caveat as T029, a human visual pass is still worthwhile before shipping.

**Note (2026-09-20, real-browser verification + post-ship UI refinement pass)**:
T029/T030 flagged that no human/browser pass had happened yet. It has
now, against the real app (dev server + the user's own OPFS-kept
`Russia (Melted).eu5` save, loaded via "Resume this save" — no file
upload needed) — confirmed the join fix end-to-end (Constantinople →
BYZ, Trebizond → TRE, correct real owners), then went through a live
refinement round based on what that actually looked like on screen, all
outside the original 30-task list (ad-hoc, same as 003's own
post-completion scope note):

1. **Wraparound wasn't part of the shipped design (added, then
   removed).** A horizontal wraparound render (drawing extra world
   copies so panning past the edge continues from the other side) was
   built and confirmed mechanically correct (landmarks reappeared at the
   right offset after ~6 full world-widths of panning), but measurably
   hurt pan/zoom performance at this feature's ~28,573-location scale —
   removed per direct user feedback. `MapCanvas.tsx` is back to a single-
   world render at the default fit-to-screen zoom.
2. **Real CSS bug, not just polish: the legend could grow past the map's
   own bottom edge.** `MapLegend`'s wrapper `div` had `max-height` but no
   explicit `height` — a child's own percentage `max-height` can't
   resolve against that (CSS spec, not a typo), so nothing was actually
   bounding it once a layer had enough entries (RGO's raw goods, the
   case that surfaced it). Fixed by flattening the wrapper (position
   directly on `.map-legend`/`.map-sidebar` against `.map-tab`, which
   does have a real height) and making `.map-legend` a flex column so
   `.map-legend__list` gets a genuine bounded height for its CSS
   `columns` layout to size against — plus `MapLegend.tsx`'s
   `widthClassFor`, since a `columns` list can't widen its own auto-
   sized ancestor panel on its own. Verified against a real 52-entry
   simulated legend: previously ran off-canvas in one scrolling column,
   now spreads into 2-3 columns and stays fully within the map.
3. **RGO now uses the game's own colors, not a generated palette** —
   the original design (research.md §4) deliberately avoided hardcoding
   a goods list; the user asked specifically for the real in-game
   colors instead. Traced through the actual game files (`common/
   goods/{00_raw_materials,01_plantation_goods,02_produced_goods,
   03_food,04_special}.txt`'s `color = goods_<name>` references,
   resolved against `common/named_colors/02_map.txt`'s `rgb`/`hsv`/
   `hsv360` values) into a static table (`rgoGameColors.ts`), confirmed
   to cover all 52 distinct `raw_material` values the real save
   produces with zero gaps. The golden-angle generator now only exists
   as a defensive fallback for a raw good absent from the table.
4. **Tooltip now follows the cursor** instead of sitting fixed in the
   map's corner — `MapCanvas` passes pointer position up through
   `onHoverLocation`'s new second argument; `MapTab` positions the
   tooltip via inline `left`/`top` at that position plus a small offset.

All of this is reflected directly in the source (no further doc
divergence) — see `ARCHITECTURE.md`'s 2026-09-20 decision-log entry for
the same summary at the whole-project level.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001's fixture-coverage check). Blocks every user story.
- **User Story 1 (Phase 3)**: Depends on Foundational. No dependency on any other story.
- **User Story 2 (Phase 4)**: Depends on Foundational **and** User Story 1 — spec's own "Why this priority" note: there must be at least one real layer to list/switch to before the switcher is meaningful to test.
- **User Story 3 (Phase 5)**: Depends on Foundational and the sidebar mechanism (Phase 4) existing to be reachable in the running app, but its own code (T022/T023) touches nothing US1 or US2 touched — independently *implementable* once Foundational is done, independently *demoable* once US2's sidebar exists.
- **User Story 4 (Phase 6)**: Same shape as US3 — independent of US3/US5's code.
- **User Story 5 (Phase 7)**: Same shape as US3/US4 — independent of their code, though its "differs from Political" acceptance scenario is most visible once US1 is also in place (already guaranteed, since US1 is a hard dependency of everything after Phase 3 in this app's actual usage even though not a *code* dependency).
- **Polish (Phase 8)**: Depends on every user story being complete.

### Within Each Phase

- Tests are written before their paired implementation task and must fail first.
- Foundational's schema task (T004) precedes the parser tasks that insert into its new columns (T005/T006), which precede the query task that reads them (T007).
- Story phases 5-7 only ever touch `mapLayers.ts` (plus their own test file) — never `schema.sql`, the parser adapter, or `queries.ts` — since Foundational already loads every column every layer needs.

### Parallel Opportunities

- T002 and T003 (Foundational tests, different files) can run in parallel.
- T008, T009 (and its test T010), T012, T013 can all run in parallel once T004/T007 land (different files, no shared state).
- Once Phase 4 (sidebar) is done, Phases 5, 6, and 7 can all be worked in parallel — each only edits `mapLayers.ts`, so in practice stagger them slightly to avoid merge conflicts in that one file, but there is no *logical* dependency between them.

---

## Parallel Example: Foundational

```bash
# After T004 (schema) and T007 (query) land, these have no dependency on each other:
Task: "Implement mapLocationData.ts (T008)"
Task: "Implement mapHitTest.ts (T009)"
Task: "Write mapHitTest.ts tests (T010)"
Task: "Implement MapLegend.tsx (T012)"
Task: "Implement MapCanvas.tsx (T013)"
```

## Parallel Example: Layer stories (once Phase 4 is done)

```bash
Task: "Population layer test + implementation (T022, T023)"
Task: "RGO layer test + implementation (T024, T025)"
Task: "Control layer test + implementation (T026, T027)"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fixture check).
2. Complete Phase 2: Foundational (schema, parser, query, dataset, canvas, hit-testing, tab wiring).
3. Complete Phase 3: User Story 1 (Political layer).
4. **STOP and VALIDATE**: `quickstart.md` steps 1-4 against a real save, confirming the map renders and colors correctly with no sidebar yet.
5. Demo if ready — this alone replaces the "coming soon" placeholder with a real, working map.

### Incremental Delivery

1. Setup + Foundational → plumbing ready, tab reachable, nothing visible yet.
2. + User Story 1 → real Political map (MVP).
3. + User Story 2 → sidebar + switching mechanism proven (still one real layer).
4. + User Story 3 → Population layer.
5. + User Story 4 → RGO layer.
6. + User Story 5 → Control layer.
7. + Polish → full-scale/accessibility verification.

Each step after Foundational adds visible value without touching or breaking what came before.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps task to specific user story for traceability.
- Every field cited in a task traces to research.md/data-model.md — no task invents a save field not already confirmed there.
- Commit after each task or logical group.
- Stop at any checkpoint to validate a story independently before continuing.
