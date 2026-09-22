# Phase 1 Data Model: Firepower Tab

## Design note: static reference data lives in code, not the database

The Unit Type Reference, Unit Unlock Reference, and Modifier Source
Reference (research.md §3-5) are **game-version-fixed lookup tables**, not
per-save data — they're generated once from the local game install (same
process as `rgoGameColors.ts`) and committed as TS/JSON, per the
constitution's Encyclopedia-data exception. They are loaded in-memory by
the query layer and joined against per-save rows in application code, not
duplicated into DuckDB tables. This keeps the ~90-entry Modifier Source
Reference (a small, code-shaped "which stat does this source contribute
to and by how much" lookup) readable as data, not as a giant SQL CASE
expression, consistent with Constitution Principle VII (simplicity).

## New/extended database entities

### `regiments` (new table)

One row per `subunit_manager.database` entry (a regiment or ship) —
source for Army/Navy Stats' counts, morale, and levy/regulars split (via
join to the static Unit Type Reference on `unit_type`).

| Column      | Type    | Source                                             |
|-------------|---------|-----------------------------------------------------|
| idx         | BIGINT  | subunit_manager.database key (PK; confirmed to exceed INT32 — sibling unit_manager ids like `2818572288` already do, same index space) |
| owner_idx   | INTEGER | `.owner` — logically REFERENCES nations(idx)       |
| unit_type   | TEXT    | `.type` (e.g. `a_heavy_cavalrymen`, `n_carrack`)   |
| morale      | DOUBLE  | `.morale`                                          |
| number      | DOUBLE  | `.number` (headcount or ship count)                |
| strength    | DOUBLE  | `.strength` — army only; NULL for navy rows (field absent in the save for navy subunits, never fabricated as 0 or 1) |

Not captured (out of scope for this feature, no FR needs them):
`controller`, `unit` (parent stack), `experience`, `home`, `culture`,
`religion`, `box`, `missing`, `attrition_losses_per_month` — dropping
these keeps the table to exactly what Army/Navy Stats consume (Principle
VII); a future feature needing unit-stack/movement data adds them then.

Indexed on `(owner_idx, unit_type)` for the grouped-aggregate query
pattern (research.md §2).

### `nation_advances` (new table)

One row per (nation, researched advance) — from
`countries.database[idx].researched_advances` (a flat boolean-flag
object; only `=yes` entries produce a row, matching the
`nation_societal_values` "-999 → no row" convention).

| Column      | Type    | Source            |
|-------------|---------|-------------------|
| nation_idx  | INTEGER | (implicit, the containing country) |
| advance     | TEXT    | the flag's key, e.g. `unlock_pikemen_advance` |

Indexed on `(nation_idx, advance)`. Feeds both the Unit Unlock Reference
join (age columns) and the Modifier Source Reference join (advance-type
sources for the 5 computed stats).

### `nation_reforms` / `nation_privileges` (new tables)

One row per (nation, implemented government reform / estate privilege) —
from `country.government.implemented_reforms` /
`.government.implemented_privileges` (each a flat list of `{date, days,
object}` entries; all entries are currently-active — EU5 government
reforms/privileges accumulate rather than replace, confirmed by the
sample real-save record showing 15+ simultaneous `implemented_reforms`
entries for one country).

