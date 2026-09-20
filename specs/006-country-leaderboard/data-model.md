# Data Model: Country Leaderboard

Extends `specs/001-save-import-overview/data-model.md` and
`specs/005-map-visualization/data-model.md`'s `nations` table (rather
than replacing it) and adds one new table. See research.md for the
source-field findings behind every column below.

## `nations` (extended)

One new column, additive (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
same pattern as `color_r/g/b` in feature 005):

| Column | Type | Source |
|---|---|---|
| `is_human_played` | `INTEGER DEFAULT 0` (not `NOT NULL` — DuckDB rejects a `NOT NULL` constraint on `ALTER TABLE ... ADD COLUMN`, confirmed empirically during implementation) | `1` for every country index appearing as some `played_country[*].country` in the save (research.md §5/§6) — not just the single country `is_player` already tracks. Drives the Leaderboard's default selection (spec FR-008). |

`is_player` (existing) is left untouched — still exactly one country,
still driving the existing player-name resolution elsewhere. The two
columns will usually overlap (the existing `is_player` country is
always one of the `is_human_played` countries) but are populated
independently and serve different callers.

## `nation_history` (new)

One row per `(nation, year, metric)` — chosen over one-row-per-year-
with-three-value-columns so a caller can query/aggregate a single
metric without touching the other two, and so a future metric doesn't
require a schema change:

```sql
CREATE TABLE IF NOT EXISTS nation_history (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  year INTEGER NOT NULL,       -- calendar year, per research.md §3 (1337 + array index)
  metric TEXT NOT NULL,        -- 'population' | 'tax_base' | 'economical_base'
  value DOUBLE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nation_history_nation_metric
  ON nation_history (nation_idx, metric, year);
```

| Column | Type | Source |
|---|---|---|
| `nation_idx` | `INTEGER`, logically REFERENCES `nations(idx)` | The country index this row belongs to (loop key, same as every other per-country table). |
| `year` | `INTEGER` | `1337 + array_index` for that entry (research.md §3). Not stored as an in-game date string (unlike `save_meta.in_game_date`) since these are always full-year granularity, never month/day. |
| `metric` | `TEXT` | One of the three metrics named in research.md §1: `'population'` ← `historical_population`, `'tax_base'` ← `historical_tax_base`, `'economical_base'` ← `historical_economical_base`. |
| `value` | `DOUBLE` | The array entry's raw numeric value — no unit conversion, no derived/estimated adjustment (constitution Principle IV). |

**Leading-zero rows are still inserted** — the "don't plot before the
country existed" rule (research.md §8) is a presentation-layer decision
applied when reading this table, not a filter applied when populating
it; the raw parsed value belongs in the table regardless of how the UI
chooses to draw it, consistent with Principle IV (don't silently drop
parsed data — the constitution's own example of what's forbidden).

**Row volume**: up to 2,470 countries × ~293 years × 3 metrics ≈ 2.1M
rows in the worst case (every country slot, not just `Real` ones, has
these arrays present — confirmed in research.md §1 sampling). In
practice, only `country_type = 'Real'` countries are ever queried
(research.md §4), and typically only a small selected subset within
those; no upfront filtering is applied at parse time (consistent with
how `population`/other large per-entity tables are already loaded in
full per feature 004), but query-time filtering (below) always scopes
to selected country indices, never a full-table scan for display.

## Parser adapter addition (`src/parser/version-adapters/1.3.11.ts`)

Within the existing `nationRows` extraction loop (the same loop already
reading `tag`/`treasury`/`color` from `countryDatabase[idxStr]`):

- A new `asNumberArray` helper (mirrors the existing `asStringArray`,
  `src/parser/version-adapters/1.3.11.ts:98-100`) reads
  `record.historical_population` / `historical_tax_base` /
  `historical_economical_base` as `number[]`, filtering to actual
  `number` entries only (defensive against a malformed/absent array,
  same posture as every other `asXOrNull`/`asXArray` helper in this
  file).
- For each of the three arrays, for each index `i` with a value, push
  `[idx, 1337 + i, '<metric>', value]` into a `nationHistoryRows`
  accumulator, inserted via one `insertRows(db, "INSERT INTO
  nation_history ...", nationHistoryRows)` call after the existing
  `nations` insert (same batching pattern already used for
  `nationRows`/`provinceRows`/etc.).
- The existing `playerIdx` line (`asNumberOrNull(playedCountryEntries[0]
  .country)`, kept as-is for `is_player`) gains a sibling: `const
  humanPlayedIdxs = new Set(playedCountryEntries.map((e) =>
  asNumberOrNull(e.country)).filter((n): n is number => n !== null))`,
  and the `nationRows` push sets the new `is_human_played` column from
  `humanPlayedIdxs.has(Number(idxStr)) ? 1 : 0`.

## UI-facing read shape

The Leaderboard queries this data as one Arrow batch per graph load
(matching feature 005's `listMapLocationsArrow` load-everything-needed-
up-front pattern, not a per-country/per-point call), shaped as:

```ts
interface LeaderboardSeriesPoint {
  nationIdx: number;
  year: number;
  value: number;
}
interface LeaderboardCountry {
  idx: number;
  tag: string;
  name: string | null;
  color: [number, number, number] | null; // null → neutral fallback (spec FR-005)
  isHumanPlayed: boolean;
}
```

**Treemap-specific shape** (added post-implementation, stretch goal —
`listLatestNationMetricArrow` decoded by `leaderboardData.ts`'s
`loadLatestNationMetric` into a plain `Map<number, number>`, nation idx
→ latest value; `LeaderboardTab.tsx` then cross-references that map
against the shared selection to build):

```ts
interface LeaderboardTreemapEntry {
  id: number | "other";
  label: string;
  color: [number, number, number] | null; // "Other" uses the same neutral fallback constant, not a special case
  value: number;
}
```

One entry per selected country present in the latest-metric map, plus
(when non-empty) one synthetic `id: "other"` entry summing every
present-but-unselected country's value — spec's **World Metric Total**
entity is simply the sum of every entry's `value` here, computed
client-side, never stored.

See `contracts/leaderboard-data-contract.md` for the exact query
functions and SQL.
