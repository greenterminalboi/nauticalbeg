# Contract: src/storage/queries.ts additions

Military Doctrine needs **no new query** — it reuses
`listSocietalValuesArrow` unchanged (research.md §1) and filters
client-side to `land_vs_naval`/`offensive_vs_defensive`/
`quality_vs_quantity`.

Army/Navy Stats split into two query shapes, matching where the
performance-sensitive work actually is (Constitution Principle V):
`regiments` can be tens of thousands of rows and MUST be aggregated in
SQL; `nation_advances`/`nation_reforms`/`nation_privileges`/
`nation_laws` are small per-country lists (bounded to whichever
countries are currently selected, same "add a country" pattern as
Leaderboard/Markets/Compass — never all countries in the save at once)
and are reduced against the static Modifier Source Reference /
Unit Unlock Reference in the TS query/service layer, not in SQL.

```ts
/** One row per (nation_idx, unit_type) with aggregate counts, following
 * listLatestNationMetricArrow's country_type='Real' + locations-liveness
 * filter. Callers classify unit_type into category/age/isLevy via the
 * static Unit Type Reference and re-aggregate client-side — kept as one
 * shared, general grouping rather than two near-duplicate army/navy
 * queries, since both sub-tabs need the same shape. */
export async function listRegimentSummaryArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer>; // columns: nation_idx, unit_type, regiment_count, total_number, avg_morale (count-weighted)

/** One row per (nation_idx, source_kind, source_name) for every
 * currently-active advance/reform/privilege/law of the given countries —
 * source_kind ∈ 'advance' | 'reform' | 'privilege' | 'law'. Feeds the
 * Modifier Source Reference reduction (5 computed Army Stats) and the
 * Unit Unlock Reference reduction (age columns) in the service layer.
 * Bounded to the given nationIdxs (never fetched for a save's full
 * country list at once). */
export async function listNationMilitarySourcesArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer>; // columns: nation_idx, source_kind, source_name

/** Per-nation currency_data-derived fields already needed by Army/Navy
 * Stats but not yet exposed by any existing query: manpower, sailors,
 * monthly_manpower, monthly_sailors, army_tradition, navy_tradition,
 * last_months_army_maintenance, last_months_navy_maintenance. New
 * `nations` columns (extends the existing color_r/g/b-style ALTER
 * pattern) rather than a new table, since these are one-per-country
 * scalars like treasury/stability already are. */
export async function listNationMilitaryScalarsArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer>;

/** Navy damage given/taken: one row per (nation_idx, 'given' | 'taken')
 * summed from war_unit_losses joined through wars.attacker_idx/
 * defender_idx, filtered to category LIKE 'navy_%'. */
export async function listNavyDamageArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer>; // columns: nation_idx, direction, total_damage
```

**Service-layer reduction** (new, e.g. `armyNavyStats.ts`, not a query
function): combines `listRegimentSummaryArrow` (classified via the
static Unit Type Reference) +
`listNationMilitarySourcesArrow` (reduced via the static Modifier Source
Reference for the 5 stats, and the static Unit Unlock Reference for the 4
age columns per sub-tab) + `listNationMilitaryScalarsArrow` +
(Navy only) `listNavyDamageArrow` into the Army Stat Summary / Navy Stat
Summary shapes `contracts/ui.md` documents as component props. This
mirrors `compassPosition.ts`'s existing precedent (a plain, testable
function outside any chart component that combines raw query rows with a
static config table).
