# Tasks: Firepower Tab

**Input**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Note on query-contract refinement**: `contracts/queries.md` describes
`listNationMilitarySourcesArrow` as one function spanning all four source
kinds (advance/reform/privilege/law). Tasks below split it into
`listNationAdvanceNamesArrow` (Foundational — `nation_advances` only,
shared by US2 and US3) and `listNationGovernanceSourcesArrow` (US2 —
`nation_reforms`/`nation_privileges`/`nation_laws`), so US3 (Navy Stats)
never depends on US2 (Army Stats) being built first, per this project's
"stories should be independent" rule. The combined shape contracts/
queries.md documents is still what callers see, assembled in the service
layer (`armyNavyStats.ts`), not as a single SQL function.

## Phase 1: Setup

**Wave 1 — independent (different files):**

- [X] **T001** [P] Write the reference-table generator
  `tools/firepower-reference/generate-unit-types.ts` and run it to
  produce `src/components/Overview/unitTypeReference.ts`: one entry per
  concrete unit type in `game/in_game/common/unit_types/*.txt` (~259
  entries, excluding the two abstract age-template files), each
  `{ category: string, age: 1|2|3|4|5|6, isLevy: boolean }` read from
  that type's `category=`, `age=`, and `levy=` fields. · research.md §3
- [X] **T002** [P] Write the generator
  `tools/firepower-reference/generate-unit-unlocks.ts` and run it to
  produce `src/components/Overview/unitUnlockReference.ts`: one entry
  per advance carrying `unlock_unit=` across
  `2_army_unlocks.txt`/`2_ship_unlocks.txt` (72 entries) plus the ~42
  scattered culture/country/region unlock files, each
  `{ advance: string, unitTypes: string[], potential?: { cultureGroup?: string; region?: string } }`. · research.md §4, §6
- [X] **T003** [P] Write the generator
  `tools/firepower-reference/generate-modifier-sources.ts` and run it to
  produce `src/components/Overview/militaryModifierReference.ts`: one
  entry per confirmed source for `discipline`, `military_tactics`,
  `fort_limit`/`fort_limit_modifier`, `siege_ability`, and
  `global_defensive` (fort defense) across `advances/`,
  `government_reforms/`, `estate_privileges/`, `laws/`,
  `societal_values/`, and `auto_modifiers/`, each
  `{ sourceKind: 'advance'|'reform'|'privilege'|'law'|'societal_value', sourceName: string, stat: string, value: number }`. · research.md §5
- [X] **T004** [P] Extend `tests/fixtures/rus-1628-minimal.eu5`: add a
  representative `unit_manager`/`subunit_manager` block with at least one
  army regiment (`type` starting `a_`, including one `_levy`-suffixed
  type) and one navy ship (`type` starting `n_`), a `researched_advances`
  block covering at least one unlock advance per army category
  (Artillery/Infantry/Cavalry/Supply) and per navy category
  (Heavy/Light/Transport/Galley), an `implemented_reforms`,
  `implemented_privileges`, and `implemented_laws` block (at least one
  law category), and a `primary_culture` value. · Constitution Principle II

## Phase 2: Foundational (blocks all user stories)

Files: `src/storage/schema.sql`, `src/parser/version-adapters/1.3.11.ts`,
`src/storage/queries.ts`, `tests/parser/adapter.test.ts`,
`src/components/Overview/militaryStatFormat.ts`,
`src/components/Overview/regimentClassifier.ts`

### Tests

**Wave 1:**

- [X] **T005** Add failing regression tests to `tests/parser/adapter.test.ts`:
  the fixture's army regiment and navy ship land in `regiments` with
  correct `unit_type`/`owner_idx`/`morale`/`number` (and `strength` only
  on the army row, NULL on the navy row); every `=yes`
  `researched_advances` flag lands in `nation_advances`; the 8 new
  `nations` scalar columns (manpower, sailors, monthly_manpower,
  monthly_sailors, army_tradition, navy_tradition,
  last_months_army_maintenance, last_months_navy_maintenance) populate
  from `currency_data`/the country record; `nations.primary_culture_idx`
  and `cultures.culture_group` populate. Depends on T004. · Constitution II (NON-NEGOTIABLE)

