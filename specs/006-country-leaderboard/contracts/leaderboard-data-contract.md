# Contract: `storage/queries.ts` additions + schema additions (Leaderboard data-access interface)

Extends `specs/001-save-import-overview/contracts/data-access-contract.md`
and `specs/005-map-visualization/contracts/map-data-contract.md` rather
than replacing them — every existing function is unchanged. This
feature adds two new query functions, one new parser-time population
step, and one new table, all read-only against the already-open,
main-thread connection (per 001's `readDbRef` pattern) — nothing here
ever writes to the save's database after import.

## Schema additions (see `data-model.md` for full field lists/rationale)

- `ALTER TABLE nations ADD COLUMN IF NOT EXISTS is_human_played INTEGER DEFAULT 0;` (not `NOT NULL` — DuckDB rejects a `NOT NULL` constraint on `ALTER TABLE ... ADD COLUMN`, confirmed empirically)
- ```sql
  CREATE TABLE IF NOT EXISTS nation_history (
    nation_idx INTEGER NOT NULL,
    year INTEGER NOT NULL,
    metric TEXT NOT NULL,
    value DOUBLE NOT NULL
  );
  ```
- `CREATE INDEX IF NOT EXISTS idx_nation_history_nation_metric ON nation_history (nation_idx, metric, year);`

Applied on every database open, not just first creation, matching
feature 005's precedent (research.md §6 there) so a save kept before
this feature shipped gains the new column/table instead of erroring. A
kept save's `nation_history` will be empty until re-imported — see
Consumer contract below for how callers must handle that.

## Parser adapter addition (`src/parser/version-adapters/1.3.11.ts`)

The existing `nationRows` extraction loop (already reading
`tag`/`treasury`/`color` from `countryDatabase[idxStr]`) gains:

- A new `asNumberArray` helper (mirrors `asStringArray`) reads
  `record.historical_population` / `historical_tax_base` /
  `historical_economical_base`.
- A new `nationHistoryRows` accumulator, populated per country per
  metric per array index with a value (data-model.md's `1337 + index`
  year mapping), inserted via one batched `INSERT INTO nation_history`
  call after the existing `nations` insert.
- `is_human_played` set from a new `humanPlayedIdxs` set built from
  **every** `playedCountryEntries[*].country` (not just entry `[0]`,
  which is all the existing `is_player`/`playerIdx` logic uses) —
  `is_player` itself is unchanged.

## New query functions

| Function | Returns | Backing query |
|---|---|---|
| `listLeaderboardCountriesArrow(db: SaveDatabase): Promise<ArrayBuffer>` | Arrow IPC buffer, one row per selectable country: `{ idx, tag, name, color_r, color_g, color_b, is_human_played }` | `SELECT idx, tag, name, color_r, color_g, color_b, is_human_played FROM nations WHERE country_type = 'Real' ORDER BY COALESCE(name, tag)` — same `country_type = 'Real'` filter as the existing nation selector (`queries.ts:155`, research.md §4), extended with the three color columns and the new flag. Backs both the search overlay's list and the initial default-selection computation (client-side: rows where `is_human_played = 1`). |
| `listNationHistoryArrow(db: SaveDatabase, nationIdxs: number[]): Promise<ArrayBuffer>` | Arrow IPC buffer, one row per `(nation, year, metric)` for the requested countries only: `{ nation_idx, year, metric, value }` | `SELECT nation_idx, year, metric, value FROM nation_history WHERE nation_idx IN (...) ORDER BY nation_idx, metric, year` — scoped to the caller's current selection (unlike `listMapLocationsArrow`'s save-wide load, `nation_history` can be a few-million-row table across the whole save per data-model.md's volume note, so this one is deliberately **not** load-everything-up-front; it's re-queried each time the selected-country set changes). |

## Consumer contract (what the Leaderboard page may assume)

- Call `listLeaderboardCountriesArrow` once per save load to populate
  the search overlay and compute the default selection
  (`is_human_played = 1` rows) — this result does not change for the
  lifetime of the loaded save (Principle I: read-only import).
- Call `listNationHistoryArrow` with the current selected-country-idx
  list whenever that selection changes (initial default selection,
  then again on every search-overlay add/remove). Not paginated — bound
  by the number of currently selected countries, which in the observed
  reference save's default selection is ~23 countries × ~293 years × 3
  metrics ≈ 20K rows, well within a single query/render cycle.
- `color_r/g/b` follow the same all-null-or-all-present convention as
  feature 005 (research.md §3 there) — a row with all three `NULL` uses
  the app's existing neutral fallback color (spec FR-005), never a
  fabricated color.
- `listNationHistoryArrow` itself returns **every** row, leading zeros
  included — it is a faithful, unfiltered read of `nation_history`
  (data-model.md's "leading-zero rows are still inserted" decision).
  Leading-zero suppression (research.md §8) is applied client-side, by
  `leaderboardData.ts`'s `suppressLeadingZeros` (a pure function over
  the decoded points, tested independently of the query — see
  `tests/components/leaderboardData.test.ts`), not in SQL. A consumer
  calling the raw query function directly (bypassing `leaderboardData.ts`)
  MUST NOT assume leading zeros have already been filtered out; a
  consumer using `leaderboardData.ts`'s loader gets suppression for free
  and MUST treat a missing year as "not yet existing" (no point
  plotted), never as an implicit zero.
- A save kept/re-opened from before this feature shipped will return an
  empty `nation_history` result (table exists via the additive
  migration, but has no rows until the save is re-imported) — the
  Leaderboard page must show its empty/placeholder state (spec FR-011)
  in that case, the same as the "no save loaded" case, rather than
  erroring.
