# Data Model: Country & Province Map Modes (014)

## New table: `works_of_art`

From `work_of_art_manager.database.<id>` (research.md §2). One row per entry, destroyed works included. The query layer filters out destroyed works, so the row set stays a faithful copy of the save.

| Column | Type | Source | Notes |
|---|---|---|---|
| `idx` | INTEGER PK | database key | |
| `owner_idx` | INTEGER NULL | `owner` | country idx; NULL for 3,327 of 4,954 in the real save |
| `type` | TEXT NULL | `type` | `painting`, `statue`, … |
| `quality` | DOUBLE NULL | `quality` | 0-100 |
| `location_idx` | INTEGER NULL | `location` | current location |
| `destroyed_date` | TEXT NULL | `destroyed_date` | non-NULL ⇒ excluded from counts (FR-008) |

It is created with `CREATE TABLE IF NOT EXISTS`, so kept saves pick it up empty on resume (research.md §6). Every row supplies every column (insertRows full-column rule).

## Extended: map location row (`listMapLocationsArrow` → `MapLocationRow`)

Fourteen new columns, each with its camelCase field in `MapLocationRow`. Every value is repeated across all locations of the same owner or province.

### Country grain (keyed by `owner_idx`; all NULL when `owner_idx` is NULL)

| SQL column | `MapLocationRow` field | Type | Derivation |
|---|---|---|---|
| `owner_treasury` | `ownerTreasury` | number \| null | `nations.treasury` |
| `owner_stability` | `ownerStability` | number \| null | `nations.stability` (−100..100) |
| `owner_government_type` | `ownerGovernmentType` | string \| null | `nations.government_type` |
| `owner_population` | `ownerPopulation` | number \| null | `arg_max(value, year)` over `nation_history` where `metric='population'` |
| `owner_economical_base` | `ownerEconomicalBase` | number \| null | same, `metric='economical_base'` |
| `owner_literacy` | `ownerLiteracy` | number \| null | `SUM(size*literacy)/SUM(size)` over pops in the owner's locations (research.md §7) |
| `owner_advances` | `ownerAdvances` | number \| null | `COUNT(*)` from `nation_advances`; 0 when the owner has none; NULL when `advances_available` is false |
| `owner_works_of_art` | `ownerWorksOfArt` | number \| null | `COUNT(*)` from `works_of_art` where `destroyed_date IS NULL`; 0 / NULL on the same rule |

### Province grain (keyed by `locations.province_idx`)

| SQL column | `MapLocationRow` field | Type | Derivation |
|---|---|---|---|
| `province_idx` | `provinceIdx` | number \| null | `locations.province_idx` |
| `province_name` | `provinceName` | string \| null | `provinces.name`, falling back to `'Province ' \|\| idx` |
| `province_development` | `provinceDevelopment` | number \| null | `SUM(development)`; NULL if all NULL |
| `province_tax_base` | `provinceTaxBase` | number \| null | `SUM(possible_tax)` |
| `province_soldiers` | `provinceSoldiers` | number \| null | `SUM(soldiers)` |
| `province_population` | `provincePopulation` | number \| null | `SUM(pop total)` over locations with `development IS NOT NULL`; NULL if none |

The two availability flags are consumed in the query and never exposed as columns. When a table is empty, `owner_advances` / `owner_works_of_art` come through as NULL for every row, which shows as "No data". The layer detects this case with "every owned row NULL" and switches its legend to the reload hint (research.md §6).

## Extended: `MapLayer`

```ts
grain: "location" | "province" | "country";   // new, required
```

Validation: every entry in `MAP_LAYERS` has a grain. Sidebar order is Location, Province, Country, and within each section it follows registration order.

## New layers (12 new; 24 total with the existing 12)

| id | label | grain | shading |
|---|---|---|---|
| `provinceDevelopment` | Province Development | province | grouped rank spectral |
| `provinceTaxBase` | Province Tax Base | province | grouped rank spectral |
| `provinceSoldiers` | Province Soldiers | province | grouped rank spectral |
| `provincePopulation` | Province Population | province | grouped rank spectral |
| `countryTreasury` | Country Treasury | country | grouped rank spectral + "In debt" |
| `countryStability` | Country Stability | country | fixed diverging −100..100 |
| `governmentType` | Government Type | country | categorical (fixed 5 + fallback) |
| `countryPopulation` | Country Population | country | grouped rank spectral |
| `economicalBase` | Economical Base | country | grouped rank spectral |
| `countryLiteracy` | Country Literacy | country | grouped rank spectral |
| `techAdvances` | Number of Tech Advances | country | grouped rank spectral, confirmed zero |
| `worksOfArt` | Number of Works of Art | country | grouped rank spectral, confirmed zero |

## States a location can render in (every new numeric layer)

| Condition | Fill | Legend label |
|---|---|---|
| no owner (country) / all-NULL province value | `NEUTRAL_COLOR` | No data |
| source table empty (advances / art only) | `NEUTRAL_COLOR` | Not in this save's data — reload the save file |
| value = 0 | `ZERO_COLOR` | Zero |
| treasury < 0 | `DEBT_COLOR` | In debt |
| value > 0 | `spectralColor(groupRank)` | Lowest … Highest |
