---

description: "Task list for Diplomatic Relations Chord Diagram"
---

# Tasks: Diplomatic Relations Chord Diagram

**Input**: Design documents from `/specs/013-diplomatic-relations-chord/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema.md, contracts/queries.md, contracts/ui.md, quickstart.md

**Tests**: Included where Constitution Principle II (parser fixture tests, NON-NEGOTIABLE) or plan.md's own testing plan (research.md §7's Hugbox algorithm unit tests, quickstart.md §1-2) explicitly require them. No test tasks are added beyond those two areas — no other TDD scaffolding was requested.

**Organization**: Tasks are grouped by user story (spec.md: US1 P1, US2 P2, US3 P3, US4 P2) to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3/US4)
- Every task's file path and any data-model.md constraint it must satisfy are quoted verbatim below

## Path Conventions

Single project (per plan.md's Structure Decision — no new module/layer): `src/storage/`, `src/parser/version-adapters/`, `src/components/Overview/`, `tests/`.

---

## Phase 1: Setup

**Purpose**: New schema and fixture data every later phase depends on.

- [X] T001 Add `diplomatic_relations` and `nation_relation_trust` tables to `src/storage/schema.sql`, exact DDL from `contracts/schema.md`: `diplomatic_relations(first_nation_idx INTEGER NOT NULL, second_nation_idx INTEGER NOT NULL, relation_type TEXT NOT NULL, start_date TEXT)` with `relation_type` constrained by convention to `'alliance' | 'rivalry' | 'royal_marriage' | 'guarantee'` (enforced adapter-side, not a SQL CHECK — matches this schema's existing convention) and `first_nation_idx < second_nation_idx` enforced at insert time, not in SQL; `nation_relation_trust(owner_nation_idx INTEGER NOT NULL, target_nation_idx INTEGER NOT NULL, trust DOUBLE NOT NULL)`; plus the two index statements (`idx_diplomatic_relations_first`, `idx_diplomatic_relations_second`, `idx_nation_relation_trust_pair`) from `contracts/schema.md`.
- [X] T002 [P] Extend `tests/fixtures/rus-1628-minimal.eu5` with a `diplomacy_manager` block referencing the fixture's existing nations (RUS `2025`, PLC `33556892`, KIE `1961`, FRA `1141`, per research.md §1/quickstart.md §1): at least one `scripted_mutual`/`scripted_oneway` entry with `object=alliance` and one with `object=guarantee` (each `{ first=<idx> second=<idx> named_targets={ { flag=scripted_relation_type target={ type=relation_type object=<type> } } } }`), one `royal_marriage={ first=<idx> second=<idx> }` entry, one per-country `rivals_2={ list={ { country=<idx> date=<date> } } }` entry (mutual — recorded under both sides, to exercise de-duplication), one per-country `relations={ <target_idx>={ trust=<value> } }` entry, and exactly one relationship type occurring only once in the whole block (to exercise the single-occurrence `toArray` normalization case, research.md §4).

**Checkpoint**: Schema and fixture data exist — parsing/query work can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Parsing, query, decode, and tab-shell plumbing every user story renders through.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 [Test] Write the parser regression test in `tests/parser/adapter.test.ts` asserting the extended fixture (T002) produces the exact expected `diplomatic_relations`/`nation_relation_trust` rows (Constitution Principle II, NON-NEGOTIABLE — written before T004 so it fails first, per the "write tests FIRST" convention). Depends on: T002.
- [X] T004 Add `"diplomacy_manager"` to `STRUCTURED_KEYS` in `src/parser/version-adapters/1.3.11.ts` and implement extraction (research.md §1): call `toArray(diplomacyManager, key)` on `royal_marriage`, `scripted_mutual`, `scripted_oneway` before iterating (research.md §4); build `diplomatic_relations` rows from `royal_marriage` entries, from `scripted_mutual`/`scripted_oneway` entries filtered to `named_targets.target.object === "alliance"` or `"guarantee"` only (every other `object` value — `military_access`, `trade_access`, `embargo_nation`, `fleet_basing_rights`, `deny_market_access`, `block_foreign_building`, `divert_trade`, `scutage`, `send_officers`, `sound_toll_exemption`, `knowledge_sharing`, `guarantee_vassal_independence`, `fondaco_rights`, `support_loyalists`, `food_access`, `support_military` — parsed and discarded, never stored), and from each per-country `rivals_2.list` entry, de-duplicated so a mutual pair produces one row with `first_nation_idx < second_nation_idx` (normalize order at insert time); build `nation_relation_trust` rows from each per-country `relations.<target_idx>.trust` field, kept directional (no averaging at parse time — data-model.md's explicit reasoning). Insert via `insertRows` per this file's existing pattern (see the `war_manager`/`warRows` block for the model to follow). Depends on: T001, T003.
- [X] T005 [P] Add `listDiplomaticRelationsArrow(db)`, `listRelationTrustArrow(db)`, and `listNationDevelopmentArrow(db)` to `src/storage/queries.ts` exactly per `contracts/queries.md`'s signatures and column lists (`listNationDevelopmentArrow`: `SELECT owner_idx, SUM(development) AS total_development FROM locations GROUP BY owner_idx`, research.md §6). Depends on: T001.
- [X] T006 [P] Create `src/components/Overview/diplomacyData.ts` with the raw-decode layer (`leaderboardData.ts` precedent: `tableFromIPC` over each of T005's three Arrow results into typed row arrays — `DiplomaticRelationship { firstNationIdx: number; secondNationIdx: number; relationType: "alliance" | "rivalry" | "royal_marriage" | "guarantee"; startDate: string | null }`, `NationRelationTrust { ownerNationIdx: number; targetNationIdx: number; trust: number }`, and a `derived: Set<"totalDevelopment">`-tagged `NationDevelopment { ownerIdx: number; totalDevelopment: number }` per the response-contract convention in architecture_constitution.md). Reuse the existing `LeaderboardCountry`-shaped query (`listLeaderboardCountriesArrow`) for country identity/color/name — no new country query. Depends on: T005.
- [X] T007 Add `"diplomatic-relations"` to the `EncyclopediaTab` union in `src/components/Overview/tabs.ts` (contracts/ui.md — distinct from the existing unrelated per-nation `"diplomacy"` `TabId`, which stays untouched). Depends on: none (can run alongside T001-T006).
- [X] T008 [P] Add `{ id: "diplomatic-relations", label: "Diplomacy" }` to the `TABS` array in `src/components/Overview/EncyclopediaNav.tsx`. Depends on: T007.
- [X] T009 Create `src/components/Overview/DiplomacyTab.tsx` (contracts/ui.md): fetches via `diplomacyData.ts` (T006) once on mount, holds relationship-type filter state (all four types on by default), major-powers/show-all toggle state (default major-powers), and Hugbox Detection toggle state (default off); renders `EmptyState` (existing `src/components/Overview/EmptyState.tsx`) when there are zero relationships, and a placeholder otherwise (US1 replaces the placeholder with the real chart). Depends on: T006.
- [X] T010 Wire `DiplomacyTab` into `src/components/Overview/FileLoader.tsx`: add `isDiplomaticRelationsTab = isFactbook && encyclopediaTab === "diplomatic-relations" && isReady && !!readDbRef.current`, include it alongside `isFirepowerTab` in the existing full-width layout condition (~line 431), add the render branch `{isFactbook && encyclopediaTab === "diplomatic-relations" && (<DiplomacyTab db={readDbRef.current} />)}` alongside the existing `firepower` branch (~line 534). Depends on: T007, T009.

**Checkpoint**: Foundation ready — loading the app and clicking the new "Diplomacy" tab shows the empty state (or a placeholder) against a real save. User story implementation can now begin.

---

## Phase 3: User Story 1 - See the whole diplomatic web at a glance (Priority: P1) 🎯 MVP

**Goal**: Every country with an active alliance/rivalry/royal marriage/guarantee renders as a colored arc; a chord per relationship connects related pairs; hovering an arc isolates its chords.

**Independent Test**: Load a real save, open Diplomacy, confirm arcs+chords render, isolated countries are absent, hovering one arc visibly isolates its chords (spec Independent Test for US1).

### Implementation for User Story 1

- [X] T011 [US1] Add a chord-diagram view-model builder to `src/components/Overview/diplomacyData.ts`: given T006's decoded rows, country metadata, and the current (initially unfiltered) relationship-type set, produce one `ChordArc` per country with ≥1 visible relationship (`{ nationIdx, tag, name, colorR, colorG, colorB, relationshipCount }`, spec FR-001/FR-003/FR-008) and one `ChordEdge` per relationship instance (`{ firstNationIdx, secondNationIdx, relationType, thickness }` — a pair with 2 simultaneous types produces 2 separate `ChordEdge`s, spec FR-004). `thickness` is the trust score when `nation_relation_trust` has a value for either direction of the pair — average both when both directions exist, use whichever exists when only one does, per FR-010/data-model.md's explicit directional-not-pre-averaged reasoning — and a uniform fallback constant when neither direction has a value. Order arcs by `relationshipCount` descending (FR-011, no geographic grouping — research.md/spec Assumptions). Depends on: T006.
- [X] T012 [P] [US1] Define the fixed, documented relationship-type legend in `src/components/Overview/diplomacyData.ts` (or a co-located constant module): one color + one line-dash pattern (solid/dashed/dotted/dash-dot) per type (`'alliance' | 'rivalry' | 'royal_marriage' | 'guarantee'`), colorblind-safe by construction per research.md §3 (dash pattern is never omitted, color is never the only distinguishing signal). Depends on: none (pure constant, can run parallel to T011).
- [X] T013 [US1] Create `src/components/Overview/DiplomacyChordChart.tsx` (research.md §2): use the existing `useEChartsInstance` hook; a `custom` series with `renderItem` drawing one arc band per `ChordArc` at its computed angular position/width (uniform width per spec Assumptions — not development-scaled), filled with `colorR/colorG/colorB`; a `graph` series, `layout: "none"`, one node per `ChordArc` pinned to that same angular midpoint, one edge per `ChordEdge` with `lineStyle.color`/`lineStyle.type` (dash pattern) from T012's legend and `lineStyle.width` from `thickness`, and `emphasis: { focus: "adjacency" }` at the series level (the `MilitaryDoctrineChart.tsx`-validated mechanism, research.md §2) so hovering a graph node isolates its edges (spec FR-005). Depends on: T011, T012.
- [X] T014 [US1] Bridge arc-hover to the same isolate behavior in `DiplomacyChordChart.tsx`: on `mouseover` of the `custom` arc series, `chart.dispatchAction({ type: "focusNodeAdjacency", ... })` targeting the matching graph node; on `mouseout`, `chart.dispatchAction({ type: "unfocusNodeAdjacency" })` (both built-in echarts actions, research.md §2 — no hand-rolled opacity state). Depends on: T013.
- [X] T015 [US1] Add a chord tooltip in `DiplomacyChordChart.tsx`'s `graph` series (`tooltip.formatter`): both countries' display names, the relationship type(s) for that chord, and the score/date if one exists (spec FR-006). Depends on: T013.
- [X] T016 [US1] Add `DiplomacyChordChart.css` for the chart container and legend swatch styling (T012's color+dash pairing), matching the sizing/layout convention of sibling chart CSS files (e.g. `LeaderboardChart.css`). Depends on: T013.
- [X] T017 [US1] Replace `DiplomacyTab.tsx`'s placeholder (T009) with `DiplomacyChordChart`, passing the unfiltered T011 view-model (all four relationship types visible, no major-powers cut, Hugbox Detection off — those toggles are US2/US3/US4's job), and confirm the existing `EmptyState` still renders when the save has zero relationships of any tracked type (spec FR-012, US1 scope: the save-has-none case; the filter-excludes-all case is US2/US3's responsibility once those toggles exist). Depends on: T011, T013, T009.

**Checkpoint**: User Story 1 is fully functional and independently testable — load a real save, open Diplomacy, see arcs and chords, hover to isolate.

---

## Phase 4: User Story 2 - Filter down to the relationships that matter (Priority: P2)

**Goal**: Independent show/hide checkboxes per relationship type; arcs with nothing left visible drop out.

**Independent Test**: Toggle each relationship-type checkbox off/on independently, confirm only that type's chords appear/disappear and arcs with zero remaining visible relationships drop out/reappear (spec Independent Test for US2).

### Implementation for User Story 2

- [X] T018 [P] [US2] Add a relationship-type filter function to `src/components/Overview/diplomacyData.ts`: given the full decoded relationship set and a `Set<RelationType>` of currently-visible types, return the filtered `ChordEdge` list and the `ChordArc` list narrowed to countries with ≥1 remaining visible relationship (reuses T011's arc-count/ordering logic against the filtered edge set, spec FR-007/FR-008). Depends on: T011.
- [X] T019 [US2] Create `src/components/Overview/DiplomacyFilters.tsx` (contracts/ui.md `DiplomacyFiltersProps`): one checkbox per relationship type showing T012's legend color+dash swatch and label, `onToggleType` callback; also hosts US3's major-powers/show-all toggle and US4's Hugbox Detection toggle (props already defined in contracts/ui.md — this task wires the relationship-type checkboxes only, US3/US4 add their own controls to the same component). Depends on: T012.
- [X] T020 [P] [US2] Create `DiplomacyFilters.css` for the checkbox/legend layout. Depends on: T019.
- [X] T021 [US2] Wire `DiplomacyFilters` into `DiplomacyTab.tsx`: render it alongside `DiplomacyChordChart`, apply T018's filter function to the fetched data before passing arcs/edges to the chart on every toggle (client-side only, no re-fetch — spec SC-003's under-1-second budget), and confirm the empty state (spec FR-012) now also covers "every visible type is toggled off" or "only one type left checked and it has zero instances," not just "the save has none." Depends on: T017, T018, T019.

**Checkpoint**: User Stories 1 AND 2 both work independently — filters toggle chords/arcs live.

---

## Phase 5: User Story 4 - Spot alliance blocs at a glance with Hugbox Detection (Priority: P2)

**Goal**: An opt-in overlay grouping mutually-allied "core" clusters, pulling in 1-tie affiliates and promoting 2-tie countries to full membership, repositioning arcs to keep clusters adjacent.

**Independent Test**: Enable Hugbox Detection on a save with a 3+ mutual-alliance clique plus a 2-tie and a 1-tie country, confirm the core is grouped with a shared boundary, the 2-tie country is a full member, the 1-tie country is a distinguished affiliate (spec Independent Test for US4).

### Implementation for User Story 4

- [X] T022 [P] [US4] Create `src/components/Overview/hugboxClustering.ts` (research.md §7, data-model.md's `HugboxCluster` shape): pure function taking the currently-visible `diplomatic_relations` rows filtered to `relation_type === 'alliance'` and returning `HugboxCluster[]`. Step 1: build an undirected alliance adjacency structure. Step 2: find maximal fully-mutual cliques of size ≥ 3 as each cluster's `coreNationIdxs` (a mutually-allied pair alone, with no third member, produces no cluster — spec Assumptions). Step 3: for every other visible country, count alliance ties into each cluster's current member set — exactly 1 tie → add to `affiliateNationIdxs` (not enclosed); 2+ ties → add to `fullMemberNationIdxs` (spec FR-014). Step 4: resolve a country eligible for full membership in 2+ clusters by assigning it to the cluster it holds the most ties to, tie-broken by larger core size, then by lowest country tag alphabetically (spec Assumptions) — never appears as a full member of more than one cluster (spec FR-018). Depends on: none beyond T004's `diplomatic_relations` rows being queryable (T005/T006 already provide the decoded shape).
- [X] T023 [P] [US4] Write `tests/components/hugboxClustering.test.ts` against synthetic adjacency data (quickstart.md §2): the 3-country mutual clique case, the 1-tie-then-promoted-to-2-tie case, the two-clusters-eligible tie-break case, and the mutual-pair-with-no-third-member produces-no-cluster case. Depends on: T022.
- [X] T024 [US4] Add the Hugbox Detection toggle to `DiplomacyFilters.tsx` (T019) per `contracts/ui.md`'s `hugboxEnabled`/`onToggleHugbox` props, off by default (spec FR-013). Depends on: T019.
- [X] T025 [US4] Extend `DiplomacyChordChart.tsx` (T013) to accept T022's `HugboxCluster[] | null`: while non-null, reposition arcs so each cluster's `fullMemberNationIdxs` are contiguous on the circle (overriding T011's relationship-count ordering for the duration — spec FR-016/FR-017) with `affiliateNationIdxs` placed adjacent to their cluster, and draw a `custom`-series boundary/background band enclosing each cluster's full members, visually distinct from the affiliate countries just outside it (spec FR-015). Reverting the toggle (`null`) restores T011's default ordering and removes all boundaries. Depends on: T013, T022.
- [X] T026 [US4] Wire the Hugbox toggle end-to-end in `DiplomacyTab.tsx`: compute `hugboxClustering.ts` clusters from the currently-filtered (T018) alliance rows whenever the toggle is on, pass to `DiplomacyChordChart` (T025), and confirm disabling the alliance relationship-type filter while Hugbox Detection is on correctly yields zero clusters (spec Edge Cases) rather than stale/incorrect groupings. Depends on: T021, T022, T024, T025.

**Checkpoint**: User Stories 1, 2, and 4 all work independently — Hugbox Detection groups alliance blocs live.

---

## Phase 6: User Story 3 - Start from a readable default on a large save (Priority: P3)

**Goal**: Default to the save's human-played country/countries with a search-and-add control to bring in more.

**Independent Test**: On a save with more real countries than are currently selected, confirm the default view is the human-played country/countries only, and adding a country via search reveals any relationship between it and an already-selected country (spec Independent Test for US3).

### Implementation for User Story 3

**Amendment (course-corrected mid-implementation, explicit user request — "you
only need to show countries that are players, but the option to add more
countries will be done similarly to how we do everything else")**: T027-T029
as originally written (a `SUM(development)`-based "major powers" ranking plus
a separate "show all" toggle) were superseded before implementation began.
What actually shipped, reusing the existing Leaderboard/World Goods/Societal
Compass pattern unchanged:

- [X] T027 [US3] Default country selection via `computeDefaultSelection` (re-exported from `src/components/Overview/diplomacyData.ts`, delegating to `leaderboardData.ts`'s existing function unchanged) — human-played countries, or a small fixed fallback when none are human-played. Wired in `DiplomacyTab.tsx`'s load effect (`setSelectedIdxs(computeDefaultSelection(countries))`).
- [X] T028 [US3] Country search-and-add control: `DiplomacyFilters.tsx` renders the existing `AddCountryInput` component (no new component) with `selectedIdxs`/`onToggleCountry` props, per `contracts/ui.md`'s amended `DiplomacyFiltersProps`.
- [X] T029 [US3] `filterBySelection` in `diplomacyData.ts` (also used by US1/US2's pipeline) requires **both** sides of a relationship to be selected — not "at least one," an ego-network reading tried first and rejected live ("youre including non player countries") — so a country never appears as a node until the player has explicitly selected/added it. Wired in `DiplomacyTab.tsx` between the relationship-type filter (T018) and `buildChordViewModel`.

The originally-planned `listNationDevelopmentArrow` query and `NationDevelopment` type were built, then removed (see research.md §8, data-model.md's amendment, contracts/queries.md's amendment) — no dead code remains.

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation against the constitution and the real save, beyond any single story.

- [X] T030 [P] Run `npm test -- tests/parser/adapter.test.ts` and `npm test -- tests/components/hugboxClustering.test.ts` (quickstart.md §1-2) and confirm both pass. Both pass (36/36 across the two files); full suite also run (`--no-file-parallelism` to avoid this machine's low-disk-space-driven parallel-worker flakiness) at 433/434, the one failure a pre-existing, unrelated `RulerHistoryChart` mock-isolation issue that passes standalone.
- [X] T031 Run `npm run dev`, load the real save, and complete quickstart.md §3 end-to-end (arcs/chords/hover/tooltip/filters/add-country/Hugbox Detection against real data) and §4 (colorblind-safety squint-test on the legend). Done live against `Russia (Melted).eu5`: hover-isolate and the chord tooltip both confirmed working by the user with a real mouse (a live tooltip: "YEM (YEM) ↔ IRA (IRA) / Royal Marriage / Since 1608.10.23 / Trust: 48.4"); filters, country add, and Hugbox Detection all click-verified; two real bugs found and fixed live (`custom` series' default `coordinateSystem` crash, chord z-layering above nodes).
- [X] T032 Confirm `git status`/`git diff` shows no stray changes to `tests/fixtures/rus-1628-minimal.eu5` beyond the intended `diplomacy_manager` addition (T002), and that no unrelated fixture data was disturbed. Confirmed: the diff is a pure 59-line insertion at the end of the file, nothing else touched.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001 for T004/T005; T002 for T003) — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion. No dependency on US2/US3/US4.
- **User Story 2 (Phase 4)**: Depends on Foundational + US1 (T017's chart must exist to wire filters into — T021 depends on T017). Independently testable once wired.
- **User Story 4 (Phase 5)**: Depends on Foundational + US1 (T013's chart) + US2 (T019's `DiplomacyFilters`, T021's filtered-data wiring in `DiplomacyTab`). Independently testable once wired — does not depend on US3.
- **User Story 3 (Phase 6)**: Depends on Foundational + US1 + US2 (T021's filtered-data wiring). Independently testable once wired — does not depend on US4.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Within Each User Story

- US1: view-model (T011) and legend (T012, parallel) before the chart (T013); hover-bridge (T014) and tooltip (T015) after the chart exists; CSS (T016) alongside; tab wiring (T017) last.
- US2: filter function (T018) and `DiplomacyFilters` (T019, needs T012's legend) can start in parallel; CSS (T020) alongside T019; tab wiring (T021) last, after T017 (US1) exists.
- US4: clustering algorithm (T022) and its test (T023) can start as soon as Foundational is done (only needs `diplomatic_relations` rows, not the chart); toggle UI (T024) needs T019 (US2); chart boundary rendering (T025) needs T013 (US1) and T022; final wiring (T026) needs T021 (US2), T022, T024, T025.
- US3: ranking function (T027) can start once Foundational + T018 (US2's filter, since ranking applies after type-filtering) are done; toggle UI (T028) needs T019 (US2); final wiring (T029) needs T021 (US2) and T027/T028.

### Parallel Opportunities

- T001 and T002 (Setup) run in parallel — different files.
- T005 and T006 (Foundational) are sequential (T006 needs T005's signatures) but T007 (tabs.ts) can run in parallel with T001-T006 — no shared file.
- T008 depends only on T007, not on T001-T006 — can run in parallel with the rest of Foundational once T007 lands.
- T011 and T012 (US1) run in parallel — different concerns in the same or adjacent files, no ordering dependency between them.
- T022 and T023 (US4) can start immediately after Foundational, in parallel with all of US1/US2/US3 — the clustering algorithm only needs `diplomatic_relations` rows, not the chart or filters. (Its UI wiring, T024-T026, still waits on US1/US2 as noted above.)
- T027 (US3's ranking function) can be developed in parallel with US4's T022/T023 — both only need Foundational + T018.

---

## Parallel Example: Foundational Phase

```bash
# After T001/T002 (Setup) complete:
Task: "Write parser regression test in tests/parser/adapter.test.ts"      # T003
Task: "Add diplomatic-relations to EncyclopediaTab union in tabs.ts"       # T007 (parallel — different file, no dependency on T003/T004/T005)
```

## Parallel Example: User Story 1

```bash
Task: "Add chord-diagram view-model builder to diplomacyData.ts"   # T011
Task: "Define relationship-type legend (color + dash pattern)"     # T012 (parallel — independent constant, different concern)
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 (Setup) + Phase 2 (Foundational).
2. Complete Phase 3 (User Story 1).
3. **STOP and VALIDATE**: load a real save, confirm arcs/chords render and hover isolates chords, per US1's Independent Test.
4. This is already a usable Diplomacy view — filters, Hugbox Detection, and the major-powers default are refinements, not requirements for a demoable diagram.

