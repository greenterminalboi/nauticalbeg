# Research: Production, Trade & Markets

## 1. `market_manager` save structure (confirmed against `tools/schema-mapping/inventories/Russia (Melted).json`)

`market_manager.database` is an **object keyed by market id** (small integers,
184 entries — `observedEntryCount: 184` on every field). A market entry has
**no name field at all** — every observed field is numeric/list/nested — so a
market's display name must be derived, never read.

Per-market fields relevant to this feature: `center` (a location/province id
— the market's representative location), `capacity` (number). Two markets
of the 184 (~1%) have no `goods` sub-object at all — a market with zero
traded goods is a real, valid state, not an error.

Per-good fields under `.goods.<good>` (`observedEntryCount: 182`, i.e. sparse
at the market level, not per-good):

- `price`, `supply`, `demand`, `stockpile`, `surplus` (always present numbers)
- `production_supplied.{RawMaterials, Buildings, Base}` (fixed_object, supply source breakdown)
- `supplied.{Production, BurgherTrades, Trade}` (fixed_object, ~119/182 markets — a second, overlapping supply breakdown)
- `demanded.{Pops, Trade, BurgherTrades, Building, Units, Construction}` (fixed_object, always present — demand breakdown)
- `taken.{...same sub-keys as demanded}` (~120/182 markets — actual-consumption counterpart to `demanded`'s potential figures)
- `export`, `import` (booleans, sometimes present)
- `history`: a **bare list of numbers**, always present, e.g.
  `[1.46704, 1.46751, 1.4689, ...]` — **no embedded dates**. Cadence looks
  monthly against the save clock but this is not confirmed from the
  inventory scan alone.

`market_manager.produced_goods.<good>` is a **flat scalar map** (`presence:
"always"`), e.g. `{"horses": 4789.74, "clay": 13015.70, ...}` — one
snapshot total per good, not a time series. This is the direct source for
the World Production Total entity; it is read as-is, never summed
client-side from per-market data.

`market_manager` is not in `1.3.11.ts`'s `STRUCTURED_KEYS`, so it currently
falls into the `raw_sections` catch-all. The pattern to mirror is how
`nation_history` is derived from the structured `countries` key: extraction
builds purpose-built tables from one parsed raw section, not a 1:1 dump.

## 2. Decisions

**Decision: market/good identifier columns use `INTEGER`, not `BIGINT`.**
Rationale: this codebase's precedent (`population.idx`, `wars.idx`) switches
to `BIGINT` only when a real insert against the reference save overflows
`INT32` — documented in-schema with the actual failure. Market ids are the
`database` object's own keys, a small (184-entry) index space, and `center`
sample values (e.g. `3662`) sit in the same range as existing `INTEGER`
location/province ids. `nations`/`locations`-style `INTEGER` applies; there
is no evidence of a large index space here.
Alternatives considered: default to `BIGINT` defensively — rejected because
it contradicts this codebase's explicit "prove it, then widen" convention
and there's no observed value near the `INT32` boundary.

**Decision: store only `member_count` on `markets`, not the member-location
list.** Rationale: FR-003 needs "how many locations belong to that market,"
and no other FR reads the individual member locations. A join table would
be unused surface area. Alternatives considered: normalize a
`market_members(market_idx, location_idx)` table — rejected per Simplicity
(Principle VII); nothing in spec.md reads it.

**Decision: derive a market's display name via this codebase's existing
location-naming pattern** — `COALESCE(provinces.name, 'Location ' ||
locations.idx)` (as `listProvincesArrow` already does), joined through
`markets.center_location_idx`, with one more fallback layer,
`COALESCE(..., 'Market ' || markets.idx)`, for the edge case where a market
has no resolvable `center` at all (spec's explicit edge case). This reuses
proven code rather than introducing new naming logic.

**Decision: map the spec's 3-way supply split (raw materials / buildings /
trade) to `production_supplied.RawMaterials`, `production_supplied.Buildings`,
and `supplied.Trade`.** `supplied.Production` and `supplied.BurgherTrades`
have no slot in the spec's 3-way split and are not surfaced in v1 (the save
has more granularity here than FR-005 asks for; the two extra numbers are
not fabricated, simply not displayed). Rationale: `production_supplied`'s
two keys name-match "raw materials"/"buildings" exactly; `supplied.Trade`
is the only trade-labeled supply figure. Alternatives considered: use
`supplied.{Production,BurgherTrades,Trade}` as the 3-way split instead —
rejected, "Production" and "BurgherTrades" don't correspond to "raw
materials"/"buildings" as clearly.
**To verify during fixture-backed extraction work** (Constitution Principle
II): confirm on real save data that `production_supplied.RawMaterials +
production_supplied.Buildings + supplied.Trade` is a sane decomposition of
`supply`, and adjust if the fixture shows otherwise.

**Decision: map the spec's 5-way demand split directly** —
`demanded.Pops` → population consumption, `demanded.Trade` +
`demanded.BurgherTrades` → trade (merged, since the spec has one "trade"
bucket, not two), `demanded.Building` → building upkeep, `demanded.Units`
→ unit upkeep, `demanded.Construction` → construction. This is a clean
1:1 map (unlike supply) with one deliberate merge.

**Decision: use `demanded`/`production_supplied`/`supplied` (potential
figures), not `taken` (actual-consumption, ~66% coverage), for FR-005's
decomposition.** Rationale: `demanded` is always present (182/182), `taken`
is sparser; the spec asks what's "driving" supply/demand, which the
always-present potential-side fields answer without introducing more
missing-data cases than necessary.

**Decision: price history dates are computed at extraction time, not
stored as a bare index.** The save's `history` list has no embedded dates.
Rationale: the extraction step has the save's current date available
already (`metadata` is parsed first); computing `date = current_date -
(length - 1 - i) months` once, at insert time, keeps every consumer
(query layer, UI, tests) working with real dates instead of each needing
to know the cadence/anchor convention independently.
**To verify during fixture-backed extraction work**: confirm the monthly
cadence assumption against the real fixture's `history` length vs. the
save's elapsed campaign time before shipping this computation.
Alternatives considered: store raw `seq` (list position) only, compute
dates client-side — rejected, duplicates the anchor/cadence logic in every
consumer.

**Decision: `WorldGoodsOverview` is a `PerspectiveViewer` grid, `MarketList`
is a `PerspectiveViewer` grid, but row-selection-drives-detail is new
plumbing.** No existing `PerspectiveViewer` usage in this codebase wires
row selection to app state — `WarsTab`'s own comment says detail-on-select
is "planned but out of scope" for that feature. This is a genuine
implementation risk to validate early in Phase 1 of implementation (does
`<perspective-viewer>` expose a selection/click event this app can listen
to, or does it need a custom click handler over the rendered grid).

**Decision: selection state (`selectedMarketId`, `selectedGoodId`) is owned
by a single `MarketsTab` parent component**, mirroring `MapTab`'s and
`LeaderboardTab`'s existing lift-state-to-the-tab pattern — value + setter
passed down as props to list/detail children, each selection change
triggering its own scoped `useEffect` data fetch (same `cancelled`-guard
idiom `loadNationHistory` already uses). No new state-management pattern
introduced.

## 3. Charting library switch: Apache ECharts (mid-planning user directive)

The user directed, mid-plan, that this feature is also the vehicle for
switching this app's charting/visualizations to **Apache ECharts**, keeping
`@perspective-dev/*` for data-grid tables only. Clarified with the user:
this includes retrofitting the already-shipped Leaderboard feature's charts,
not just the new price-history chart.

**Scope: three chart components, one new shared hook.**
- `MarketGoodPriceChart.tsx` (new, this feature) — single market/good price
  line series.
- `LeaderboardChart.tsx` (existing, retrofit) — multi-nation metric-over-time
  line series. Data shape (`LeaderboardChartSeries`/`leaderboardData.ts`) is
  unchanged; only the rendering internals swap from hand-rolled SVG to
  ECharts. This retires the file's custom hover math (`nearestPointIndex`
  binary search, `HOVER_RADIUS_SQ`) and manual wheel-zoom/pan handlers —
  ECharts' built-in `tooltip` + `dataZoom` components replace them outright.
