# Tasks: World Goods Production Share

**Scale note**: this task list spans a new parser extraction, a new
storage table plus two query changes, a component rename
(`LeaderboardTreemap` → `ShareTreemap`, now shared by two unrelated
features), and a navigation restructuring inside `MarketsTab.tsx`.
18 tasks across 4 phases. A reviewer should watch the rename (T003,
touches `LeaderboardTab.tsx`) and the "Other producers" vs
"Unattributed" bucket split in T016 — two distinct concepts, not one.

## Phase 1: Foundational (BLOCKS all user stories)

Files: `src/storage/schema.sql`, `tests/fixtures/rus-1628-minimal.eu5`,
`src/components/Overview/ShareTreemap.tsx`,
`src/components/Overview/ShareTreemap.css`,
`tests/components/ShareTreemap.test.tsx`,
`src/components/Overview/LeaderboardTab.tsx`,
`tests/components/LeaderboardTab.test.tsx`,
`src/components/Overview/charts/useEChartsInstance.ts`,
`src/parser/version-adapters/1.3.11.ts`, `src/storage/queries.ts`,
`tests/parser/adapter.test.ts`, `tests/storage/good-production.test.ts`,
`src/components/Overview/marketData.ts`,
`tests/components/marketData.test.ts`

**Wave 1 — independent (different files):**
- [x] **T001** [P] Add `province_good_production` table (`province_idx INTEGER NOT NULL, good TEXT NOT NULL, amount DOUBLE NOT NULL`) + `idx_province_good_production_good` index, per data-model.md · `src/storage/schema.sql`
- [x] **T002** [P] Add one `market_manager.produced_goods` entry with no matching `last_month_produced` key on either fixture province, to exercise the no-coverage branch (the fixture's two provinces already carry real `last_month_produced` data) · `tests/fixtures/rus-1628-minimal.eu5`
- [x] **T003** [P] Rename `LeaderboardTreemap` → `ShareTreemap` (component, its `.css`, its test file, `LeaderboardTreemapEntry` → `ShareTreemapEntry`); update `LeaderboardTab.tsx`'s import and `useEChartsInstance.ts`'s doc comment — mechanical, no behavior change · `src/components/Overview/ShareTreemap.tsx`, `src/components/Overview/ShareTreemap.css`, `tests/components/ShareTreemap.test.tsx`, `src/components/Overview/LeaderboardTab.tsx`, `tests/components/LeaderboardTab.test.tsx`, `src/components/Overview/charts/useEChartsInstance.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**
- [x] **T004** [P] Extend `1.3.11.ts`'s existing `provinces` extraction loop: also read `last_month_produced`, insert `province_good_production` rows (research.md §1 — the same 52-good vocabulary this feature covers) · `src/parser/version-adapters/1.3.11.ts`
- [x] **T005** [P] Extend `queries.ts`: add `has_production_coverage` to `listWorldGoodsArrow`'s SQL (research.md's `EXISTS` decision); add `listGoodProductionByOwnerArrow(db, good)` grouped by `provinces.owner_idx`, no `nations` join, per contracts/query-functions.md · `src/storage/queries.ts`

**⟶ Wait for Wave 2 to finish, then:**

**Wave 3 — independent (different files):**
- [x] **T006** [P] Extend `adapter.test.ts`: assert `province_good_production` rows from the fixture's existing `last_month_produced` data on both provinces · `tests/parser/adapter.test.ts`
- [x] **T007** [P] Write `tests/storage/good-production.test.ts`: `listWorldGoodsArrow`'s `has_production_coverage` true (a good with `last_month_produced` data) and false (T002's added entry); `listGoodProductionByOwnerArrow` sums correctly per owner and groups `NULL` (unowned) as its own row · `tests/storage/good-production.test.ts`

**⟶ Wait for Wave 3 to finish, then:**

- [x] **T008** Extend `marketData.ts`: `WorldGood.hasProductionCoverage: boolean`; add `decodeGoodProductionByOwner(db, good): Promise<{ownerIdx: number | null; amount: number}[]>` · `src/components/Overview/marketData.ts`

**⟶ Wait for T008, then:**

- [x] **T009** Extend `marketData.test.ts` for both · `tests/components/marketData.test.ts`

**Checkpoint**: data layer, `ShareTreemap` rename, and decode helpers are
ready — every story phase below can build on them.

## Phase 2: User Story 1 - World Goods as its own page (P1)

**Goal**: World Goods and Markets are two separate, switchable pages
under the Markets section (FR-001, FR-002).
**Independent Test**: from the Markets section, switch to the World
Goods page and confirm the existing good/world-total list renders
there, sortable and searchable, with the Markets list on its own
separate page.
Files: `src/components/Overview/MarketsTab.tsx`,
`src/components/Overview/MarketsTab.css` + test.

### Tests

- [x] **T010** Rewrite `MarketsTab.test.tsx` for the `activeView` toggle: World Goods is the default view; switching to Markets hides World Goods and shows the market list (and its existing drill-down), and switching back reverses it · `tests/components/MarketsTab.test.tsx`

### Implementation

**⟶ Wait for T010, then:**

**Wave 1 — independent (different files):**
- [x] **T011** [P] Extend `MarketsTab.tsx`: add `activeView: "worldGoods" | "markets"` state + a `VIEWS` button-group toggle mirroring `LeaderboardTab.tsx`'s exact pattern; `"worldGoods"` renders `WorldGoodsOverview` (unchanged props for now); `"markets"` renders the existing `MarketList` + drill-down block, unchanged · `src/components/Overview/MarketsTab.tsx`
- [x] **T012** [P] Add view-toggle styles to `MarketsTab.css`, mirroring `.leaderboard-tab__view-toggle` · `src/components/Overview/MarketsTab.css`

**Checkpoint**: User Story 1 is independently functional — World Goods
and Markets are two separate, switchable pages.

## Phase 3: User Story 2 - See a good's production share by country (P2)

**Goal**: selecting a covered good on the World Goods page shows a
real production-share treemap; an uncovered good shows an honest
"not available" message; the list itself marks which is which
(FR-003–FR-010).
**Independent Test**: on the World Goods page, select a good with
production-share coverage and confirm a treemap renders with one box
per producing country, real colors, and correct shares; select an
uncovered good and confirm the not-available message, not a blank or
fabricated treemap.
Files: `src/components/Overview/WorldGoodsOverview.tsx`,
`src/components/Overview/WorldGoodsPage.tsx`,
`src/components/Overview/WorldGoodsPage.css` + tests; extends
`MarketsTab.tsx` (Phase 2) to render `WorldGoodsPage` instead of
`WorldGoodsOverview` directly.

### Tests

**Wave 1 — independent (different files):**
- [x] **T013** [P] Extend `WorldGoodsOverview.test.tsx`: the `has_production_coverage` column renders; a row click calls `onSelectGood` with that row's `good` · `tests/components/WorldGoodsOverview.test.tsx`
- [x] **T014** [P] Write `WorldGoodsPage.test.tsx`: a covered good renders `ShareTreemap` with one entry per producing country plus an `"unattributed"` entry when applicable; a country with zero production of the good never appears; more than 15 real producers fold the smallest into one `"other-producers"` entry, distinct from `"unattributed"`; an uncovered good renders the not-available message, never a treemap · `tests/components/WorldGoodsPage.test.tsx`

### Implementation

**⟶ Wait for the Tests wave to finish, then:**

- [x] **T015** Extend `WorldGoodsOverview.tsx`: add `selectedGood`/`onSelectGood` props, `has_production_coverage` as a visible grid column, row-click via the existing `onClick`/`"perspective-click"` pattern (`MarketList`/`MarketGoodsTable`) · `src/components/Overview/WorldGoodsOverview.tsx`

**⟶ Wait for T015, then:**

- [x] **T016** Build `WorldGoodsPage.tsx` (+ `.css`): owns `selectedGood`, loads the `WorldGood[]` list once (for the coverage lookup), always renders `WorldGoodsOverview`; on a covered selection, loads `decodeGoodProductionByOwner` + `loadLeaderboardCountries`, builds `ShareTreemapEntry[]` (real countries, `"unattributed"` bucket for `NULL`/non-Real owners, `"other-producers"` bucket beyond the top 15 — research.md/contracts), renders `ShareTreemap`; on an uncovered selection, renders the not-available message · `src/components/Overview/WorldGoodsPage.tsx`, `src/components/Overview/WorldGoodsPage.css`

**⟶ Wait for T016, then:**

- [x] **T017** Wire `MarketsTab.tsx`'s `"worldGoods"` view to render `WorldGoodsPage` instead of `WorldGoodsOverview` directly · `src/components/Overview/MarketsTab.tsx`

**Checkpoint**: User Story 2 is independently functional — the full
World Goods → production-share treemap flow works end to end.

## Phase 4: Polish

- [x] **T018** Run the full test suite (`npx vitest run`), typecheck (`npx tsc --noEmit`), and production build (`npm run build`); verify against spec.md's Success Criteria SC-001–SC-004 · (repo-wide)

## Dependencies & Execution Order

- **Foundational → User Story 1 → User Story 2 → Polish.** Each later
  phase depends on every phase before it.
- **Foundational** (T001–T009): Wave 1 (T001, T002, T003) → Wave 2
  (T004, T005, both need T001's table) → Wave 3 (T006, T007) → T008
  alone → T009.
- **User Story 1** (T010–T012): T010 (tests first) → Wave 1 (T011,
  T012).
- **User Story 2** (T013–T017): depends on Foundational's `ShareTreemap`
  (T003) and decode helpers (T008), and Phase 2's `MarketsTab.tsx`
  (T011) existing. Tests wave (T013, T014) → T015 → T016 (needs T015's
  new props) → T017 (needs T016 to exist).
- **Polish** (T018): needs everything else done to validate the whole
  feature.