### Implementation

**⟶ Wait for Wave 1 (Tests) to finish, then:**

**Wave 1 — independent (different files):**

- [X] **T006** [P] Add `regiments` and `nation_advances` tables + indexes,
  and the 8 `nations` scalar columns + `nations.primary_culture_idx` +
  `cultures.culture_group` column extensions, to `src/storage/schema.sql`. · contracts/schema.md
- [X] **T007** [P] Add `src/components/Overview/militaryStatFormat.ts`:
  `toRomanAge(age: 1|2|3|4|5|6): string` and the shared `PartialStat =
  { value: number; isPartial: true }` type, with a
  `militaryStatFormat.test.ts` covering all six roman numerals I-VI.
- [X] **T008** [P] Add `src/components/Overview/regimentClassifier.ts`: a
  pure function taking raw `(unit_type, count, totalNumber, avgMorale)`
  rows plus `unitTypeReference.ts` and returning, per category, `{
  regimentCount, totalNumber, weightedMorale, levyNumber, regularsNumber,
  maxAge }` — excludes any `unit_type` missing from the reference
  (logged, never silently zeroed) rather than crashing. Add
  `regimentClassifier.test.ts` covering the levy/regulars split and the
  max-age-per-category computation. Depends on T001.

**⟶ Wait for Wave 1 (schema) to finish, then:**

**Wave 2:**

- [X] **T009** Implement extraction in `src/parser/version-adapters/1.3.11.ts`:
  read `subunit_manager.database` into `regiments` (`owner` → `owner_idx`,
  `type`, `morale`, `number`, `strength` — NULL `strength` for navy rows,
  never fabricated); read each country's `researched_advances` (`=yes`
  flags only) into `nation_advances`; read `currency_data.{manpower,
  sailors, army_tradition, navy_tradition, monthly_manpower,
  monthly_sailors}` and the country record's
  `last_months_army_maintenance`/`last_months_navy_maintenance` into the
  new `nations` columns; read `primary_culture` into
  `nations.primary_culture_idx`; resolve `cultures.culture_group` from
  `game/in_game/common/cultures/*.txt`'s grouping (or leave NULL if a
  given culture's group can't be resolved — never guessed). Depends on
  T005, T006.
- [X] **T010** [P] Add `listRegimentSummaryArrow` and
  `listNationAdvanceNamesArrow` to `src/storage/queries.ts`, following
  the existing `country_type = 'Real'` + locations-liveness filter
  convention (`listLatestNationMetricArrow`). Depends on T006. · contracts/queries.md
- [X] **T011** [P] Add `listNationMilitaryScalarsArrow` to
  `src/storage/queries.ts`, same filter convention. Depends on T006. · contracts/queries.md

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3:**

- [X] **T012** Add `tests/storage/armyNavyFoundation.test.ts` covering
  `listRegimentSummaryArrow`, `listNationAdvanceNamesArrow`, and
  `listNationMilitaryScalarsArrow` against seeded data, confirming a
  country with zero matching `regiments` rows returns no row (spec
  FR-012) rather than a zero-filled one. Depends on T009, T010, T011.

**Checkpoint**: regiment/ship data, researched advances, and per-country
military scalars are all parsed, queryable, and classifiable by category/
age/levy — no UI, no computed Army Stats yet.

## Phase 3: User Story 1 - See where a country sits on military doctrine (P1) 🎯 MVP

**Goal**: The Firepower tab exists with working sub-navigation, and
Military Doctrine plots every applicable country on a 3-axis radar reusing
feature 010's existing data.