- `LeaderboardTreemap.tsx` (existing, retrofit) — the file's own doc comment
  records *why* it's hand-rolled: "Perspective's own Treemap plugin has no
  way to bind a literal RGB per box, only a numeric gradient or an
  auto-assigned category palette." **ECharts' treemap supports an explicit
  per-node `itemStyle.color`**, which removes that original blocker —
  confirmed before committing to this migration, not assumed.

**Decision: use the `echarts` core package directly via a thin custom
hook, not the `echarts-for-react` wrapper package.** New file
`src/components/Overview/charts/useEChartsInstance.ts`: takes a container
`ref` and a memoized ECharts `option` object, owns `echarts.init` /
`setOption` / `ResizeObserver`-driven `.resize()` / `.dispose()` on
unmount. All three chart components consume this one hook instead of each
managing their own instance lifecycle.
Rationale: this mirrors the codebase's existing preference for owning its
own thin React-integration layer over the raw library (as it already does
for `apache-arrow`, `duckdb-wasm`) rather than adding a second dependency
whose only job is wrapping the first. `@perspective-dev/react`'s official
binding is the one exception, because Perspective ships no lower-level API
this app would otherwise hand-write against.
Alternatives considered: `echarts-for-react` — rejected as an unnecessary
extra dependency layer for what a ~40-line hook already covers, shared
across exactly the three call sites that need it.

**Constitution consequence**: this reverses spec.md's original charting
Assumption ("reuses this app's existing hand-rolled SVG charting approach,
no new charting dependency") per explicit user direction during planning.
Recorded as a justified Principle VII (Simplicity) violation in plan.md's
Complexity Tracking table, and spec.md's Assumption is corrected to match
(see spec.md diff, 2026-09-20).

## 4. Confirmed scale

- 184 markets (`market_manager.database`, all fields `observedEntryCount: 184`).
- 182 of 184 have at least one traded good; up to ~80 distinct goods
  (`produced_goods` keys) — market_goods rows are therefore low tens of
  thousands at most (182 × up to 80), well inside this app's existing scale
  (`nation_history` ~2.1M rows).
- `building_manager` (138,516 entries, independently re-derived from the
  same inventory scan) and `trade_path_manager`/`trade_manager` remain
  out of scope per spec.md's Assumptions — confirmed, not re-litigated here.
