# Tasks: Production, Trade & Markets

**Scale note**: this task list spans the parser, storage schema/query layer,
five new Markets UI components, and a mid-plan scope addition — consolidating
this app's charting on Apache ECharts, which also retrofits two
already-shipped components (`LeaderboardChart.tsx`, `LeaderboardTreemap.tsx`)
and retires `treemapLayout.ts`. 28 tasks across 6 phases. A reviewer should
watch Phase 2 (data layer, blocks everything) and Phase 6's charting
consolidation (touches shipped code, not itself a user story).

## Phase 1: Setup

- [x] **T001** Add `echarts` as a dependency · `package.json`

## Phase 2: Foundational (BLOCKS all user stories)

Files: `tests/fixtures/rus-1628-minimal.eu5`, `tests/parser/adapter.test.ts`,
`src/storage/schema.sql`, `src/parser/version-adapters/1.3.11.ts`,
`src/storage/queries.ts`, `tests/storage/markets.test.ts`,
`src/components/Overview/marketData.ts`,
`tests/components/marketData.test.ts`,
`src/components/Overview/charts/useEChartsInstance.ts`,
`tests/components/charts/useEChartsInstance.test.ts`

**Wave 1 — independent (different files):**
- [x] **T002** [P] Extend the fixture with a minimal `market_manager` block (a couple of markets, a couple of goods each, with a short `history` list) · `tests/fixtures/rus-1628-minimal.eu5`
- [x] **T003** [P] Build `useEChartsInstance` hook — `echarts.init`, `setOption` on change, `ResizeObserver`-driven `.resize()`, `.dispose()` on unmount (contracts/ui-components.md) · `src/components/Overview/charts/useEChartsInstance.ts`

**⟶ Wait for Wave 1 to finish, then:**

**Wave 2 — independent (different files):**
- [x] **T004** [P] Add `markets`, `market_goods`, `market_good_price_history`, `world_good_production` tables to schema, per data-model.md (FR-002–FR-011) · `src/storage/schema.sql`
- [x] **T005** [P] Write `useEChartsInstance.test.ts` against T003 (init, option-change re-render, dispose on unmount) · `tests/components/charts/useEChartsInstance.test.ts`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T006** Extend `1.3.11.ts`: add `market_manager` to `STRUCTURED_KEYS`, extract into `markets`/`market_goods`/`market_good_price_history`/`world_good_production` per data-model.md's field mappings and research.md §1–2 (nullable/`*OrNull` for anything the save may omit, computed `date` for price-history points) · `src/parser/version-adapters/1.3.11.ts`

**⟶ Wait for T006, then:**

**Wave 3 — independent (different files):**
- [x] **T007** [P] Extend `adapter.test.ts`: assert `market_manager` → all four tables' rows from the extended fixture, including the no-`goods`-sub-object and no-resolvable-`center` edge cases · `tests/parser/adapter.test.ts`
- [x] **T008** [P] Add `listMarketsArrow`, `listWorldGoodsArrow`, `listMarketGoodsArrow`, `listMarketGoodPriceHistoryArrow` per contracts/query-functions.md · `src/storage/queries.ts`

**⟶ Wait for Wave 3 to finish, then:**

**Wave 4 — independent (different files):**
- [x] **T009** [P] Write `tests/storage/markets.test.ts` for the four new query functions (including empty-result cases) · `tests/storage/markets.test.ts`
- [x] **T010** [P] Add `marketData.ts` Arrow-decode helpers (`decodeMarkets`, `decodeWorldGoods`, `decodeMarketGoods`, `decodeMarketGoodPriceHistory`), mirroring `leaderboardData.ts`'s decode pattern · `src/components/Overview/marketData.ts`

**⟶ Wait for Wave 4 to finish, then:**

- [x] **T011** Write `marketData.test.ts` · `tests/components/marketData.test.ts`

**Checkpoint**: data layer and shared chart hook are ready — every story
phase below can query real market data and render charts.

