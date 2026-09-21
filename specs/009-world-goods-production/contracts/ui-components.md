# UI Component Contracts

## `MarketsTab` (extended)

```ts
interface MarketsTabProps {
  db: SaveDatabase;
  activeView: MarketsView;
}
```

**Post-ship follow-up (2026-09-21)**: `activeView` is a prop, not state
`MarketsTab` owns itself. The initial ship put the World Goods/Markets
switch in a top-of-content button group inside `MarketsTab` (mirroring
`LeaderboardTab.tsx`'s internal `activeView`/`VIEWS` chart-type toggle);
moved instead to the shell's side nav (`MarketsSideNav`, wired into
`FileLoader.tsx` exactly like `LeaderboardSideNav`/`activeMetric`), since
it's a primary page switch, not a secondary axis like Leaderboard's own
graph/ranking/treemap toggle — this project's convention reserves the
side nav for the former.

Renders either `<WorldGoodsPage db={db} />` (`activeView === "worldGoods"`)
or the existing Markets-list-and-drill-down block (`MarketList` +
conditional `MarketGoodsTable` + conditional `MarketGoodPriceChart`,
unchanged internally) for `"markets"`. The existing
`selectedMarketId`/`selectedGoodId` state stays exactly as it is today —
`WorldGoodsPage` owns its own, separate `selectedGood`.

## `MarketsSideNav` (new, post-ship follow-up)

```ts
type MarketsView = "worldGoods" | "markets";
interface MarketsSideNavProps {
  activeView: MarketsView;
  onSelectView: (view: MarketsView) => void;
}
```

Mirrors `LeaderboardSideNav` exactly (`.side-nav`/`.side-nav__list`/
`.side-nav__item` styles, `grid-area: sidenav` box treatment). Owned and
rendered by `FileLoader.tsx` (`showMarketsNav`, same `isFactbook &&
encyclopediaTab === "markets" && isReady && !!readDbRef.current` gate
as `showLeaderboardNav`), mutually exclusive with the other side navs.

## `WorldGoodsOverview` — removed (post-ship, 2026-09-21)

The always-visible `listWorldGoodsArrow` data grid, and its
row-selection-to-callback wiring, are gone — replaced by `GoodSelect`
below, on explicit user request ("get rid of the datatable"). The file,
its CSS, and its test are deleted.

## `GoodSelect` (new, post-ship follow-up)

```ts
interface GoodSelectProps {
  goods: readonly string[];
  selectedGood: string;
  onSelectGood: (good: string) => void;
}
```

A single-select searchable combobox — same search-a-filtered-list
interaction `CountrySearchOverlay` established for Leaderboard, but
single-select and self-closing on a pick rather than staying open. Pure
presentation: `WorldGoodsPage` is the one that scopes `goods` to only
the RGOs (goods with `hasProductionCoverage`), so a good without a
production-share breakdown is never offered in the first place — this
is now how the coverage boundary is made visible (FR-005/FR-004),
superseding the old grid's `has_production_coverage` column and the old
per-selection "not available" message.

## `WorldGoodsPage` (state owner, revised)

```ts
interface WorldGoodsPageProps {
  db: SaveDatabase;
}
```

Loads `decodeWorldGoods(db)` once on mount (`goods: WorldGood[]`).
`selectedGood` defaults to `"wheat"` if it has coverage, else the first
covered good — set once `goods` loads, from `goods.filter(g =>
g.hasProductionCoverage)`. Renders `GoodSelect` scoped to that same
covered list, the selected good's world total (from the already-loaded
`goods`, no extra fetch) next to it, and — on selecting a good — fetches
`listGoodProductionByOwnerArrow(db, selectedGood)` (via
`decodeGoodProductionByOwner`) and joins against
`loadLeaderboardCountries`'s result (research.md) to build
`ShareTreemapEntry[]`, rendering `<ShareTreemap title={selectedGood}
entries={entries} />`. `buildEntries`'s legibility-at-scale logic
(FR-009: top 15 individual producers + a distinct "Other producers"
bucket beyond that, separate from "Unattributed") is unchanged. If no
good in the save has coverage at all, renders a plain message instead
of `GoodSelect`/`ShareTreemap` — the only remaining "not available"
case, now a save-wide edge case rather than a per-selection one.

## `ShareTreemap` (renamed from `LeaderboardTreemap`)

No prop or behavior change — same `title: string` /
`entries: readonly ShareTreemapEntry[]` (renamed from
`LeaderboardTreemapEntry`, same shape: `{id: number | "other" | "unattributed", label, color, value}`)
signature the component already had. `LeaderboardTab.tsx` updates its
import path only; its own entries-building logic (the wealth-share
"Other" bucket) is untouched.

**Post-ship follow-up (2026-09-21)**: `squareRatio: 1` (a boxier
layout) and a per-box drop shadow/border via ECharts' `itemStyle`, plus
its canvas sizing to `min(70vh, 44rem)` instead of a fixed `20rem` —
applied here in the shared component, so Leaderboard's own treemap use
gets the same visual treatment as World Goods', not a per-caller
option.

**Post-ship follow-up (2026-09-21, same day)**: `title` prop removed
entirely. Whatever selected the entries being shown (`GoodSelect` for
World Goods, the Leaderboard side nav for Leaderboard's treemap) already
displays that label, so a repeated one inside the treemap box was
redundant. The container's own padding is gone too — the canvas now
fills `.share-treemap` edge to edge (`overflow: hidden` clips it to the
container's rounded corners).
