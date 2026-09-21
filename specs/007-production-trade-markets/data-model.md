# Data Model: Production, Trade & Markets

Field mappings and rationale for each decision below are in research.md
§1–2. All new tables follow this codebase's existing conventions: nullable
columns for anything the save may not populate (never a fabricated `0`/`""`
— constitution Principle IV, FR-011), no enforced `REFERENCES` (DuckDB
dialect note already established in `schema.sql`), `-- logically
REFERENCES` comments for documentation.

## `markets`

One row per market (`market_manager.database.*`, 184 in the reference
save).

| Column | Type | Notes |
|---|---|---|
| `idx` | `INTEGER PRIMARY KEY` | The `database` object's own key. Small (184-entry) index space — `INTEGER` per research.md's resolved BIGINT-vs-INTEGER question, not `BIGINT`. |
| `center_location_idx` | `INTEGER` (nullable) | Logically REFERENCES `locations(idx)`. NULL when the save's own `center` field is absent (the spec's explicit no-resolvable-center edge case) — never a fabricated location. |
| `member_count` | `INTEGER` (nullable) | Length of the save's member-location list for this market, computed at extraction. Only the count is stored (no FR reads individual member locations — see research.md's scope decision). |
| `capacity` | `DOUBLE` (nullable) | From the save's `capacity` field. |

Index: none needed beyond the primary key — 184 rows, always read as a
full/filtered list, never joined at scale.

## `market_goods`

One row per (market, good) pair the market **actually trades** — a market
with no `goods` sub-object in the save (2 of 184) contributes zero rows,
not zero-value rows (FR-006).

| Column | Type | Notes |
|---|---|---|
| `market_idx` | `INTEGER NOT NULL` | Logically REFERENCES `markets(idx)`. |
| `good` | `TEXT NOT NULL` | The save's raw good key (e.g. `iron`), surfaced as-is per this app's existing un-localized-key precedent. |
| `price` | `DOUBLE` (nullable) | FR-004. |
| `supply` | `DOUBLE` (nullable) | FR-004, total supply — the save's own `supply` field, authoritative total (not re-derived by summing the components below). |
| `demand` | `DOUBLE` (nullable) | FR-004, total demand — the save's own `demand` field, same authoritative-total treatment as `supply`. |
| `stockpile` | `DOUBLE` (nullable) | FR-004. |
| `is_importing` | `INTEGER` 0/1 (nullable) | From save's `import`; NULL when the save doesn't populate it for this market/good, never coerced to `0`. No native BOOLEAN column exists anywhere in this schema (`nations.is_player` sets the 0/1 precedent) — also required by `insertRows`' bulk Arrow-insert path, which only accepts string/number/null per row. |
| `is_exporting` | `INTEGER` 0/1 (nullable) | From save's `export`, same NULL handling. |
| `supply_raw_materials` | `DOUBLE` (nullable) | `production_supplied.RawMaterials` — FR-005 supply component. |
| `supply_buildings` | `DOUBLE` (nullable) | `production_supplied.Buildings` — FR-005 supply component. |
| `supply_trade` | `DOUBLE` (nullable) | `supplied.Trade` — FR-005 supply component. |
| `demand_population` | `DOUBLE` (nullable) | `demanded.Pops` — FR-005 demand component. |
| `demand_trade` | `DOUBLE` (nullable) | `demanded.Trade + demanded.BurgherTrades` (summed; spec has one "trade" bucket, save has two) — FR-005 demand component. |
| `demand_building_upkeep` | `DOUBLE` (nullable) | `demanded.Building` — FR-005 demand component. |
| `demand_unit_upkeep` | `DOUBLE` (nullable) | `demanded.Units` — FR-005 demand component. |
| `demand_construction` | `DOUBLE` (nullable) | `demanded.Construction` — FR-005 demand component. |

Index: `idx_market_goods_market ON market_goods (market_idx, good)` —
mirrors `idx_nation_history_nation_metric`'s covering-index pattern for
"all rows for one parent, ordered."

## `market_good_price_history`

One row per recorded price point for one (market, good) pair. Source:
`goods.<good>.history`, a bare number list with no embedded dates —
dates are computed once at extraction time (research.md's resolved
decision), not stored as raw list position.

| Column | Type | Notes |
|---|---|---|
| `market_idx` | `INTEGER NOT NULL` | Logically REFERENCES `markets(idx)`. |
| `good` | `TEXT NOT NULL` | |
| `date` | `TEXT NOT NULL` | ISO `YYYY-MM`, computed at extraction as `current_save_date - (history.length - 1 - i) months` for point `i`. To be validated against the real fixture's monthly-cadence assumption before this ships (constitution Principle II). |
| `price` | `DOUBLE NOT NULL` | The save always populates every `history` entry — no nullable case here. |

Index: `idx_market_good_price_history ON market_good_price_history
(market_idx, good, date)` — same shape as `idx_nation_history_nation_metric`.

## `world_good_production`

One row per good, the save's own world-total snapshot — read directly from
`market_manager.produced_goods.<good>`, never summed client-side from
`market_goods` (accuracy: this is a distinct save-provided figure, not
necessarily equal to a naive sum).

| Column | Type | Notes |
|---|---|---|
| `good` | `TEXT PRIMARY KEY` | |
| `total` | `DOUBLE NOT NULL` | Always present per the save (`presence: "always"`). |

## Query contracts

See `contracts/query-functions.md` for exact function signatures.

## UI state / chart contracts

See `contracts/ui-components.md` for the `MarketsTab` selection-state shape
and the three ECharts-based chart components' prop contracts
(`useEChartsInstance`, `MarketGoodPriceChart`, retrofit notes for
`LeaderboardChart`/`LeaderboardTreemap`).
