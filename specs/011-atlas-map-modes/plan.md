# Implementation Plan: Expanded Atlas Map Modes

**Branch**: `011-atlas-map-modes` | **Date**: 2026-09-21 | **Spec**: [atlas-map-modes.spec.md](./atlas-map-modes.spec.md)

**Input**: Feature specification from `/specs/011-atlas-map-modes/atlas-map-modes.spec.md`

**Scale note**: This feature adds eight new map layers (Development, Location Terrain, Location Rank, Primary Culture, Primary Religion, Location Market, Tax Base, Soldiers), touching the parser, schema, queries, the per-location dataset loader, and `mapLayers.ts`, plus two new small reference tables (`cultures`, `religions`) and one generated static lookup (terrain). It spans five existing source files, two new database tables, and one new generated data file — read the Project Structure and data-model.md together before starting, since several layers share the same new query and dataset-loading changes rather than being independent slices.

## Summary

Extends feature 005's map-layer infrastructure (sidebar, tooltip, legend, pan/zoom-preserving switch, single active layer, load-once-per-save dataset) with eight new `MapLayer` entries in `src/components/Overview/mapLayers.ts`, none of which change the existing four layers (Political, Location Population, RGO, Control). Every new field was confirmed against a real, full save file (`/Users/halda/Downloads/Russia (Melted).eu5`) during specification, not inferred from the trimmed test fixture — three originally-requested modes (Location Wealth, Food Productivity, Sailors) were dropped from scope because no genuine per-location save field backs any of them. Five of the eight new attributes (`rank`, `culture`, `religion`, `market`, `tax`/`possible_tax`, `population.pop_stats.soldiers`) are extracted from the save's existing `locations.locations[idx]` record the same way `raw_material`/`control` already are; `culture` and `religion` are numeric ids that resolve to real names and in-game colors via two new small per-save tables (`cultures`, `religions`) sourced from the save's own `culture_manager`/`religion_manager` sections, which aren't parsed today. Location Terrain is the one exception to "per-save data": terrain is static per-location-name reference data that lives only in the game's own install files (`location_templates.txt`), never in a save, so it is resolved the same way `rgoGameColors.ts` already resolves RGO colors — extracted once from a local game install and committed as a small generated TypeScript lookup table, per the constitution's Encyclopedia-data exception.

## Technical Context

**Language/Version**: TypeScript (existing stack) — no change.

**Primary Dependencies**: No new dependency. Reuses `@duckdb/duckdb-wasm` + `apache-arrow` (existing query/decode path), `jomini` (existing save parser), `react`/`react-dom` (existing UI). The terrain lookup's generation script reuses the existing local-game-file-reading pattern already established by `tools/map-generation/` and `rgoGameColors.ts`'s own generation approach — no new tooling dependency.

**Storage**: DuckDB (existing). Extends the existing per-save schema: `locations` gains new columns (additive `ALTER TABLE`, matching feature 005's own pattern), and two new small reference tables are added: `cultures` and `religions` (id, name, color — mirroring the existing `markets` table's shape).

**Testing**: `vitest` (existing), against the real trimmed fixture `tests/fixtures/rus-1628-minimal.eu5` — **which must first be extended** to carry the new fields this feature reads (`rank`, `market`, `culture_manager`/`religion_manager` sections, `population.pop_stats.soldiers`), per constitution Principle II (NON-NEGOTIABLE fixture+test requirement). Per project feedback recorded this session, no field's existence or shape may be assumed from the fixture as it stands today — every field extracted here was independently confirmed against the real save first ([[never_guess_map_mode_fields_from_fixture]]).

**Target Platform**: Evergreen browsers (existing — no native install), client-side/in-browser only.

**Project Type**: Single web application (existing `src/` tree) — no new top-level project.

