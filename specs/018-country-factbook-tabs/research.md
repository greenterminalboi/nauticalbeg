# Research: Country Factbook Tabs (018)

Every save field below was checked against the real save (`/Users/halda/Downloads/Russia (Melted).eu5`), not the minimized fixture. Sample country used for field shapes: idx 1576 (Morocco).

## R1. Government power and its label

**Decision**: Store `countries.database[idx].currency_data.government_power` as `nations.government_power`. Label it from the government type: monarchy → Legitimacy, republic → Republican Tradition, theocracy → Devotion, steppe_horde → Horde Unity, tribe → Tribal Cohesion. An unknown type gets "Government Power".
**Rationale**: EU5 uses one currency for all five. The type → power mapping comes from `public/encyclopedia/government_types.json` (`fields.government_power`), which the 008 scraper already produced from game files.
**Alternatives considered**: Reading the label at runtime from `government_types.json`. Rejected: five fixed entries, and the JSON holds keys, not display names.

## R2. Prestige and monthly income

**Decision**: New `nations` columns `prestige` (`currency_data.prestige`) and `monthly_income` (`economy.income`).
**Rationale**: Both are single raw fields on the country record. `economy.income` is the owner's "wealth" (spec Assumptions).

## R3. Total debt

**Decision**: New `loans` table from `loan_manager.database` (amount, interest, borrower_idx, is_bond). Total debt = `SUM(amount) WHERE borrower_idx = ?`. Government bonds (`bond=yes`) count, since they are money the country owes. No loans → confirmed 0.
**Rationale**: Keeping one row per loan (not a pre-summed nation column) costs little and lets a later tab list loans. `borrower` values are country idxs, including large ones like 16779642 (country idxs go up to 83888428 in `countries.tags`).
**Alternatives considered**: A `nations.total_debt` column summed at parse time. Rejected: loses the per-loan detail for no real saving.

## R4. Which pops belong to a nation (literacy and the four pies)

**Decision**: Use location ownership, `location_pops → locations.owner_idx`, the same rule 014's research §7 set for the Country Literacy map mode. Literacy = `SUM(size × literacy) / SUM(size)` over pops with `size > 0` and non-null literacy. Each pie groups the same pop set by `religion`, `culture`, `estate` or `pop_type`, summing `size`.
**Rationale**: The Overview literacy figure then equals the map's for the same country, and the pies and the location count describe the same territory.
**Alternatives considered**: `population.owner_idx`. Rejected for the same reason as in 014: it would disagree with the map.

## R5. Pie readability

**Decision**: Slices under 2% of the total fold into one "Other" slice. Culture and religion slices use the game colors already stored for the map; estate and social class use a fixed categorical palette. Every slice has a text label in the legend and tooltip, so color is never the only cue.
**Rationale**: Russia has dozens of minority cultures. Without grouping the pie is unreadable (constitution VI).

## R6. Estates

**Decision**: New `nation_estates` table from `estate_manager.database`, one row per record with `existence=yes`, keyed by the record's `country` field. Columns: estate_type, satisfaction, gold, balance, wealth_impact, and last month's income and expense lines. The estate's tax rate comes from the country's `economy.tax_rates.<estate_type>`, stored on the same row. Population share is computed at query time from R4's pop set grouped by `estate`.
**Rationale**: Confirmed shape: the crown estate record carries only `satisfaction` and `existence`. Other estates also carry `gold`, `balance`, `wealth_impact` and `last_month.{taxable_income, uncontrolled_income, city_income, trade_income, food_income, paid_taxes, pop_expense, building_expense, rebel_expense, invest_expense, infra_expense}`. A missing value stays NULL and shows as "not tracked" (spec US7 scenario 3).
**Alternatives considered**: A child table for the `last_month` lines. Rejected: the 11 keys are fixed in this game version, so plain columns are simpler.

## R7. Subjects

**Decision**: New `subject_relations` table (overlord_idx, subject_idx, subject_type, start_date) from `diplomacy_manager.dependency` blocks: `first` = overlord, `second` = subject, subject type from the `named_targets` entry with `flag=subject_type` (`target.object`). The tree is built in the component from every row. With 195 rows, one query is enough. A visited set stops any cycle. A node is clickable only when its idx is in the nation selector's list.
**Rationale**: Confirmed in the real save: 195 blocks, direction checked against tags (POR → colonial nation AAA63, ZAN → MOZ tributary), each subject appears once (a single overlord), and 6 subjects have subjects of their own. `start_date` is on 182 of 195. This parses in the same pass as 013's diplomacy extraction, in a separate table so the 013 chord chart doesn't change.
**Alternatives considered**: Rows in `diplomatic_relations`. Rejected: the chord chart reads that table and would start drawing subject links.

## R8. Readable names for laws, policies, privileges, estates, pop types and subject types

**Decision**:
- Law category, privilege, estate, pop type and subject type names come from the existing `public/encyclopedia/*.json` files (`laws`, `estate_privileges`, `estates`, `pop_types`, `subject_types`).
- Policy names (the chosen value inside a law, like `noble_levies`) are absent from those files. They come from the game's `main_menu/localization/english/laws_and_policies_l_english.yml` via a small generator script in `tools/`, which writes `src/components/Overview/policyNames.json`. It follows the `rulerNames.json` pattern.
- Any key with no name falls back to the key with underscores turned into spaces, title-cased.
**Rationale**: `noble_levies: "Noble Levies"` confirmed in that file. It is a derived lookup, which fits the asset-redistribution stance (names, not art).

