# Tasks: Country Factbook Tabs (018)

**Input**: [plan.md](./plan.md), [country-factbook-tabs.spec.md](./country-factbook-tabs.spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

> **Scale note**: 62 tasks across about 35 files in all four layers. All data work (parser, schema, queries, fixture) is foundational, so each tab phase owns only its own component and tests. The one shared file is `CountryTabContent.tsx`, the Countries tab router: each tab phase adds a single route line to it, so the tab phases run one after another, never in parallel. That matches the owner's tab-by-tab review anyway. Each tab phase ends with a check against the real save before the next tab starts.

Format: `- [ ] **T###** [P?] [US#] Description · path`. Tests are written first and must fail before the code they cover (constitution II).

---

## Phase 1: Setup

- [x] **T001** Record a green baseline: run `npm test` and `npm run build` on the branch before any change, and note any known-flaky test (RulerHistoryChart) so later failures are attributable · (no file)

---

## Phase 2: Foundational (blocks every tab)

Files: `tests/fixtures/rus-1628-minimal.eu5` (+ `.bin.eu5`, `.zip.eu5`, `.ztext.eu5`), `src/storage/schema.sql`, `src/parser/version-adapters/1.3.11.ts`, `src/storage/queries.ts`, `src/components/Overview/tabs.ts`, `src/components/Overview/SideNav.tsx`, `src/components/Overview/countryNames.ts` (+ `countryNames.json`, `tools/country-names/generate.ts`, `package.json`), `src/components/Overview/FileLoader.tsx`, `src/components/Overview/CountryTabContent.tsx` (created here)

### Tests

Test files: `tests/parser/adapter.test.ts`, `tests/storage/country-card.test.ts`, `tests/storage/country-tables.test.ts`, `tests/components/countryNames.test.ts`, `tests/components/SideNav.test.tsx`

**Wave 1 — independent (different files):**

- [x] **T002** [P] Add real-shaped excerpts to the fixture: RUS `currency_data.government_power`/`prestige`, `economy.income` and `economy.tax_rates`; a `loan_manager` with a RUS bond, a RUS loan and another country's loan; an `estate_manager` with RUS crown (satisfaction only), nobles (full `last_month`) and one record without `existence`; `diplomacy_manager.dependency` blocks for RUS → subject → sub-subject, one missing `start_date`, one malformed (no `second`) · tests/fixtures/rus-1628-minimal.eu5
- [x] **T003** [P] Schema: `nations.government_power`, `prestige`, `monthly_income`; new `loans`, `nation_estates`, `subject_relations` tables with indexes (data-model.md) · src/storage/schema.sql
- [x] **T004** [P] Write `countryNames.test.ts`: government power label per type with generic fallback, estate/pop type/subject type/privilege/law category names, humanized fallback for unknown keys · tests/components/countryNames.test.ts
- [x] **T005** [P] `TabId` becomes the 12 ids in contracts/ui.md; `trade` and `diplomacy` removed · src/components/Overview/tabs.ts

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**

- [x] **T006** [P] Regenerate the binary, zip and ztext fixture copies with `npm run generate:save-fixtures` · tests/fixtures/rus-1628-minimal.{bin,zip,ztext}.eu5
- [x] **T007** [P] Adapter tests (fail first): the 3 nation columns; loans incl. bond flag; estates with NULLs for the crown and the non-existing record skipped; subject relations with direction, type, NULL start date; malformed blocks skipped and counted in the load warning · tests/parser/adapter.test.ts
- [x] **T008** [P] Query tests (fail first) for `getCountryCard` and `getPopulationMakeup`: every card field, the `derived` set, debt 0 with no loans, literacy weighting, 4 makeup groupings, availability flags false on empty tables · tests/storage/country-card.test.ts
- [x] **T009** [P] Query tests (fail first) for `listNationProvincesArrow`, `listNationLocations`, `listNationLaws`, `listNationPrivileges`, `listNationEstates` (incl. population share), `listSubjectRelations` · tests/storage/country-tables.test.ts
- [x] **T010** [P] Implement `countryNames.ts` against T004, backed by a generated `countryNames.json` (encyclopedia names plus policy names and government power labels from the game's localization; `$key$` and script references resolved; fallback humanizer). Generator `tools/country-names/generate.ts` and `generate:country-names` script · src/components/Overview/countryNames.ts, src/components/Overview/countryNames.json, tools/country-names/generate.ts, package.json
- [x] **T011** [P] SideNav: 12 items in contracts/ui.md order and labels, plus test · src/components/Overview/SideNav.tsx, tests/components/SideNav.test.tsx

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T012** Adapter: add `loan_manager` and `estate_manager` to `STRUCTURED_KEYS`; nations insert gains the 3 columns (insertRows full-column rule); parse loans, estates (tax rate from the owner's `economy.tax_rates`) and `dependency` blocks next to the 013 diplomacy pass; count skipped entries in the load warning. T007 passes · src/parser/version-adapters/1.3.11.ts

**⟶ Wait for T012, then:**

- [x] **T013** Queries: every function in contracts/queries.md except `loadMilitaryProfiles`, with availability flags per research R13. T008 and T009 pass · src/storage/queries.ts

**⟶ Wait for T013, then:**

- [x] **T014** Move `ActiveTabContent` out of `FileLoader.tsx` into `CountryTabContent.tsx`; route `economy`, `buildings`, `characters` to `ComingSoonPlaceholder`; drop `UNBUILT_TAB_LABELS`; add `openNation(idx)` in FileLoader (select nation, set tab to `overview`) and pass it down · src/components/Overview/FileLoader.tsx, src/components/Overview/CountryTabContent.tsx
- [x] **T015** Load the real Russia save in the dev app: no new load warnings about skipped loans, estates or dependencies beyond expected; `subject_relations` has 195 rows · (manual check)

**Checkpoint**: data is parsed and queryable, the nav shows the new order, and the three out-of-scope tabs show Coming Soon.

---

## Phase 3: User Story 1 — Overview (P1) 🎯 MVP

Files: `src/components/Overview/OverviewTab.tsx` (+ `.css`), `src/components/Overview/PopulationPie.tsx` (+ `.css`), removes `OverviewCard.tsx` and `OverviewCard.css`; one route line in `CountryTabContent.tsx`

### Tests

Test files: `tests/components/PopulationPie.test.tsx`, `tests/components/OverviewTab.test.tsx`

**Wave 1 — independent (different files):**

- [x] **T016** [P] [US1] PopulationPie test: slices under 2% fold into a labeled "Other", every slice has a text label, empty data shows an empty state · tests/components/PopulationPie.test.tsx
- [x] **T017** [P] [US1] OverviewTab test: all 11 stats render, government power label follows type, debt shows 0 with no loans, "not available" when a flag is false, computed stats marked in text, nation switch discards a stale result · tests/components/OverviewTab.test.tsx

### Implementation

**⟶ Wait for the tests, then Wave 2 — independent (different files):**

- [x] **T018** [P] [US1] PopulationPie: ECharts pie with legend and `HoverTooltip`-style tooltip, game colors for culture and religion (research R5) · src/components/Overview/PopulationPie.tsx
- [x] **T019** [P] [US1] OverviewTab: country card (`section` "Country card") and four pie `figure`s captioned Religion, Culture, Estates, Social class · src/components/Overview/OverviewTab.tsx

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T020** [US1] Route `overview` to OverviewTab; delete OverviewCard.tsx/.css once nothing imports them · src/components/Overview/CountryTabContent.tsx
- [x] **T021** [US1] Owner check on the real save: Russia's stats match the game (SC-001), each pie sums to within 1% of population (SC-002) · (manual check)

**Checkpoint**: Overview is complete and independently usable.

---

## Phase 4: User Story 2 — History (P2)

Files: `src/components/Overview/HistoryTab.tsx` (+ `.css`), `src/components/Overview/RulerHistoryChart.tsx`; one route line in `CountryTabContent.tsx`

### Tests

Test files: `tests/components/HistoryTab.test.tsx`

- [x] **T022** [US2] HistoryTab test: opens with only the selected nation on all four charts; adding a nation adds it everywhere; changing the selected nation resets to one · tests/components/HistoryTab.test.tsx

### Implementation

**⟶ Wait for T022, then Wave 1 — independent (different files):**

- [x] **T023** [P] [US2] RulerHistoryChart: optional controlled `selectedIdxs`/`onToggle` props; Leaderboard's uncontrolled use unchanged and its tests still pass · src/components/Overview/RulerHistoryChart.tsx
- [x] **T024** [P] [US2] HistoryTab: 3 `LeaderboardChart`s from `loadNationHistory` plus `RulerHistoryChart`, one shared selection edited by `AddCountryInput` · src/components/Overview/HistoryTab.tsx

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T025** [US2] Route `history` · src/components/Overview/CountryTabContent.tsx
- [x] **T026** [US2] Owner check on the real save · (manual check)

---

## Phase 5: User Story 3 — Provinces (P2)

Files: `src/components/Overview/ProvincesTab.tsx` (+ `.css`)

- [x] **T027** [US3] ProvincesTab test: columns for development, tax base, soldiers, population, location count; sortable · tests/components/ProvincesTab.test.tsx
- [x] **T028** [US3] ProvincesTab reads `listNationProvincesArrow` (real province rows, not locations) · src/components/Overview/ProvincesTab.tsx
- [x] **T029** [US3] Owner check: values match the Province map modes · (manual check)

---

## Phase 6: User Story 4 — Locations (P2)

Files: `src/components/Overview/LocationsTab.tsx` (+ `.css`); one route line in `CountryTabContent.tsx`

- [x] **T030** [US4] LocationsTab test: one row per owned location, terrain joined, all columns sortable · tests/components/LocationsTab.test.tsx
- [x] **T031** [US4] LocationsTab: Perspective table from `listNationLocations` plus terrain from `locationTerrain.ts` · src/components/Overview/LocationsTab.tsx
- [x] **T032** [US4] Route `locations` · src/components/Overview/CountryTabContent.tsx
- [x] **T033** [US4] Owner check: row count equals Overview's location count (SC-003) · (manual check)

---

## Phase 7: User Story 5 — Military (P2)

Files: `src/components/Overview/firepowerData.ts`, `src/components/Overview/FirepowerTab.tsx`, `src/components/Overview/MilitaryTab.tsx` (+ `.css`), `src/components/Overview/NavyCompositionView.tsx` (+ `.css`); one route line in `CountryTabContent.tsx`

- [x] **T034** [US5] Extract per-nation military assembly from FirepowerTab into `loadMilitaryProfiles(db, idxs)`; Firepower's existing tests pass unchanged · src/components/Overview/firepowerData.ts, src/components/Overview/FirepowerTab.tsx

**⟶ Wait for T034, then Wave 1 — independent (different files):**

- [x] **T035** [P] [US5] NavyCompositionView and its test: ships grouped Heavies/Lights/Galleys/Transports, "no ships" state · src/components/Overview/NavyCompositionView.tsx, tests/components/NavyCompositionView.test.tsx
- [x] **T036** [P] [US5] MilitaryTab test: army composition, navy composition, doctrine chart with exactly one nation · tests/components/MilitaryTab.test.tsx

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T037** [US5] MilitaryTab: ArmyCompositionView + NavyCompositionView + MilitaryDoctrineChart with one point · src/components/Overview/MilitaryTab.tsx
- [x] **T038** [US5] Route `military` · src/components/Overview/CountryTabContent.tsx
- [x] **T039** [US5] Owner check: army numbers match Firepower for the same nation · (manual check)

---

## Phase 8: User Story 6 — Government (P3)

Files: `src/components/Overview/GovernmentTab.tsx` (+ `.css`); one route line in `CountryTabContent.tsx`

**Wave 1 — independent (different files):**

- [x] **T040** [P] [US6] Policy names: already delivered by T010's `countryNames.json` (822 policies). Nothing to build here beyond confirming the laws the real save uses all resolve · (no file)
- [x] **T041** [P] [US6] GovernmentTab test: "Policies" and "Estate Privileges" headings, readable names, privilege's estate shown · tests/components/GovernmentTab.test.tsx

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T042** [US6] Confirm every law and privilege key in the real save resolves to a name (no humanized fallback), regenerating `countryNames.json` if not · (check)
- [x] **T043** [US6] GovernmentTab from `listNationLaws` and `listNationPrivileges` · src/components/Overview/GovernmentTab.tsx
- [x] **T044** [US6] Route `government` · src/components/Overview/CountryTabContent.tsx
- [x] **T045** [US6] Owner check against the game's government screen · (manual check)

---

## Phase 9: User Story 7 — Estates (P3)

Files: `src/components/Overview/EstatesTab.tsx` (+ `.css`); one route line in `CountryTabContent.tsx`

- [x] **T046** [US7] EstatesTab test: one entry per existing estate, all FR-022 fields, crown's missing values say "not tracked" · tests/components/EstatesTab.test.tsx
- [x] **T047** [US7] EstatesTab from `listNationEstates` · src/components/Overview/EstatesTab.tsx
- [x] **T048** [US7] Route `estates` · src/components/Overview/CountryTabContent.tsx
- [x] **T049** [US7] Owner check against the game's estates screen · (manual check)

---

## Phase 10: User Story 8 — Values (P3)

Files: `src/components/Overview/ValuesTab.tsx` (+ `.css`); one route line in `CountryTabContent.tsx`

- [x] **T050** [US8] ValuesTab test: only the selected nation, labeled pole-to-pole bars, non-applicable axes listed as such · tests/components/ValuesTab.test.tsx
- [x] **T051** [US8] ValuesTab from `decodeSocietalValuesByNation` · src/components/Overview/ValuesTab.tsx
- [x] **T052** [US8] Route `values` · src/components/Overview/CountryTabContent.tsx
- [x] **T053** [US8] Owner check: values match the Societal Compass for the same nation · (manual check)

---

## Phase 11: User Story 9 — Subjects (P2)

Files: `src/components/Overview/subjectTree.ts`, `src/components/Overview/SubjectsTab.tsx` (+ `.css`); one route line in `CountryTabContent.tsx`

**Wave 1 — independent (different files):**

- [x] **T054** [P] [US9] subjectTree test: nesting over several levels, a cycle stops, non-live subjects not clickable · tests/components/subjectTree.test.ts
- [x] **T055** [P] [US9] SubjectsTab test: `tree` named "Subjects of <nation>", keyboard operable, clicking a subject calls `onOpenNation`, "no subjects" state · tests/components/SubjectsTab.test.tsx

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T056** [US9] subjectTree builder · src/components/Overview/subjectTree.ts
- [x] **T057** [US9] SubjectsTab from `listSubjectRelations` + subjectTree · src/components/Overview/SubjectsTab.tsx
- [x] **T058** [US9] Route `subjects` with `onOpenNation` · src/components/Overview/CountryTabContent.tsx
- [x] **T059** [US9] Owner check: Portugal's colonial nations, a nested subject, click-through lands on the subject's Overview (SC-004) · (manual check)

---

## Phase 12: Polish

- [x] **T060** Pre-018 data: a snapshot without the new tables imports and every new section says "not available" · tests/share/pre-018-snapshot.test.ts
- [x] **T061** Validate against Success Criteria: `npm test` and `npm run build` green; spot-check SC-005 (nation switch under 1 second) and SC-006 (every tab renders for several live nations incl. one with no land) on the real save · (no file)
- [x] **T062** Wrap-up docs: ARCHITECTURE.md entry, `specs/spec-status.md`, feature research notes · ARCHITECTURE.md, specs/spec-status.md

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T015)** → tab phases in order **US1 → US2 → US3 → US4 → US5 → US6 → US7 → US8 → US9** → **Polish (T060–T062)**.
- Tab phases run one at a time: each adds a line to `CountryTabContent.tsx`, and the owner checks each tab before the next begins. US3 needs no route change (Provinces is already routed).
- Foundational: Wave 1 (T002–T005) → Wave 2 (T006–T011) → T012 → T013 → T014 → T015.
- US1: tests (T016, T017) → Wave 2 (T018, T019) → T020 → T021.
- US2: T022 → Wave 1 (T023, T024) → T025 → T026.
- US3: T027 → T028 → T029. US4: T030 → T031 → T032 → T033.
- US5: T034 → Wave 1 (T035, T036) → T037 → T038 → T039.
- US6: Wave 1 (T040, T041) → T042 → T043 → T044 → T045.
- US7: T046 → T047 → T048 → T049. US8: T050 → T051 → T052 → T053.
- US9: Wave 1 (T054, T055) → T056 → T057 → T058 → T059.
- Polish: T060 → T061 → T062.

## Notes

- **2026-09-26, implementation.** All tabs built in nav order and checked by the owner on the real Russia save before moving on.
  - T010 also absorbed the policy-name generator (T040/T042 became checks): one generator writes `countryNames.json` and, later, `countryModifiers.json`.
  - T015 was checked in the browser, not Node: `parseAndStore` on the 642MB save crashes the Node DuckDB-Wasm bindings (see ARCHITECTURE.md's 018 entry).
  - Owner-requested additions beyond the original tasks: game colors for the estate/social-class pies (no "Other" there); a smaller doctrine chart on Military; policy/privilege effects with green/red coloring (FR-030); Government sub-tabs with a Modifiers column and estate row groups; full-width layout for every Countries tab.
  - Requested and dropped: a Cabinet tab. The save has no cabinet action history (research.md R16).
  - Tests: 108 files / 619 tests pass; `npm run build` and `check:dist` clean.
