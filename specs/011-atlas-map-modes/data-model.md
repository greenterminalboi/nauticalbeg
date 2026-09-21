# Phase 1 Data Model: Expanded Atlas Map Modes

## Location *(extended)*

`locations` (existing table, feature 001/005/007) gains six additive columns, matching the existing `ALTER TABLE locations ADD COLUMN IF NOT EXISTS` convention so saves kept before this feature ships stay openable:

| Column | Type | Source (real save field) | Nullability |
|---|---|---|---|
| `rank` | TEXT | `locations.locations[idx].rank` | NULL when absent (sea zones/lakes carry no rank, per feature 005's existing precedent for minimal location records) |
| `culture_idx` | INTEGER | `locations.locations[idx].culture` | NULL when absent; logically REFERENCES `cultures(idx)` |
| `religion_idx` | INTEGER | `locations.locations[idx].religion` | NULL when absent; logically REFERENCES `religions(idx)` |
| `market_idx` | INTEGER | `locations.locations[idx].market` | NULL when the location belongs to no market |
| `possible_tax` | DOUBLE | `locations.locations[idx].possible_tax` | NULL when absent (research.md §2 — this, not `tax`, is "Tax Base") |
| `soldiers` | DOUBLE | `locations.locations[idx].population.pop_stats.soldiers.produced` | NULL when the location has no `population.pop_stats.soldiers` entry (research.md §3) |

`development` (already present, feature 001/005) is unchanged — the Development layer reads the existing column.

## Culture *(new)*

One row per `culture_manager.database` entry in the save — a per-save reference table, not a per-location one (many locations share one culture).

| Column | Type | Source |
|---|---|---|
| `idx` | INTEGER PRIMARY KEY | `culture_manager.database`'s numeric key |
| `name` | TEXT | `culture_manager.database[idx].name` |
| `color_r`/`color_g`/`color_b` | INTEGER | `culture_manager.database[idx].color` (`rgb { r g b }`) |

## Religion *(new)*

Same shape as Culture, one row per `religion_manager.database` entry.

| Column | Type | Source |
|---|---|---|
| `idx` | INTEGER PRIMARY KEY | `religion_manager.database`'s numeric key |
| `name` | TEXT | `religion_manager.database[idx].name` |
| `color_r`/`color_g`/`color_b` | INTEGER | `religion_manager.database[idx].color` (`rgb { r g b }`) |

## Market *(existing, referenced not modified)*

No schema change. `locations.market_idx` joins to the existing `markets(idx)` (feature 007); a market's display name continues to be derived from its `center_location_idx` per the existing query pattern in `listLeaderboardCountriesArrow`'s sibling market query.

## Terrain *(generated static reference data, not a database table)*

A committed TypeScript lookup, `src/components/Overview/locationTerrain.ts`, shaped like `rgoGameColors.ts`:

```ts
export const LOCATION_TERRAIN: Record<string, string> = {
  "stockholm": "flatland",
  // … one entry per location_templates.txt entry (28,573)
};
```

Keyed by location **name** (matching the same join key `mapLocationData.ts` already uses against the map geometry), value is the raw `topography` string (`"flatland"`, `"mountains"`, etc. — one of the 21 confirmed categories, research.md §5). Not a database table: this data has no per-save variation (it's static game-definition data), so it's loaded once as a module-level constant, not queried per save.

## MapLayer *(extended, no schema — in-memory registry)*

`MAP_LAYERS` (existing array in `mapLayers.ts`) gains eight entries. No new fields on the `MapLayer` interface itself — every new layer implements the existing `getFill(row, dataset)` / `getTooltipFields(row)` / `getLegend(dataset)` contract:

| id | label | kind | value source (on `MapLocationRow`) |
|---|---|---|---|
| `development` | Development | numeric (log-normalized, like Population) | `row.development` |
| `terrain` | Location Terrain | categorical (from `LOCATION_TERRAIN[row.name]`) | n/a (static table, not `MapLocationRow`) |
| `rank` | Location Rank | categorical (4 values) | `row.rank` |
| `primaryCulture` | Primary Culture | categorical (save's own color) | `row.cultureName` / `row.cultureColor` |
| `primaryReligion` | Primary Religion | categorical (save's own color) | `row.religionName` / `row.religionColor` |
| `market` | Location Market | categorical (RGO-style fallback color) | `row.marketIdx` |
| `taxBase` | Tax Base | numeric (log-normalized, like Population) | `row.possibleTax` |
| `soldiers` | Soldiers | numeric (log-normalized, like Population) | `row.soldiers` |

## MapLocationRow *(extended)*

`mapLocationData.ts`'s `MapLocationRow` interface gains the fields the table above reads:

```ts
export interface MapLocationRow {
  // … existing fields (idx, name, ownerIdx, ownerColor, ownerName,
  //    controllerIdx, controllerColor, controllerName, control,
  //    rawMaterial, totalPopulation) unchanged
  rank: string | null;
  cultureName: string | null;
  cultureColor: [number, number, number] | null;
  religionName: string | null;
  religionColor: [number, number, number] | null;
  marketIdx: number | null;
  possibleTax: number | null;
  soldiers: number | null;
}
```

`listMapLocationsArrow` (`src/storage/queries.ts`) is extended with `LEFT JOIN cultures`/`LEFT JOIN religions` (mirroring its existing `LEFT JOIN nations owner`/`controller` pattern) plus the new `locations` columns, so every new field loads in the same single per-save query feature 005 already established — no new query function, no additional per-layer data fetch.

## Validation rules

- Every new numeric field (`development`, `possible_tax`, `soldiers`) renders the shared `NEUTRAL_COLOR` "no data" fill when `null`, never a fabricated zero (matching `rawMaterial`'s existing null-handling in `mapLayers.ts`).
- Every new categorical field renders `NEUTRAL_COLOR` when its id doesn't resolve (a `culture_idx`/`religion_idx` absent from that save's `cultures`/`religions` table, a `market_idx` of `NULL`, a `rank` of `NULL`, or a location name absent from `LOCATION_TERRAIN`).
- `cultures`/`religions` color columns follow the same `rgbOrNull` pattern `mapLocationData.ts` already uses for `ownerColor`/`controllerColor` — all three components must be confirmed numbers, or the color is `null` (falls back to the RGO-style generated fallback color, never a partial/guessed triple).