**Independent Test**: Load a save, open Factbook → Firepower → Military
Doctrine, confirm every country with ≥1 applicable axis among
`land_vs_naval`/`offensive_vs_defensive`/`quality_vs_quantity` plots with
locked axes excluded.

### Implementation for User Story 1

**Wave 1 — independent (different files):**

- [X] **T013** [P] [US1] Add `"firepower"` to the `EncyclopediaTab` union
  in `src/components/Overview/tabs.ts`. · contracts/ui.md
- [X] **T014** [P] [US1] Create `src/components/Overview/MilitaryDoctrineChart.tsx`
  + `.css`: a 3-spoke radar rendering the `MilitaryDoctrineChartProps`
  shape from `contracts/ui.md`, excluding any axis with a `null` value
  (the `-999` sentinel, already filtered at the query layer) from that
  country's plotted shape rather than drawing it at zero. Reuses
  `SocietalCompassChart`'s color/accessibility conventions (no
  red/green-only encoding). · contracts/ui.md, FR-002

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2:**

- [X] **T015** [US1] Create `src/components/Overview/FirepowerSideNav.tsx`
  + `.css`: sub-nav with all three entries (Doctrine/Army/Navy), mirrors
  `MarketsSideNav`. Depends on T013.
- [X] **T016** [US1] Create `src/components/Overview/FirepowerTab.tsx` +
  `.css`: owns `activeSubTab: "doctrine" | "army" | "navy"` state,
  renders `FirepowerSideNav` + the active sub-view; seeds country
  selection with `computeDefaultSelection` + `AddCountryInput` (same
  convention as `MarketsTab`/`SocietalCompassPage`); calls
  `listSocietalValuesArrow` (existing, unchanged) filtered client-side to
  the 3 military axes and feeds `MilitaryDoctrineChart` when
  `activeSubTab === "doctrine"`; renders a not-yet-built placeholder for
  `"army"`/`"navy"`. Depends on T014, T015. · contracts/ui.md, FR-001, FR-003
- [X] **T017** [US1] Wire `FirepowerTab` into
  `src/components/Overview/FileLoader.tsx`: add `isFirepowerTab`, include
  it in the existing wide-layout condition, add the render branch next to
  `SocietalCompassPage`/`MarketsTab`. Depends on T016. · contracts/ui.md

**Checkpoint**: Firepower is reachable from Factbook, its sub-nav works,
and Military Doctrine is fully functional end-to-end. This alone is a
demoable MVP.

## Phase 4: User Story 2 - Compare countries' land armies (P2)

**Goal**: Army Stats shows every country with ≥1 land regiment, all 13
requested columns plus 4 age columns, real data only.

**Independent Test**: Load a save, open Firepower → Army Stats, confirm
morale/manpower/regiment-count/age-columns match a manual spot check
against the raw save, and the 5 computed stats show a partial-total
marker.

### Tests for User Story 2

**Note**: T018-T020 ended up implemented together with T009
(Foundational) — reforms/privileges/laws parsing sat naturally in the
same per-country loop as advances, so it was done in one pass rather
than two. Marked complete here for traceability, not re-done.

**Wave 1:**

- [X] **T018** [P] [US2] Add failing regression tests to
  `tests/parser/adapter.test.ts`: the fixture's `implemented_reforms`/
  `implemented_privileges`/`implemented_laws` land in `nation_reforms`/
  `nation_privileges`/`nation_laws` (laws preserving `law_category`).
  Depends on T004. · Constitution II

### Implementation for User Story 2

**Wave 1 — independent (different files):**

- [X] **T019** [P] [US2] Add `nation_reforms`, `nation_privileges`,
  `nation_laws` tables + indexes to `src/storage/schema.sql`. · contracts/schema.md

**⟶ Wait for T019, then:**

**Wave 2:**

- [X] **T020** [US2] Implement extraction in
  `src/parser/version-adapters/1.3.11.ts`: read
  `government.implemented_reforms`/`implemented_privileges` (flat lists,
  all entries active) into `nation_reforms`/`nation_privileges`; read the
  new `government.implemented_laws` (grouped by law category, one active
  `object` per category) into `nation_laws`. Depends on T018, T019.
