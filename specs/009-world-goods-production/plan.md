# Implementation Plan: World Goods Production Share

**Branch**: `009-world-goods-production` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-world-goods-production/spec.md`

**Scale note**: this feature spans a new parser extraction, a new storage
table plus two query changes, a component rename (`LeaderboardTreemap` →
`ShareTreemap`, since it is now shared by two unrelated features), a new
page-level component, and a navigation restructuring inside
`MarketsTab.tsx`. ~13 source files and ~8 test files. A reader auditing
this plan should watch two things: the `ShareTreemap` rename (mechanical,
but touches `LeaderboardTab.tsx`'s import) and how the "unattributed
production" bucket is computed (client-side, reusing `loadLeaderboardCountries`'s
existing `country_type = 'Real'` filter — no new nations query).

## Summary

Promotes World Goods from a block always stacked inside `MarketsTab` to
its own switchable page under Markets, and adds a production-share
treemap: selecting a good with coverage shows one box per producing
country, sized by its share of that good's summed production. Technical
approach: extend the parser's existing `provinces` extraction to also
capture `last_month_produced` (a real, populated per-province
production-by-good field this app has read but never stored) into a
new `province_good_production` table; a good "has coverage" is derived
dynamically from whether it appears in that table at all, never a
hardcoded list. The treemap reuses `007-production-trade-markets`'s
`LeaderboardTreemap` component (renamed `ShareTreemap` — it was already
generic, title + entries, with no Leaderboard-specific logic inside it)
and mirrors `LeaderboardTab.tsx`'s exact client-side "join countries,
bucket the rest as Other" pattern for the unattributed-production case.

## Project Structure

### Documentation (this feature)

```
specs/009-world-goods-production/
├── plan.md              # this file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── contracts/            # Phase 1 output (UI/query contract)
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```
src/
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts          # extend the existing provinces loop: also extract last_month_produced -> province_good_production rows
├── storage/
│   ├── schema.sql              # add province_good_production table + index
│   └── queries.ts               # add listGoodProductionByOwnerArrow; extend listWorldGoodsArrow with a derived has_production_coverage column
└── components/
    └── Overview/
        ├── marketData.ts          # extend WorldGood with hasProductionCoverage; add decodeGoodProductionByOwner
        ├── WorldGoodsOverview.tsx  # add onSelectGood/selectedGoodId + a visible coverage column (row-click reuses MarketList's onClick/perspective-click pattern)
        ├── WorldGoodsPage.tsx      # new: owns selectedGood, renders WorldGoodsOverview + (covered -> ShareTreemap | uncovered -> "not available" message)
        ├── WorldGoodsPage.css
        ├── ShareTreemap.tsx        # renamed from LeaderboardTreemap.tsx -- unchanged behavior, generic title+entries props
        ├── ShareTreemap.css        # renamed from LeaderboardTreemap.css
        ├── LeaderboardTab.tsx      # import path update only (ShareTreemap)
        ├── MarketsTab.tsx          # add activeView ("worldGoods" | "markets") + a VIEWS button-group toggle, mirroring LeaderboardTab.tsx's exact pattern
        ├── MarketsTab.css          # add the view-toggle styles (mirrors .leaderboard-tab__view-toggle)
        └── charts/
            └── useEChartsInstance.ts  # doc-comment update only (mentions ShareTreemap, not LeaderboardTreemap)

tests/
├── fixtures/
│   └── rus-1628-minimal.eu5   # add one produced_goods entry with NO matching last_month_produced, to exercise the no-coverage branch (the fixture's two provinces already carry real last_month_produced data from an earlier feature)
├── parser/
│   └── adapter.test.ts         # extend: last_month_produced -> province_good_production rows
├── storage/
│   └── good-production.test.ts # new: listGoodProductionByOwnerArrow + listWorldGoodsArrow's has_production_coverage column
└── components/
    ├── marketData.test.ts         # extend: hasProductionCoverage, decodeGoodProductionByOwner
    ├── WorldGoodsOverview.test.tsx # extend: coverage column, onSelectGood
    ├── WorldGoodsPage.test.tsx     # new
    ├── ShareTreemap.test.tsx       # renamed from LeaderboardTreemap.test.tsx, import path only
    ├── LeaderboardTab.test.tsx     # import path update only
    └── MarketsTab.test.tsx         # rewritten: activeView toggle replaces "both always visible"
```

**Structure Decision**: Single-project structure, unchanged from
`007-production-trade-markets`. No new top-level directory — this
feature extends the existing `src/components/Overview/` Markets
component group and the existing `provinces` parser extraction, rather
than introducing a new subsystem.

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS — parses already-loaded save bytes in-browser like every existing section; no new persistence beyond the existing per-save DuckDB database. |
| II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE) | PASS — `last_month_produced` extraction ships with a regression test in `tests/parser/adapter.test.ts`, written before the extraction logic; the fixture already carries real `last_month_produced` data on both its province entries (added incidentally by an earlier feature), so only one small fixture addition (an uncovered `produced_goods` entry) is needed. |
| III. Explicit Format-Version Compatibility | PASS — reuses the existing `"1.3.11"` adapter; `provinces` is already a `STRUCTURED_KEYS` section, no new version-detection logic. |
| IV. Accurate, Unembellished Representation | PASS, with explicit rules carried from the spec: a good's coverage flag is derived from real table contents, never a hardcoded/guessed list (FR-005); a country with zero production never appears as a box (FR-007); unattributed production is a distinct, honestly-labeled bucket, never dropped or misattributed to a real country (FR-008); a country with no confirmed color uses the existing neutral fallback (FR-006). |
| V. Performance & Scalability for Large Saves | PASS — `province_good_production` is bounded by (provinces × goods each produces), the same order of magnitude as `market_goods` from 007; well within this app's demonstrated scale (`nation_history`'s ~2.1M rows). |
| VI. Visualization Clarity & Accessibility | PASS — reuses `ShareTreemap` (ex-`LeaderboardTreemap`)'s existing accessible hover/inspect pattern and literal-per-country-RGB convention; goods/countries identified by name/key, never color-only. |
| VII. Simplicity & Incremental Scope | PASS — explicitly scopes to the 52 of 71 goods `last_month_produced` actually covers, deferring the other 19 (manufactured/building outputs) to a future feature rather than speculatively ingesting `building_manager` (138,516 rows, already excluded from 007 on the same grounds) to chase them now. Reuses `ShareTreemap`/`useEChartsInstance`/the client-side-join-and-bucket pattern rather than writing new equivalents. |
| VIII. Grounded AI Query Agent | PASS — not applicable; no AI-agent-facing surface. |

No violations; Complexity Tracking table omitted.