| Column      | Type    | Source                                    |
|-------------|---------|---------------------------------------------|
| nation_idx  | INTEGER | (implicit)                                  |
| object      | TEXT    | `.object` — the reform/privilege id         |
| date        | TEXT    | `.date`, EU5 "Y.M.D" display format (matches `wars.start_date`'s existing convention) |

Same shape for both tables. Indexed on `(nation_idx, object)`.

### `nation_laws` (new table)

One row per (nation, active law choice) — from the newly-discovered
`country.government.implemented_laws` (research.md §6), grouped by law
category rather than a flat list; exactly one active choice per category
at any time (a new choice in the same category replaces the row, per the
save's own structure — no history to preserve here, unlike
reforms/privileges).

| Column       | Type    | Source                                          |
|--------------|---------|---------------------------------------------------|
| nation_idx   | INTEGER | (implicit)                                         |
| law_category | TEXT    | the containing key, e.g. `recruitment_law`         |
| object       | TEXT    | `.object` — the active choice id, e.g. `expanded_levies_policy` |
| date         | TEXT    | `.date`                                            |

Indexed on `(nation_idx, law_category)`.

### `war_unit_losses` (new table, widens existing `sumLosses()` logic)

One row per (war, side, unit category) — preserves the category-level
breakdown that `sumLosses()` (in `1.3.11.ts`) currently collapses into
`wars.attacker_casualties`/`defender_casualties`. Needed for Navy Stats'
damage given/taken (research.md §8: filter to `navy_%`-prefixed
categories, roll up across all of a country's wars).

| Column     | Type    | Source                                                |
|------------|---------|--------------------------------------------------------|
| war_idx    | BIGINT  | (implicit — same BIGINT convention as `wars.idx`)       |
| side       | TEXT    | `'attacker'` \| `'defender'`                            |
| category   | TEXT    | the losses map's key, e.g. `army_heavy_infantry`, `navy_transport` |
| battle     | DOUBLE  | `.Battle`                                                |
| attrition  | DOUBLE  | `.Attrition`                                             |
| capture    | DOUBLE  | `.Capture`                                                |

`wars.attacker_casualties`/`defender_casualties` continue to be derived
the same way as before (sum across every category for that side) — this
table is additive, not a replacement, so feature 008's existing Wars tab
is unaffected. Indexed on `(war_idx, side)`.

### `nations` (extend existing table)

New nullable column, needed only for the culture/region-gate check on
unique unit unlocks (spec Edge Cases):

| Column               | Type    | Source                          |
|----------------------|---------|-----------------------------------|
| primary_culture_idx  | INTEGER | `country.primary_culture` (confirmed present, e.g. `primary_culture=1262`) — logically REFERENCES cultures(idx) |

### `cultures` (extend existing table)

New nullable column:

| Column         | Type | Source                                                |
|----------------|------|--------------------------------------------------------|
| culture_group  | TEXT | resolved from the game's `common/cultures/*.txt` (culture definitions are grouped by file/section — confirmed the directory structure exists; exact per-culture group assignment is a task-level detail, not yet fully walked) |

**Known accepted simplification** (documented, not silent): country-specific
unlock advances (the ~42 scattered files in research.md §5) are already
implicitly scoped correctly since only that country's tag can ever
research them — the `researched_advances=yes` flag alone is authoritative
for those. Only a smaller subset — *culture-group*-gated unique unlocks
(not country-locked) — actually need the `primary_culture_idx` →
`culture_group` join to avoid over-crediting a unit to a country outside
that culture group. If a specific unlock's exact `potential=` gate proves
more complex than a simple culture-group check during implementation
(tasks.md), the fallback is to leave that one specific unlock ungated
(same over-inclusion-only risk as the general case) rather than block the
whole feature on it — flagged here so it isn't a silent scope cut later.

## Derived/computed views (query-layer, not stored)

### Army Stat Summary (per nation with ≥1 army regiment)

Computed at query time from `regiments` (filtered `unit_type LIKE 'a\_%'`,
grouped by `owner_idx`) joined against `nations.currency_data`-sourced
columns (`manpower`, `monthly_manpower`, `army_tradition`,
`last_months_army_maintenance` — already planned as existing/extended
`nations` columns per the currency_data fields research.md's earlier pass
confirmed) plus the five computed stats (sum of matching
`nation_advances`/`nation_reforms`/`nation_privileges`/`nation_laws`/
`nation_societal_values` rows against the static Modifier Source
Reference) plus the four age columns (max age among `nation_advances`
rows matching the static Unit Unlock Reference for each of
Artillery/Infantry/Cavalry/Supply, gated by the Unit Type Reference's
`category`).

### Navy Stat Summary (per nation with ≥1 ship regiment)

Same shape, `unit_type LIKE 'n\_%'`, plus `war_unit_losses` rolled up
across `wars` where the nation is `attacker_idx`/`defender_idx` for
damage given/taken.

## Key Entities *(spec cross-reference)*

Restates spec.md's Key Entities section with the concrete tables above:
Army Stat Summary → `regiments` + `nation_advances`/`nation_reforms`/
`nation_privileges`/`nation_laws`/`nation_societal_values` + Modifier
Source Reference; Navy Stat Summary → same + `war_unit_losses`; Unit Type
Reference / Unit Unlock Reference / Modifier Source Reference → static
code data (see design note above), not database tables.
