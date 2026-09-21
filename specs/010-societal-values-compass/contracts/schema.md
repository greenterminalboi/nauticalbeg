# Contract: schema.sql additions

One new table, following the existing `nation_history` long-format
convention exactly (see `src/storage/schema.sql:71-78`).

> Post-ship correction (spec addendum point 7): a `great_powers` table
> was originally added here too, populated from
> `great_power_manager.members`. The user asked for great-power status
> to be dropped from this feature entirely; the table, its parsing, and
> its query were all removed.

```sql
-- specs/010-societal-values-compass: one row per (nation, axis) where the
-- axis is currently applicable to that country. A missing row for a given
-- (nation_idx, axis) pair means "not applicable" (research.md) — the raw
-- save's -999 sentinel is filtered out at ingest, never stored.
CREATE TABLE IF NOT EXISTS nation_societal_values (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  axis TEXT NOT NULL, -- e.g. 'centralization_vs_decentralization'
  value DOUBLE NOT NULL -- raw reading, roughly -100..+100
);
CREATE INDEX IF NOT EXISTS idx_nation_societal_values_nation_axis
  ON nation_societal_values (nation_idx, axis);
```

**Consumer contract**: any query joining these tables to `nations` MUST
filter `nations.country_type = 'Real'` and the `EXISTS (SELECT 1 FROM
locations WHERE locations.owner_idx = nations.idx)` liveness check, matching
`listLatestNationMetricArrow` (`src/storage/queries.ts:499`) — the same
"is this country alive" gate every other per-country query in this codebase
already applies.