### Incremental Delivery

1. Setup + Foundational → Diplomacy tab exists, shows empty state against a real save.
2. Add US1 → full diagram with hover-isolate → validate → demo (MVP).
3. Add US2 → relationship-type filters → validate → demo.
4. Add US4 → Hugbox Detection overlay → validate → demo (independent of US3).
5. Add US3 → major-powers default/show-all → validate → demo.
6. Polish (Phase 7) → constitution/quickstart sign-off.

### Suggested Team Split (if parallelized)

- Developer A: US1 (core chart), then US2 (filters, needs US1's chart to wire into).
- Developer B: US4's `hugboxClustering.ts` algorithm + its unit tests (T022/T023) — startable right after Foundational, independent of the chart's existence until T024-T026's UI wiring.
- Developer C: US3's ranking function (T027) — same early-start property as US4's algorithm.

## Notes

- [P] tasks = different files or independent concerns, no ordering dependency.
- [Story] label maps task to specific user story for traceability.
- No task in this feature touches `.specify/memory/` or requires a Complexity Tracking entry — plan.md's Constitution Check found no unjustified deviations.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.

## Post-ship additions (2026-09-22, explicit user requests, no new task numbers)

All 32 tasks above were complete before this round of live-testing-driven
fixes; these were done as direct edits rather than new tracked tasks (see
research.md §9 for full rationale/derivation on each):

- **Bounded/on-demand queries**: `listDiplomaticRelationsArrow`/
  `listRelationTrustArrow` now take `nationIdxs` and scope to the current
  selection instead of fetching save-wide (perf fix — the diagram was slow).
- **Relationship types widened** from 4 to 8: added `military_access`,
  `food_access`, `fleet_basing_rights`, `economic_support`.
- **`is_one_way` direction**: new `diplomatic_relations` column, drives a
  directional arrowhead on one-way chords.
- **`opinion_score`**: new `nation_relation_trust` column, derived sum of
  `timed_biases.Opinion[]`/`Antagonism[]`, shown in the hover tooltip.
- **`amount`**: new `diplomatic_relations` column (economic_support's ducat
  grant only), shown in the hover tooltip.
- **Hugbox Detection**: `economic_support` now counts alongside `alliance`
  for the clique-pair filter.
- **Two rendering bugs fixed**: nodes could paint above/below chords
  inconsistently (fixed via `zlevel` separation) and chord endpoints could
  misalign with node centers (fixed via one shared `geometry` object instead
  of two independently-measured ones) — see `specs/debug_images/fix this.png`.