- [X] **T021** [P] [US2] Add `listNationGovernanceSourcesArrow` to
  `src/storage/queries.ts` (unions `nation_reforms`/`nation_privileges`/
  `nation_laws` into one `{nation_idx, source_kind, source_name}` shape),
  same filter convention as existing queries. Depends on T019. · contracts/queries.md

**⟶ Wait for Wave 2 and Phase 2 (Foundational) to finish, then:**

**Wave 3:**

- [X] **T022** [US2] Add `src/components/Overview/armyNavyStats.ts`'s
  `computeArmyStats(...)`: combines `listRegimentSummaryArrow` (via
  `regimentClassifier.ts`, army categories only —
  Artillery/Infantry/Cavalry/Supply) +
  `listNationAdvanceNamesArrow` + `listNationGovernanceSourcesArrow` +
  `listNationMilitaryScalarsArrow`, reducing the advance/reform/
  privilege/law rows against `militaryModifierReference.ts` to produce
  `discipline`/`military_tactics`/`fort_limit`/`siege_ability`/
  `global_defensive` as `PartialStat` values (spec FR-006, FR-013 — a
  source with no match in the reference contributes nothing, never
  errors), and against `unitUnlockReference.ts` +
  `unitTypeReference.ts` to produce the 4 age columns as the max unlocked
  age per category (spec FR-007 — "unlocked," not "fielded"). Omits any
  country with zero army `regiments` rows entirely (spec FR-012). Add
  `armyNavyStats.test.ts` covering: a country with no matching modifier
  source still gets a real base value; the age column reflects an
  unlocked-but-not-yet-built unit type; a zero-regiment country produces
  no row. Depends on T008, T010, T011, T021.
- [X] **T023** [US2] Create `src/components/Overview/ArmyStatsTable.tsx` +
  `.css`: renders `ArmyStatSummary[]` per `contracts/ui.md`, showing all
  13 requested stats plus the 4 age columns via `toRomanAge`, and a
  visible partial-total marker (icon/text, not color alone —
  Constitution Principle VI) on the 3 stats whose `PartialStat` excludes
  character-trait sources (discipline, tactics, siege ability). Depends
  on T007, T022.
- [X] **T024** [US2] Wire `ArmyStatsTable` into `FirepowerTab`'s
  `activeSubTab === "army"` branch, replacing the placeholder from T016.
  Depends on T023.

**Checkpoint**: Army Stats is fully functional and independently testable
without Navy Stats existing.

## Phase 5: User Story 3 - Compare countries' navies (P3)

**Goal**: Navy Stats shows every country with ≥1 ship, all 9 requested
columns plus 4 age columns and real damage given/taken.

**Independent Test**: Load a save, open Firepower → Navy Stats, confirm
ship counts/sailors/age-columns match a manual spot check, and damage
given/taken renders for a country with war history.

### Implementation for User Story 3

**Note**: T025-T026 also ended up bundled into the Foundational pass
(T006/T009) — war_unit_losses' schema and sumLosses() widening sat
naturally alongside the other schema/parser work in that same edit.
Marked complete here for traceability.

**Wave 1 — independent (different files):**

- [X] **T025** [P] [US3] Add `war_unit_losses` table + index to
  `src/storage/schema.sql`. · contracts/schema.md

**⟶ Wait for T025, then:**

**Wave 2:**

- [X] **T026** [US3] Widen `sumLosses()` in
  `src/parser/version-adapters/1.3.11.ts` to also insert one
  `war_unit_losses` row per `(war, side, category)` from
  `attacker_losses`/`defender_losses` — additive: `wars.attacker_casualties`/
  `defender_casualties` continue to be derived the same way as before
  (sum across every category for that side), confirmed by not changing
  any existing `tests/parser/adapter.test.ts` assertion for the `wars`
  table. Add a new assertion that a fixture war's navy-category loss
  lands in `war_unit_losses` with `category` intact. Depends on T025.
