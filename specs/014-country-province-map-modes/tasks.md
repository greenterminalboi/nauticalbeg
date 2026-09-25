# Tasks: Country & Province Map Modes

**Input**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included. Constitution Principle II requires fixture-first tests for the one parser change (works of art). plan.md also names the storage and component suites that cover the new columns and layers.

**Story order**: The spec has 13 stories. US1 (sidebar grouping) is the structural prerequisite. US2–US6 are P1, US7–US11 are P2 and US12–US13 are P3. After Foundational, each layer story only appends its own columns to the map query and registers its own layer, so the layer stories are independent of each other.

## Phase 1: Setup

No new dependencies or project scaffolding (plan.md Technical Context).

- [X] T001 Run `npm test` and `npm run build` on a clean tree and record the baseline (pass count, any pre-existing failures), so any regression introduced by 014 can be told apart from existing failures

## Phase 2: Foundational (blocks every layer story)

- [X] T002 Add the required `grain: "location" | "province" | "country"` field to the `MapLayer` interface in src/components/Overview/mapLayers.ts. Set `grain: "location"` on all 12 existing layers, including the `rankSpectralLayer`/`numericLayer` factory outputs, by passing it through the factories (contracts/ui.md)
- [X] T003 Refactor `rankSpectralLayer` in src/components/Overview/mapLayers.ts into a general `groupedRankSpectralLayer({ id, label, grain, groupLabel, getGroupKey, getGroupName, getValue, formatValue?, negativeAs? })`. It ranks distinct group keys whose value is > 0 once per dataset (WeakMap memo) and spreads rank evenly as `i/(n-1)`. Fill: `null` → NEUTRAL_COLOR, `0` → ZERO_COLOR, `< 0` → `DEBT_COLOR` when `negativeAs: "debt"` (else NEUTRAL_COLOR), otherwise `spectralColor(rank)`. `getHeight` returns the group rank. Tooltip: `Location`, `<groupLabel>: <group name>`, `<label>: <formatted value>`. Legend: No data / Zero / (In debt) / 7 spectral stops. Re-express the existing location-grain `rankSpectralLayer` as a wrapper keyed by `row.name`, with a tooltip identical to today's (research.md §4)
- [X] T004 Add a `DEBT_COLOR: [number, number, number] = [1, 102, 94]` export with a doc comment in src/components/Overview/mapLayers.ts (research.md §5)
- [X] T005 [P] Add tests in tests/components/mapLayers.test.ts: (a) existing Population/Development/Tax Base layers return the same fills as before the refactor on a small hand-built dataset; (b) grouped rank gives all rows of one group the same fill; (c) a group with 1000 rows and a group with 1 row sit at rank ends 0 and 1 (not biased by row count); (d) 0 → ZERO_COLOR, null → NEUTRAL_COLOR, negative with `negativeAs:"debt"` → DEBT_COLOR; (e) every `MAP_LAYERS` entry has a `grain`
- [X] T006 Promote the inline `pop_totals` subquery in `listMapLocationsArrow` (src/storage/queries.ts) to a CTE with the result unchanged, so the province CTEs can reuse it (contracts/queries.md)
- [X] T007 Extend `MapLocationRow` and `loadMapLocationDataset` in src/components/Overview/mapLocationData.ts with all 14 new fields from data-model.md. Each field is `number | null` (or `string | null`), decoded with the file's existing `typeof … === "number" ? … : null` pattern: `ownerTreasury`, `ownerStability`, `ownerGovernmentType`, `ownerPopulation`, `ownerEconomicalBase`, `ownerLiteracy`, `ownerAdvances`, `ownerWorksOfArt`, `provinceIdx`, `provinceName`, `provinceDevelopment`, `provinceTaxBase`, `provinceSoldiers`, `provincePopulation`. Columns absent from the query decode to null until their story adds them
- [X] T008 Update any test helper or factory that builds `MapLocationRow` objects (grep `tests/` for `totalPopulation:`) to supply the 14 new fields as `null`, so the type change compiles

**Checkpoint**: tests and build are green, the map behaves exactly as before, and every layer has a grain.

## Phase 3: User Story 1 — Sidebar grouped by grain (P1)

**Goal**: The sidebar shows Location / Province / Country sections, each independently collapsible.
**Independent test**: The 12 existing layers appear under Location. Collapsing a section hides only its items. The active layer survives a collapse.

