# Contract: `listMapLocationsArrow` extension (014)

Signature unchanged: `listMapLocationsArrow(db: SaveDatabase): Promise<ArrayBuffer>`. It is still called exactly once per save by `loadMapLocationDataset` (FR-021).

## Added result columns

All existing columns and `ORDER BY locations.idx` are unchanged. The added columns are listed in data-model.md § "Extended: map location row".

## Shape of the added SQL

```sql
WITH
live_owners AS (SELECT DISTINCT owner_idx FROM locations WHERE owner_idx IS NOT NULL),
latest AS (                                   -- research.md §3
  SELECT nation_idx, metric, arg_max(value, year) AS value
  FROM nation_history
  WHERE metric IN ('population','economical_base')
    AND nation_idx IN (SELECT owner_idx FROM live_owners)
  GROUP BY nation_idx, metric),
literacy AS (                                 -- research.md §7
  SELECT l.owner_idx,
         SUM(p.size * p.literacy) / NULLIF(SUM(p.size), 0) AS value
  FROM location_pops lp
  JOIN locations l ON l.idx = lp.location_idx
  JOIN population p ON p.idx = lp.pop_idx
  WHERE l.owner_idx IS NOT NULL AND p.literacy IS NOT NULL AND p.size > 0
  GROUP BY l.owner_idx),
advances AS (SELECT nation_idx, COUNT(*) AS n FROM nation_advances GROUP BY nation_idx),
art AS (SELECT owner_idx, COUNT(*) AS n FROM works_of_art
        WHERE owner_idx IS NOT NULL AND destroyed_date IS NULL GROUP BY owner_idx),
flags AS (SELECT EXISTS (SELECT 1 FROM nation_advances) AS advances_ok,
                 EXISTS (SELECT 1 FROM works_of_art)    AS art_ok),
province_totals AS (                          -- research.md §8
  SELECT l.province_idx,
         SUM(l.development)  AS development,
         SUM(l.possible_tax) AS tax_base,
         SUM(l.soldiers)     AS soldiers,
         SUM(CASE WHEN l.development IS NOT NULL THEN COALESCE(pt.total_population, 0) END) AS population
  FROM locations l LEFT JOIN pop_totals pt ON pt.location_idx = l.idx
  WHERE l.province_idx IS NOT NULL
  GROUP BY l.province_idx)
```

`pop_totals` is promoted from the existing inline subquery to a CTE so the location columns and the province totals share it.

The per-row count expressions:

```sql
CASE WHEN locations.owner_idx IS NULL OR NOT flags.advances_ok THEN NULL
     ELSE COALESCE(advances.n, 0) END AS owner_advances
```

`owner_works_of_art` follows the same pattern.

## Tests (`tests/storage/map-locations.test.ts`)

Run against the fixture after it gains a works-of-art block (contracts/schema.md). The tests assert:

- Two locations with the same owner return identical `owner_*` values.
- Two locations in the same province return identical `province_*` values.
- `owner_works_of_art` excludes the destroyed work and the unowned one.
- An unowned location returns NULL for every `owner_*` column.
- An owned country with no advances returns `0`, and with `nation_advances` emptied returns `NULL`.
- A province whose locations all have NULL development returns NULL `province_development` and NULL `province_population`.
- `owner_population` equals the latest-year value, not the maximum.
