# Contract: `storage/queries.ts` addition + schema additions (Map data-access interface)

Extends `specs/001-save-import-overview/contracts/data-access-contract.md`
and `specs/002-db-technology-migration/contracts/tab-data-contract.md`
rather than replacing them — every existing function is unchanged. This
feature adds exactly one new query function and one new parser-time
population step, both read-only against the already-open, main-thread
connection `FileLoader.tsx` keeps (per 001's `readDbRef` pattern) — no
new worker-protocol message, nothing here ever writes to the save's
database.

## Schema additions (see `data-model.md` for full field lists)

- `ALTER TABLE locations ADD COLUMN IF NOT EXISTS name TEXT;`
- `ALTER TABLE locations ADD COLUMN IF NOT EXISTS raw_material TEXT;`
- `ALTER TABLE locations ADD COLUMN IF NOT EXISTS controller_idx INTEGER;`
- `ALTER TABLE locations ADD COLUMN IF NOT EXISTS control DOUBLE;`
- `ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_r INTEGER;`
- `ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_g INTEGER;`
- `ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_b INTEGER;`
- `CREATE TABLE IF NOT EXISTS location_pops (location_idx INTEGER, pop_idx BIGINT);`
- Supporting indexes: `idx_locations_controller`,
  `idx_location_pops_location` (see data-model.md). No index on `name` —
  the Map tab's own join happens client-side (decoded geometry feature
  → `MapLocationDataset` lookup, research.md §7), not via a SQL `WHERE
  name = ...`, so no query in this contract needs one.

Applied on every database open, not just first creation, so a save kept
before this feature shipped gains the new columns instead of erroring
(research.md §6). **Contract**: a caller of the query below may assume
these columns/table always exist on any successfully-opened `SaveDatabase`
from this feature onward, regardless of when that save was originally
imported — but must still treat any individual value as possibly `NULL`
(an old kept save's existing rows won't retroactively gain real data,
only the column).

## Parser adapter addition (`src/parser/version-adapters/1.3.11.ts`)

The existing `locationRows`/`nationRows` extraction loops (which already
read `owner`/`province`/`development` and `tag`/`treasury`/etc.) gain
the new fields from the same raw records, per research.md §3/§4/§5.
`name` is the one field sourced differently: `metadata.compatibility
.locations[idx - 1]`, read once per save (not per location) before the
location loop runs (research.md §1). No new `STRUCTURED_KEYS` entry — 
`metadata` is already a structured section this adapter reads. A new
loop over each location's `population.pops` list populates
`location_pops` (research.md §2) — the other genuinely new extraction
loop this feature adds.

## New query function

| Function | Returns | Backing query (see `data-model.md`) |
|---|---|---|
| `listMapLocationsArrow(db: SaveDatabase): Promise<ArrayBuffer>` | Arrow IPC buffer, one row per location: `{ idx, name, owner_idx, owner_color_r, owner_color_g, owner_color_b, owner_name, controller_idx, controller_color_r, controller_color_g, controller_color_b, controller_name, control, raw_material, total_population }` | `SELECT ... FROM locations LEFT JOIN nations owner ON owner.idx = locations.owner_idx LEFT JOIN nations controller ON controller.idx = locations.controller_idx LEFT JOIN location_pops ON location_pops.location_idx = locations.idx LEFT JOIN population ON population.idx = location_pops.pop_idx GROUP BY locations.idx, ...` — see data-model.md's full column table. `name` is the join key against the generated map geometry's `properties.name` (research.md §1); `idx` is informational only. |

**No pagination**: unlike `listProvinces`/`listMilitaryUnits` (which page
because a nation's own rows are shown in a scrollable table), this
returns the save's **entire** location set in one call — required by the
load-once-per-save decision (research.md §7, spec FR-017): the map needs
every location's data up front to render and to recolor on layer switch
without a further query. Confirmed acceptable volume: ~28,573 rows of
small scalar fields (data-model.md), the same order of magnitude
`listProvincesArrow` already returns per-nation without pagination.

**No `nationIdx` parameter**: unlike every other `list*` function in
this contract, this one is save-wide, not scoped to a selected nation —
the map shows every country's territory at once (spec User Story 1),
matching `listWarsArrow`'s existing save-wide precedent rather than the
per-nation `list*(db, nationIdx)` shape.

## Consumer contract (what the Map tab may assume)

- Calling `listMapLocationsArrow` once per save load (or first Map tab
  open) is sufficient; the result does not change for the lifetime of
  that loaded save (the save is read-only per constitution Principle I
  — nothing mutates `locations`/`nations`/`population` after import).
- `owner_color_*`/`controller_color_*` are all-`NULL`-or-all-present per
  row (never partially null) — the extraction always writes all three or
  none (research.md §3).
- `name` is the join key against the loaded map geometry asset's decoded
  `properties.name` (`public/map/locations.topojson`) — sourced from the
  save's own `metadata.compatibility.locations` array, confirmed at
  99.92%+ accuracy and 100% end-to-end resolution against a real save
  (research.md §1), so the consumer may treat a join miss as exceptional
  rather than a routine case to design around; it should still be
  handled gracefully (fall through to the neutral "no data" style, spec
  FR-009), just not expected at scale. `name` can be `NULL` if a save
  has no `metadata.compatibility.locations` block at all (unconfirmed
  whether this occurs for any real save) — that row is then unjoinable
  and skipped when building the client-side dataset.
- `idx` is informational only (`locations.idx`, the table's primary
  key) — not used for joining against the map geometry.
