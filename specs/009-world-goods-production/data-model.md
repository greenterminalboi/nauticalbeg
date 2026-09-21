# Data Model: World Goods Production Share

## `province_good_production`

One row per (province, good) the save's `last_month_produced` records —
sparse, only for provinces/goods actually producing something.

| Column | Type | Notes |
|---|---|---|
| `province_idx` | `INTEGER NOT NULL` | Logically REFERENCES `provinces(idx)`. `INTEGER` per research.md — matches `provinces.idx`'s existing type. |
| `good` | `TEXT NOT NULL` | The save's raw good key, surfaced as-is. |
| `amount` | `DOUBLE NOT NULL` | The save always populates a `last_month_produced` entry with a real number once it exists for that province/good. |

Index: `idx_province_good_production_good ON province_good_production
(good, province_idx)` — the primary access pattern is "every row for
one good," mirroring `idx_market_goods_market`'s shape for the opposite
access direction.

## Derived: a good's production-share coverage

Not a stored column — computed at query time in `listWorldGoodsArrow`
(research.md's resolved decision) as `EXISTS (SELECT 1 FROM
province_good_production WHERE province_good_production.good =
world_good_production.good)`, surfaced as `has_production_coverage`
(`0`/`1`, this schema's existing boolean convention — see `007`'s
`market_goods.is_importing`/`is_exporting`).

## Query contracts

See `contracts/query-functions.md`.

## UI state / component contracts

See `contracts/ui-components.md` for `WorldGoodsPage`'s state shape and
the `ShareTreemap` rename.
