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

## `WorldGoodsOverview` (extended)

```ts
interface WorldGoodsOverviewProps {
  db: SaveDatabase;
  selectedGood: string | null;
  onSelectGood: (good: string, hasProductionCoverage: boolean) => void;
}
```

**Implementation-time refinement**: `onSelectGood` carries the clicked
row's `has_production_coverage` alongside `good`, since it's already a
column in the click payload — `WorldGoodsPage` then needs no separate
`decodeWorldGoods` fetch/lookup just to answer "is this good covered,"
which also removes a real async race (selecting a good before that
separate list finishes loading). `has_production_coverage` remains a
real grid column for FR-005's visible marker regardless.

`PerspectiveViewer` over `listWorldGoodsArrow`, columns `["good",
"total", "has_production_coverage"]` (the third column is the visible
coverage marker — FR-005). Row-selection-to-callback via the same
`onClick`/`"perspective-click"` pattern `MarketList`/`MarketGoodsTable`
already established (007's resolved risk) — the click payload needs
`good` in `config.columns`, which it already is.

## `WorldGoodsPage` (new, state owner)

```ts
interface WorldGoodsPageProps {
  db: SaveDatabase;
}
```

Owns `selectedGood: string | null` and `selectedGoodCoverage: boolean`,
both set together from `onSelectGood`'s two arguments — no separate
`decodeWorldGoods` fetch needed (see the refinement note above). Always
renders `WorldGoodsOverview`. When `selectedGood` is set:
- `selectedGoodCoverage === true`: fetches
  `listGoodProductionByOwnerArrow(db, selectedGood)` (via a new
  `decodeGoodProductionByOwner` helper in `marketData.ts`), builds
  `ShareTreemapEntry[]` by joining against `loadLeaderboardCountries`'s
  result (research.md), and renders `<ShareTreemap title={selectedGood}
  entries={entries} />`.
  **Legibility at scale (FR-009)**: after the real-country/Unattributed
  split above, sort real countries descending by amount; the top
  `MAX_INDIVIDUAL_PRODUCERS` (a constant, 15 — enough to show every
  major producer of a typical good without degenerating into dozens of
  sliver boxes) get their own entry, and every real country beyond that
  cutoff folds into one further `"Other producers"` entry (`id:
  "other-producers"`), summed — a second, distinct bucket from
  `"unattributed"`, so a viewer can tell "many small real countries"
  apart from "no real owner" at a glance. Below the cutoff (typically
  the case), no such bucket appears at all — never an empty
  "Other producers" box.
- Otherwise: renders a plain message — "Production-share data isn't
  available for `<good>` yet" — never a blank or fabricated treemap
  (FR-004).

## `ShareTreemap` (renamed from `LeaderboardTreemap`)

No prop or behavior change — same `title: string` /
`entries: readonly ShareTreemapEntry[]` (renamed from
`LeaderboardTreemapEntry`, same shape: `{id: number | "other" | "unattributed", label, color, value}`)
signature the component already had. `LeaderboardTab.tsx` updates its
import path only; its own entries-building logic (the wealth-share
"Other" bucket) is untouched.