## R9. History tab

**Decision**: A new `HistoryTab` that renders `LeaderboardChart` three times (population, economic base, tax base) from `loadNationHistory`, and `RulerHistoryChart` below them. One selection is shared by all four, starts as `[selected nation]`, and is edited with `AddCountryInput`. `RulerHistoryChart` gains optional controlled props (`selectedIdxs`, `onToggle`). The Leaderboard keeps using it uncontrolled, unchanged.
**Rationale**: Reuses the exact charts the owner asked for. One shared selection matches "you can still add nations".
**Alternatives considered**: Embedding `LeaderboardTab`. Rejected: it carries page nav, a ranking view and a treemap that don't belong here.

## R10. Provinces and Locations tables

**Decision**: Both use Perspective, like today's Provinces tab. Provinces gains development, tax base, soldiers and population (the four province-grain map values) and a location count. Locations lists every owned location with control, controller, raw good, population, development, rank, market, tax base, soldiers, culture, religion and terrain. Terrain is joined in the component from the static `locationTerrain.ts` lookup, as the map does. Queries mirror the SQL in `listMapLocationsArrow` but filter by owner.
**Rationale**: Same values the map shows, same definitions, so a table and the map never disagree.

## R11. Military tab

**Decision**: Move the per-nation data assembly out of `FirepowerTab.tsx` into a shared `loadMilitaryProfiles(db, idxs)` helper next to `firepowerData.ts`. Firepower and the new `MilitaryTab` both call it. `MilitaryTab` renders `ArmyCompositionView`, a new `NavyCompositionView` that mirrors it for ships (Heavies, Lights, Galleys, Transports from `computeNavyStats`), and `MilitaryDoctrineChart` with one point.
**Rationale**: One code path for military numbers, so the Military tab and Firepower can't drift apart.

## R12. Values tab

**Decision**: `ValuesTab` reads `decodeSocietalValuesByNation` for the selected nation and shows each axis as a labeled bar from one pole to the other. Axes the nation doesn't have are listed as not applicable.
**Rationale**: "Like before" means one nation's values, not the multi-nation compass scatter. Per-axis bars show every value directly.
**Alternatives considered**: `SocietalCompassChart` with one point. Rejected: a two-axis projection of one country hides most of its values.

## R13. Old kept saves and old share links

**Decision**: Each new table gets an availability flag, `EXISTS (SELECT 1 FROM <table>)`, as 014's research §6 did for works of art. When the flag is false, the section shows "Not in this save's data — reload the save file". New `nations` columns are NULL on old data and show as not available.
**Rationale**: A kept save resumed from before 018 gets the new tables empty. A share link made before 018 imports cleanly, because import accepts a snapshot with fewer tables than the schema. Share export already includes every table, so new links carry the new data automatically.

## R14. Navigation

**Decision**: `TabId` drops `trade` and `diplomacy` and adds `history`, `locations`, `estates`, `values` and `subjects`. `economy`, `buildings` and `characters` render the existing `ComingSoonPlaceholder`. Clicking a subject calls one `selectNationAndTab(idx, "overview")` handler in `FileLoader`.

## R15. Policy and privilege effects (added during implementation, 2026-09-26)

**Decision**: The owner asked to see what each policy and privilege does. `tools/country-names/generate.ts` also writes `countryModifiers.json`: each one's `country_modifier` from the encyclopedia data, with named constants resolved from `script_values` and `*_tt` tooltip keys resolved to text, plus the name (`MODIFIER_TYPE_NAME_<key>`) and format flags (`percent`, `already_percent`, `boolean`, `decimals`, `color`) of each modifier type used. Loaded on demand, so it's its own build chunk.
**Rationale**: All three pieces are in the game files (checked: `00_modifier_types.txt`, `default_values.txt`, localization). 467 modifier types, 624 policies and 247 privileges have effects.
**Colors**: no color setting = higher is better; `color=bad` = lower is better; `color=neutral` = never colored. Sign plus screen-reader text back up the color.
**Known gaps**: `in_game/common/script_values/eu4_conversions.txt` doesn't parse (skipped with a warning). One value (`scope:recipient.total_members`) is computed by the game at runtime and is shown as raw text.

## R16. Cabinet actions: no history in the save (2026-09-26)

**Finding**: `cabinet_manager.database` has one entry per cabinet slot: `params.actor` (country), `index` (slot), `implemented_government_action.{date, object}`, `character`. Russia has 7; no country has more than 9. The country record's `government.cabinet_entries` only points at those. Nothing records past actions.
**Decision**: The owner dropped the requested Cabinet tab (time spent per action) rather than chart how long each current action has run.

## R17. Government layout (2026-09-26)

**Decision**: Policies and Estate Privileges are sub-tabs, each a table with a Modifiers column between the name and the date. Privileges are grouped into one `<tbody>` per estate with the estate name spanning its rows. The hover tooltip and Effects panel from the first version stay behind `interactiveEffects` (off), at the owner's request.

## R18. Colors from the game (2026-09-26)

**Decision**: Estate and social-class pies, estate cards and subject-type dots use the game's named colors (`main_menu/common/named_colors/02_map.txt`: `pop_*`, `estate_*`, `subject_*`, converted from hsv/hsv360). The owner chose the game-file clergy color over the peachier estate icon art. Estate and social-class pies list every group (no "Other").
