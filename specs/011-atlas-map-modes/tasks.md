# Tasks: Expanded Atlas Map Modes

**Input**: Design documents from `/specs/011-atlas-map-modes/`

**Prerequisites**: atlas-map-modes.spec.md, plan.md, research.md, data-model.md (all present; no contracts/ — this feature exposes no new external interface, see plan.md)

**Scale note**: 8 new map layers, 6 new `locations` columns, 2 new reference tables (`cultures`, `religions`), 1 new generated static data file, one new local-game-install-reading script. Four files (`schema.sql`, `1.3.11.ts`, `queries.ts`, `mapLocationData.ts`) are shared by every story below since they all flow through the one existing per-save query/dataset — those live entirely in Foundational, not per-story. `mapLayers.ts` is touched by every story (one new `MapLayer` entry each), matching how feature 005's own tasks.md handled the same shared-file shape: sequential per-story tasks, never marked `[P]` against each other.

**Tests**: Included. Every new/changed field in `1.3.11.ts`/`schema.sql` gets a fixture-backed regression test per constitution Principle II (NON-NEGOTIABLE), and every new layer's coloring/tooltip/legend rule gets a pure-function test in `tests/components/mapLayers.test.ts`, matching feature 005's own convention.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[US1]**-**[US8]**: Which user story a task belongs to
- Paths are repo-relative, per `plan.md`'s Project Structure section

---

## Phase 1: Setup

**Purpose**: The fixture every Foundational test below depends on must actually carry the new fields first — extending it is prerequisite, shared work, not part of any one story.

**Wave 1 — single task:**

- [x] **T001** Extend `tests/fixtures/rus-1628-minimal.eu5`: add `rank`, `market`, `possible_tax` to its existing location entries (`tax` is already present); add a `population.pop_stats.soldiers` block to at least one location entry; add minimal `culture_manager`/`religion_manager` sections whose entries' numeric keys match the `culture`/`religion` ids the fixture's location entries already use (`1851`/`884` for culture, `15`/`18` for religion), each carrying a real `name` and `color`. Re-derive every value from the real save this fixture was originally minimized from (`/Users/halda/Downloads/Russia (Melted).eu5`) — never fabricate a value, per this session's confirmed real-save findings (research.md).

**Checkpoint**: The fixture carries every field this feature's tests below will assert against.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Every field all 8 new layers need, flowing through the one existing per-save query and in-memory dataset (feature 005's "load once" design) — no story starts until this phase is done, except Location Terrain (US2), which reads an entirely separate, static data source and touches none of these files.

**⚠️ CRITICAL**: No story task below (other than US2) can start until this phase is complete.

**Files**: `src/storage/schema.sql`, `src/parser/version-adapters/1.3.11.ts`, `src/storage/queries.ts`, `src/components/Overview/mapLocationData.ts`, `src/components/Overview/mapLayers.ts` (shared numeric-layer helper only).

### Tests for Foundational ⚠️ (write first; confirm each fails before its paired implementation task)

**Wave 1 — independent (different files):**

