# Implementation Plan: Production, Trade & Markets

**Branch**: `007-production-trade-markets` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-production-trade-markets/spec.md`

**Scale note**: this feature spans the full stack — a new parser section
(`market_manager`, currently unparsed and falling into `raw_sections`), four
new DuckDB tables, four new query functions, and five-plus new UI components
wiring into an already-reserved "Markets" nav slot. Touches
`src/parser/version-adapters/1.3.11.ts`, `src/storage/schema.sql`,
`src/storage/queries.ts`, and a new `src/components/Overview/Markets*`
component group. It also carries a mid-plan scope addition, at explicit user
direction: introducing Apache ECharts as this app's charting library and
retrofitting the already-shipped `LeaderboardChart.tsx` and
`LeaderboardTreemap.tsx` onto it alongside the new
`MarketGoodPriceChart.tsx`, via one new shared hook. A reader auditing this
plan should watch three things: the resolved BIGINT-vs-INTEGER index-width
question for market/good identifiers (research.md §2, resolved to INTEGER),
the deliberate exclusion of `building_manager` (138,516 rows in the
reference save — far larger than any table this app has ingested before)
and of `trade_path_manager`/`trade_manager` (sparse, unconfirmed semantics)
from this pass, and the ECharts dependency addition (research.md §3,
justified in Complexity Tracking below).

## Summary

Fill in the Factbook → Markets page (currently a `ComingSoonPlaceholder`)
with real per-market goods data: a world goods-production overview, a
sortable/searchable list of every market in the save, a per-market per-good
breakdown (price/supply/demand/stockpile/import-export, with supply and
demand source components), and a price-history chart per market/good pair.
Technical approach: extend the existing `1.3.11` parser adapter to ingest
`market_manager` (currently caught only by the `raw_sections` opaque-JSON
fallback) into structured `markets`, `market_goods`, `market_good_price_history`,
and `world_good_production` tables, following the exact patterns
`nations`/`nation_history` and `population` already establish; expose the
data via new `list*Arrow` query functions; and build the UI from this app's
proven `PerspectiveViewer` datagrid pattern (as `WarsTab.tsx`/`ProvincesTab.tsx`
already do) for the two sortable/searchable list views. The price-history
chart introduces **Apache ECharts** as a new dependency, rather than
extending the hand-rolled SVG approach — per explicit direction during
planning, this feature also retrofits the existing `LeaderboardChart.tsx`
and `LeaderboardTreemap.tsx` onto ECharts through one new shared
`useEChartsInstance` hook, consolidating this app onto a single charting
library (`@perspective-dev/*` stays the datagrid/table library only).

## Project Structure

### Documentation (this feature)

```
specs/007-production-trade-markets/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── contracts/            # Phase 1 output (UI/query contract)
├── quickstart.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
package.json                   # add `echarts` dependency

src/
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts          # add market_manager ingestion (STRUCTURED_KEYS + extraction, mirrors population/nation_history)
├── storage/
│   ├── schema.sql              # add markets, market_goods, market_good_price_history, world_good_production tables
│   └── queries.ts               # add listMarketsArrow, listMarketGoodsArrow, listWorldGoodsArrow, listMarketGoodPriceHistoryArrow
└── components/
    └── Overview/
        ├── FileLoader.tsx        # swap `encyclopediaTab === "markets"` ComingSoonPlaceholder for <MarketsTab db={...} />
        ├── MarketsTab.tsx         # new: owns selected-market/selected-good state, switches between the three views below
        ├── MarketsTab.css
        ├── WorldGoodsOverview.tsx # new: PerspectiveViewer over listWorldGoodsArrow (User Story 1)
        ├── MarketList.tsx         # new: PerspectiveViewer over listMarketsArrow, row-select drives MarketsTab's selected market (User Story 1)
        ├── MarketGoodsTable.tsx   # new: PerspectiveViewer over listMarketGoodsArrow for the selected market (User Story 2)
        ├── MarketGoodPriceChart.tsx   # new: ECharts line chart over listMarketGoodPriceHistoryArrow, via useEChartsInstance (User Story 3)
        ├── MarketGoodPriceChart.css
        ├── marketData.ts          # new: Arrow-IPC decode helpers, mirrors leaderboardData.ts
        ├── charts/
        │   └── useEChartsInstance.ts   # new: shared init/resize/dispose hook, consumed by all three chart components below
        ├── LeaderboardChart.tsx        # retrofit: hand-rolled SVG -> ECharts via useEChartsInstance; drops custom hover-math/zoom-pan code; leaderboardData.ts data shape unchanged
        └── LeaderboardTreemap.tsx      # retrofit: hand-rolled SVG -> ECharts treemap via useEChartsInstance (per-node itemStyle.color resolves the original Perspective-plugin blocker documented in this file)
                                         # (treemapLayout.ts's squarify() becomes dead code once this lands — deleted along with tests/components/treemapLayout.test.ts, no other caller)

tests/
├── fixtures/
│   └── rus-1628-minimal.eu5   # extend with a minimal market_manager block (a couple of markets, a couple of goods each)
├── parser/
│   └── adapter.test.ts         # extend: market_manager -> markets/market_goods/market_good_price_history/world_good_production rows
├── storage/
│   └── markets.test.ts         # new: listMarketsArrow / listMarketGoodsArrow / listWorldGoodsArrow / listMarketGoodPriceHistoryArrow
└── components/
    ├── MarketsTab.test.tsx
    ├── MarketList.test.tsx
    ├── WorldGoodsOverview.test.tsx
    ├── MarketGoodsTable.test.tsx
    ├── MarketGoodPriceChart.test.tsx
    ├── marketData.test.ts
    ├── charts/
    │   └── useEChartsInstance.test.ts   # new
    ├── LeaderboardChart.test.tsx        # updated for ECharts rendering, same data-shape assertions
    └── LeaderboardTreemap.test.tsx      # updated for ECharts rendering, same entries-shape assertions
                                          # (tests/components/treemapLayout.test.ts deleted alongside treemapLayout.ts)
```

**Structure Decision**: Single-project structure (already established by
this codebase — no backend/frontend split; DuckDB runs in-browser via
DuckDB-Wasm, parsing runs in a Worker). This feature adds one new component
group under the existing `src/components/Overview/` directory (the app's
one components root) rather than a new top-level directory, matching how
Leaderboard (006) and Map Visualization (005) were each added.

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS — parses the already-loaded save bytes in-browser like every existing section; no new file writes, no new persistence beyond the existing per-save DuckDB database. |
| II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE) | PASS, with a concrete obligation: `market_manager` ingestion MUST ship with an extended `tests/fixtures/rus-1628-minimal.eu5` (a minimal real market block) and a regression test in `tests/parser/adapter.test.ts`, written before the extraction logic, per this repo's existing pattern for every prior structured section. |
| III. Explicit Format-Version Compatibility | PASS — reuses the existing `"1.3.11"` adapter and `STRUCTURED_KEYS` gate; no new version-detection logic needed. |
| IV. Accurate, Unembellished Representation | PASS, with explicit rules carried from the spec: a good not traded in a market is never a fabricated zero row (FR-006); a market with no resolvable name uses a neutral fallback, never an invented one (FR-003); price history charts show only recorded points, never interpolated ones (FR-007/SC-003); values the save genuinely never populated render as missing, never as `0` (FR-011). |
| V. Performance & Scalability for Large Saves | PASS, with one design consequence: `market_manager.database` (184 markets in the reference save) and its per-good sub-objects (~80 goods × 184 markets ≈ low tens of thousands of rows) are well within this app's existing scale (compare `nation_history`'s ~2.1M rows), and both list views use `PerspectiveViewer`, which already virtualizes large grids (as `ProvincesTab`/`WarsTab` do today). `building_manager` (138,516 rows in the reference save) is deliberately **not** ingested by this feature — seeing that row count during research is exactly why it's out of scope (see research.md). |
| VI. Visualization Clarity & Accessibility | PASS — the price-history chart's hover/inspect comes from ECharts' built-in `tooltip`/`axisPointer`, an upgrade over the hand-rolled hover math it replaces; goods/markets/nations are identified by name/key (never color-only), matching this app's existing map/leaderboard precedent, and the treemap retrofit explicitly preserves per-country literal RGB via ECharts' `itemStyle.color`. |
| VII. Simplicity & Incremental Scope | JUSTIFIED VIOLATION (new dependency) — see Complexity Tracking. Otherwise PASS: explicitly excludes `building_manager` (huge, and already correctly out of scope per the reserved-but-unbuilt "Building Registry" nav slot) and `trade_path_manager`/`trade_manager` (sparse, real-world meaning not yet confirmed) rather than speculatively building against under-researched data. |
| VIII. Grounded AI Query Agent | PASS — not applicable; this feature adds no AI-agent-facing surface (NauticalBot remains a separate, still-unbuilt section). |

### Complexity Tracking

| Violation | Why needed | Simpler alternative rejected |
|---|---|---|
| New `echarts` dependency, where prior features (Leaderboard) established a no-new-charting-dependency, hand-rolled-SVG precedent | Explicit user direction during this feature's planning: consolidate this app's charting/visualizations onto Apache ECharts, using this feature (which needs a new price-history chart anyway) as the vehicle, and retrofit the already-shipped `LeaderboardChart.tsx`/`LeaderboardTreemap.tsx` in the same pass so the app doesn't carry two divergent hand-rolled charting implementations plus a third new one | Extend the hand-rolled SVG approach to the new price-history chart, leaving Leaderboard's charts untouched — rejected per explicit user direction; would also mean writing a *third* custom hover/zoom implementation instead of retiring the pattern entirely |