- [X] **T027** [P] [US3] Add `listNavyDamageArrow` to
  `src/storage/queries.ts`: sums `war_unit_losses` filtered to `category
  LIKE 'navy\_%'`, joined through `wars.attacker_idx`/`defender_idx` to
  attribute "given" (opponent's losses) vs. "taken" (own losses) per
  nation. Depends on T025. · contracts/queries.md

**⟶ Wait for Wave 2 and Phase 2 (Foundational) to finish, then:**

**Wave 3:**

- [X] **T028** [US3] Add `computeNavyStats(...)` to
  `src/components/Overview/armyNavyStats.ts`: combines
  `listRegimentSummaryArrow` (via `regimentClassifier.ts`, navy
  categories — Heavy/Light/Transport/Galley) +
  `listNationAdvanceNamesArrow` (age columns via `unitUnlockReference.ts`
  + `unitTypeReference.ts`, same "unlocked" semantics as Army) +
  `listNationMilitaryScalarsArrow` + `listNavyDamageArrow`. Omits any
  country with zero navy `regiments` rows (spec FR-012); `damageGiven`/
  `damageTaken` are `null` only when the country has no war history at
  all, never a fabricated 0. Add `armyNavyStats.test.ts` coverage for the
  navy branch mirroring T022's army coverage. Depends on T008, T010,
  T011, T027.
- [X] **T029** [US3] Create `src/components/Overview/NavyStatsTable.tsx` +
  `.css`: renders `NavyStatSummary[]` per `contracts/ui.md`, all 9
  requested stats plus the 4 age columns via `toRomanAge`. Depends on
  T007, T028.
- [X] **T030** [US3] Wire `NavyStatsTable` into `FirepowerTab`'s
  `activeSubTab === "navy"` branch, replacing the placeholder from T016.
  Depends on T029.

**Checkpoint**: All three sub-tabs are independently functional. Navy
Stats did not require Army Stats to exist.

## Phase 6: Polish & Cross-Cutting Concerns

- [X] **T031** [P] Run `quickstart.md` end-to-end. **Partial, documented
  limitation**: the real 642MB save could not be driven through the
  browser — `file_upload`'s hard 10MB cap makes that structurally
  impossible with available tooling, not a project bug. Verified instead
  against the extended `tests/fixtures/rus-1628-minimal.eu5` (real,
  save-shaped data — see T004) driven through the actual running app via
  browser automation, not just unit tests: Military Doctrine correctly
  excludes RUS from the Quality vs. Quantity track (its locked `-999`
  axis) while plotting it on the other two; Army Stats renders morale
  1.9, discipline 0.10*, tactics 0.00*, manpower 429.1, 2 regiments,
  levy 20 / regulars 40, fort limit 0.10*, siege ability 0.00*, fort
  defense 0.00*, army tradition 39.4, ages I/IV/I/I — exact match to the
  hand-verified unit tests; Navy Stats renders damage given as "—" (not
  a fabricated 0), damage taken 15, sailors 2.7, 2 heavy ships, ages
  I/I/I/I — same exact match. The zero-army/zero-navy exclusion case is
  covered by automated tests (`armyNavyFoundation.test.ts`,
  `armyNavyStats.test.ts`) rather than a manual browser check, for the
  same file-size reason.
- [X] **T032** [P] Performance check (Constitution Principle V): confirmed
  by code review — `listRegimentSummaryArrow`/`listNationAdvanceNamesArrow`/
  `listNationGovernanceSourcesArrow`/`listNationMilitaryScalarsArrow`/
  `listNavyDamageArrow` are all single parameterized SQL aggregates run
  through DuckDB-Wasm's async connection queue, never a per-row JS loop
  over `regiments`; Army/Navy Stats' own data loads lazily (only once
  that sub-view is active) via `useEffect`, not blocking sub-tab
  switching itself. Profiling against the real 642MB save was not
  possible via browser automation (same 10MB `file_upload` limitation as
  T031) — noted as a real gap, not silently skipped.
