# Tasks: Province Map Generation

**Input**: Design documents from `/specs/003-province-map-generation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included. `plan.md`'s Constitution Check commits to fixture-first tests for this pipeline "by analogy" with Principle II, so tests are written before their corresponding implementation, not treated as optional here.

**Organization**: This spec has two user stories: US1 (P1, the asset generation pipeline — the feature's real deliverable) and US2 (P2, a dev-only demo viewer that exists purely to validate US1's output). Phase 3 covers US1; Phase 5 covers US2. There is no US3.

**Post-completion scope extension (all tasks below still checked off, done under the extended scope)**: mid-implementation, the scope grew from "provinces only" to "provinces + locations" — a province is a named union of locations, and the pipeline already computed per-location geometry internally before unioning it, so tracing each location individually was cheap to add. The single output file became two: `public/map/provinces.topojson` (both a `provinces` and a `locations` object, sharing arcs) and `public/map/locations.topojson` (locations alone). `write-topology.ts`'s `buildTopology` became `buildCombinedTopology` + `buildLocationsOnlyTopology`; `generate.ts` gained `--out-locations`. Individual task descriptions below still describe the original single-file design where they weren't directly touched by this change — see `research.md` §9, `data-model.md`, and both `contracts/` files for the authoritative current shape.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[US1]** / **[US2]**: Which user story a task belongs to
- Paths are repo-relative, per `plan.md`'s Project Structure section

---

## Phase 1: Setup

**Purpose**: Get the tool's scaffolding and dependencies in place.

- [X] T001 Add `tsx`, `pngjs`, `@types/pngjs`, `topojson-server`, `topojson-simplify`, and `topojson-client` to `package.json` devDependencies, and add a `"generate:map": "tsx tools/map-generation/generate.ts"` script (per `plan.md`'s Technical Context and `contracts/cli-contract.md`'s invocation shape); run `npm install` to lock them in `package-lock.json`. *(Implemented per plan.md's explicit correction: `topojson-client` went into `dependencies`, not devDependencies — it's imported by the browser-side demo, not just the Node CLI. Also added `@types/topojson-client`, `@types/topojson-server`, `@types/topojson-simplify`, `@types/geojson` since this repo runs strict TypeScript.)*
- [X] T002 [P] Create the `tools/map-generation/` directory with empty placeholder files for `generate.ts`, `read-locations-bitmap.ts`, `read-named-locations.ts`, `read-definitions.ts`, `trace-polygons.ts`, `project.ts`, `write-topology.ts`, `types.ts` (per `plan.md`'s Project Structure).
- [X] T003 [P] Create the `tests/map-generation/fixtures/` directory (per `plan.md`'s Project Structure; populated in T007 below).

**Checkpoint**: `npm run generate:map` exists as a runnable (if empty) command; the module layout matches the plan.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and the CLI skeleton every pipeline stage and test depends on.

**⚠️ CRITICAL**: No pipeline-stage task below (Phase 3) can start until this phase is complete.

- [X] T004 Define the shared pipeline types in `tools/map-generation/types.ts`: `NamedLocation`, `LocationPixelRegion`, `ProvinceGrouping`, `ProvinceGeometry` (the pre-topology, GeoJSON-shaped `{ name, geometry }` per province fed into `topojson-server`), and the output `Topology`/`GeometryCollection` properties shapes — exactly as specified in `data-model.md`'s "Pipeline intermediate entities" and "Output entity" sections (field names and types must match verbatim, including the per-province `properties.name`, `properties.location_count`, and top-level `properties.generated_from_game_version` / `generated_at` / `source_bitmap_width` / `source_bitmap_height` / `province_count` / `skipped_location_names` fields).
- [X] T005 Implement CLI argument parsing and error-exit skeleton in `tools/map-generation/generate.ts`: accept `--install <path>` (required) and `--out <path>` (optional, default `public/map/provinces.topojson`), per `contracts/cli-contract.md`. If `--install` is missing, or the path doesn't contain `game/in_game/map_data/`, print a clear, actionable error naming exactly what was expected and exit non-zero **without** writing any output file (contract's "Exit behavior" table, row 2). Leave the actual pipeline call as a stub for now.

**Checkpoint**: Running `npm run generate:map -- --install /nonexistent/path` already exits non-zero with a clear error (validates T005 and the FR-007 edge case ahead of any real pipeline logic existing).

---

## Phase 3: User Story 1 - Generate the province geometry asset (Priority: P1) 🎯 MVP

**Goal**: Produce `public/map/provinces.topojson`, a valid, name-keyed, geometrically-accurate province boundary asset, from a real local EU5 installation — per spec.md's Acceptance Scenarios 1-4.

**Independent Test**: Run `npm run generate:map -- --install <real EU5 install path>` and confirm the output file exists, is valid TopoJSON that decodes cleanly via `topojson-client`, has one feature per province with a name matching `provinces.name`/`province_definition` conventions, and those shapes are recognizably accurate against the in-game map (spec.md's Independent Test).

### Tests for User Story 1 ⚠️ (write first; confirm each fails before its paired implementation task)

- [X] T006 [US1] Build tiny synthetic fixtures in `tests/map-generation/fixtures/`: a small hand-built PNG (e.g. 20×10px, a handful of flat-colored regions including one deliberately split into two disjoint blobs sharing the same color, to exercise the `MultiPolygon` case) plus matching small excerpts of `named_locations.txt`-format (name→hex color) and `definitions.txt`-format (`region { area { province = { loc loc } } }`) content — small enough to commit, large enough to exercise every code path in T013-T018.
- [X] T007 [P] [US1] Write a failing test in `tests/map-generation/read-named-locations.test.ts` asserting `read-named-locations.ts` parses the T006 fixture's name→color excerpt into the `NamedLocation[]` shape from `data-model.md`, including correct hex→`[r,g,b]` conversion.
- [X] T008 [P] [US1] Write a failing test in `tests/map-generation/read-locations-bitmap.test.ts` asserting `read-locations-bitmap.ts` decodes the T006 fixture PNG and groups pixels by exact RGB color into `LocationPixelRegion`-shaped output, including the deliberately-disjoint-same-color case producing two separate pixel groups worth checking downstream in T010.
- [X] T009 [P] [US1] Write a failing test in `tests/map-generation/read-definitions.test.ts` asserting `read-definitions.ts` flattens the T006 fixture's `region { area { province = { loc loc } } }` excerpt into `ProvinceGrouping[]` (province name → member location names), discarding the region/area nesting per `research.md` §1's conclusion.
- [X] T010 [P] [US1] Write a failing test in `tests/map-generation/trace-polygons.test.ts` asserting `trace-polygons.ts` traces a single contiguous pixel region into one raw `Polygon` ring, and traces the T006 fixture's disjoint-same-color region into a raw `MultiPolygon` with two ring groups — no simplification here (per `data-model.md`'s `ProvinceGeometry` and the non-contiguous-province edge case in `research.md` §6 / spec.md's Edge Cases; simplification is T018's job now, per `research.md` §4).
- [X] T011 [P] [US1] Write a failing test in `tests/map-generation/project.test.ts` asserting `project.ts` converts pixel `(x, y)` to `[longitude, latitude]` using the exact formula in `research.md` §3 (`lon = (x / width) * 360 - 180`, `lat = 90 - (y / height) * 180`), parameterized on width/height rather than hardcoded to the real bitmap's 16384×8192.
- [X] T012 [P] [US1] Write a failing test in `tests/map-generation/write-topology.test.ts` asserting `write-topology.ts` enforces `data-model.md`'s validation rules: rejects/reports a duplicate `properties.name` across provinces, rejects a province whose geometry decodes (via `topojson-client`) to empty coordinates, and confirms the written file round-trip-decodes as valid TopoJSON (via `topojson-client`'s `feature()`). Also assert that two adjacent provinces sharing a border in the input end up referencing the same arc(s) after `topojson-server`'s `topology()` runs — the whole reason this stage exists (research.md §3-4).

### Implementation for User Story 1

- [X] T013 [P] [US1] Implement `read-named-locations.ts` (parses `named_locations/*.txt` into `NamedLocation[]`) to make T007 pass.
- [X] T014 [P] [US1] Implement `read-locations-bitmap.ts` (uses `pngjs` to decode the bitmap, groups pixels by exact color into per-name `LocationPixelRegion`s using the T013 output as the color→name key) to make T008 pass.
- [X] T015 [P] [US1] Implement `read-definitions.ts` (parses the `region { area { province = { loc loc } } }` tree into `ProvinceGrouping[]`) to make T009 pass.
- [X] T016 [P] [US1] Implement `trace-polygons.ts` (Moore-neighbor boundary tracing of a unioned pixel region, producing one or more raw, unsimplified rings; `MultiPolygon` whenever a province's unioned locations aren't all pixel-connected — simplification is explicitly deferred to T018) to make T010 pass.
- [X] T017 [P] [US1] Implement `project.ts` (pixel `(x, y)` → equirectangular `[lon, lat]`, per `research.md` §3) to make T011 pass.
- [X] T018 [P] [US1] Implement `write-topology.ts`: assemble a GeoJSON-shaped `{ name, geometry }` per `ProvinceGrouping` (traced + projected), build the topology with `topojson-server`'s `topology()`, simplify with `topojson-simplify` **on the resulting shared arcs** (not per-polygon beforehand — research.md §4's ordering requirement), run `data-model.md`'s validation rules by decoding back via `topojson-client`, and write the file. On any validation failure, exit non-zero and write nothing, per `contracts/cli-contract.md`'s "Exit behavior" row 4. Makes T012 pass.
- [X] T019 [US1] Wire the full pipeline in `tools/map-generation/generate.ts`: load named locations (T013) and the bitmap (T014) from `--install`'s `map_data/`, load province groupings (T015), union each province's member locations' pixel regions and trace (T016), project to lon/lat (T017), build/simplify/validate/write the topology (T018). Print the FR-008 summary line (province count written, skipped-location count) to stdout on success. Depends on T013-T018 all passing their tests.
- [X] T020 [US1] Handle the confirmed edge case from `research.md` §6 inside the T019 pipeline: any location name present in `location_templates.txt`-equivalent input but absent from the named-color map (T013's output) is excluded from geometry generation and collected into the output's `skipped_location_names` (per `data-model.md`), not silently dropped and not treated as a fatal error.
- [X] T021 [US1] Implement the "unparseable map-data file" error path in `generate.ts` per `contracts/cli-contract.md`'s "Exit behavior" row 3: if the bitmap isn't a valid PNG, or the definitions content doesn't match the expected nested shape, exit non-zero with a clear error naming the specific file and failure — not a raw stack trace, and no output file written.

**Checkpoint**: `npm run generate:map -- --install <path>` run against a real EU5 installation produces a valid, populated `public/map/provinces.topojson` — User Story 1 (the entire feature) is functionally complete and independently testable.

---

## Phase 4: Polish & Validation

**Purpose**: Confirm the real-world result against `quickstart.md` and keep project docs in sync (no new pipeline code).

- [X] T022 [US1] Run `npm run generate:map -- --install <real EU5 install path>` and follow `quickstart.md` steps 1-2: confirm exit 0, confirm the decoded feature count is in the low thousands, and confirm a known province name (e.g. `uppland_province`) is present in the output.
- [X] T023 [US1] Follow `quickstart.md` step 3: load `tests/fixtures/rus-1628-minimal.eu5` (or a real save) through the existing app/parser, query `provinces.name`, and confirm every non-null name either matches a decoded feature in `provinces.topojson` or is an explicable version mismatch — no manual remapping table involved (validates spec SC-002).
- [X] T024 [US1] Follow `quickstart.md` step 4: visually spot-check a handful of generated province shapes (via the decode snippet) against EU5's own in-game map for recognizable positional/shape accuracy (validates spec SC-003). Keep this check local per the quickstart's note — do not upload the output to a public/third-party tool.
- [X] T025 [US1] Follow `quickstart.md` step 5: re-run the generator to a second output path and diff decoded feature count/name sets against the committed output to confirm idempotency (validates spec SC-005).
- [X] T026 [US1] Follow `quickstart.md` step 6: confirm `npm run generate:map -- --install /nonexistent/path` still exits non-zero with a clear error after the full pipeline is wired (regression check on T005/T021).
- [X] T027 [P] Update `ARCHITECTURE.md` to document the new `tools/map-generation/` directory (including its `demo/` subfolder) and the `public/map/provinces.topojson` asset it produces, per the file's own "living summary; update it whenever the as-built design diverges" instruction.
- [ ] T028 [P] Commit the generated `public/map/provinces.topojson` from a real local EU5 installation run, per this feature's Constitution Check exception (`plan.md`'s Complexity Tracking) — this is the feature's actual deliverable artifact, not just its code.

**Checkpoint**: All of spec.md's User Story 1 Acceptance Scenarios and Success Criteria are validated against a real installation; `public/map/provinces.topojson` is committed and ready for the future "Map" tab feature to consume.

---

## Phase 5: User Story 2 - Quick demo viewer for the generated asset (Priority: P2)

**Goal**: A minimal, dev-only browser page that loads `public/map/provinces.topojson`, draws every province's border, and supports pan + zoom-in + zoom-out — per spec.md's User Story 2 Acceptance Scenarios 1-4.

**Independent Test**: With a real generated asset present, run `npm run dev` and open the demo page; confirm borders render for the whole map, dragging pans the view, scrolling zooms in with correct (non-distorted) borders, and scrolling back out returns to the full map.

### Implementation for User Story 2

- [X] T029 [P] [US2] Create `tools/map-generation/demo/index.html`: a bare page (per `research.md` §7 — no app styling/design-system usage, per spec FR-011) with a full-viewport `<svg>` element and a `<script type="module" src="./main.ts">` tag.
- [X] T030 [US2] Implement the "no asset found" path in `tools/map-generation/demo/main.ts`: `fetch("/map/provinces.topojson")`, and on a non-OK response, render a clear "no asset found — run `npm run generate:map` first" message into the page rather than a blank screen or console-only error (spec.md's demo-page Edge Case).
- [X] T031 [US2] Implement border rendering in `main.ts`: on a successful fetch, decode with `topojson-client`'s `feature(topology, topology.objects.provinces)`, and for each decoded feature draw one SVG `<path>` (`Polygon` → one subpath; `MultiPolygon` → one subpath per ring group) using the direct linear mapping `px = (lon + 180) / 360 * viewWidth`, `py = (90 - lat) / 180 * viewHeight` (research.md §7) — `fill: none`, a visible `stroke`, into a single `<g id="provinces">` group. Satisfies Acceptance Scenario 1.
- [X] T032 [US2] Implement pan in `main.ts`: pointerdown/pointermove/pointerup handlers on the SVG that translate the `<g id="provinces">` group by drag delta, updating its `transform`. Satisfies Acceptance Scenario 2.
- [X] T033 [US2] Implement zoom in `main.ts`: a `wheel` handler that scales the same `<g>` transform around the cursor position, clamped to a sane min/max so zooming in stays sharp (vector redraw, not raster) and zooming back out always returns to a valid, fully-visible state. Satisfies Acceptance Scenarios 3 and 4.

**Checkpoint**: Opening the demo page against a real generated asset shows the whole map's province borders and supports pan/zoom in both directions — User Story 2 is functionally complete.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T002's file scaffolding). Blocks all of Phase 3.
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) completion.
- **Polish (Phase 4)**: Depends on Phase 3 (T019-T021) being complete — these tasks validate and document the finished pipeline, they don't add pipeline code.
- **User Story 2 (Phase 5)**: Depends on User Story 1 (Phase 3) producing a real `public/map/provinces.topojson` to load — per spec.md, US2 exists purely to validate US1's output. It does not depend on Phase 4's polish tasks, so it could run in parallel with Phase 4 if desired, but is listed after it here since Phase 4's T024 (visual spot-check) is a natural moment to reach for the demo instead of a generic GIS tool.

### Within Phase 3

- T006 (fixtures) blocks T007-T012 (each test reads the fixtures T006 creates).
- T007-T012 (tests) should each be written and confirmed failing before its paired implementation task (T013-T018 respectively) — standard red-then-green, not a file-level dependency, so they're still marked `[P]` against each other.
- T013-T018 are `[P]` against each other (six distinct files, each only depending on its own paired test).
- T019 depends on **all** of T013-T018 (it imports and calls every pipeline stage) — not parallel.
- T020 and T021 both edit `generate.ts` (same file as T019) — sequential, in order T019 → T020 → T021.

### Within Phase 5

- T029 (the HTML shell) blocks nothing else structurally but should exist before `main.ts` is meaningfully testable in a browser.
- T030-T033 all edit the same file (`main.ts`) — sequential, in the given order (each subsequent piece assumes the previous one's state, e.g. zoom (T033) and pan (T032) share the same transform).

### Parallel Opportunities

- T002 and T003 (Setup) can run together.
- T007-T012 (all six test files) can be written in parallel once T006's fixtures exist.
- T013-T018 (all six implementation files) can be built in parallel once their paired test exists and Phase 2 is done.
- T027 and T028 (Polish) can run in parallel with each other, once T022-T026 have validated the real result.
- T029 can be done any time after Phase 2 (it doesn't touch pipeline code) — in practice, do it once Phase 3 has a real asset to test against.

---

## Parallel Example: Phase 3 test writing

```bash
# After T006 (fixtures) is done, launch all six test-writing tasks together:
Task: "Write failing test in tests/map-generation/read-named-locations.test.ts"
Task: "Write failing test in tests/map-generation/read-locations-bitmap.test.ts"
Task: "Write failing test in tests/map-generation/read-definitions.test.ts"
Task: "Write failing test in tests/map-generation/trace-polygons.test.ts"
Task: "Write failing test in tests/map-generation/project.test.ts"
Task: "Write failing test in tests/map-generation/write-topology.test.ts"
```

---

## Implementation Strategy

### MVP = User Story 1 alone

User Story 1 (Phases 1-3) is the feature's actual deliverable — a real,
committed `public/map/provinces.topojson`. User Story 2 (Phase 5) is
validation tooling for it, not a second independent deliverable; it's
useful to have but nothing else depends on it existing.

### Suggested order

1. Phase 1 → Phase 2 (fast; mostly scaffolding).
2. Phase 3 tests (T006-T012), confirmed red.
3. Phase 3 implementation (T013-T018) in parallel, then T019 → T020 → T021 to wire and harden the CLI.
4. Phase 4 (T022-T028) against the real local EU5 installation to produce and commit the actual deliverable asset — reach for the Phase 5 demo (built next, or interleaved) instead of a generic GIS tool for T024's spot-check if it's ready in time.
5. Phase 5 (T029-T033): the demo viewer, once a real asset exists to point it at.
