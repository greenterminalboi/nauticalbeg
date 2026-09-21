# Query Function Contracts

New functions in `src/storage/queries.ts`, following this file's existing
`list*Arrow(db, ...params): Promise<ArrayBuffer>` convention
(`queryArrowIPC` under the hood, positional `?1`/`?2` params, no
client-supplied sort/filter — grids handle that themselves via
PerspectiveViewer, charts via their own data shape).

## `listWorldGoodsArrow`

```ts
export async function listWorldGoodsArrow(db: SaveDatabase): Promise<ArrayBuffer>
```

`SELECT good, total FROM world_good_production ORDER BY good`. Feeds
`WorldGoodsOverview` (User Story 1). No params — save-wide, unfiltered.

## `listMarketsArrow`

```ts
export async function listMarketsArrow(db: SaveDatabase): Promise<ArrayBuffer>
```

Returns one row per market: `idx`, a derived `name`, `member_count`,
`capacity`. Name derivation mirrors `listProvincesArrow`'s existing
location-naming pattern, with one extra fallback layer for markets with no
resolvable center at all:

```sql
SELECT
  markets.idx AS idx,
  COALESCE(provinces.name, 'Location ' || locations.idx, 'Market ' || markets.idx) AS name,
  markets.member_count AS member_count,
  markets.capacity AS capacity
FROM markets
LEFT JOIN locations ON locations.idx = markets.center_location_idx
LEFT JOIN provinces ON provinces.idx = locations.province_idx
ORDER BY markets.idx
```

Feeds `MarketList` (User Story 1).

## `listMarketGoodsArrow`

```ts
export async function listMarketGoodsArrow(db: SaveDatabase, marketIdx: number): Promise<ArrayBuffer>
```

`SELECT good, price, supply, demand, stockpile, is_importing, is_exporting,
supply_raw_materials, supply_buildings, supply_trade, demand_population,
demand_trade, demand_building_upkeep, demand_unit_upkeep,
demand_construction FROM market_goods WHERE market_idx = ?1 ORDER BY good`.
Empty result set (a market with zero traded goods — 2 of 184 in the
reference save) is a valid, non-error response. Feeds `MarketGoodsTable`
(User Story 2).

## `listMarketGoodPriceHistoryArrow`

```ts
export async function listMarketGoodPriceHistoryArrow(
  db: SaveDatabase,
  marketIdx: number,
  good: string,
): Promise<ArrayBuffer>
```

`SELECT date, price FROM market_good_price_history WHERE market_idx = ?1
AND good = ?2 ORDER BY date`. Feeds `MarketGoodPriceChart` (User Story 3).
Empty result (a good with no recorded history for this market) renders as
an empty-state chart, not a zero-filled one (FR-011/SC-003).
