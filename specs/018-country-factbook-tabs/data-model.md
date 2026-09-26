# Data Model: Country Factbook Tabs (018)

Only what 018 adds or reshapes. Everything else (`population`, `location_pops`, `locations`, `provinces`, `works_of_art`, `nation_laws`, `nation_privileges`, `nation_history`, `ruler_history`, `regiments`, `nation_societal_values`) is reused as is.

## Stored (schema.sql)

### `nations`: three new columns

| Column | Type | Save source | Null means |
|---|---|---|---|
| `government_power` | DOUBLE | `currency_data.government_power` | not in save / pre-018 data |
| `prestige` | DOUBLE | `currency_data.prestige` | same |
| `monthly_income` | DOUBLE | `economy.income` | same |

The nations `INSERT` in the adapter must list the new columns (insertRows full-column gotcha).

### `loans` (new)

| Column | Type | Save source |
|---|---|---|
| `idx` | BIGINT PK | `loan_manager.database` key |
| `borrower_idx` | INTEGER | `borrower` (a country idx) |
| `amount` | DOUBLE | `amount` |
| `interest` | DOUBLE | `interest` |
| `is_bond` | INTEGER | `bond=yes` → 1, else 0 |

Index on `borrower_idx`. A loan with no `borrower` or no `amount` is skipped and counted in the load warning (constitution II: never drop silently).

### `nation_estates` (new)

One row per `estate_manager.database` record with `existence=yes`.

| Column | Type | Save source |
|---|---|---|
| `nation_idx` | INTEGER | `country` |
| `estate_type` | TEXT | `estate_type`, e.g. `nobles_estate` |
| `satisfaction` | DOUBLE | `satisfaction` (0 to 1) |
| `tax_rate` | DOUBLE | the nation's `economy.tax_rates.<estate_type>`, NULL if absent |
| `gold` | DOUBLE | `gold` |
| `balance` | DOUBLE | `balance` |
| `wealth_impact` | DOUBLE | `wealth_impact` |
| `taxable_income`, `uncontrolled_income`, `city_income`, `trade_income`, `food_income` | DOUBLE | `last_month.*` |
| `paid_taxes`, `pop_expense`, `building_expense`, `rebel_expense`, `invest_expense`, `infra_expense` | DOUBLE | `last_month.*` |

Every economic column is NULL when the record doesn't carry it (the crown estate carries only satisfaction). Index on `nation_idx`.

### `subject_relations` (new)

| Column | Type | Save source |
|---|---|---|
| `overlord_idx` | INTEGER | `dependency.first` |
| `subject_idx` | INTEGER | `dependency.second` |
| `subject_type` | TEXT | `named_targets[flag=subject_type].target.object` |
| `start_date` | TEXT | `start_date`, NULL on 13 of 195 in the reference save |

Validation at parse time: skip a block missing `first` or `second`, or where they're equal; count skips in the load warning. Each subject has one overlord in real data. The tree code still guards against cycles.

## Derived at query time (queries.ts)

### `CountryCard` (replaces `NationOverview` for the Overview tab)

| Field | Definition | Computed? |
|---|---|---|
| name, tag, governmentType, treasury, stability, prestige, monthlyIncome | direct columns | no |
| governmentPower | `nations.government_power` | no |
| economicBase | `nation_history` value at the latest year for `economical_base` | yes |
| literacy | size-weighted mean over the owned-location pop set (research R4) | yes |
| locationCount | `COUNT(*) FROM locations WHERE owner_idx` | yes |
| worksOfArt | count of non-destroyed works with `owner_idx` | yes |
| totalDebt | `SUM(amount) FROM loans WHERE borrower_idx`, 0 when none | yes |
| available | `{ loans, worksOfArt, estates, subjects }` flags from `EXISTS` (research R13) | n/a |
| derived | `Set` of the computed field names (constitution IV) | n/a |

The label for governmentPower is resolved in the component from governmentType (research R1).

### `PopulationMakeup`

`{ religion, culture, estate, socialClass }`, each a list of `{ key, label, size, color | null }` sorted by size, over the owned-location pop set. The component folds slices under 2% into "Other".

### `ProvinceRow` and `LocationRow`

The province-grain and location-grain fields from `MapLocationRow` (014), filtered to one owner. Provinces add `locationCount`.

### `EstateRow`

A `nation_estates` row plus `populationShare` (the estate's share of the owned-location pop set) and a readable name.

### `SubjectNode`

`{ idx, name, tag, subjectType, startDate, clickable, children: SubjectNode[] }`, built in the component from all `subject_relations` rows, rooted at the selected nation. `clickable` = the idx is in the nation selector list. A visited set stops any cycle.

## UI state

`TabId` (tabs.ts) becomes:
`"overview" | "history" | "provinces" | "locations" | "military" | "government" | "estates" | "values" | "subjects" | "economy" | "buildings" | "characters"`.
