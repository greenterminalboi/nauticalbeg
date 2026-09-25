# Implementation Plan: Country & Province Map Modes

**Branch**: `main` (project convention; setup script reported `014-country-province-map-modes`) | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/014-country-province-map-modes/spec.md`

## Summary

This feature adds 12 map layers: 8 at country grain and 4 at province grain. It also groups the Map tab sidebar into Location / Province / Country sections.

Almost every source value is already in DuckDB (`nations`, `nation_history`, `population`, `nation_advances`, `locations`), confirmed against the real save in research.md §1. The only new parsing is one table, `works_of_art`, from `work_of_art_manager`.

Country and province aggregates are computed in SQL inside the existing load-once `listMapLocationsArrow` query and repeated onto every location row. Layer switching therefore stays a pure client-side prop change. Shading uses a new *grouped* percentile rank, where each country or province is ranked once rather than each location, so large countries don't dominate the scale. Stability uses a fixed diverging scale, and Treasury gets an explicit "In debt" state, because both are legitimately negative in real saves.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 18

**Primary Dependencies**: @duckdb/duckdb-wasm, apache-arrow, jomini (parser), existing canvas `MapCanvas`. No new dependencies.

**Storage**: DuckDB-Wasm on OPFS (per-save DB). +1 table (`works_of_art`), 0 ALTERs.

**Testing**: vitest + @testing-library/react + jsdom, plus fixture `tests/fixtures/rus-1628-minimal.eu5`.

**Target Platform**: Evergreen browsers, client-only.

**Project Type**: Single-project web app (`src/` + `tests/`).

**Performance Goals**: The added query cost at map load is ≤ ~1s on the 642MB real save. Pan and zoom stay as smooth as the existing layers (SC-005). A layer switch triggers no query.

**Constraints**: Parsing stays in the Web Worker. Every value shown is either raw or labeled as derived (the Literacy mean and the province sums are derived, and their tooltip labels say "average" / "total").

**Scale/Scope**: ~38k locations, ~265 live countries (2,470 slots), ~4,954 works of art, and `nation_history` in the millions of rows. The change adds 12 layers and 1 table, and edits 6 source files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | How |
|---|---|---|
| I. Read-only save handling | ✅ | No save mutation. The new table is derived from the save in the existing per-session OPFS DB. |
| II. Parser correctness, fixture first | ✅ | `works_of_art` extraction gets a fixture block and an adapter test *before* the parser code (contracts/schema.md). The shape was copied from the real save, not guessed. |
| III. Version compatibility | ✅ | The change goes into the existing `1.3.11` adapter. No new version path. |
| IV. Accurate representation | ✅ | Confirmed zero ≠ no data. Debt is shown as its own fact instead of being folded into "lowest". Empty-table kept saves say "not in this save's data" instead of showing a fake 0 (research.md §5–§6). Derived figures (literacy mean, province sums, latest-year history) are labeled in their tooltips. |
| V. Performance | ✅ | Aggregation happens once in SQL at map load, and rank caches are per-dataset `WeakMap`s. The `nation_history` cost is flagged and gets a measured check with a fallback (research.md §3, quickstart §4). |
| VI. Clarity & accessibility | ✅ | Stability is purple↔orange diverging (no red/green). Government Type hues are ≥60° apart. Text tooltips appear on every layer, and section toggles are native buttons with `aria-expanded`. The PR note includes a CVD emulation check. |
| VII. Simplicity | ✅ | One new table, one generalized helper replacing a copy-paste, and a `grain` field instead of a separate registry. No subject/overlord layer (FR-022). Firepower and diplomacy layers stay deferred. |
| VIII. AI agent | N/A | Not touched. |
| Architecture constitution (storage is the only DB toucher; parser decoupled from UI) | ✅ | SQL lives in `storage/queries.ts`, parsing in the adapter, and UI reads only `MapLocationRow`. |

**Post-design re-check (after Phase 1)**: still passes. The one design choice that could have violated IV, ranking negative treasuries as "lowest", was resolved in research.md §5.

## Project Structure

### Documentation (this feature)

```text
specs/014-country-province-map-modes/
├── plan.md              # this file
├── research.md          # Phase 0: real-save field confirmation + design decisions
├── data-model.md        # Phase 1: works_of_art table, extended MapLocationRow/MapLayer
├── quickstart.md        # Phase 1: validation guide with real-save expected values
├── contracts/
│   ├── schema.md        # works_of_art DDL + adapter extraction + fixture/test
│   ├── queries.md       # listMapLocationsArrow extension
│   └── ui.md            # grouped-rank helper, 12 layers, grouped MapSidebar
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── parser/version-adapters/1.3.11.ts     # + work_of_art_manager → works_of_art
├── storage/
│   ├── schema.sql                        # + works_of_art table
│   └── queries.ts                        # listMapLocationsArrow: + owner_*/province_* CTEs
└── components/Overview/
    ├── mapLocationData.ts                # + 14 MapLocationRow fields
    ├── mapLayers.ts                      # + grain, groupedRankSpectralLayer, 12 layers
    ├── MapSidebar.tsx / MapSidebar.css   # three collapsible grain sections

tests/
├── fixtures/rus-1628-minimal.eu5         # + work_of_art_manager block
├── parser/adapter.test.ts                # works_of_art extraction
├── storage/map-locations.test.ts         # owner_*/province_* columns
├── components/mapLayers.test.ts          # grouped rank, debt, diverging, zero vs no-data
├── components/MapSidebar.test.tsx        # grouping + per-section collapse
└── schema-mapping/*                      # structured-key expectations, if enumerated
```

**Structure Decision**: This is the existing single-project layout. No new modules. `MapTab.tsx` and `MapCanvas.tsx` are expected to need no changes.

## Suggested delivery order (for /speckit-tasks)

1. **Foundational**:
   - `grain` on `MapLayer` for all existing layers, and the grouped `MapSidebar` (US1).
   - The `groupedRankSpectralLayer` refactor, with the existing location layers unchanged and their tests still green.
   - The query CTE scaffold with the province columns.
2. **P1**: Treasury, Stability, Government Type (country; plain `nations` columns), then Province Development and Province Tax Base.
3. **P2**: Country Population and Economical Base (the `latest` CTE, with a timing check here), Literacy, Province Soldiers, Province Population.
4. **P3**: Tech Advances (availability flag), then Works of Art (fixture → test → schema → adapter → query → layer).
5. **Verify**: quickstart §2–§6 in the real app on the real save, then the wrap-up (ARCHITECTURE.md, spec-status.md, commit, push).

## Complexity Tracking

No constitution violations to justify.
