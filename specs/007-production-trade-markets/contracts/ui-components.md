# UI Component Contracts

## `MarketsTab` (state owner)

Mirrors `MapTab`/`LeaderboardTab`'s existing lift-state-to-the-tab pattern
(research.md §2). Owns:

```ts
const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null);
const [selectedGoodId, setSelectedGoodId] = useState<string | null>(null);
```

Selecting a different market clears `selectedGoodId` (a good selection
only makes sense within its market). Renders, always: `WorldGoodsOverview`
and `MarketList` (User Story 1, no selection required). Conditionally:
`MarketGoodsTable` when `selectedMarketId !== null` (User Story 2);
`MarketGoodPriceChart` when both are set (User Story 3).

## `MarketList`

```ts
interface MarketListProps {
  db: SaveDatabase;
  selectedMarketId: number | null;
  onSelectMarket: (marketId: number) => void;
}
```

`PerspectiveViewer` over `listMarketsArrow`, columns `[idx, name,
member_count, capacity]` (`idx` visible, not hidden — Perspective's
`config.columns` controls the view's actual output, with no
queried-but-hidden concept, and the click payload only carries whatever
columns are listed there; `idx` is the callback's payload, so it has to
be one of them), default sort by `name`. Row selection resolved during
implementation: `@perspective-dev/react`'s `PerspectiveViewer` has a
documented `onClick` prop subscribing to the underlying element's own
`"perspective-click"` event, whose `detail.row` is that row's
`View.to_json()` keyed by `config.columns` (source-confirmed against
`@perspective-dev/viewer-datagrid`, not the research-flagged risk this
contract originally anticipated).

## `WorldGoodsOverview`

```ts
interface WorldGoodsOverviewProps {
  db: SaveDatabase;
}
```

`PerspectiveViewer` over `listWorldGoodsArrow`, columns `[good, total]`,
default sort by `total` descending. No selection — informational only.

## `MarketGoodsTable`

```ts
interface MarketGoodsTableProps {
  db: SaveDatabase;
  marketId: number;
  selectedGoodId: string | null;
  onSelectGood: (good: string) => void;
}
```

`PerspectiveViewer` over `listMarketGoodsArrow(db, marketId)`, re-queried
in a `[db, marketId]`-keyed effect (same `cancelled`-guard idiom as
`loadNationHistory`). Same new-plumbing note as `MarketList` for
row-selection.

## `useEChartsInstance` (new shared hook)

`src/components/Overview/charts/useEChartsInstance.ts`. Consumed by all
three chart components (`MarketGoodPriceChart`, retrofit `LeaderboardChart`,
retrofit `LeaderboardTreemap`).

```ts
function useEChartsInstance(
  containerRef: RefObject<HTMLDivElement>,
  option: EChartsOption | null,
): void
```

Owns: `echarts.init(container)` on mount, `chart.setOption(option)` on
every `option` change (memoized by the caller), a `ResizeObserver` calling
`chart.resize()`, and `chart.dispose()` on unmount. Callers own building
their own `option` object from their existing data shape — this hook is
lifecycle-only, no chart-type-specific logic.

## `MarketGoodPriceChart`

```ts
interface MarketGoodPriceChartProps {
  db: SaveDatabase;
  marketId: number;
  good: string;
}
```

Builds a single-series ECharts line `option` from
`listMarketGoodPriceHistoryArrow(db, marketId, good)` (decoded via a new
`marketData.ts` helper, mirroring `leaderboardData.ts`'s Arrow-decode
pattern): `xAxis: { type: "time" }`, `series: [{ type: "line", data: [[date, price], ...] }]`,
`tooltip: { trigger: "axis" }` for FR-008's point-inspection requirement.
An empty history renders ECharts' own empty-state (no series data), not a
fabricated flat line.

## `LeaderboardChart` (retrofit, data shape unchanged)

`LeaderboardChartSeries`/`LeaderboardSeriesPoint` from `leaderboardData.ts`
are untouched — only the render internals change. New `option` building:
one ECharts `series` entry per `LeaderboardChartSeries`, `itemStyle.color`
set from each series' literal `color` (falls back to ECharts' default
palette when `color` is `null`, matching the current SVG version's
neutral-color fallback). `dataZoom` (type `"inside"` + a slider) replaces
the hand-rolled wheel-zoom/click-drag-pan code. `tooltip: { trigger: "axis" }`
replaces the custom nearest-point hover math.

## `LeaderboardTreemap` (retrofit, entries shape unchanged)

`LeaderboardTreemapEntry[]` is untouched. New `option`: a single
`series: [{ type: "treemap", data: [...] }]`, one data node per entry with
`itemStyle.color` set from the entry's literal `[r,g,b]` (converted to a
CSS color string) — this is the exact capability the file's own doc
comment says Perspective's Treemap plugin lacks, confirmed available on
ECharts before committing to this retrofit (research.md §3). `label`
shows each entry's `label` + `formatShare` percentage, matching current
behavior.