- [x] **T002** [P] Write failing tests in `tests/parser/adapter.test.ts` asserting that, after parsing the extended fixture, a real location row has non-null `rank`, `market_idx`, `possible_tax`, and `soldiers`, and that `cultures`/`religions` each have a row whose `name`/`color_r`/`color_g`/`color_b` match the fixture's raw `culture_manager`/`religion_manager` entries (data-model.md; constitution Principle II).
- [x] **T003** [P] Write failing tests in `tests/storage/map-locations.test.ts` asserting `listMapLocationsArrow` returns the six new columns (data-model.md's query table) correctly joined to `cultures`/`religions` by id, with `NULL` (not a fabricated value) when a location has no culture/religion/market/rank/possible_tax/soldiers.

### Implementation for Foundational

**Wave 1 — single task (every later Foundational task depends on it):**

- [x] **T004** In `src/storage/schema.sql`, add `ALTER TABLE locations ADD COLUMN IF NOT EXISTS rank TEXT` / `culture_idx INTEGER` / `religion_idx INTEGER` / `market_idx INTEGER` / `possible_tax DOUBLE` / `soldiers DOUBLE`, and `CREATE TABLE IF NOT EXISTS cultures (idx INTEGER PRIMARY KEY, name TEXT, color_r INTEGER, color_g INTEGER, color_b INTEGER)` plus the identical-shaped `religions` table (data-model.md).

**⟶ Wait for Wave 1 (T004) to finish, then:**

**Wave 2 — same file, sequential (not parallel):**

- [x] **T005** In `src/parser/version-adapters/1.3.11.ts`, add `culture_manager` and `religion_manager` to `STRUCTURED_KEYS`, and extract each into `cultures`/`religions` rows (`idx`, `name`, `color` via the existing `asRgbOrNull` helper). Depends on T004. Partially makes T002 pass.
- [x] **T006** In the same file, extract `locations.locations[idx].rank`, `.market`, `.possible_tax`, and `.population.pop_stats.soldiers.produced` (falling back to `null` when that pop-stats entry is absent) into the `locations` insert. Depends on T004 (same file as T005, so sequential). Makes T002 pass.

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — single task:**

- [x] **T007** In `src/storage/queries.ts`, extend `listMapLocationsArrow` with `LEFT JOIN cultures`/`LEFT JOIN religions` (mirroring the existing `owner`/`controller` double-join style) and select `rank`, `market_idx`, `possible_tax`, `soldiers`, `cultures.name as culture_name`, `cultures.color_*`, `religions.name as religion_name`, `religions.color_*`. Depends on T004-T006. Makes T003 pass.

**⟶ Wait for Wave 3 (T007) to finish, then:**

**Wave 4 — independent (different files):**

- [x] **T008** [P] In `src/components/Overview/mapLocationData.ts`, extend `MapLocationRow` and `loadMapLocationDataset` with `rank`, `cultureName`/`cultureColor`, `religionName`/`religionColor`, `marketIdx`, `possibleTax`, `soldiers` (data-model.md), using the existing `rgbOrNull` pattern for the two color pairs. Depends on T007.
- [x] **T009** [P] In `src/components/Overview/mapLayers.ts`, add a small shared `numericLayer(id, label, getValue: (row) => number | null): MapLayer` factory implementing the same log-normalized, per-dataset-`WeakMap`-memoized min/max shading the existing Location Population layer already uses — for reuse by Development, Tax Base, and Soldiers below, without touching Population's own existing implementation. No dependency on T004-T008 (pure function over `MapLocationRow`, can be written any time).

**Checkpoint**: Every new field is parsed, stored, queried, and loaded into `MapLocationRow` exactly once; `mapLayers.ts` has a reusable numeric-layer helper ready. No new layer is selectable yet — that's each story below.

---

## Phase 3: User Story 1 - View the Development Map (Priority: P1) 🎯 MVP slice

**Goal**: The Development layer shades every location by its already-stored `development` value.

**Independent Test**: Switch to the Development layer and confirm shading matches each location's real `development` value, with a legend, and tooltip showing the exact value.

**Files**: `src/components/Overview/mapLayers.ts` (development entry only).

### Tests for User Story 1

- [x] **T010** [P] [US1] Write a pure-function test in `tests/components/mapLayers.test.ts` for the development layer: a row with `development` shades per the log-normalized scale; a row with `null` renders the shared `NEUTRAL_COLOR`.

### Implementation for User Story 1

- [x] **T011** [US1] Add the `"development"` entry to `MAP_LAYERS` using the `numericLayer` helper (T009), `getValue: (row) => row.development`. Makes T010 pass.

**Checkpoint**: Development layer selectable and correct — independently demoable.

---

## Phase 4: User Story 2 - View the Location Terrain Map (Priority: P1)

**Goal**: The Location Terrain layer colors every location by its static topography category.

**Independent Test**: Switch to the Location Terrain layer and confirm every location is colored per its real terrain type (spot-checked against `location_templates.txt`), with a legend and tooltip.

**Files**: `tools/map-generation/generate-terrain-lookup.ts` (new), `src/components/Overview/locationTerrain.ts` (new, generated), `src/components/Overview/mapLayers.ts` (terrain entry). Entirely independent of Phase 2 — no shared file.

**Wave 1 — independent of everything else in this feature:**

- [x] **T012** [P] [US2] Write `tools/map-generation/generate-terrain-lookup.ts`: reads the local game install's `game/in_game/map_data/location_templates.txt` (path from research.md §5), parses each `<location_name> = { topography = <value> ... }` entry, and writes `src/components/Overview/locationTerrain.ts` as a committed `Record<string, string>` keyed by location name — mirroring `rgoGameColors.ts`'s own generation-then-commit shape.

**⟶ Wait for Wave 1 (T012) to finish, then:**

**Wave 2 — single task:**

- [x] **T013** [US2] Run the script against the real local install and commit the generated `src/components/Overview/locationTerrain.ts` (all 28,573 entries; 21 distinct topography categories, research.md §5). Depends on T012.

**⟶ Wait for Wave 2 (T013) to finish, then:**

### Tests for User Story 2

- [x] **T014** [P] [US2] Write a pure-function test in `tests/components/mapLayers.test.ts` for the terrain layer: a row whose `name` resolves in a small mock terrain table gets that category's assigned color; a row whose `name` doesn't resolve renders `NEUTRAL_COLOR`.

### Implementation for User Story 2

- [x] **T015** [US2] Add the `"terrain"` entry to `MAP_LAYERS`: `getFill` looks up `LOCATION_TERRAIN[row.name]`, assigning each of the 21 categories a distinguishable color (golden-angle-hue assignment, same approach RGO already uses) memoized once per module load (not per dataset, since terrain never varies by save). Depends on T013, T014. Makes T014 pass.

**Checkpoint**: Location Terrain layer selectable and correct — independently demoable, and buildable in parallel with Phase 2/3 since it shares no file with them.

---

## Phase 5: User Story 3 - View the Location Rank Map (Priority: P1)

**Goal**: The Location Rank layer colors every location by its current settlement tier.

**Independent Test**: Switch to the Location Rank layer and confirm every location is colored per its real `rank` (4 categories), with a legend and tooltip.

**Files**: `src/components/Overview/mapLayers.ts` (rank entry only). Depends on Phase 2 (T008).

### Tests for User Story 3

- [x] **T016** [P] [US3] Write a pure-function test in `tests/components/mapLayers.test.ts` for the rank layer: each of the 4 confirmed rank values (`rural_settlement`/`town`/`city`/`megalopolis`) gets a distinct color; `null` renders `NEUTRAL_COLOR`.

### Implementation for User Story 3

- [x] **T017** [US3] Add the `"rank"` entry to `MAP_LAYERS`, a small fixed 4-entry color map (no dynamic assignment needed — the category set is closed and confirmed, research.md §7). Depends on T008. Makes T016 pass.

**Checkpoint**: Location Rank layer selectable and correct.

---

## Phase 6: User Story 4 - View the Primary Culture Map (Priority: P2)

**Goal**: The Primary Culture layer colors every location by its primary culture, using the save's own culture colors.

**Independent Test**: Switch to the Primary Culture layer and confirm every location is colored per its real culture using that culture's real in-game color, with a legend and tooltip; a large distinct-culture count stays legend-scannable.

**Files**: `src/components/Overview/mapLayers.ts` (culture entry only). Depends on Phase 2 (T008).

### Tests for User Story 4

- [x] **T018** [P] [US4] Write a pure-function test in `tests/components/mapLayers.test.ts` for the culture layer: a row with `cultureColor` renders that exact RGB; a row with no culture (or an id absent from `cultures`) renders `NEUTRAL_COLOR`.

### Implementation for User Story 4

- [x] **T019** [US4] Add the `"primaryCulture"` entry to `MAP_LAYERS`: `getFill` returns `row.cultureColor ?? NEUTRAL_COLOR`, `getTooltipFields` includes `row.cultureName`, `getLegend` lists every distinct culture present in the dataset (RGO-style, scannable/sorted). Depends on T008. Makes T018 pass.

**Checkpoint**: Primary Culture layer selectable and correct.

---

## Phase 7: User Story 5 - View the Primary Religion Map (Priority: P2)

**Goal**: The Primary Religion layer colors every location by its primary religion, using the save's own religion colors.

**Independent Test**: Switch to the Primary Religion layer and confirm every location is colored per its real religion using that religion's real in-game color, with a legend and tooltip; a large distinct-religion count stays legend-scannable.

**Files**: `src/components/Overview/mapLayers.ts` (religion entry only). Depends on Phase 2 (T008).

### Tests for User Story 5

- [x] **T020** [P] [US5] Write a pure-function test in `tests/components/mapLayers.test.ts` for the religion layer: a row with `religionColor` renders that exact RGB; a row with no religion (or an id absent from `religions`) renders `NEUTRAL_COLOR`.

### Implementation for User Story 5

- [x] **T021** [US5] Add the `"primaryReligion"` entry to `MAP_LAYERS`, mirroring T019's shape exactly for religion. Depends on T008. Makes T020 pass.

**Checkpoint**: Primary Religion layer selectable and correct.

---

## Phase 8: User Story 6 - View the Location Market Map (Priority: P2)

**Goal**: The Location Market layer colors every location by the trade market it belongs to.

**Independent Test**: Switch to the Location Market layer and confirm every location is colored per its real `market_idx`, distinct markets visibly distinguishable, with a legend and tooltip; many distinct markets stay legend-scannable.

**Files**: `src/components/Overview/mapLayers.ts` (market entry + new per-dataset color-assignment helper). Depends on Phase 2 (T008).

### Tests for User Story 6

- [x] **T022** [P] [US6] Write a pure-function test in `tests/components/mapLayers.test.ts` for the market layer: two rows with different `marketIdx` values get visibly distinct colors; a row with `marketIdx === null` renders `NEUTRAL_COLOR`.

### Implementation for User Story 6

- [x] **T023** [US6] Add a `getMarketColorMap(dataset)` helper to `mapLayers.ts`, `WeakMap`-memoized per dataset exactly like the existing `getRgoColorMap`, assigning each distinct `marketIdx` a golden-angle-hue color in first-encountered order. Add the `"market"` entry to `MAP_LAYERS` using it. Depends on T008. Makes T022 pass.

**Checkpoint**: Location Market layer selectable and correct.

---

## Phase 9: User Story 7 - View the Tax Base Map (Priority: P2)

**Goal**: The Tax Base layer shades every location by its `possible_tax` value.

**Independent Test**: Switch to the Tax Base layer and confirm shading matches each location's real `possible_tax` value, with a legend and tooltip.

**Files**: `src/components/Overview/mapLayers.ts` (tax base entry only). Depends on Phase 2 (T008, T009).

### Tests for User Story 7

- [x] **T024** [P] [US7] Write a pure-function test in `tests/components/mapLayers.test.ts` for the tax base layer, mirroring T010's shape for `possibleTax`.

### Implementation for User Story 7

- [x] **T025** [US7] Add the `"taxBase"` entry to `MAP_LAYERS` using the `numericLayer` helper (T009), `getValue: (row) => row.possibleTax`. Depends on T008, T009. Makes T024 pass.

**Checkpoint**: Tax Base layer selectable and correct.

---

## Phase 10: User Story 8 - View the Soldiers Map (Priority: P2)

**Goal**: The Soldiers layer shades every location by its soldier population.

**Independent Test**: Switch to the Soldiers layer and confirm shading matches each location's real soldier population, with a legend and tooltip.

**Files**: `src/components/Overview/mapLayers.ts` (soldiers entry only). Depends on Phase 2 (T008, T009).

### Tests for User Story 8

- [x] **T026** [P] [US8] Write a pure-function test in `tests/components/mapLayers.test.ts` for the soldiers layer, mirroring T010's shape for `soldiers`.

### Implementation for User Story 8

- [x] **T027** [US8] Add the `"soldiers"` entry to `MAP_LAYERS` using the `numericLayer` helper (T009), `getValue: (row) => row.soldiers`. Depends on T008, T009. Makes T026 pass. **Also**: spot-check `population.pop_stats.soldiers.produced` against the in-game location panel's own displayed soldier count for at least one real location (research.md §3's open verification item) — if it disagrees, switch the extraction (T006) to `population_ratio` instead and re-verify, before considering this task done.