- [X] T009 [P] [US1] Add tests in tests/components/MapSidebar.test.tsx: three section headings render in the order Location, Province, Country (a section with zero layers is not rendered); collapsing Province hides only Province items; the active layer's `aria-current` is unaffected by collapsing a different section and `onSelectLayer` is not called by a collapse; clicking a Country item calls `onSelectLayer` with its id; the outer "Collapse layers" toggle still hides everything
- [X] T010 [US1] Rewrite the list body of `MapSidebar` in src/components/Overview/MapSidebar.tsx to group `layers` by `grain` into `<section>`s. Each section has a header `<button type="button" aria-expanded>` that toggles local `useState` collapse for that section only (default: expanded). Keep the existing item buttons, `aria-current="page"` and outer toggle unchanged (contracts/ui.md)
- [X] T011 [P] [US1] Style section headers and nested lists in src/components/Overview/MapSidebar.css with the existing tokens from src/styles/tokens.css: a header distinguishable from items, a visible focus ring, and a disclosure indicator that is not color-only

## Phase 4: User Story 2 — Country Treasury (P1)

**Independent test**: All RUS locations show treasury 5,493.1. A country in debt shows the "In debt" color. Unowned locations show No data.

- [X] T012 [US2] Add `owner.treasury AS owner_treasury` to `listMapLocationsArrow` in src/storage/queries.ts
- [X] T013 [US2] Register `countryTreasury` ("Country Treasury", grain `country`) in src/components/Overview/mapLayers.ts via `groupedRankSpectralLayer`, keyed on `ownerIdx`, with group name `ownerName`, value `ownerTreasury` and `negativeAs: "debt"`. Place it after the Province layers' registration block (the Country section is ordered by registration)
- [X] T014 [P] [US2] In tests/storage/map-locations.test.ts, assert that locations with the same owner return identical `owner_treasury` equal to `nations.treasury`, and that an unowned location returns NULL

## Phase 5: User Story 3 — Country Stability (P1)

**Independent test**: RUS reads +27.3. GBR reads −1.4 on the purple side. 0 is cream, which is distinct from No-data gray.

- [X] T015 [US3] Add `owner.stability AS owner_stability` to `listMapLocationsArrow` in src/storage/queries.ts
- [X] T016 [US3] Register `countryStability` ("Country Stability", grain `country`) in src/components/Overview/mapLayers.ts as a fixed diverging layer: `t = clamp01((stability + 100) / 200)`, interpolating purple `[94, 60, 153]` → cream `[250, 240, 215]` (t=0.5) → orange `[230, 97, 1]`; null → NEUTRAL_COLOR. Tooltip: Location, Owner, Stability with sign and 1 dp. Legend: No data, −100, −50, 0, +50, +100 (research.md §5)
- [X] T017 [P] [US3] Add tests in tests/components/mapLayers.test.ts: −100 → purple, 0 → cream, +100 → orange, null → NEUTRAL_COLOR, and the tooltip shows "+27.3" / "−1.4"-style signed values

## Phase 6: User Story 4 — Government Type (P1)

**Independent test**: RUS reads monarchy. The legend lists only the types present.

- [X] T018 [US4] Add `owner.government_type AS owner_government_type` to `listMapLocationsArrow` in src/storage/queries.ts
- [X] T019 [US4] Register `governmentType` ("Government Type", grain `country`) in src/components/Overview/mapLayers.ts with a fixed `GOVERNMENT_COLORS` table for `monarchy`, `republic`, `theocracy`, `tribe` and `steppe_horde` (hues ≥60° apart, none relying on a red/green contrast), plus a per-dataset memoized golden-angle fallback for unknown types. Null → NEUTRAL_COLOR. The legend lists present types sorted, with display labels title-cased (`steppe_horde` → "Steppe Horde"). Tooltip: Location, Owner, Government (research.md §10)
- [X] T020 [P] [US4] Add tests in tests/components/mapLayers.test.ts: a known type gets its fixed color; an unknown type gets a non-neutral fallback; the legend contains only types present

## Phase 7: User Story 5 — Province Development (P1)

**Independent test**: Every location in one province shares one shade. The tooltip total equals the sum of its locations. An all-water province shows No data.

- [X] T021 [US5] Add a `province_totals` CTE (SUM development / possible_tax / soldiers, plus population restricted to `development IS NOT NULL`, grouped by `locations.province_idx`) and a `LEFT JOIN provinces` to `listMapLocationsArrow` in src/storage/queries.ts. Emit `locations.province_idx AS province_idx`, `COALESCE(provinces.name, 'Province ' || locations.province_idx) AS province_name` and `province_totals.development AS province_development` (contracts/queries.md, research.md §8)
- [X] T022 [US5] Register `provinceDevelopment` ("Province Development", grain `province`) in src/components/Overview/mapLayers.ts, keyed on `provinceIdx`, with group label "Province", group name `provinceName` and value `provinceDevelopment`. It must be registered before every Country layer
- [X] T023 [P] [US5] In tests/storage/map-locations.test.ts, assert that same-province locations return identical `province_development` equal to the SUM of their `development`, and that a province whose locations are all NULL development returns NULL

