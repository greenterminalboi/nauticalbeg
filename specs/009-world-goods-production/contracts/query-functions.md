# Query Function Contracts

## `listWorldGoodsArrow` (extended, not a new function)

```ts
export async function listWorldGoodsArrow(db: SaveDatabase): Promise<ArrayBuffer>
```

Existing signature, unchanged. New SQL:

```sql
SELECT
  world_good_production.good AS good,
  world_good_production.total AS total,
  EXISTS (
    SELECT 1 FROM province_good_production
    WHERE province_good_production.good = world_good_production.good
  ) AS has_production_coverage
FROM world_good_production
ORDER BY good
```

`has_production_coverage` is DuckDB's native boolean from `EXISTS`
(unlike `market_goods.is_importing`/`is_exporting`, which had to be
`INTEGER` for `insertRows`' bulk-insert path — this is a `SELECT`, not
an insert, so no such constraint applies). `marketData.ts`'s
`decodeWorldGoods` narrows it defensively regardless (`typeof r.has_production_coverage
=== "boolean" ? r.has_production_coverage : Number(r.has_production_coverage) === 1`,
since Arrow's JS boolean round-trip has occasionally needed this
defensive narrowing elsewhere in this codebase).

## `listGoodProductionByOwnerArrow`

```ts
export async function listGoodProductionByOwnerArrow(db: SaveDatabase, good: string): Promise<ArrayBuffer>
```

```sql
SELECT
  provinces.owner_idx AS owner_idx,
  SUM(province_good_production.amount) AS amount
FROM province_good_production
JOIN provinces ON provinces.idx = province_good_production.province_idx
WHERE province_good_production.good = ?1
GROUP BY provinces.owner_idx
```

No join to `nations` — deliberately (research.md's resolved decision).
`owner_idx` can be `NULL` (DuckDB groups `NULL` as its own group,
correctly). Feeds `WorldGoodsPage`'s treemap: the page joins each row
against the already-loaded `loadLeaderboardCountries` result
client-side, bucketing any `owner_idx` that's `NULL` or not found in
that `country_type = 'Real'`-filtered list into one "Unattributed"
entry, mirroring `LeaderboardTab.tsx`'s existing Other-bucket logic
exactly.