## Phase 3: User Story 1 - See world goods and markets at a glance (P1) 🎯 MVP

**Goal**: opening the Markets page with a save loaded shows a world goods
overview and a market list with no interaction (FR-001, FR-002, FR-003,
FR-009, FR-010).
**Independent Test**: load a save, navigate to Factbook → Markets, confirm
both lists render non-empty real data without touching any control.
Files: `src/components/Overview/FileLoader.tsx`, `MarketsTab.tsx`,
`MarketsTab.css`, `WorldGoodsOverview.tsx`, `MarketList.tsx` + their tests.

### Tests

**Wave 1 — independent (different files):**
- [x] **T012** [P] Write `WorldGoodsOverview.test.tsx` (renders grid over `listWorldGoodsArrow`, includes zero-production goods) · `tests/components/WorldGoodsOverview.test.tsx`
- [x] **T013** [P] Write `MarketList.test.tsx` (renders grid, neutral-fallback name for unresolvable center, one-member-location market is valid) · `tests/components/MarketList.test.tsx`
- [x] **T014** [P] Write `MarketsTab.test.tsx` (no-save placeholder state, both list views render together) · `tests/components/MarketsTab.test.tsx`

### Implementation

**⟶ Wait for the Tests wave to finish, then:**

**Wave 2 — independent (different files):**
- [x] **T015** [P] Build `WorldGoodsOverview.tsx` (PerspectiveViewer over `listWorldGoodsArrow`) · `src/components/Overview/WorldGoodsOverview.tsx`
- [x] **T016** [P] Build `MarketList.tsx` (PerspectiveViewer over `listMarketsArrow`, `onSelectMarket` callback prop) · `src/components/Overview/MarketList.tsx`

**⟶ Wait for Wave 2 to finish, then:**

- [x] **T017** Build `MarketsTab.tsx` (owns `selectedMarketId`/`selectedGoodId` state; always renders `WorldGoodsOverview` + `MarketList`; idle state when no save loaded) · `src/components/Overview/MarketsTab.tsx`, `src/components/Overview/MarketsTab.css`
- [x] **T018** Wire `FileLoader.tsx`: swap the `encyclopediaTab === "markets"` `ComingSoonPlaceholder` for `<MarketsTab db={...} />`, matching the Wars/Leaderboard sibling blocks · `src/components/Overview/FileLoader.tsx`

**Checkpoint**: User Story 1 is independently functional — the Markets page
shows real data with zero clicks.

## Phase 4: User Story 2 - Drill into one market's goods (P2)

**Goal**: selecting a market reveals its full per-good breakdown, with
supply/demand decomposition (FR-004, FR-005, FR-006).
**Independent Test**: select a market from the list, confirm its full
per-good table renders with price/supply/demand/stockpile/import-export.
Files: `src/components/Overview/MarketGoodsTable.tsx` + test; extends
`MarketsTab.tsx` (Phase 3) to render it on selection.

### Tests

- [x] **T019** Write `MarketGoodsTable.test.tsx` (renders breakdown with supply/demand components, a market with zero traded goods, a good not traded in a market never appears as a zero row) · `tests/components/MarketGoodsTable.test.tsx`

### Implementation

**⟶ Wait for T019, then:**

- [x] **T020** Build `MarketGoodsTable.tsx` (PerspectiveViewer over `listMarketGoodsArrow(marketId)`, `onSelectGood` callback prop) · `src/components/Overview/MarketGoodsTable.tsx`
- [x] **T021** Extend `MarketsTab.tsx`: render `MarketGoodsTable` when `selectedMarketId` is set; clear `selectedGoodId` on market change · `src/components/Overview/MarketsTab.tsx`

**Checkpoint**: User Story 2 is independently functional — selecting a
market reveals its full per-good breakdown.

## Phase 5: User Story 3 - See a good's price trend over time (P3)