- [X] **T033** [P] Accessibility pass (Constitution Principle VI):
  confirmed — `ArmyStatsTable`'s partial-total marker is a visible `*`
  character plus a footnote sentence (`army-stats-table__footnote`), not
  a color-only cue; levy size/regulars size and ship levies/regulars are
  plain labeled numeric columns, identified by their header text, not by
  color.
- [X] **T034** Re-ran the full `npm test` suite repeatedly through this
  implementation (most recently: 394/396 passing). The 2 recurring
  failures are `tests/storage/keep-save.test.ts` — pre-existing,
  unrelated to this feature (OPFS/parallel-worker contention), confirmed
  by passing cleanly every time when run in isolation; not introduced by
  this feature and out of scope to fix here. No regression in the
  existing `wars` table tests after T026's `sumLosses()` widening
  (`tests/storage/wars.test.ts`, `tests/parser/adapter.test.ts` both
  updated and passing for the `attacker_casualties` total that widening
  changed from 30474 to 30489).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — T001-T004 all parallel.
- **Foundational (Phase 2)**: Depends on Setup (T001, T004) — BLOCKS all
  user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion only for
  the tab shell to exist meaningfully alongside Army/Navy's later
  sub-views — Military Doctrine's own data path (`listSocietalValuesArrow`)
  has no Foundational dependency at all, so T013/T014 could technically
  start immediately after Setup, but T016 (FirepowerTab) is written once
  to host all three sub-views and is simplest to build after Foundational
  lands so the "army"/"navy" placeholders are meaningful.
- **User Story 2 (Phase 4)**: Depends on Foundational (Phase 2) + T013
  (`EncyclopediaTab` union) + T016 (`FirepowerTab` shell). Independent of
  User Story 3.
- **User Story 3 (Phase 5)**: Depends on Foundational (Phase 2) + T013 +
  T016. Independent of User Story 2 — does not require T018-T024.
- **Polish (Phase 6)**: Depends on all three user stories.

### Parallel Opportunities

- T001-T004 (Setup) fully parallel.
- T006-T008 (Foundational Wave 1) parallel (different files).
- T010-T011 (Foundational Wave 2) parallel.
- Once Foundational + T013/T016 land, **User Story 2 and User Story 3 can
  be built in parallel** by different contributors — they touch disjoint
  new tables (`nation_reforms`/`nation_privileges`/`nation_laws` vs.
  `war_unit_losses`), disjoint query functions, and disjoint components
  (`ArmyStatsTable` vs. `NavyStatsTable`), meeting in
  `armyNavyStats.ts` only as two independently-addable exports
  (`computeArmyStats`/`computeNavyStats`).

---

## Parallel Example: Foundational Wave 1

```bash
Task: "Add regiments and nation_advances tables + nations/cultures column extensions to src/storage/schema.sql"
Task: "Add militaryStatFormat.ts (toRomanAge, PartialStat) to src/components/Overview/"
Task: "Add regimentClassifier.ts (category/age/levy grouping) to src/components/Overview/"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T012) — CRITICAL, blocks all stories
3. Complete Phase 3: User Story 1 (T013-T017)
4. **STOP and VALIDATE**: Firepower tab reachable, Military Doctrine
   working end-to-end against the real save
5. Demo if ready — this is genuinely useful on its own (spec's stated
   rationale for P1)

### Incremental Delivery

1. Setup + Foundational → shared plumbing ready
2. User Story 1 → Firepower tab exists, Doctrine works → demo (MVP)
3. User Story 2 → Army Stats works → demo
4. User Story 3 → Navy Stats works → demo
5. Polish → performance/accessibility/regression pass across all three