**Checkpoint**: Soldiers layer selectable and correct.

---

## Phase 11: Polish

**Purpose**: Cross-cutting validation against the spec's Success Criteria; no `.specify/companion.yml` post-implement validation hook is configured, so this phase owns validation.

- [x] **T028** [P] Manual verification note (constitution Development Workflow): for all 8 new layers, confirm Principle VI (color-vision-deficiency-safe palettes, every layer's tooltip as the non-color identification path) was checked, alongside spec SC-004 (a user can tell which of the 12 total layers is active at a glance).
- [x] **T029** Run the full test and lint suites, confirming every new/extended test (T002-T003, T010, T014, T016, T018, T020, T022, T024, T026) passes and the four existing layers (Political, Location Population, RGO, Control) show no regression — validates spec SC-001 through SC-005.

---

## Dependencies & Execution Order

- **Setup (T001) → Foundational (T002-T009) → Stories → Polish (T028-T029).**
- **Foundational** internal order: T002/T003 (tests, parallel) → T004 (schema) → T005/T006 (parser, sequential, same file) → T007 (query) → T008/T009 (dataset + numeric helper, parallel).
- **US2 (Location Terrain, T012-T015) has no dependency on Foundational** and can be built in parallel with Phase 2 and every other story — it shares no file with any of them.
- **US1, US3-US8** all depend on Foundational's T008 (dataset); US1/US7/US8 additionally depend on T009 (shared numeric helper).
- Within each story phase, its `[P]`-tagged test task can run alongside any other story's test task; each story's single implementation task touches `mapLayers.ts` and so runs sequentially relative to every other story's implementation task (never `[P]` against another story).
- Polish (T028-T029) depends on every story phase being complete.

---

## Post-Ship Additions

### 2026-09-22, explicit user request

- Population/Development/Tax Base share a new `rankSpectralLayer` factory in `mapLayers.ts`: percentile-rank normalization + a 7-stop purple→blue→green→light green→yellow→orange→red gradient, replacing the old per-layer two-color scales. Soldiers untouched.
- New `ZERO_COLOR` (dark charcoal), reserved for a confirmed value of exactly `0`, distinct from `NEUTRAL_COLOR`'s "no data" — applies to Development/Tax Base directly, and to Population via a new rule: `populationLayer` now treats a location as "no data" whenever `development` is null (population's own SQL source can't otherwise distinguish "confirmed zero" from "never recorded" — `queries.ts`'s `COALESCE(..., 0)`).
- See research.md §9 for the full decision record. Verified live against the real save (`tests/components/mapLayers.test.ts` updated to match).
- A related pseudo-3D "heat/elevation" extrusion prototype for these same three layers also shipped this session but is explicitly experimental/unshipped, outside this feature's formal scope — see `ARCHITECTURE.md`'s decision log.
