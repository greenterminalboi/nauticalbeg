---

description: "Task list for DB Technology Migration (formerly \"Country Portfolio\")"
---

# Tasks: DB Technology Migration (formerly "Country Portfolio")

**Input**: Design documents from `/specs/002-db-technology-migration/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Not requested generally, but constitution Principle II makes
fixture-based parser tests NON-NEGOTIABLE — every task that adds or changes
parsing logic includes a fixture test written first. User Story 1 (the
shell) touches no parser code, so Principle II doesn't apply there; its
component tests are written alongside implementation instead. Other layers
only get tests where they materially reduce risk (query correctness,
derived-value flags).

**Organization**: Tasks are grouped by user story (spec.md priorities
P1–P9) so each can be implemented and validated independently, mirroring
001's `tasks.md` structure.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US9)
- Paths are relative to the repository root (single-project layout per plan.md)

---

## Phase 1: Setup

**Purpose**: Confirm the project foundation needs no changes before feature work begins.

- [x] T001 ~~Confirm no new setup is required for this feature~~ — **Overtaken by events (2026-09-18)**: this assumption held only through Phase 4 (US1/US2). Mid-feature, the storage engine was migrated from `wa-sqlite`/SQLite to `@duckdb/duckdb-wasm`/DuckDB (see ARCHITECTURE.md's decision log), and `@perspective-dev/*` was adopted as the app's table-rendering tooling (new dependencies, a `vite.config.ts` `build.target` change, and a `patch-package` postinstall step for a real upstream packaging bug — see ARCHITECTURE.md's "Data tables: Perspective" section). Both were real, substantial setup changes that happened inside this feature rather than as a prerequisite to it.

**Checkpoint**: Nothing to build here; this phase exists only to record that 001's scaffold is sufficient.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared UI state and presentational components every user story from US1 (state) or US2 onward (empty/unavailable states) depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Create `src/components/Overview/EmptyState.tsx` implementing FR-013's "nothing to show" state: a clear, plainly worded message (not color-only per constitution Principle VI), reusable by every data tab from User Story 2 onward.
- [x] T003 [P] Create `src/components/Overview/NotAvailableState.tsx` implementing FR-014's "not available for this save" state, visually and textually distinct from `EmptyState` (T002) — a user must never confuse "the nation genuinely has none of this" with "the tool couldn't read this section."
- [x] T004 Extend `FileLoader.tsx`'s `Status` "ready" variant with an `activeTab` field (plan.md Technical Context: `"overview" | "provinces" | "military" | "government" | "economy" | "diplomacy" | "trade" | "buildings" | "characters" | "ai-agent" | "map"`), defaulting to `"overview"`, with a setter that User Story 1's `SideNav` will call — no UI wiring yet, just the state shape.

**Checkpoint**: Shared empty/unavailable-state components and the `activeTab` state shape exist. User Story 1 can now begin.

---

## Phase 3: User Story 1 - Portfolio shell (Priority: P1) 🎯 MVP

**Goal**: Replace today's flat stack of controls with a persistent top bar,
side navigation, and centered main content area — the structure every
later tab renders into (spec.md User Story 1).

**Independent Test**: Load a save and visually confirm: a top bar
containing the file/keep/kept-save controls, a side navigation listing at
least "Overview," a centered main content area showing the existing
overview data, and no leftover unstyled/stacked controls from the previous
layout.

### Implementation for User Story 1

- [x] T005 [US1] Create `src/components/Overview/TopBar.tsx`: the file/keep/kept-save controls (moved out of `FileLoader.tsx`'s current inline layout) plus the independent nation selector, which stays disabled/hidden until a save is loaded and then initializes with that save's nations (FR-018, FR-020) — visible from the very first render, before any save exists (Acceptance Scenario 1).
- [x] T006 [US1] Create `src/components/Overview/SideNav.tsx`: the category list — Overview, Provinces, Military, Government, Economy, Diplomacy, Trade, Building Registry, Characters, plus AI Agent and Map (FR-001, FR-016) — operable via keyboard (FR-015), rendering only once a nation is selected (research.md §3). Selecting an item calls the `activeTab` setter from T004.
- [x] T007 [P] [US1] Create `src/components/Overview/ComingSoonPlaceholder.tsx`: shared "not yet available" content shown when `activeTab` is `"ai-agent"` or `"map"` (FR-016), marked not-yet-available via text/label, not color alone (Principle VI).
- [x] T008 [US1] Implement the CSS Grid shell layout from research.md §1 (top bar spanning full width; side navigation and main content as two columns below it), styled with `src/styles/tokens.css`'s existing custom properties. Main content area is horizontally centered with a bounded max-width and balanced margins (FR-019); table content inside it keeps ordinary per-column alignment, not forced centering.
- [x] ~~T009 [US1] Implement the responsive collapse behavior~~ — **Removed 2026-09-18**: mobile/narrow-viewport support is explicitly out of scope for this project (spec.md Assumptions, formerly FR-017). A responsive collapse (CSS media query + on-demand nav toggle) was built and live-tested at a narrow viewport — this actually surfaced and fixed a real `grid-template-rows` bug in `Shell.css` (see T018's notes) — but was then removed entirely per this decision: `SideNav.tsx`/`SideNav.css`/`Shell.css` no longer contain any breakpoint or toggle logic; the side navigation is a permanent column at every width.
- [x] T010 [US1] Rewire `FileLoader.tsx` to render `TopBar`/`SideNav`/main content area instead of its current flat stack of controls. The main content area is a permanent layout region (research.md §3) whose contents vary by `Status`: pre-load, the file picker and (if present) `KeptSaveOffer`; while parsing, progress feedback; once ready, the side navigation's active-tab content, defaulting to `OverviewCard` for `"overview"`.
- [x] T011 [P] [US1] Write component tests in `tests/components/TopBar.test.tsx` and `tests/components/SideNav.test.tsx` covering: nation selector disabled before load / enabled and populated after (Acceptance Scenarios 1-2), AI Agent/Map items rendered and clickable (Acceptance Scenarios 5-6), and keyboard operability (FR-015).
- [x] T012 [US1] Manually verify in a real Chrome browser per quickstart.md scenarios 1-6 (scenario 4 later removed — see T009). **Done for scenarios 1, 2, 3, 5, 6** — verified via a real Chrome session against a scratch copy of `tests/fixtures/rus-1628-minimal.eu5` with `played_country.country` pointed at a real nation (the committed fixture has no player nation set, per its documented behavior — see 001's `tests/storage/queries.test.ts`): top bar visible and usable pre-load with the nation selector present but disabled, selector enables/populates on load with no layout shift, shell structure (top bar + side nav + centered content) matches Acceptance Scenario 3, switching nations while "Provinces" was active kept "Provinces" active rather than resetting to Overview (FR-003, confirmed early since it's the same mechanism), AI Agent shows its "Coming Soon" placeholder and is clickable, console was clean throughout. Scenario 4 (responsive) was verified live before being removed per the above decision — see T018's bug-fix notes for what that testing found.

**Checkpoint**: User Story 1 is independently functional — this is the MVP. Every later story renders into the shell built here.

---

## Phase 4: User Story 2 - Browse a nation's data by category / Provinces (Priority: P2)

**Goal**: The first real data tab beyond Overview, reusing 001's existing
`provinces`/`locations` tables with zero new schema (spec.md User Story 2).

**Independent Test**: Load a save, select a nation, open the side
navigation, and switch between "Overview" and "Provinces," confirming the
displayed data changes accordingly and the nation selection is preserved.

### Implementation for User Story 2

- [x] T013 [US2] Implement `listProvinces(db, nationIdx, page)` in `src/storage/queries.ts` per contracts/tab-data-contract.md. **Corrected during implementation**: `locations` has no `name` column (only `idx`/`owner_idx`/`province_idx`/`development`) — the real query joins `provinces` on `province_idx` for the display name (the adapter's `province_definition` string, e.g. `"mazyr_province"`), falling back to `"Location {idx}"` if unmatched. contracts/tab-data-contract.md updated to match.
- [x] T014 [P] [US2] Write a query test asserting `listProvinces` paginates correctly and matches the fixture's known province rows. Done: `tests/storage/provinces.test.ts` (3 tests — basic row shape, empty-nation case, and a 60-synthetic-row pagination case since the real fixture only has 1 province per nation).
- [x] T015 [US2] Create `src/components/Overview/ProvincesTab.tsx`: lists every province the selected nation controls with at least name and development (FR-004), paginated per research.md §5, showing `EmptyState` (T002) when the nation controls zero provinces (Acceptance Scenario 4). Owns its own fetch/pagination state and re-fetches (resetting to page 0) whenever `nationIdx` changes, satisfying FR-003 without `FileLoader` needing to own tab-specific data.
- [x] T016 [P] [US2] Write a component test in `tests/components/ProvincesTab.test.tsx` covering the populated, empty, and paginated cases. Done: 4 tests (populated rows, `EmptyState` for zero provinces, re-fetch-on-nationIdx-change, `NotAvailableState` on query failure).
- [x] T017 [US2] Wire `SideNav`'s "Provinces" item to `activeTab`; confirm a nation change updates `ProvincesTab`'s contents without resetting the active tab (Acceptance Scenario 2/FR-003), and confirm switching to a different nav item swaps content without a full reload (FR-002). Verified live in Chrome (see T018) — switching from RUS to SCA while "Provinces" was active kept "Provinces" active and updated its contents.
- [x] T018 [US2] Manually verify in Chrome per quickstart.md scenarios 7-10. **Two real bugs found and fixed during this pass** (not caught by any unit test, since Node/jsdom has neither React StrictMode's real double-invoke timing against a real Asyncify WASM build nor a real narrow-viewport CSS Grid layout to catch either):
  1. **Concurrency hang**: opening the Provinces tab for the first time froze the entire tab (unresponsive to all further input, including `navigate`). Root cause: `src/storage/db.ts`'s `queryRows`/`insertRows`/`applySchema`/`closeSaveDatabase` had zero serialization against a connection — React StrictMode's dev-mode double-invoke of `ProvincesTab`'s fetch effect fired two concurrent `queryRows` calls against the same wa-sqlite connection, corrupting its Asyncify-based shared WASM call stack (the same root cause 001 first found via a `Promise.all` in `FileLoader.tsx`, but reachable here without any explicit concurrent call in application code). **Fixed**: added a per-connection `WeakMap`-based queue (`withConnectionQueue`) in `db.ts` that every `db.handle`-touching function now routes through, so no caller (present or future) can reintroduce this by accident; `queries.ts`'s `markSaveKept` updated to go through the new serialized `execSql` instead of calling `db.sqlite3.exec` directly. Regression test added: `tests/storage/connection-queue.test.ts` (spies on `execWithParams` to assert max concurrency is always 1). `architecture_constitution.md`'s Async and Integration Rules already stated this rule; this makes it actually enforced in code, not just documented.
  2. **Mobile layout bug** (context only — the responsive code this describes was subsequently removed entirely per T009's 2026-09-18 decision that mobile is out of scope; kept here as the real discovery that happened during this pass): at a 588px-wide viewport (below the then-existing 768px breakpoint), the Provinces tab's real data rendered correctly in the DOM but was visually pushed almost entirely off-screen. Root cause: the `@media (max-width: 768px)` rule in `Shell.css` overrode `grid-template-areas` to a 3-row layout (topbar/sidenav/main) but never overrode `grid-template-rows`, which stayed at the desktop rule's 2-track `auto 1fr` — so the browser's implicit grid-track assignment gave "sidenav" (not "main") the greedy `1fr` track, growing it to fill the viewport height and shoving "main" into an implicit auto-sized row far below the fold. Fixed at the time by also setting `grid-template-rows: auto auto 1fr` in the mobile rule, then re-verified live (Overview and Provinces both rendered correctly at 588px width, page stayed fully responsive, clean console) — before the whole mobile code path was deleted per T009.
  - Scenarios 7 (navigate to Provinces), 8 (nation change preserves active tab), 9 (tab switch, no reload) all directly verified live in Chrome. Scenario 10 (empty Provinces) and scenario 18 (SC-003 large-nation responsiveness/pagination UI) verified only via the component/query unit tests (T014/T016's synthetic-data cases) — the real fixture has no landless nation and only 1 province per real nation, so neither case has live-browser confirmation yet; revisit once a save with a landless nation or 50+ provinces is available.

**Checkpoint**: User Stories 1 and 2 are both independently functional.

---

## Phase 5: User Story 3 - Military tab (Priority: P3)

**DEFERRED (2026-09-18)** — this feature stopped at User Story 2; every
task below (T019-T027) is deferred to a future feature rather than
built here. See spec.md's Clarifications and Assumptions for why. Left
unchanged (not deleted) so the research-dependency notes remain usable
input for whichever feature picks this up.

**Goal**: Show the selected nation's standing military units, summarized
by type (spec.md User Story 3, FR-005).

**Independent Test**: Load a save, select a nation with at least one
military unit, open the Military tab, and confirm unit counts/types shown
match the source save.

### Tests for User Story 3 (required by constitution Principle II — parser logic is NON-NEGOTIABLE test-first)

- [ ] T019 [US3] Extend `tests/fixtures/rus-1628-minimal.eu5` (or add a second fixture) with representative `unit_manager.database` rows per research.md §6 (army and navy units, varying `owner`/`type`/`strength`/`morale`/`number`).
- [ ] T020 [P] [US3] Write a fixture-based regression test in `tests/parser/adapter.test.ts` asserting the 1.3.11 adapter parses `unit_manager.database` into the `military_units` table exactly as specified in data-model.md — write this before T022, per Principle II.

### Implementation for User Story 3

- [ ] T021 [US3] Add the `military_units` table to `src/storage/schema.sql` per data-model.md (`idx`, `owner_idx`, `controller_idx` nullable, `unit_type`, `strength`, `morale`, `number`).
- [ ] T022 [US3] Extend `src/parser/version-adapters/1.3.11.ts` to populate `military_units` from `unit_manager.database`, satisfying T020.
- [ ] T023 [US3] Implement `listMilitaryUnits(db, nationIdx, page)` in `src/storage/queries.ts` per contracts/tab-data-contract.md.
- [ ] T024 [P] [US3] Write a query test asserting `listMilitaryUnits` and its per-`unit_type` totals (marked derived per Principle IV/data-model.md) match the fixture.
- [ ] T025 [US3] Create `src/components/Overview/MilitaryTab.tsx`: units summarized in a way that shows total strength at a glance, e.g. counts by unit type (FR-005), `EmptyState` when the nation has none (Acceptance Scenario 2).
- [ ] T026 [P] [US3] Write a component test in `tests/components/MilitaryTab.test.tsx` covering the populated and empty cases.
- [ ] T027 [US3] Manually verify in Chrome per quickstart.md scenario 11.

**Checkpoint**: User Stories 1-3 are independently functional.

---

## Phase 6: User Story 4 - Government tab (Priority: P4)

**DEFERRED (2026-09-18)** — see Phase 5's note above; T028-T038 deferred
to a future feature.

**Goal**: Show the selected nation's government type, estates, and active
policies (spec.md User Story 4, FR-006).

**Independent Test**: Load a save, select a nation, open the Government
tab, and confirm the government type, estate standing, and active
policies shown match the source save.

### Implementation for User Story 4

- [ ] T028 [US4] Update spec.md's FR-006 and Key Entities to drop the "National Value" display from Government tab scope: research.md confirms no `national_value*` key exists anywhere in the real save. Policies (`implemented_laws`) is the closest real mechanic and is already covered separately below; document this resolution in data-model.md's existing note rather than inventing schema for a mechanic that doesn't exist (constitution Principle II).

### Tests for User Story 4 (required by constitution Principle II)

- [ ] T029 [US4] Extend the fixture with representative `estate_manager.database` rows (all 8 estate types for at least one country) and a `countries.database[idx].implemented_laws` map with at least one entry, per research.md §6.
- [ ] T030 [P] [US4] Write fixture-based regression tests in `tests/parser/adapter.test.ts` asserting the adapter parses `estate_manager.database` into `estates` and `implemented_laws` into `policies`, exactly per data-model.md — write before T032/T033.

### Implementation for User Story 4 (continued)

- [ ] T031 [US4] Add the `estates` and `policies` tables to `src/storage/schema.sql` per data-model.md.
- [ ] T032 [US4] Extend `src/parser/version-adapters/1.3.11.ts` to populate `estates` from `estate_manager.database`.
- [ ] T033 [US4] Extend `src/parser/version-adapters/1.3.11.ts` to populate `policies` from each country's `implemented_laws` map (synthetic autoincrement `id`, per data-model.md).
- [ ] T034 [US4] Implement `listEstates(db, nationIdx)` and `listPolicies(db, nationIdx)` in `src/storage/queries.ts` per contracts/tab-data-contract.md.
- [ ] T035 [P] [US4] Write query tests for both functions against the fixture.
- [ ] T036 [US4] Create `src/components/Overview/GovernmentTab.tsx`: government type (already parsed by 001), estates with their satisfaction/wealth-impact standing, and active policies; `EmptyState` for the policies section when none are set (Acceptance Scenario 3).
- [ ] T037 [P] [US4] Write a component test in `tests/components/GovernmentTab.test.tsx` covering the populated and no-policies cases.
- [ ] T038 [US4] Manually verify in Chrome per quickstart.md scenario 12.

**Checkpoint**: User Stories 1-4 are independently functional.

---

## Phase 7: User Story 5 - Economy tab (Priority: P5)

**DEFERRED (2026-09-18)** — see Phase 5's note above; T039-T048 deferred
to a future feature.

**Goal**: Show the selected nation's income/expense breakdown and
outstanding loans (spec.md User Story 5, FR-007).

**Independent Test**: Load a save, select a nation, open the Economy tab,
and confirm the loan and income/expense figures shown match the source
save.

### Research (constitution Principle II — confirm before inventing schema)

- [ ] T039 [US5] Research `bureaucracy_manager`/`market_manager`'s income/expense field structure against the real save; document findings in research.md, updating data-model.md's Economy TBD note with either confirmed schema or a documented, narrower scope for FR-007's income/expense half.

### Tests for User Story 5

- [ ] T040 [US5] Extend the fixture with representative `loan_manager.database` rows (at least one bond loan, at least one lender-bearing loan) per research.md §6.
- [ ] T041 [P] [US5] Write a fixture-based regression test in `tests/parser/adapter.test.ts` asserting the adapter parses `loan_manager.database` into `loans` per data-model.md — write before T043.

### Implementation for User Story 5

- [ ] T042 [US5] Add the `loans` table to `src/storage/schema.sql` per data-model.md.
- [ ] T043 [US5] Extend `src/parser/version-adapters/1.3.11.ts` to populate `loans` from `loan_manager.database`.
- [ ] T044 [US5] Implement `listLoans(db, nationIdx)` in `src/storage/queries.ts` per contracts/tab-data-contract.md.
- [ ] T045 [P] [US5] Write a query test for `listLoans` against the fixture.
- [ ] T046 [US5] Create `src/components/Overview/EconomyTab.tsx`: the loans list (T044) plus the income/expense breakdown per T039's findings (or a `NotAvailableState` per FR-014 if T039 finds nothing extractable), `EmptyState` when no loans exist (Acceptance Scenario 2).
- [ ] T047 [P] [US5] Write a component test in `tests/components/EconomyTab.test.tsx` covering the with-loan and no-loan cases.
- [ ] T048 [US5] Manually verify in Chrome per quickstart.md scenario 13.

**Checkpoint**: User Stories 1-5 are independently functional.

---

## Phase 8: User Story 6 - Diplomacy tab (Priority: P6)

**DEFERRED (2026-09-18)** — see Phase 5's note above; T049-T056 deferred
to a future feature.

**Goal**: Show the selected nation's current wars and alliances (spec.md
User Story 6, FR-008).

**Independent Test**: Load a save, select a nation known to be at war
(per its Overview war-status stat), open the Diplomacy tab, and confirm
that war and any alliances shown match the source save.

### Research (constitution Principle II)

- [ ] T049 [US6] Research `diplomacy_manager`/`international_organization_manager`'s alliance-flag structure against the real save; document findings in research.md, resolving data-model.md's Diplomacy TBD note into confirmed schema (or a documented absence).

### Tests for User Story 6

- [ ] T050 [US6] Add whatever `alliances`-shaped table T049 confirms to `src/storage/schema.sql` (or, if T049 finds no extractable alliance flag, document that Diplomacy's alliance half falls back to FR-014's "not available for this save" state and skip the remaining tasks in this block).
- [ ] T051 [P] [US6] Write a fixture-based regression test in `tests/parser/adapter.test.ts` for the alliance data per T049/T050's findings — write before T052 (skip if T050 was skipped).

### Implementation for User Story 6

- [ ] T052 [US6] Extend `src/parser/version-adapters/1.3.11.ts` to populate the alliance table per T049's findings (skip if T050 was skipped).
- [ ] T053 [US6] Implement a `listAlliances(db, nationIdx)`-shaped function in `src/storage/queries.ts` (or confirm none is possible) and add it to contracts/tab-data-contract.md.
- [ ] T054 [US6] Create `src/components/Overview/DiplomacyTab.tsx`: current wars (reusing 001's existing `war_participants` data — no new query needed beyond what 001 established) and alliances per T053, or `NotAvailableState` for the alliance section if T049 found nothing.
- [ ] T055 [P] [US6] Write a component test in `tests/components/DiplomacyTab.test.tsx` covering the at-war and allied cases.
- [ ] T056 [US6] Manually verify in Chrome per quickstart.md scenario 14.

**Checkpoint**: User Stories 1-6 are independently functional.

---

## Phase 9: User Story 7 - Trade tab (Priority: P7)

**DEFERRED (2026-09-18)** — see Phase 5's note above; T057-T064 deferred
to a future feature.

**Goal**: Show the selected nation's trade good production and/or trade
route participation (spec.md User Story 7, FR-009).

**Independent Test**: Load a save, select a nation, open the Trade tab,
and confirm the goods/routes shown match the source save.

### Research (constitution Principle II — `trade_manager`/`trade_path_manager` are unresearched)

- [ ] T057 [US7] Research `trade_manager`/`trade_path_manager`'s field structure against the real save; document findings in research.md and resolve data-model.md's Trade "deferred entirely" note into confirmed schema or a documented reason it can't be extracted.

### Tests for User Story 7

- [ ] T058 [US7] Add whatever trade-goods/trade-routes schema T057 confirms to `src/storage/schema.sql` (skip if T057 finds nothing extractable).
- [ ] T059 [P] [US7] Write a fixture-based regression test in `tests/parser/adapter.test.ts` per T057/T058's findings — write before T060 (skip if T058 was skipped).

### Implementation for User Story 7

- [ ] T060 [US7] Extend `src/parser/version-adapters/1.3.11.ts` to populate the new table(s) per T057's findings (skip if T058 was skipped).
- [ ] T061 [US7] Implement a `listTradeGoods`/`listTradeRoutes`-shaped function in `src/storage/queries.ts` per T057's findings, adding it to contracts/tab-data-contract.md.
- [ ] T062 [US7] Create `src/components/Overview/TradeTab.tsx`: goods produced and/or trade routes per T061, or `NotAvailableState` if T057 found nothing extractable (FR-014).
- [ ] T063 [P] [US7] Write a component test in `tests/components/TradeTab.test.tsx`.
- [ ] T064 [US7] Manually verify in Chrome; add a Trade validation scenario to quickstart.md (a pre-existing gap noted there) and run it.

**Checkpoint**: User Stories 1-7 are independently functional.

---

## Phase 10: User Story 8 - Building registry tab (Priority: P8)

**DEFERRED (2026-09-18)** — see Phase 5's note above; T065-T073 deferred
to a future feature.

**Goal**: List buildings constructed across the selected nation's
territory (spec.md User Story 8, FR-010).

**Independent Test**: Load a save, select a nation with at least one
constructed building, open the Building registry tab, and confirm the
buildings listed (and which province each is in) match the source save.

### Tests for User Story 8 (required by constitution Principle II)

- [ ] T065 [US8] Extend the fixture with representative `building_manager.database` rows (varying `type`/`level`/`location`/`owner`) per research.md §6.
- [ ] T066 [P] [US8] Write a fixture-based regression test in `tests/parser/adapter.test.ts` asserting the adapter parses `building_manager.database` into `buildings` per data-model.md — write before T068.

### Implementation for User Story 8

- [ ] T067 [US8] Add the `buildings` table to `src/storage/schema.sql` per data-model.md.
- [ ] T068 [US8] Extend `src/parser/version-adapters/1.3.11.ts` to populate `buildings` from `building_manager.database`.
- [ ] T069 [US8] Implement `listBuildings(db, nationIdx, page)` in `src/storage/queries.ts` per contracts/tab-data-contract.md.
- [ ] T070 [P] [US8] Write a query test for `listBuildings` against the fixture.
- [ ] T071 [US8] Create `src/components/Overview/BuildingRegistryTab.tsx`: each building listed with its type and which province/location it's in (FR-010), paginated per research.md §5, `EmptyState` when none exist.
- [ ] T072 [P] [US8] Write a component test in `tests/components/BuildingRegistryTab.test.tsx`.
- [ ] T073 [US8] Manually verify in Chrome per quickstart.md scenario 15.

**Checkpoint**: User Stories 1-8 are independently functional.

---

## Phase 11: User Story 9 - Characters tab (Priority: P9)

**DEFERRED (2026-09-18)** — see Phase 5's note above; T074-T082 deferred
to a future feature.

**Goal**: Show the selected nation's ruler and other notable characters
(spec.md User Story 9, FR-011).

**Independent Test**: Load a save, select a nation, open the Characters
tab, and confirm the ruler and any other listed characters match the
source save.

### Tests for User Story 9 (required by constitution Principle II)

- [ ] T074 [US9] Extend the fixture with representative `character_db.database` rows (at least one alive ruler referenced by a country's `government.ruler`, at least one other character) per research.md §6 — explicitly excluding the `dna` field.
- [ ] T075 [P] [US9] Write a fixture-based regression test in `tests/parser/adapter.test.ts` asserting the adapter parses `character_db.database` into `characters` per data-model.md, confirming `dna` is never read or stored — write before T077.

### Implementation for User Story 9

- [ ] T076 [US9] Add the `characters` table to `src/storage/schema.sql` per data-model.md.
- [ ] T077 [US9] Extend `src/parser/version-adapters/1.3.11.ts` to populate `characters` from `character_db.database`, excluding `dna`.
- [ ] T078 [US9] Implement `listCharacters(db, nationIdx)` in `src/storage/queries.ts` per contracts/tab-data-contract.md, joining `nations.idx`'s `government.ruler`/`.heir` to derive `isRuler`/`isHeir` (data-model.md's Derived Values) and `death_date IS NULL` to derive `isAlive`.
- [ ] T079 [P] [US9] Write a query test asserting `listCharacters` correctly flags ruler/heir/alive status against the fixture.
- [ ] T080 [US9] Create `src/components/Overview/CharactersTab.tsx`: ruler shown by name at minimum, other notable characters listed alongside (FR-011), derived flags marked per Principle IV.
- [ ] T081 [P] [US9] Write a component test in `tests/components/CharactersTab.test.tsx`.
- [ ] T082 [US9] Manually verify in Chrome per quickstart.md scenario 16.

**Checkpoint**: All nine user stories are independently functional.

---

## Phase 12: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that span multiple user stories.

**Scope narrowed (2026-09-18)**: with US3-US9 deferred, these apply only
to what was actually delivered — the shell (US1, now the 4-section top
nav) and Provinces (US2, now Perspective-based).

- [x] T083 [P] Update `ARCHITECTURE.md` to document the shell layout, the storage-engine migration, and the Perspective adoption, and any deviations discovered during implementation (same pattern as 001's T040). Done — see ARCHITECTURE.md's storage-engine decision log and "Data tables: Perspective, not plain HTML tables with app-level pagination" sections.
- [ ] T084 [P] Verify `TopBar`, `SideNav`/`CountryViewerNav`, `ComingSoonPlaceholder`, `OverviewCard`, and `ProvincesTab` against constitution Principle VI — compute actual WCAG contrast ratios (don't just eyeball, per 001's T041 precedent), confirm no color-only meaning, and confirm every interactive element is keyboard-operable. **Not done** — remaining follow-up if/when this feature is formally closed out.
- [ ] T085 Run the full quickstart.md validation pass for the delivered scenarios (1-10) against a real save, in both the local dev server and the Docker container (same pattern as 001's T042). **Partially done** — scenarios 1, 2, 3, 5, 6 (T012) and 7-9 (T018) verified live in Chrome across this feature's several real-browser sessions (including after the nav restructuring and Perspective retrofit); scenario 10 (empty Provinces) and the Docker-container pass are **not done**.
- [ ] ~~T086 Run `/speckit-analyze`~~ — **DEFERRED (2026-09-18)** along with US3-US9; re-run once/if this feature resumes rather than analyzing a spec that's intentionally left mid-scope.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup. Blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational only (needs T004's `activeTab` state shape).
- **User Story 2 (Phase 4)**: Depends on Foundational and on US1's shell (`SideNav`/main content area) existing to render into — implement after US1.
- **User Stories 3-9 (Phases 5-11)**: Each depends on Foundational and US1's shell; they do NOT depend on each other or on US2 — any may be implemented in any order, or in parallel by different people, once US1 is done.
- **Polish (Phase 12)**: Depends on all nine user stories being complete.

### Within Each User Story

- Fixture tests before adapter logic (constitution Principle II — applies to US3-US9; US1 and US2 touch no parser code).
- Research tasks (US5's T039, US6's T049, US7's T057) before that story's schema/adapter tasks — Principle II forbids inventing schema for an unconfirmed section.
- Schema/query changes before the UI components that consume them.
- Story checkpoint reached only once its Independent Test passes.

### Parallel Opportunities

- T002 and T003 (Foundational) can run in parallel.
- T007 (US1) can run in parallel with T005/T006 once T004 exists.
- Once US1 (Phase 3) is complete, User Stories 3 through 9 (Phases 5-11) can each be built in parallel by different people — none depends on another.
- Within any single data-tab story, the `[P]`-marked test task can run in parallel with the next story's setup once its own fixture task is committed.

---

## Parallel Example: User Story 3

```bash
# Fixture extension and its regression test are sequential (Principle II: test before logic),
# but once T020 exists, the schema task can proceed while the test still fails:
Task: "Extend the fixture with unit_manager.database rows"
Task: "Write the failing fixture-based adapter test for military_units"

# Once T022 (adapter) and T023 (query) both land, these can run in parallel:
Task: "Write a query test for listMilitaryUnits"
Task: "Write a component test for MilitaryTab"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (confirm no changes needed).
2. Complete Phase 2: Foundational (`EmptyState`/`NotAvailableState`, `activeTab` state shape).
3. Complete Phase 3: User Story 1 (the portfolio shell).
4. **STOP and VALIDATE**: run quickstart.md scenarios 1-6 against a real save.
5. Demo: "the app now looks like a finished tool, not a rough draft — top bar, side nav, centered content, with AI Agent/Map marked coming soon."

### Incremental Delivery

1. Setup + Foundational → shared UI state and empty/unavailable-state components ready.
2. Add User Story 1 → validate independently → this is the MVP.
3. Add User Story 2 (Provinces) → validate independently → first real data tab, zero new schema.
4. Add User Stories 3-9 in any order (Military, Government, Economy, Diplomacy, Trade, Building Registry, Characters) → validate each independently — each is its own self-contained increment per spec.md's Assumptions.
5. Polish.

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- [Story] labels map every implementation task back to spec.md for traceability.
- Constitution Principle II is non-negotiable: every fixture-extension/adapter-test pair in US3-US9 must exist and fail before its corresponding implementation task is done.
- Policies/national values (US4) and the alliance/trade/income-expense TBD items (US5-US7) carry real research risk per plan.md — their task counts and exact shapes may change once each research task (T039, T049, T057) reports back, same as 001's schema corrections after real-save research.
- Commit after each task or logical group, consistent with this project's established rhythm.
- **Storage engine migrated mid-implementation (2026-09-18, between US2 and US3)**: this project moved from `wa-sqlite`/SQLite to `@duckdb/duckdb-wasm`/DuckDB — see ARCHITECTURE.md's decision log for why and what changed. US3-US9's remaining tasks (T019 onward) still apply as written, but every future `schema.sql` addition MUST use DuckDB dialect: `DOUBLE` (not `REAL`, which is 32-bit in DuckDB) for floating-point columns, a `CREATE SEQUENCE` + `DEFAULT nextval(...)` (not `AUTOINCREMENT`) for any synthetic key like `policies.id`, and no `REFERENCES` enforcement expectations beyond documentation (matches 001's existing schema, which never enabled FK enforcement either). Any write added outside `closeSaveDatabase`'s automatic checkpoint (i.e. anything that doesn't immediately close its connection) MUST `CHECKPOINT` itself — see ARCHITECTURE.md's "OPFS persistence requires an explicit CHECKPOINT."
- **Bulk-insert fix (2026-09-18, found via a real ~650MB save crash after the migration above)**: `insertRows` now bulk-loads via Apache Arrow instead of a row-by-row prepared-statement loop — see ARCHITECTURE.md's "Bulk inserts: Arrow, not a row-by-row prepared-statement loop." This is transparent to every future US3-US9 adapter insert *as long as* the `INSERT INTO table (col1, col2, ...) VALUES (?1, ?2, ...)` string lists every column of the target table with no literal values mixed in (matching every existing call site's shape) — a statement that doesn't fit this exact shape silently falls back to the slow row-by-row path instead of erroring, so keep new insert call sites consistent with the existing ones in `version-adapters/1.3.11.ts` rather than deviating without a reason.
