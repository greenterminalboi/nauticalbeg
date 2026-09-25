# Research: Country & Province Map Modes (014)

Every field below was confirmed against the real save
(`/Users/halda/Downloads/Russia (Melted).eu5`, 642MB, game 1.3.11), never
the minimized fixture `tests/fixtures/rus-1628-minimal.eu5` (see the
project's recorded lesson from 011 on why).

## §1 Data sources: everything but works of art is already stored

| Layer | Source already in DuckDB | Real-save confirmation |
|---|---|---|
| Country Treasury | `nations.treasury` ← `countries.database[i].currency_data.gold` | 2,470 countries; 108 negative (min −439.9, max 899,538) |
| Country Stability | `nations.stability` ← `currency_data.stability` | range exactly −100..+100; 284 negative |
| Government Type | `nations.government_type` ← `government.type` | 5 distinct values: `monarchy` 1412, `tribe` 731, `republic` 232, `theocracy` 74, `steppe_horde` 18 |
| Country Population | `nation_history` metric `population` ← `historical_population` | per-year float array, e.g. RUS (idx 2025) latest 20,330.1 |
| Economical Base | `nation_history` metric `economical_base` ← `historical_economical_base` | same shape, RUS latest 9,890.5 |
| Country Literacy | `population.literacy` × `population.size`, linked via `location_pops` → `locations.owner_idx` | `literacy=` present on pop records (e.g. 25, 40.061) |
| Number of Tech Advances | `nation_advances` (one row per `researched_advances` `=yes` flag, from 012) | — |
| Province Development / Tax Base / Soldiers / Population | `locations.development`, `.possible_tax`, `.soldiers`, `location_pops`×`population.size`, grouped by `locations.province_idx` | fields confirmed in 011 |
| **Number of Works of Art** | **nothing yet** — `work_of_art_manager` currently lands in `raw_sections` as opaque JSON | see §2 |

**Decision**: Reuse the existing tables. Add exactly one new table, `works_of_art`.
**Rationale**: Principle VII. The only new parser work is the one section no feature has read before.

## §2 `work_of_art_manager` structure

The top-level section at line 2,461,577 of the real save is `work_of_art_manager.database.<id>`, with 4,954 entries. Field frequency across all entries:

| Field | Count | Meaning |
|---|---|---|
| `type` | 4954 | `painting`, `scripture`, `regalia`, `statue`, `monument`, `poem`, `temple_tower`, `palace`, … |
| `origin` | 4954 | location idx where it was made |
| `location` | 4954 | location idx where it currently is |
| `creation_date` | 4954 | jomini date |
| `quality` | 4836 | 0-100 |
| `owner` | 1627 | **country idx** (see below) |
| `destroyed_date` | 1207 | present ⇒ destroyed |
| `artist` | 810 | character id |
| `key` | 361 | localization key for named historical works only |

`owner` is a **country index**, not a character id. It was checked against `countries.tags`: `289=GBR` (owns `bayeux_tapestry_key`, which fits), and `83888392=MTPSC`, a dynamically created country with a large idx, which is also a valid `nations.idx`. 1,627 works have an owner. 1,399 of those have no `destroyed_date` and count toward the layer.

**Decision**: New table `works_of_art(idx, owner_idx, type, quality, location_idx, destroyed_date)`. Add `work_of_art_manager` to the adapter's `STRUCTURED_KEYS` so it leaves `raw_sections`. Nothing currently reads that raw section.
**Alternatives considered**:
- Query `raw_sections` JSON at map-load time. Rejected: DuckDB would re-parse a ~40k-line JSON blob every load, and it breaks the convention of structured tables for anything a feature reads.
- Store only `owner_idx`. Rejected: `destroyed_date` is needed for FR-008. `type` and `quality` cost nothing and are the obvious next thing an Encyclopedia or Country view would want, but they are stored, not surfaced (no speculative UI).

## §3 Where aggregation happens: in the existing load-once map query

**Decision**: Extend `listMapLocationsArrow` (`src/storage/queries.ts`) with per-location `owner_*` and `province_*` columns. They are computed with CTEs that aggregate once per country and once per province, then join back onto each location row.
**Rationale**: FR-021 / SC-001 require no new query or reload on layer switch. `mapLocationData.ts` already loads this one Arrow result once per save and every layer reads from it. Repeating a country value on each of its locations costs about 12 extra columns × ~38k rows, which is negligible in Arrow.
**Alternatives considered**:
- A separate `listMapCountriesArrow` plus `listMapProvincesArrow` and a client-side join. Rejected: more loaders and more caching for no benefit at this row count.
- Computing aggregates in TS from location rows. Rejected: literacy and works of art need tables the location query doesn't carry, and SQL is where every other aggregate in this project lives (ARCHITECTURE.md: `domain/` stays empty).

"Most recent" population and economical base use DuckDB `arg_max(value, year)` grouped by `(nation_idx, metric)`. The query is limited to nations that own ≥1 location, so the few-million-row `nation_history` scan only aggregates for about 265 live countries. It must be timed on the real save during implementation (quickstart §4). If it adds more than ~1s to map load, the fallback is to precompute a `nation_latest` table at parse time.

## §4 Shading: ranking by country and province, not by location

`rankSpectralLayer` ranks **every location row**. Reused as-is for a country layer, Russia's thousands of identical-value locations would take up a huge slice of the rank space and flatten everyone else. That is the outlier problem FR-019 exists to prevent, just from another direction.

**Decision**: Generalize to a grouped rank. Rank the **distinct group keys** (owner idx for country layers, province idx for province layers) by their value. Each location then takes its group's rank. The existing location layers keep calling the ungrouped helper, where the key is the location itself, so their behavior doesn't change.
**Rationale**: SC-006 (every location in a group gets one shade) holds by construction, and FR-019 is met with the same percentile approach the user already approved for Development, Population and Tax Base (2026-09-22).

## §5 Signed values: Stability and Treasury

The existing helper sends `≤ 0` to ZERO_COLOR/NEUTRAL_COLOR. For these two layers that would be a lie, because negatives are real and common.

- **Stability** has a fixed, meaningful −100..+100 scale. **Decision**: a *diverging* fixed scale, not a rank. Purple (−100) → pale cream (0) → orange (+100), a PuOr-style palette that is colorblind-safe with no red/green encoding (Principle VI). The midpoint cream (`[250, 240, 215]`) is clearly distinct from NEUTRAL_COLOR's gray. A fixed scale is correct here because "0 stability" means the same thing in every save.
- **Treasury** is unbounded with a heavy tail (max 899k), so rank it like the other numerics. Countries in debt get their own **"In debt"** legend entry and color (dark teal `[1, 102, 94]`, distinct from ZERO_COLOR charcoal and from the spectral stops). They are not put at the bottom of the rank. Being in debt is a categorical fact the player cares about, and folding it into "lowest" would hide it (Principle IV).
- Treasury exactly `0` → ZERO_COLOR, as elsewhere.

## §6 Counts, confirmed zero, and kept saves

For Tech Advances and Works of Art, an owned country with no rows is a **confirmed zero** (FR-015). A kept save parsed before 012 (advances) or before this feature (works of art) resumes with an **empty** table, because `applySchema` adds the table but never fills it (`load-save.ts` resume comment). Showing every country as "Zero" there would be a fabricated reading.

**Decision**: The query emits `works_of_art_available` / `advances_available` flags, computed as `EXISTS (SELECT 1 FROM <table>)`. When a flag is false, the layer shows every location as NEUTRAL "No data", and the legend carries one entry: "Not in this save's data — reload the save file".
**Alternative rejected**: a schema-version marker in `save_meta`. That's more machinery than needed, because an empty table is an unambiguous signal on real saves (4,954 works of art, 265 live countries all with advances).

## §7 Literacy: which pops belong to a country

**Decision**: Use location ownership: `location_pops → locations.owner_idx`. The weighted mean is `SUM(size × literacy) / SUM(size)` over pops with non-null literacy and `size > 0`. `population.owner_idx` is not used.
**Rationale**: Every other country layer defines "the country's" by the map's own ownership, and the tooltip names the owner. Using the same link means the literacy figure is the literacy *of the shaded territory*. A country whose locations have no pops with literacy → NULL → "No data".

## §8 Province aggregates

Group by `locations.province_idx`, with the name from `provinces.name`.

- Development, Tax Base, Soldiers: `SUM(field)`. DuckDB's `SUM` skips NULLs and returns NULL when all inputs are NULL, which matches FR-014's "no data" exactly.
- Population: sum only over locations whose `development IS NOT NULL`, carrying the user's 2026-09-22 rule from the location Population layer up to the province.
- The spec records that mixed ownership inside a province doesn't occur in the real save. The aggregate ignores ownership either way.

## §9 Sidebar grouping

**Decision**: Add `grain: "location" | "province" | "country"` to `MapLayer`. All 12 existing layers get `"location"`, as the spec states, including Political and Control. `MapSidebar` renders three headed sections, in the order Location, Province, Country, and each section has its own collapse toggle (`aria-expanded`, native `<button>`, as the existing panel toggle does). The outer "Collapse layers" toggle stays. Section-collapse state is local to `MapSidebar` because it has no effect on the canvas. Collapsing a section never deactivates the active layer (acceptance scenario 1.2).
**Alternative rejected**: a separate `MAP_LAYER_GROUPS` registry. It would duplicate the ordering, while a field on each layer keeps the "each story appends one entry" pattern.

## §10 Government Type colors

The five values form a small closed set, like Location Rank, so the table is fixed: monarchy, republic, theocracy, tribe, steppe_horde, each with a hue at least 60° apart (for CVD). Any unknown type from a future game version falls back to the golden-angle hue already used for RGO/Market, so it never gets NEUTRAL. The legend lists only the types present in the dataset, sorted (FR-020).