## Phase 8: User Story 6 — Province Tax Base (P1)

- [X] T024 [US6] Emit `province_totals.tax_base AS province_tax_base` in `listMapLocationsArrow` in src/storage/queries.ts
- [X] T025 [US6] Register `provinceTaxBase` ("Province Tax Base", grain `province`) in src/components/Overview/mapLayers.ts, right after Province Development

## Phase 9: User Story 7 — Country Population (P2)

**Independent test**: RUS reads 20,330.1, the latest year's value and not the maximum.

- [X] T026 [US7] Add `live_owners` and `latest` CTEs to `listMapLocationsArrow` in src/storage/queries.ts. `latest` is `arg_max(value, year)` over `nation_history` for metrics `population` and `economical_base`, limited to live owners. Emit `owner_population`
- [X] T027 [US7] Register `countryPopulation` ("Country Population", grain `country`) in src/components/Overview/mapLayers.ts
- [X] T028 [P] [US7] In tests/storage/map-locations.test.ts, assert that `owner_population` equals the value at the owner's maximum `year` in `nation_history`, not `MAX(value)`. Pick or insert a nation whose latest value is below its peak

## Phase 10: User Story 8 — Economical Base (P2)

- [X] T029 [US8] Emit `owner_economical_base` from the `latest` CTE in `listMapLocationsArrow` in src/storage/queries.ts
- [X] T030 [US8] Register `economicalBase` ("Economical Base", grain `country`) in src/components/Overview/mapLayers.ts

## Phase 11: User Story 9 — Country Literacy (P2)

- [X] T031 [US9] Add a `literacy` CTE to `listMapLocationsArrow` in src/storage/queries.ts: `SUM(size*literacy)/NULLIF(SUM(size),0)` over `location_pops` → `locations.owner_idx` → `population`, where `literacy IS NOT NULL AND size > 0`. Emit `owner_literacy` (research.md §7)
- [X] T032 [US9] Register `countryLiteracy` ("Country Literacy", grain `country`) in src/components/Overview/mapLayers.ts, with the value formatted as `x.y%` and the tooltip label "Average literacy" (derived value labeled, Principle IV)
- [X] T033 [P] [US9] In tests/storage/map-locations.test.ts, assert that `owner_literacy` equals a hand-computed size-weighted mean from the fixture's pops for one owner

## Phase 12: User Story 10 — Province Soldiers (P2)

- [X] T034 [US10] Emit `province_totals.soldiers AS province_soldiers` in `listMapLocationsArrow` in src/storage/queries.ts
- [X] T035 [US10] Register `provinceSoldiers` ("Province Soldiers", grain `province`) in src/components/Overview/mapLayers.ts

## Phase 13: User Story 11 — Province Population (P2)

- [X] T036 [US11] Emit `province_totals.population AS province_population` in `listMapLocationsArrow` in src/storage/queries.ts
- [X] T037 [US11] Register `provincePopulation` ("Province Population", grain `province`) in src/components/Overview/mapLayers.ts, after Province Soldiers

## Phase 14: User Story 12 — Number of Tech Advances (P3)

**Independent test**: RUS reads 291. A live country with none reads Zero (charcoal). A kept save with empty `nation_advances` reads No data, with the reload hint.

- [X] T038 [US12] Add `advances` and `flags` CTEs to `listMapLocationsArrow` in src/storage/queries.ts. Emit `owner_advances` as `CASE WHEN owner_idx IS NULL OR NOT advances_ok THEN NULL ELSE COALESCE(n,0) END` (contracts/queries.md, research.md §6)
- [X] T039 [US12] Add `unavailableHint?: string` support to `groupedRankSpectralLayer` in src/components/Overview/mapLayers.ts. When every row with a non-null `ownerIdx` has a null value, the legend is `[NEUTRAL_COLOR, "Not in this save's data — reload the save file"]` (memoized per dataset). Register `techAdvances` ("Number of Tech Advances", grain `country`) with an integer format
- [X] T040 [P] [US12] In tests/storage/map-locations.test.ts, assert that an owned country with no `nation_advances` rows returns 0, and that after `DELETE FROM nation_advances` every row returns NULL. In tests/components/mapLayers.test.ts, assert that the unavailable legend appears when every owned value is null

## Phase 15: User Story 13 — Number of Works of Art (P3)