**Goal**: selecting a good within a selected market shows its price
history as an inspectable chart (FR-007, FR-008).
**Independent Test**: pick a good from a market's per-good table, confirm
a price history chart renders from only the real recorded points, with
hover/inspect revealing the exact value at a point.
Files: `src/components/Overview/MarketGoodPriceChart.tsx`,
`MarketGoodPriceChart.css` + test; extends `MarketsTab.tsx`.

### Tests

- [x] **T022** Write `MarketGoodPriceChart.test.tsx` (renders line series from real history, empty-history state, a short history range is not padded/extrapolated) · `tests/components/MarketGoodPriceChart.test.tsx`

### Implementation

**⟶ Wait for T022, then:**

- [x] **T023** Build `MarketGoodPriceChart.tsx` (ECharts line chart via `useEChartsInstance`, `axisPointer`/`tooltip` for point-inspection per FR-008) · `src/components/Overview/MarketGoodPriceChart.tsx`, `src/components/Overview/MarketGoodPriceChart.css`
- [x] **T024** Extend `MarketsTab.tsx`: render `MarketGoodPriceChart` when `selectedGoodId` is set · `src/components/Overview/MarketsTab.tsx`

**Checkpoint**: User Story 3 is independently functional — the full
US1 → US2 → US3 drill-down works end to end.

## Phase 6: Polish

### Charting library consolidation (mid-plan scope addition, user-directed — research.md §3)

Files: `src/components/Overview/LeaderboardChart.tsx`,
`LeaderboardTreemap.tsx`, `treemapLayout.ts` (deleted), their tests.

**Wave 1 — independent (different files):**
- [x] **T025** [P] Retrofit `LeaderboardChart.tsx` onto ECharts via `useEChartsInstance`; drop the custom hover-math/zoom-pan code; `leaderboardData.ts` data shape unchanged; update `LeaderboardChart.test.tsx` for the same data-shape assertions · `src/components/Overview/LeaderboardChart.tsx`, `tests/components/LeaderboardChart.test.tsx`
- [x] **T026** [P] Retrofit `LeaderboardTreemap.tsx` onto ECharts' `treemap` series via `useEChartsInstance`, per-node `itemStyle.color` from each entry's literal RGB; `LeaderboardTreemapEntry` shape unchanged; update `LeaderboardTreemap.test.tsx` · `src/components/Overview/LeaderboardTreemap.tsx`, `tests/components/LeaderboardTreemap.test.tsx`

**⟶ Wait for Wave 1 to finish, then:**

- [x] **T027** Delete `treemapLayout.ts` and `treemapLayout.test.ts` (dead code once T026 lands — confirmed no other caller) · `src/components/Overview/treemapLayout.ts`, `tests/components/treemapLayout.test.ts`

### Validation

- [x] **T028** Run the full test and lint suites; verify against spec.md's Success Criteria SC-001–SC-005 · (repo-wide)

## Dependencies & Execution Order

- **Setup → Foundational → Story phases (in priority order) → Polish.**
  Each later phase depends on every phase before it.
- **Foundational** (T002–T011): Wave 1 (T002, T003) → Wave 2 (T004, T005) →
  T006 alone (needs both prior waves) → Wave 3 (T007, T008) → Wave 4
  (T009, T010) → T011 alone.
- **User Story 1** (T012–T018): Tests wave (T012–T014) → Implementation
  Wave 2 (T015, T016) → T017 (needs both) → T018 (needs T017).
- **User Story 2** (T019–T021): depends on Phase 3's `MarketsTab.tsx`
  (T017) existing. T019 → T020 → T021.
- **User Story 3** (T022–T024): depends on Phase 4's `MarketsTab.tsx`
  edits (T021) and Foundational's `useEChartsInstance` (T003). T022 → T023
  → T024.
- **Polish** (T025–T028): depends on Foundational's `useEChartsInstance`
  (T003) only, not on any story phase — could in principle run right
  after Foundational, but is sequenced last since it's cross-cutting
  cleanup, not part of this feature's user-facing increments. Wave 1
  (T025, T026) → T027 → T028 (needs everything done to validate).
