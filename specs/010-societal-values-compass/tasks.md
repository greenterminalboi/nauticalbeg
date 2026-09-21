# Tasks: Societal Values Compass

**Input**: `plan.md`, `spec.md` ([societal-values-compass.spec.md](./societal-values-compass.spec.md)), `research.md`, `data-model.md`, `contracts/`

> **Post-ship note**: after all 18 tasks below shipped, the user reviewed
> the live feature and requested six changes (spec.md's "Post-Implementation
> Course Correction"): centering, a player-country-only default with
> `AddCountryInput`, country-color + always-on tag labels, axis-end labels
> replacing corner names, a formula fix (y negated) correcting the quadrant
> orientation, and complete removal of great-power status. Task descriptions
> below (especially T013-T016, which mention "Great Powers") describe the
> *original* build; the code now reflects the corrected version. See
> `.spec-context.json`'s `implement` decisions/concerns for what changed and
> why, rather than re-numbering tasks after the fact.

## Phase 1: Setup

**Wave 1 — independent (different files):**

- [x] **T001** [P] Create `src/components/Overview/axisConfig.json` with all 14 axes (the 13 from the spec's source list plus `latinization_vs_hellenization`): `axis`, `angle_degrees`, `positive_pole_label`, `negative_pole_label`, `band`. Mark `belligerent_vs_conciliatory`, `outward_vs_inward`, and `latinization_vs_hellenization` with a comment noting their placement is provisional (SC-005 is the validation check). · contracts/axis-config.md · FR-002, FR-003, FR-016
- [x] **T002** [P] Extend `tests/fixtures/rus-1628-minimal.eu5`: add a realistic `government.societal_values` block for the fixture's country (real values across several axes plus at least one exact `-999` sentinel) and a `great_power_manager.members` entry naming it. · Constitution Principle II

## Phase 2: Foundational (blocks all user stories)

Files: `tests/parser/adapter.test.ts`, `src/storage/schema.sql`, `src/parser/version-adapters/1.3.11.ts`, `src/storage/queries.ts`, `tests/storage/societal-values.test.ts`, `src/components/Overview/compassPosition.ts`, `tests/components/compassPosition.test.ts`

### Tests

**Wave 1:**

- [x] **T003** Add failing regression tests to `tests/parser/adapter.test.ts`: a real axis value lands in `nation_societal_values` with its raw value intact; the fixture's `-999` axis produces no row at all; `great_power_manager.members` produces a `great_powers` row. Depends on T002. · FR-001, FR-002, FR-005, Constitution II (NON-NEGOTIABLE)

### Implementation

**⟶ Wait for Wave 1 (Tests) to finish, then:**

**Wave 1 — independent (different files):**

- [x] **T004** [P] Add `nation_societal_values` and `great_powers` tables plus indexes to `src/storage/schema.sql`. · contracts/schema.md
- [x] **T005** [P] Add `src/components/Overview/compassPosition.ts`: a pure function that takes a country's axis readings plus the `axisConfig.json` angle table, normalizes each raw -100..+100 value to -1.0..+1.0, excludes any axis with no reading (never treats it as 0), sums the resulting vectors, divides by the count of applicable axes (mean vector), and returns `{x, y, axisCount}`. Add `compassPosition.test.ts` covering: a locked axis is excluded not zeroed; the mean-vector division; `axisCount === 0` when nothing is applicable. Depends on T001. · FR-004, FR-005, FR-006, FR-015

**⟶ Wait for Wave 1 (schema) to finish, then:**

**Wave 2:**

- [x] **T006** Implement extraction in `src/parser/version-adapters/1.3.11.ts`: read each country's `government.societal_values`, skip any axis whose value is exactly `-999`, insert the rest into `nation_societal_values`; read `great_power_manager.members` into `great_powers`. Depends on T003, T004. · FR-001, FR-002
- [x] **T007** [P] Add `listSocietalValuesArrow` and `listGreatPowersArrow` to `src/storage/queries.ts`, following the existing `country_type = 'Real'` + locations-liveness filter convention (`listLatestNationMetricArrow`). Depends on T004. · contracts/queries.md

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [x] **T008** Extend `tests/storage/societal-values.test.ts` to cover both new query functions against seeded data, confirming a `-999` axis never surfaces as a row. Depends on T006, T007.

**Checkpoint**: the data pipeline and position math are ready and independently tested — every applicable axis reading is stored, queryable, and correctly excludable, with no UI involved yet.

## Phase 3: User Story 1 - See every country's ideological position at a glance (P1)

**Goal**: Every country with at least one applicable axis renders as a hoverable dot positioned by the vector-sum projection.

**Independent Test**: Load a save, open the compass, confirm every applicable country appears as one dot, and hovering explains its position.

Files: `src/components/Overview/tabs.ts`, `src/components/Overview/EncyclopediaNav.tsx`, `src/components/Overview/FileLoader.tsx`, `src/components/Overview/SocietalCompassChart.tsx`, `src/components/Overview/SocietalCompassPage.tsx`, `src/components/Overview/SocietalCompassPage.css`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T009** [P] Add `"societal-compass"` to the `EncyclopediaTab` union in `tabs.ts`.
- [x] **T010** [P] Build `SocietalCompassChart.tsx`: an ECharts `scatter` series via the existing `useEChartsInstance` hook, `option` built in a `useMemo`, chart range auto-scaled to the actual data spread, a `tooltipFormatter` closure showing the country's name/tag and a per-axis breakdown, and permanent labels suppressed once the country count is 50+. Accept the full point-props shape from contracts/ui.md; size/color fields exist on the type but render as uniform defaults for now. · FR-007, FR-008, FR-009, FR-010

**⟶ Wait for Wave 1, then:**

**Wave 2:**

- [x] **T011** Build `SocietalCompassPage.tsx`: call `listSocietalValuesArrow`, compute each country's position via `compassPosition.ts`, exclude or explicitly flag `axisCount === 0` countries (never plot them as if centrist), render `SocietalCompassChart` with uniform size and the great-power default color mode inert (no toggle yet), and add `SocietalCompassPage.css`. Depends on T005, T007, T010. · FR-001, FR-005, FR-015
- [x] **T012** Wire `EncyclopediaNav.tsx` (add the `TABS` entry) and `FileLoader.tsx` (add the wide-layout flag and the render branch mounting `SocietalCompassPage`). Depends on T009, T011.

**Checkpoint**: US1 is independently functional — loading a save shows every applicable country as a hoverable, self-explaining dot, reachable from the Encyclopedia nav.

## Phase 4: User Story 2 - Tell countries apart by size and status (P2)

**Goal**: Dot size and color respond to a chosen size metric and color mode (great-power status, or a chosen axis).

**Independent Test**: With the compass open, switch the size metric and color mode and confirm every dot updates accordingly.

Files: `src/components/Overview/SocietalCompassChart.tsx` (extends US1's file), `src/components/Overview/SocietalCompassPage.tsx` (extends US1's file), `src/components/Overview/SocietalCompassControls.tsx` (new)

*This phase extends the same page/chart US1 built — one evolving view, not a parallel build — so it runs strictly after Phase 3 (see Dependencies & Execution Order).*

### Implementation

**Wave 1 — independent (different files):**

- [x] **T013** [P] Build `SocietalCompassControls.tsx`: a size-metric toggle (population / total development) and a color-mode toggle (great-power / axis), in the sidenav button-group style (`LeaderboardSideNav`/`MarketsSideNav`); when color-mode is "axis", show a `GoodSelect`-style filtered popover to pick which axis. · FR-011, FR-013

**⟶ Wait for Wave 1, then:**

**Wave 2:**

- [x] **T014** Extend `SocietalCompassChart.tsx`: resolve `symbolSize` from each point's `sizeValue`, and `itemStyle.color` from `colorMode` (a two-value palette for `isGreatPower`, or a colorblind-safe gradient over `colorAxisValue`). Depends on T013. · FR-011, FR-012, FR-013, Constitution Principle VI
- [x] **T015** Extend `SocietalCompassPage.tsx`: call `listGreatPowersArrow` and the existing latest-value population/development metric query, hold size-metric/color-mode/color-axis state, resolve each point's `sizeValue`/`isGreatPower`/`colorAxisValue`, and mount `SocietalCompassControls`. Depends on T007, T013. · FR-011, FR-012, FR-013

**Checkpoint**: US2 is independently functional — dot size and color respond immediately to the chosen metric/mode without leaving the view.

## Phase 5: User Story 3 - Read the compass against an ideological reference (P3)

**Goal**: Static quadrant gridlines and labels give first-time users a reference for interpreting the chart.

**Independent Test**: With the compass open, confirm faint quadrant gridlines/labels are visible and stay fixed across different loaded saves.

Files: `src/components/Overview/SocietalCompassChart.tsx` (extends US1/US2's file)

### Implementation

**Wave 1:**

- [x] **T016** Extend `SocietalCompassChart.tsx`: add a static ECharts `graphic` layer (quadrant gridlines + labels per spec §4's four bands) beneath the scatter series, never derived from the loaded save's data. · FR-014

**Checkpoint**: US3 is independently functional — the quadrant reference is visible and identical regardless of which save is loaded.

## Phase 6: Polish

**Wave 1 — independent:**

- [x] **T017** [P] Review the great-power and axis-color palettes in `SocietalCompassChart.tsx` for colorblind-safe distinguishability (Constitution Principle VI); adjust if needed.
- [x] **T018** [P] Run the full test and lint suites, then manually verify each Success Criterion (SC-001 through SC-007) against a real loaded save.

## Dependencies & Execution Order

- **Setup → Foundational → User Story phases (in priority order) → Polish.** Foundational blocks every story; nothing in Phase 3-5 starts before Phase 2's checkpoint.
- **Phase 2 waves**: Tests (T003, needs T002) → schema/position-math (T004, T005, needs T001) → adapter/queries (T006 needs T003+T004; T007 needs T004) → query tests (T008, needs T006+T007).
- **Phase 3 waves**: tab-id + chart (T009, T010, independent) → page + wiring (T011 needs T005/T007/T010; T012 needs T009/T011).
- **Phase 4 waves**: controls (T013) → chart/page extensions (T014 needs T013; T015 needs T007/T013).
- **Phase 5**: single task (T016), no wave split needed.
- **Note on shared files**: `SocietalCompassChart.tsx` and `SocietalCompassPage.tsx` are created in Phase 3 and extended (not recreated) in Phases 4 and 5. This is one evolving page across three priority-ordered stories, not three independently parallelizable ones — implement should apply Phases 3, 4, and 5 in sequence for this feature, fanning workers out only within a phase's waves, not across these three phases.
