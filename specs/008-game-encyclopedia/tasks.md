# Tasks: Game Encyclopedia

**Scale note**: Oversized change. Spans a new offline generation tool
(`tools/encyclopedia-scraping/`), a new save-independent static data
layer (`public/encyclopedia/`), and a new UI section
(`src/components/Overview/Encyclopedia*.tsx`) — no other feature in
this project touches all three. The Foundational phase does the one-
time, non-story-sliceable work (the generation pipeline itself and
running it once against the real game install); every user-story phase
after it is UI work consuming already-generated data, since the
generation mechanism proven in Foundational/User Story 1 is generic
across all ~124 categories and needs no story-specific rework.

**Input**: plan.md, spec.md, data-model.md, research.md, contracts/encyclopedia-data-contract.md

## Phase 1: Setup

- [x] **T001** [P] Add `generate:encyclopedia` npm script (mirrors `generate:map`/`schema-map`) · `package.json`
- [x] **T002** [P] Shared types matching data-model.md (`Manifest`, `DomainGroup`, `CategoryMeta`, `ExcludedCategory`, `EncyclopediaEntry`, `EntrySource`, `CrossReference`, `SearchIndexRow`) · `tools/encyclopedia-scraping/types.ts`
- [x] **T003** [P] Fixture files for generation-tool tests: 2 tiny definition `.txt` files across 2 fake categories (one entry with a field that references the other category's entry, for cross-ref tests), one malformed `.txt`, one localization `.yml` (a key with a `_desc` pair, a key with no `_desc`, a key with no localization at all), one fixture shaped like an excluded/technical category, one fixture shaped like a `dlc/` folder · `tests/fixtures/encyclopedia/**`

## Phase 2: Foundational

**Files**: `tools/encyclopedia-scraping/{categories,parse-definitions,parse-localization,resolve-cross-refs,write-output,generate}.ts`, `src/components/Overview/encyclopediaData.ts`, `public/encyclopedia/**`

No user-story work begins until this phase is done: every story's UI
reads `public/encyclopedia/*.json`, which doesn't exist until this
phase generates and commits it.

**Wave 1 — independent (different files):**

- [x] **T004** [P] `categories.ts`: the full category→domain-group table for every folder under `game/in_game/common/` (~124) plus `game_concepts` (under `main_menu/common/`), each mapped to one of the five domain group ids or `excluded: true` with a one-line reason (research.md §3). Cross-check against the official `ENCYCLOPEDIA_PAGE_*` list in `main_menu/localization/english/encyclopedia_l_english.yml` (research.md §8): use the game's own page label as `CategoryMeta.label` where a category matches one · `tools/encyclopedia-scraping/categories.ts`
- [x] **T005** [P] `parse-definitions.ts`: parse a category's `.txt` files via `jomini`'s `parseText` (reuse pattern from `src/parser/version-adapters/1.3.11.ts`), skip and record a file that fails to parse rather than aborting (FR-013) · `tools/encyclopedia-scraping/parse-definitions.ts`
- [x] **T006** [P] `parse-localization.ts`: merge every `localization/english/*.yml` file into one global key → `{name, description}` map, `_desc`-suffixed keys pair with their base key (research.md §2) · `tools/encyclopedia-scraping/parse-localization.ts`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T007** `resolve-cross-refs.ts`: given all parsed entries, find fields whose value matches another entry's key and record a `CrossReference` (resolved when the target exists in the generated catalog, unresolved otherwise) (research.md §7, FR-008) · `tools/encyclopedia-scraping/resolve-cross-refs.ts`
- [x] **T008** `write-output.ts`: emit `manifest.json`, `search-index.json`, and one `<category>.json` per included category, per data-model.md's shapes; enforces `(category, key)` uniqueness (FR-014) · `tools/encyclopedia-scraping/write-output.ts`
- [x] **T009** `generate.ts` CLI: wires T004–T008 together, `--install <path>` / `--out <dir>` args (mirrors `tools/map-generation/generate.ts`), scans `<install>/dlc/*` and tags every entry's `EntrySource` accordingly (FR-010), exits non-zero with a clear message when `--install` isn't a valid game root (FR-012) · `tools/encyclopedia-scraping/generate.ts`

**⟶ Wait for T009, then:**

- [x] **T010** [P] `encyclopediaData.ts` client loading interface: `loadManifest`, `loadSearchIndex`, `loadCategory` (in-memory cached), `findEntry` (contracts/encyclopedia-data-contract.md) · `src/components/Overview/encyclopediaData.ts`
- [x] **T011** Run `npm run generate:encyclopedia -- --install <local game path>` and commit the full output: `manifest.json`, `search-index.json`, and every included category's JSON, covering all five domain groups (FR-006/FR-007) · `public/encyclopedia/**`

**Checkpoint**: Foundational data pipeline complete. Full dataset generated and committed; nothing user-facing yet.

## Phase 3: User Story 1 - Look up Economy & Production reference entries (P1)

**Files**: `src/components/Overview/{EncyclopediaSection,EncyclopediaDomainNav,EncyclopediaCategoryList,EncyclopediaEntryView,EncyclopediaSourceBadge}.tsx`, `src/components/Overview/FileLoader.tsx`

Goal: Economy & Production is browsable with real names, descriptions,
and mechanical fields, proving the whole scrape → store → browse
pipeline end to end.

**Independent Test**: Open Encyclopedia → Economy & Production; confirm
goods, building categories, building types, production methods, prices,
and pop types all list real entries with real display names.

### Tests

- [x] **T012** [P] [US1] `parse-definitions.ts` unit tests against T003's fixtures: real entries extracted with correct fields; malformed file skipped and recorded, not aborting the run · `tests/encyclopedia-scraping/parse-definitions.test.ts`
- [x] **T013** [P] [US1] `parse-localization.ts` unit tests: name/`_desc` pairing; a key with no matching localization resolves to `null` (never fabricated) (FR-004) · `tests/encyclopedia-scraping/parse-localization.test.ts`
- [x] **T014** [P] [US1] `write-output.ts` unit test: two entries in different categories sharing a key stay distinguishable by `(category, key)` (FR-014) · `tests/encyclopedia-scraping/write-output.test.ts`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T015** [P] [US1] `EncyclopediaDomainNav.tsx`: five domain-group tabs and their category sub-list, from `loadManifest()` · `src/components/Overview/EncyclopediaDomainNav.tsx`
- [x] **T016** [P] [US1] `EncyclopediaCategoryList.tsx`: one category's entries, name-with-raw-key-fallback, virtualized/paginated for large categories (Constitution Principle V) · `src/components/Overview/EncyclopediaCategoryList.tsx`
- [x] **T017** [P] [US1] `EncyclopediaEntryView.tsx`: one entry's name, description, and a fields table exactly as recorded (FR-005); renders `crossRefs` as plain text for now (User Story 3 upgrades to links) · `src/components/Overview/EncyclopediaEntryView.tsx`
- [x] **T018** [P] [US1] `EncyclopediaSourceBadge.tsx`: small "Base Game" / named-DLC label, non-color-only (Constitution Principle VI) · `src/components/Overview/EncyclopediaSourceBadge.tsx`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T019** [US1] `EncyclopediaSection.tsx`: composes Nav/List/EntryView, defaults to opening Economy & Production · `src/components/Overview/EncyclopediaSection.tsx`
- [x] **T020** [US1] Wire `activeSection === "encyclopedia"` to render `EncyclopediaSection` instead of `ComingSoonPlaceholder`, unconditionally (no loaded-save gate) · `src/components/Overview/FileLoader.tsx`

**Checkpoint**: User Story 1 independently functional — Economy & Production is fully browsable with real data, raw-key fallback works, no save required.

## Phase 4: User Story 2 - Browse the rest of the game's reference catalog (P2)

**Files**: none new. `EncyclopediaDomainNav`/`EncyclopediaCategoryList`/`EncyclopediaEntryView` are already category-agnostic (data-model.md's `EncyclopediaEntry` shape is identical for every category), so this phase is verification that the Phase 3 mechanism genuinely covers the rest of the catalog, not new implementation.

Goal: every domain group is browsable and every reference category is
accounted for (browsable or explicitly excluded), matching research.md
§3's "additive coverage over the same pipeline, not new mechanics."

**Independent Test**: Open each of the four remaining domain groups and
confirm real entries render; confirm every category present in the base
game's files appears in `manifest.json`'s `domainGroups` or
`excludedCategories`, never neither.

### Tests

- [x] **T021** [P] [US2] Manifest completeness test: every category id found by scanning a fixture install's category folders appears in exactly one of `domainGroups`/`excludedCategories` (FR-007, SC-001) · `tests/encyclopedia-scraping/write-output.test.ts`
- [x] **T022** [P] [US2] UI test: `EncyclopediaDomainNav` + `EncyclopediaCategoryList` render real entries for a fixture manifest/category payload from each of the four non-Economy domain groups · `tests/components/EncyclopediaDomainNav.test.tsx`

### Verification

- [x] **T023** [US2] Manual verification per quickstart.md step 4: open Government & Society, Culture/Religion/Characters, Military & Diplomacy, and World & Events against the real generated data; confirm a DLC-sourced entry (if the local install has any DLC) shows its source badge outside Economy & Production too

**Checkpoint**: User Story 2 independently functional — the full catalog is browsable and accounted for.

## Phase 5: User Story 3 - Cross-reference and search across the whole Encyclopedia (P3)

**Files**: `src/components/Overview/{EncyclopediaEntryView,EncyclopediaSearch,EncyclopediaSection}.tsx`

Goal: an entry's references to other entries are clickable links, and a
single search box finds any entry by name or key from anywhere in the
Encyclopedia.

**Independent Test**: Open an entry with a known cross-reference and
confirm it's a working link; use search to jump to a known entry from a
different domain group than the one open.

### Tests

- [x] **T024** [P] [US3] `resolve-cross-refs.ts` unit tests: a reference to an existing entry resolves; a reference to an excluded/DLC-absent entry does not (FR-008) · `tests/encyclopedia-scraping/resolve-cross-refs.test.ts`
- [x] **T025** [P] [US3] `EncyclopediaSearch` component test: matches by display name and by internal key, across categories/domain groups (FR-009) · `tests/components/EncyclopediaSearch.test.tsx`

### Implementation

**Wave 1 — independent (different files):**

- [x] **T026** [P] [US3] `EncyclopediaSearch.tsx`: global search box over `loadSearchIndex()`, eagerly loaded once, in-memory filter by name/key, jumps to the matched entry (spec SC-002: 2 interactions or fewer) · `src/components/Overview/EncyclopediaSearch.tsx`
- [x] **T027** [P] [US3] Update `EncyclopediaEntryView.tsx`: render `crossRefs` as working links when `resolved: true` (fetches the target category via `loadCategory` if not cached), plain text otherwise · `src/components/Overview/EncyclopediaEntryView.tsx`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T028** [US3] Wire `EncyclopediaSearch` into `EncyclopediaSection.tsx`, always visible (not scoped to the currently open domain group) · `src/components/Overview/EncyclopediaSection.tsx`

**Checkpoint**: User Story 3 independently functional — cross-references are clickable and global search works from anywhere in the Encyclopedia.

## Phase 6: Polish

- [x] **T029** Run the full test and lint suites; validate against spec Success Criteria SC-001–SC-005 per quickstart.md · `npm test`, `npm run build`
- [x] **T030** [P] Confirm zero committed icon/art files via quickstart.md §5's `git ls-files` check (SC-003, FR-011)

## Dependencies & Execution Order

- **Phase 1 (Setup) → Phase 2 (Foundational) → Phase 3 (US1, P1) → Phase 4 (US2, P2) → Phase 5 (US3, P3) → Phase 6 (Polish)**, strictly in that order — every story phase after Foundational depends on `public/encyclopedia/**` existing (T011), and User Story 3's cross-reference links depend on User Story 1's `EncyclopediaEntryView` existing (T017).
- **Phase 2 waves**: Wave 1 (T004, T005, T006 — independent, different files) → Wave 2 (T007, T008, T009 — each depends on the prior finishing) → Wave 3 (T010, T011 — depend on T009's CLI existing).
- **Phase 3 waves**: Tests (T012–T014, independent) run before or alongside Wave 1 (T015–T018, independent components) → Wave 2 (T019, T020 — depend on Wave 1's components existing).
- **Phase 4**: T021/T022 (tests) and T023 (manual verification) have no file dependencies on each other; all three can run in any order once Phase 3 is checkpointed.
- **Phase 5 waves**: Tests (T024, T025, independent) alongside Wave 1 (T026, T027, independent) → Wave 2 (T028, depends on T026 existing).
- **Phase 6**: T029 and T030 are independent; both depend on every prior phase being complete.