**Performance Goals**: Layer switch in under 1s with zero additional data loading (matching feature 005's SC-002/FR-016); pan/zoom/layer-switch stays responsive across a save's full ~28,573-location set (matching feature 005's SC-006).

**Constraints**: No new heavy dependency (constitution Principle VII). Every new layer's value must trace to a real, confirmed field — never fabricated or estimated (Principle IV); this is why three originally-requested modes were dropped rather than approximated. Terrain data must never be committed as raw game art/text, only as structured reference data derived from it (Technical Constraints' Encyclopedia-data exception) — the topography value list (21 categories) and location names are exactly this kind of structured, factual data.

**Scale/Scope**: ~28,573 locations per save. Eight new map layers. Five new/extended database objects (`locations` +6 columns, two new tables `cultures`/`religions`). One new generated static data file (terrain lookup, ~28,573 entries, name-keyed like `rgoGameColors.ts`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — still holds.*

| Principle | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | ✅ Pass | Reads more fields from data already being parsed; no change to save-file handling. |
| II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE) | ✅ Pass (planned) | Every new field (`locations.rank/market/tax/possible_tax`, `population.pop_stats.soldiers`, `culture_manager`/`religion_manager`) gets extraction code in `1.3.11.ts` plus a fixture-backed regression test — the fixture must be extended first, tracked as an explicit task before any new extraction code is written. |
| III. Explicit Format-Version Compatibility | ✅ Pass | No new version handling — extends the existing single `1.3.11` adapter with fields already confirmed present for that version against a real save of that version. |
| IV. Accurate, Unembellished Representation | ✅ Pass | Every layer's value traces to a real, confirmed raw save field or, for Terrain, a real static game-definition file — nothing invented or estimated. Location Wealth, Food Productivity, and Sailors were dropped specifically because no real field could be confirmed for them, rather than shipping a guessed one. |
| V. Performance & Scalability for Large Saves | ✅ Pass | Reuses feature 005's load-once/recolor-from-memory design (`loadMapLocationDataset`) and existing canvas rendering; no new per-layer query. |
| VI. Visualization Clarity & Accessibility | ✅ Pass (with a design constraint) | Culture/Religion reuse the save's own real per-id colors (`culture_manager`/`religion_manager`); Terrain/Rank/Market use the same distinguishable-color-assignment approach RGO already established; every new layer keeps a tooltip as the non-color-dependent identification path. |
| VII. Simplicity & Incremental Scope | ✅ Pass | No new dependency; reuses the existing `MapLayer` registration pattern and query/dataset-loading shape rather than inventing a new one; three requested modes were cut rather than half-built on guessed data. |
| VIII. Grounded AI Query Agent | N/A | No agent-facing capability changes. |
| Technical Constraints — parsing/visualization decoupling | ✅ Pass | New layers are purely new consumers of the existing parsed/stored representation; no parsing logic lives in `mapLayers.ts`. |
| Technical Constraints — no Paradox asset redistribution | ✅ Pass | Terrain data is structured reference data (topography category per location name), matching the existing `rgoGameColors.ts` precedent explicitly carved out by the constitution's Encyclopedia-data exception — no art/texture/icon is touched. |

**Gate result**: PASS, no exceptions needed — no Complexity Tracking entries below.

## Project Structure

### Documentation (this feature)

```text
specs/011-atlas-map-modes/
├── atlas-map-modes.spec.md   # Feature spec
├── plan.md                   # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
└── tasks.md                   # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
tools/
└── map-generation/
    ├── generate-terrain-lookup.ts   # NEW: reads location_templates.txt, writes src/components/Overview/locationTerrain.ts
    └── types.ts                      # extended: topography type, if not already modeled

src/
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts              # extended: +locations.rank/market/tax/possible_tax,
│                                    #           +population.pop_stats.soldiers → locations.soldiers,
│                                    #           +culture_manager → cultures rows, +religion_manager → religions rows
├── storage/
│   ├── schema.sql                  # extended: ALTER TABLE locations ADD rank/market_idx/tax/possible_tax/soldiers;
│                                    #           + CREATE TABLE cultures, CREATE TABLE religions
│   └── queries.ts                  # extended: listMapLocationsArrow gains rank/culture(name+color)/religion(name+color)/market_idx/tax_base/soldiers
└── components/
    └── Overview/
        ├── mapLocationData.ts      # extended: MapLocationRow gains rank/primaryCulture/primaryReligion/marketIdx/taxBase/soldiers
        ├── mapLayers.ts             # extended: +8 MapLayer entries (development/terrain/rank/culture/religion/market/taxBase/soldiers)
        └── locationTerrain.ts       # NEW (generated): location name → topography, committed like rgoGameColors.ts

tests/
├── fixtures/
│   └── rus-1628-minimal.eu5        # extended: +rank/market/tax/possible_tax on existing location entries,
│                                     #           +minimal culture_manager/religion_manager sections,
│                                     #           +population.pop_stats.soldiers on at least one location
└── parser/
    └── adapter.test.ts              # extended: assertions for every new field above
```

**Structure Decision**: No new top-level directory. This is purely additive to feature 005's already-established layout (`src/parser` → `src/storage` → `src/components/Overview/mapLayers.ts`), plus one small generation script in the existing `tools/map-generation/` directory (matching `rgoGameColors.ts`'s own generation-then-commit precedent) rather than reading `location_templates.txt` at runtime.
