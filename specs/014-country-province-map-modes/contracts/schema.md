# Contract: Schema & Parser (014)

## `src/storage/schema.sql`

```sql
-- specs/014-country-province-map-modes: one row per
-- work_of_art_manager.database entry (research.md §2), destroyed works
-- included; owner is a country idx (confirmed against the real save).
CREATE TABLE IF NOT EXISTS works_of_art (
  idx INTEGER PRIMARY KEY,
  owner_idx INTEGER,        -- logically REFERENCES nations(idx)
  type TEXT,
  quality DOUBLE,
  location_idx INTEGER,     -- logically REFERENCES locations(idx)
  destroyed_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_works_of_art_owner ON works_of_art (owner_idx);
```

No `ALTER` to existing tables.

## `src/parser/version-adapters/1.3.11.ts`

- Add `"work_of_art_manager"` to `STRUCTURED_KEYS`, so it is no longer written to `raw_sections`.
- Extract `root.work_of_art_manager.database` into rows `[idx, owner_idx, type, quality, location_idx, destroyed_date]` and write them with one `insertRows` call that supplies all 6 columns.
- `destroyed_date` / `creation_date` get jomini date narrowing. Store them with the adapter's existing date-to-string helper, the same way `nation_reforms.date` is stored.
- Add a `reportMilestone()` after the insert only if the progress protocol lists milestones by name. If it does, add `"works-of-art"` to that list.

## Fixture + test (constitution Principle II, written before the parser code)

- Add a minimal `work_of_art_manager={ database={ ... } }` block to `tests/fixtures/rus-1628-minimal.eu5`, copied verbatim in shape from the real save. The block must cover four cases: an owned live work, an owned *destroyed* work, an unowned work, and a work owned by a large dynamic-country idx.
- `tests/parser/adapter.test.ts`: assert those 4 rows come through with the correct `owner_idx` / `destroyed_date`, and that `raw_sections` no longer contains `work_of_art_manager`.
- `tests/schema-mapping/*`: update the inventory/classification expectations if they enumerate structured vs. raw keys.
