# Implementation Plan: Firepower Tab

**Branch**: `012-firepower-tab` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-firepower-tab/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a new "Firepower" sibling tab to Factbook (alongside Wars, Leaderboard,
Markets, Societal Values Compass) with three sub-views: Military Doctrine
(reuses feature 010's `nation_societal_values` data for the three axes it
deliberately excluded), Army Stats, and Navy Stats. The two stat tables
require substantial new parsing (regiment/ship aggregation from
`unit_manager`/`subunit_manager`, plus `implemented_reforms`,
`implemented_privileges`, and military law choices, none of which are
parsed today) and a set of static reference tables — built once from the
game's own definition files, following the existing `rgoGameColors.ts`/
`axisConfig.json` precedent — mapping unit types to category+age, advances
to unit unlocks, and every advance/reform/privilege/law/societal-value
source to the five computed Army Stats (discipline, tactics, fort limit,
siege ability, fort defense/`global_defensive`).

## Technical Context

**Language/Version**: TypeScript (React 19), matching the rest of the app

**Primary Dependencies**: `jomini` (WASM save parser, already in use),
DuckDB-Wasm (already in use), React (already in use) — no new runtime
dependencies anticipated; static reference tables are generated data
files (JSON/TS), not a new dependency

**Storage**: DuckDB-Wasm, client-side, single OPFS-backed file per loaded
save (per ARCHITECTURE.md's existing decision) — new tables added to the
existing `src/storage/schema.sql`

**Testing**: `vitest`, fixture-based per Constitution Principle II —
extends `tests/fixtures/rus-1628-minimal.eu5` with representative
`unit_manager`, `subunit_manager`, `implemented_reforms`,
`implemented_privileges`, and law-choice data

**Target Platform**: Evergreen browsers (client-side only), matching the
rest of the app — no server-side component

**Project Type**: Single web application (existing structure, no new
top-level project)

**Performance Goals**: Sub-tab switch and country-table render MUST stay
interactive (Constitution Principle V) even on a save with hundreds of
countries and a `subunit_manager` table that can run into the tens of
thousands of rows on a large, long-running campaign save

**Constraints**: All computation client-side (Principle I); static
reference tables MUST be pre-generated (not scraped from game files at
app runtime) since the game install isn't guaranteed to be present for
every user; no player character/leader trait parsing in this feature
(spec Assumptions — accepted partial-total gap on 3 of the 5 computed
Army Stats)

**Scale/Scope**: 3 sub-views under 1 new Factbook tab; 2 new storage
tables (regiment/ship aggregation may be view-computed rather than
materialized, see data-model.md) plus extensions to the country-level
adapter for reforms/privileges/laws; on the order of 5-10 new static
reference data files (unit type→category/age, advance→unit unlock,
per-stat modifier source catalogs)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Read-Only, Non-Destructive Save Handling** — PASS. Purely additive
  parsing/reads; no save mutation introduced.
- **II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE)** — PASS,
  with an explicit early task: the fixture must gain representative
  `unit_manager`/`subunit_manager` entries (army + navy), `researched_advances`
  covering at least one unlock per age for one category, `implemented_reforms`,
  `implemented_privileges`, and at least one military law choice, each with a
  regression test, before the new adapter logic merges — same pattern feature
  010 used for `societal_values`.
- **III. Explicit Format-Version Compatibility** — PASS. All new parsing
  lands in the existing `1.3.11.ts` version adapter; no new adapter needed
  unless save version support changes.
- **IV. Accurate, Unembellished Representation** — PASS, with a concrete
  design obligation: the five computed Army Stats MUST be visually/textually
  marked as partial totals (spec FR-013) since character/leader trait
  sources are knowingly excluded, and any column whose real data source
  can't be confirmed in Phase 0 research (damage given/taken, levy/regulars
  split) MUST be omitted rather than estimated (spec FR-010, FR-011).
- **V. Performance & Scalability for Large Saves** — PASS, with a design
  obligation: regiment/ship aggregation (potentially tens of thousands of
  `subunit_manager` rows) MUST be done as a SQL aggregate query, not
  row-by-row JS, and MUST NOT block the main thread — reuses the existing
  worker-based parse pipeline; the per-country stat tables page/scroll
  rather than rendering unbounded countries at once if a save's country
  count is large.