**Independent test**: RUS reads 36 (37 owned, 1 destroyed excluded). An unowned work counts for nobody.

- [X] T041 [US13] Add a `work_of_art_manager={ database={ … } }` block to tests/fixtures/rus-1628-minimal.eu5 in the exact shape of the real save (research.md §2) with 4 entries: owned by a fixture country and live; owned by the same country with a `destroyed_date`; with no `owner`; owned by a large dynamic-country idx present in the fixture's `countries` (or add a minimal country slot for it)
- [X] T042 [US13] Write a failing test in tests/parser/adapter.test.ts: after parsing the fixture, `works_of_art` holds 4 rows with correct `owner_idx` (NULL for the unowned one), `destroyed_date` is non-NULL only on the destroyed one, and `raw_sections` has no `work_of_art_manager` key
- [X] T043 [US13] Add the `works_of_art` table (`idx INTEGER PRIMARY KEY, owner_idx INTEGER, type TEXT, quality DOUBLE, location_idx INTEGER, destroyed_date TEXT`) plus `idx_works_of_art_owner` to src/storage/schema.sql, using `CREATE TABLE IF NOT EXISTS` (contracts/schema.md)
- [X] T044 [US13] In src/parser/version-adapters/1.3.11.ts, add `"work_of_art_manager"` to `STRUCTURED_KEYS` and extract `database` entries into 6-column rows (every column supplied, per the insertRows full-column rule; dates via the adapter's existing date-to-string handling), inserted with one `insertRows` call. Make T042 pass
- [X] T045 [US13] Update tests/schema-mapping/* expectations if they enumerate structured versus raw sections, so `work_of_art_manager` is classified as structured
- [X] T046 [US13] Add `art` CTE and extend `flags` with `art_ok` in `listMapLocationsArrow` in src/storage/queries.ts. Emit `owner_works_of_art` (live, owned works only; NULL when unowned or when the table is empty)
- [X] T047 [US13] Register `worksOfArt` ("Number of Works of Art", grain `country`) in src/components/Overview/mapLayers.ts with an integer format and the `unavailableHint`, as last in the Country section
- [X] T048 [P] [US13] In tests/storage/map-locations.test.ts, assert that `owner_works_of_art` for the fixture owner is 1 (destroyed and unowned works excluded) and that an unowned location returns NULL

## Phase 16: Polish & verification

- [X] T049 Run `npm test` and `npm run build`, and fix every failure introduced since the T001 baseline
- [ ] T050 Real-app verification per quickstart.md §2–§3, with a fresh load of `/Users/halda/Downloads/Russia (Melted).eu5`: sidebar sections and collapse; RUS values (stability +27.3, treasury 5,493.1, monarchy, population 20,330.1, economical base 9,890.5, 291 advances, 36 works of art); GBR −1.4 stability; one province sum spot-check; No data / Zero / In debt states. Leave the dev server running
- [ ] T051 Time the `listMapLocationsArrow` load on the real save (quickstart §4). If the added cost is > ~1s, implement the `nation_latest` parse-time fallback from research.md §3 and re-time
- [ ] T052 Check the kept-save regression (quickstart §5) and the CVD emulation check for Stability and Government Type (quickstart §6)
- [ ] T053 Wrap-up: update ARCHITECTURE.md (grouped-rank layers, `works_of_art`, grain sidebar); refresh specs/spec-status.md with a 014 row; mark tasks complete; make a scoped commit of the 014 files only and push

## Dependencies

- T001 → Phase 2 (T002–T008) → every story.
- US1 (T009–T011) is independent of every layer story, but should land first because it's the structural prerequisite.
- Layer stories US2–US13 depend only on Phase 2. They all edit the same two files (`queries.ts`, `mapLayers.ts`), so implementation tasks across stories run sequentially, not in parallel.
- Within US12: T038 → T039. Within US13: T041 → T042 → T043 → T044 → T045 → T046 → T047.
- T039's `unavailableHint` is reused by T047.
- Polish (T049–T053) comes after all stories.

## Parallel opportunities

Tasks marked [P] touch a test file, or a different source file, than the implementation task they sit beside. Examples:

- T005 alongside T006/T007
- T009 and T011 alongside T010
- Each story's storage test alongside that story's layer registration

## Implementation strategy

- **MVP**: Phase 2 + US1 + US2–US6. This gives the grouped sidebar, the 3 cheap country layers and 2 province layers.
- **Increment 2**: P2 stories US7–US11. The timing check for the `latest` CTE comes with US7.
- **Increment 3**: P3 stories US12–US13. This is the only parser change.
- Everything ships together in one commit per the project's wrap-up convention. The increments are for ordering work, not for separate releases.
