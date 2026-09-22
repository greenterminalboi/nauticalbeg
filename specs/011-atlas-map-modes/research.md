# Phase 0 Research: Expanded Atlas Map Modes

All findings below were confirmed by directly inspecting a real, full save file (`/Users/halda/Downloads/Russia (Melted).eu5`, 642MB, per [[eu5_save_format_gotchas]]) and, for terrain, the real local game install (`game/in_game/map_data/location_templates.txt`). None were inferred from `tests/fixtures/rus-1628-minimal.eu5` — that fixture was hand-minimized for earlier features and silently omits fields this feature needs; treating an absence there as "the save doesn't have this" produced two wrong conclusions during specification (see [[never_guess_map_mode_fields_from_fixture]]) before the real save was checked directly.

## 1. Decision: drop Location Wealth, Food Productivity, and Sailors

**Decision**: These three modes from the original request are out of scope for this feature.

**Rationale**: Exhaustively checked against the real save:
- **Location Wealth**: no field named `wealth` (or anything else identifiable as a location-level wealth figure) exists anywhere in the save. The one candidate considered (`locations.locations[idx].value_flow`) was rejected after checking its actual distribution across all locations — median `1.78`, max `~2.01 trillion` — a spread inconsistent with any plausible in-game currency/wealth figure; it reads as an internal trade-routing value, not a player-facing stat.
- **Food Productivity**: no field exists anywhere in the entire `locations.locations` block (confirmed by grepping all ~5.67M lines of that block in the real save — zero matches for `food`). Food data exists only at the *province* level (`provinces.database[i].food.current`, `max_food_value`, `food_growth_modifier`), one level up from locations.
- **Sailors**: exists only as a country-wide pool (`countries.database[idx].currency_data.sailors`), not per-location. (Unlike Soldiers — see §4 — there is no `population.pop_stats.sailors` entry on the locations checked; a location's population breakdown carries `nobles`/`clergy`/`burghers`/`laborers`/`soldiers`/`peasants` but not a sailor profession.)

**Alternatives considered**: Approximating Wealth from `prosperity` or `possible_tax`, or spreading the province/country-level Food/Sailors figure across member locations, were both proposed and rejected per project direction — per constitution Principle IV (Accurate, Unembellished Representation), presenting a province- or country-wide figure as if it were a per-location reading (with no visual distinction) would misrepresent the save's actual granularity. Dropping is simpler and honest; either could return as a future feature if a genuine per-location source is found.

## 2. Decision: Tax Base sources `possible_tax`, not `tax`

**Decision**: The "Tax Base" layer shades by `locations.locations[idx].possible_tax`.

**Rationale**: The save carries both `tax` (current, already-modified tax revenue: `48.04188` on the sample location) and `possible_tax` (the location's maximum/potential tax value before autonomy or other current-state reductions: `48.04188` — identical on a fully-integrated core location, but expected to diverge on a newly-conquered or low-autonomy one). "Tax base" is the standard fiscal-policy term for the underlying assessable value before actual collection, which maps to `possible_tax`, not the current collected `tax`.

**Alternatives considered**: `tax` (current collected revenue) was considered but rejected — it answers "how much tax am I actually getting" rather than "how much tax base does this location have," which is the layer the user asked for by name.

## 3. Decision: Soldiers sources `population.pop_stats.soldiers.produced`

**Decision**: The "Soldiers" layer shades by `locations.locations[idx].population.pop_stats.soldiers.produced`.

**Rationale**: `population.pop_stats` on every location breaks down its population by profession (`nobles`, `clergy`, `burghers`, `laborers`, `soldiers`, `peasants`), each carrying `population_ratio`, `produced`, `last`, `unemployed`, and `changes` sub-fields — confirmed present on the real save (this is the field the earlier, fixture-based search missed entirely, since the minimized fixture doesn't carry a full `population.pop_stats` block on its sample locations). `produced` is the closest analog across this codebase's existing conventions to "how many of this location's population are soldiers" (a headcount-like figure), matching how the existing Location Population layer already shades by a raw headcount (`totalPopulation`), not a ratio.

**Open verification item (carried into tasks.md, not blocking this plan)**: Whether `produced` or `population_ratio` most accurately represents "soldier count" is not yet independently cross-checked against the game's own displayed number for a specific location. `population.pop_stats.*.produced` is the working choice; the implementation task that writes this extraction must spot-check it against the in-game location panel for at least one location, per constitution Principle II/IV, before this is considered confirmed rather than a best-reading choice.

## 4. Decision: Primary Culture / Primary Religion resolve via two new per-save reference tables

**Decision**: Add `cultures(idx, name, color_r, color_g, color_b)` and `religions(idx, name, color_r, color_g, color_b)`, populated from the save's own `culture_manager.database` and `religion_manager.database` sections. `locations.culture`/`locations.religion` (already-numeric ids, structurally identical to the existing `population.culture`/`population.religion` columns from feature 002/004) join against these new tables for both the map layer's legend/tooltip name and its color.

**Rationale**: `locations.locations[idx].culture`/`.religion` are bare numeric ids (`1851`, `15` on the sample location) with no existing name-lookup anywhere in this app's schema — the only other tables carrying `culture`/`religion` columns (`population`) store them as the same opaque ids, never resolved to a name. Confirmed in the real save that `culture_manager.database.<id>` and `religion_manager.database.<id>` are keyed by exactly this id and carry both `name` (a clean string, e.g. `"dakelh_culture"`) and the game's own `color` (an `rgb {r g b}` literal, same shape the parser already decodes for `nations.color_*`). Using the save's own colors means Primary Culture/Primary Religion need no golden-angle fallback-color generation for any id that resolves — only for the edge case of an id absent from that save's manager section (rare/malformed data), where the existing RGO-style fallback approach applies.

**Alternatives considered**: Reading `culture`/`religion` from the static `location_templates.txt` install file (which also carries a `religion =`/`culture =` field per location name) was considered and rejected — that file describes each location's *default/historical* culture and religion, not its current save-state value, which can change over the course of a game (conversion, migration). The save's own `locations.culture`/`.religion` fields are the current, authoritative values and were already being read as opaque ids nowhere else in the app, so extending that path is both more correct and reuses existing parsing.

**Parser scope note**: `culture_manager` and `religion_manager` are not in `1.3.11.ts`'s current `STRUCTURED_KEYS` set (today they fall into the generic `raw_sections` catch-all). Both must be added to `STRUCTURED_KEYS` and given their own small extraction pass, mirroring how `market_manager` was added for feature 007.

## 5. Decision: Location Terrain is generated static reference data, not save-parsed

**Decision**: A one-time generation script (`tools/map-generation/generate-terrain-lookup.ts`) reads the real local game install's `game/in_game/map_data/location_templates.txt`, extracts `<location_name> → topography` for all 28,573 entries, and writes a committed TypeScript lookup table (`src/components/Overview/locationTerrain.ts`), following the exact precedent `rgoGameColors.ts` already established for RGO colors. The Location Terrain layer's `getFill`/`getTooltipFields`/`getLegend` read from this static table, joined by the same `name` key already used to join map geometry to save data (per feature 005's own join-key research).

**Rationale**: Confirmed real values in `location_templates.txt` — `topography = flatland`, `topography = mountains`, etc., 21 distinct categories across the whole file (`atoll`, `coastal_ocean`, `deep_ocean`, `dune_wasteland`, `flatland`, `flatland_wasteland`, `high_lakes`, `hills`, `hills_wasteland`, `inland_sea`, `lakes`, `mesa_wasteland`, `mountain_wasteland`, `mountains`, `narrows`, `ocean`, `ocean_wasteland`, `plateau`, `plateau_wasteland`, `salt_pans`, `wetlands`, `wetlands_wasteland`), a small enough set for a clean legend with no "scannable, not a wall of colors" concern. Terrain does **not** appear anywhere in the save file itself — it is static per-location-name game-definition data, identical in kind to the raw-good→color table the constitution's Encyclopedia-data exception was already written to cover (structured, factual, non-artistic reference data derived from the base game's own definition files).

**Alternatives considered**:
- **Bake `topography` into the `public/map/locations.topojson` asset** (feature 003's generation tool, `tools/map-generation/generate.ts`, currently writes only `name` into each location feature's `properties`) — rejected: would require re-running full geometry generation and re-committing the topojson asset, a much larger blast radius than adding one small new generated data file, for no benefit over the `rgoGameColors.ts`-style approach this app already uses for exactly this kind of per-location static lookup.
- **Read `location_templates.txt` at runtime from the user's local install** — rejected: the app has no access to the user's local filesystem at runtime (it's a browser app processing an uploaded save), and every other piece of "read from local game files" data in this app (RGO colors, Encyclopedia content) is resolved at generation/build time and committed, never read live.

## 6. Decision: Location Market reads `locations.market` directly

**Decision**: Add `market_idx INTEGER` to `locations` (additive `ALTER TABLE`, extracted from `locations.locations[idx].market`), and join to the existing `markets` table for a display name.

**Rationale**: Confirmed the location record itself already carries `market=<idx>` (and `second_best_market=<idx>`) directly — no need to derive market membership from `markets`' unnormalized member-location list (which schema.sql's own comment already notes was deliberately not normalized, "no FR reads the individual member locations"). This is simpler than originally planned: a straight column addition plus a join, not a membership-list join.

**Alternatives considered**: Normalizing `markets`' member-location list into its own join table was considered (and was the original, more complex plan) and rejected once `locations.market` was confirmed present — reading the field a location already carries is strictly simpler and avoids touching the existing `markets`/`market_goods` tables at all.

## 7. Decision: Location Rank reads `locations.rank` directly

**Decision**: Add `rank TEXT` to `locations` (additive `ALTER TABLE`), extracted from `locations.locations[idx].rank`.

**Rationale**: Confirmed present and populated on every location checked, with exactly four distinct values across the whole real save (`rural_settlement`: 16,721: `town`: 2,895; `city`: 1,702; `megalopolis`: 6) — a small, clean categorical set, no fallback-color concerns.

**Alternatives considered**: `original_rank` (also present) was considered — rejected, since it records a location's rank at some earlier point (e.g. game start), not its current state, and the spec asks for the location's current settlement tier.

## 8. Development

No new research needed — `locations.development` is already extracted by the existing `1.3.11.ts` parser (feature 001/005) and already stored; this layer only needs a new `MapLayer` entry and no schema/parser change at all.

## 9. Post-ship, explicit user request (2026-09-22): a shared percentile-rank spectral gradient, and a reserved zero color

**Decision**: Population, Development, and Tax Base now share one factory (`rankSpectralLayer` in `mapLayers.ts`) instead of each having its own bespoke two-color scale: percentile-rank normalization (the same fix a 2026-09-21 post-ship correction already established for Development alone, undocumented here at the time — see `mapLayers.ts`'s own doc comment on `developmentLayer`) paired with a 7-stop purple→blue→green→light green→yellow→orange→red gradient (`SPECTRAL_STOPS`). User-requested explicitly — "more colors... normalized in such a way that it's very easy to spot the difference." Soldiers was left on the original `numericLayer` two-color/log-scale path (not mentioned in the request).

**Rationale for percentile rank over the gradient's 7 stops**: a skewed value distribution (log or linear) would still bunch most locations into one or two of the 7 stops; rank spreads every location an even `1/(N-1)` apart by construction, so the wider palette is actually legible everywhere along the scale, not just at the extremes.

**Reserved zero color**: `ZERO_COLOR` (dark charcoal, `[58, 58, 58]`) is now distinct from `NEUTRAL_COLOR` (light gray, `[200, 200, 200]`) — a location confirmed at exactly `0` is a different fact from "no data," and conflating them (both previously rendered as `NEUTRAL_COLOR`) understated what the save actually confirms. Applies to Development/Tax Base (`number | null` fields) directly; verified live against the real save that a deleted country's still-existing locations read `development: null` → gray "No data", distinctly from any location confirmed at `0` → dark "Zero".

**Population's null-vs-zero gap, and how it's closed**: `totalPopulation` is typed plain `number` (never null) because its SQL source already collapses "no population rows joined" to a bare `0` via `COALESCE(pop_totals.total_population, 0)` (`queries.ts:407`) before it ever reaches the map layer — population alone can't structurally distinguish "confirmed zero" from "never recorded" the way development/tax base can. Per the user's own rule ("if a location has no data for development, treat population the same way"), `populationLayer`'s value getter became `row.development === null ? null : row.totalPopulation` — wherever development has no confirmed reading, population is now shown as "no data" too, overriding the `COALESCE` default, rather than an unowned/untracked location blending into the ocean-colored background at whatever the SQL default happened to leave it at. Verified live: the save's unownable/untracked East Asia region (confirmed via the Political layer, not assumed to be any specific country) now reads gray on Population, matching Development, instead of showing a real-looking but meaningless value.

**Also, separately (same session): a Canvas-only pseudo-3D extrusion prototype** for these same three layers exists but is explicitly experimental/unshipped — see `ARCHITECTURE.md`'s own decision-log entry rather than this feature's formal scope; it was never run through `/speckit-specify` and has no task list of its own.