- **VI. Visualization Clarity & Accessibility** — PASS. Military Doctrine
  reuses the already-accessible `SocietalCompassChart` presentation
  pattern; Army/Navy Stats tables follow existing table conventions
  (`LeaderboardRankingTable`, `MarketGoodsTable`).
- **VII. Simplicity & Incremental Scope** — PASS, with a scope note: the
  five-stat "formula engine" and unit-unlock lookup are the largest net-new
  pieces of logic this project has taken on for a single feature; they are
  scoped down to exactly the sources actually found in Phase 0 research
  (no speculative generalization to a full game-modifier-engine covering
  stats this feature doesn't need).
- **VIII. Grounded AI Query Agent** — N/A. No copilot/agent surface touched
  by this feature.

## Project Structure

### Documentation (this feature)

```text
specs/012-firepower-tab/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/parser/version-adapters/1.3.11.ts   # + unit_manager, subunit_manager,
                                         #   researched_advances (already
                                         #   parsed for societal_values'
                                         #   gating? verify), implemented_reforms,
                                         #   implemented_privileges, law
                                         #   choices

src/storage/schema.sql                  # + regiments/ships aggregation
                                         #   tables (or views), reforms/
                                         #   privileges/laws tables

src/storage/queries.ts                  # + per-country Army/Navy Stats
                                         #   query functions

src/components/Overview/tabs.ts         # + "firepower" EncyclopediaTab

src/components/Overview/
├── FirepowerTab.tsx / .css             # new: owns the 3-sub-view switch,
│                                       #   mirrors MarketsTab/LeaderboardTab
├── FirepowerSideNav.tsx / .css         # new: sub-nav (Doctrine/Army/Navy),
│                                       #   mirrors MarketsSideNav
├── MilitaryDoctrineChart.tsx / .css    # new: 3-axis radar, reuses
│                                       #   compassPosition.ts math where
│                                       #   applicable
├── ArmyStatsTable.tsx / .css           # new
├── NavyStatsTable.tsx / .css           # new
├── unitTypeReference.ts                # new static data: unit type →
│                                       #   {category, age}, generated the
│                                       #   same way as rgoGameColors.ts
├── unitUnlockReference.ts              # new static data: advance →
│                                       #   unlocked unit type(s) [+ gate]
└── militaryModifierReference.ts        # new static data: advance/reform/
                                        #   privilege/law/societal-value →
                                        #   {stat, value}, one entry per
                                        #   confirmed source

tests/parser/adapter.test.ts            # extend: unit_manager/subunit_manager
                                         #   + reforms/privileges/laws
tests/fixtures/rus-1628-minimal.eu5     # extend per Constitution II
tests/storage/                          # new: Army/Navy Stats query tests
```

**Structure Decision**: Single existing web application, no new project.
Firepower joins Wars/Leaderboard/Markets/Societal Compass as a sibling
`EncyclopediaTab` inside the existing Factbook section — **not** the
existing per-nation "Military" `TabId` placeholder (Countries sub-tab's
own unbuilt category list in `SideNav.tsx`/`FileLoader.tsx`), which is a
different, still out-of-scope feature (a single selected country's detail
view) that this work does not touch or resolve.

## Constitution Check (post-Phase 1 re-check)

No changes to the pre-Phase-0 gate results. Two design decisions worth
recording against Principle IV/VII specifically:

- The static Modifier Source Reference and Unit Unlock Reference are
  deliberately scoped to exactly the sources research.md confirmed for
  the 5 stats this feature needs — not a general-purpose game-modifier
  engine (Principle VII).
- The culture-group gate on unique unit unlocks has a documented,
  bounded fallback (data-model.md's "known accepted simplification") if
  a specific `potential=` trigger proves more complex than a simple
  culture-group check during implementation — an honest approximation
  that can only ever over-include, never fabricate a false negative,
  and is flagged rather than silently applied (Principle IV).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
