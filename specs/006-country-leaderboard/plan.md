# Implementation Plan: Country Leaderboard

**Branch**: `006-country-leaderboard` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-country-leaderboard/spec.md`

## Summary

Fill in the app's existing "Leaderboard" placeholder
(`EncyclopediaTab`'s `"leaderboard"` value, currently rendering
`ComingSoonPlaceholder`) with three hand-rolled SVG line graphs —
population, economic base, and tax base, always shown together rather
than behind a metric toggle (revised during implementation from an
earlier two-graph-plus-toggle design; see spec.md's User Story 3
revision note) — each supporting independent zoom/pan and expanded
axis tick labels, plotting every currently selected country's history
across the full campaign, plus a search bar overlay for choosing which
countries are selected. The technical core is three per-country time
series the save already tracks but this app has never extracted:
`historical_population`, `historical_tax_base`, and
`historical_economical_base`, each a flat per-year array confirmed
directly against the real reference save (research.md §1). These land
in a new `nation_history` table (one row per nation/year/metric) via an
additive schema change, populated by extending the existing
`nationRows` parser loop. A second, smaller parser addition
(`nations.is_human_played`) marks every country any human player
controls per the save's `played_country` records, driving the page's
default selection so it's never empty on first open. Rendering is
hand-rolled SVG (not the app's existing Perspective charting, and not
canvas) because the one requirement no off-the-shelf option here
satisfies is binding each line's exact stroke color to that specific
country's real in-game RGB — the same reasoning, and the opposite scale
tradeoff, as feature 005's canvas choice for the map (research.md §7).

## Technical Context

**Language/Version**: TypeScript (existing stack) — no change.

**Primary Dependencies**: No new dependency. Reuses `@duckdb/duckdb-wasm`
+ `apache-arrow` (existing query/decode path, `src/storage/db.ts`),
`react`/`react-dom` (existing UI). Explicitly does **not** add a
charting library, and explicitly does not route through the app's
existing `@perspective-dev/viewer-charts` — research.md §7 explains why
neither fits this feature's per-country-RGB requirement.

**Storage**: DuckDB (existing, via `@duckdb/duckdb-wasm`, OPFS-persisted
for kept saves). Extends the existing per-save schema: `nations` gains
one new column (`is_human_played`, additive `ALTER TABLE`), and one new
table `nation_history` is added (data-model.md).

**Testing**: `vitest` (existing), against the real trimmed fixture
`tests/fixtures/rus-1628-minimal.eu5` (constitution Principle II —
NON-NEGOTIABLE fixture+test requirement for every parser change). The
fixture does not currently carry `historical_*` fields or more than one
`played_country` entry (confirmed during research) — extending the
fixture is a prerequisite task, not optional.

**Target Platform**: Evergreen browsers (existing — no native install),
client-side/in-browser only; no server-side component is introduced.

**Project Type**: Single web application (existing `src/` tree) — no new
top-level project, no backend/service split.

**Performance Goals**: All three graphs render within a couple seconds
of opening Encyclopedia → Leaderboard for the default (human-played)
selection (spec SC-002); adding/removing a country via search updates
all three graphs with no perceptible delay (spec SC-005); zooming in
on a graph narrows its visible range in under 1 second, same for reset
(spec SC-004, FR-013).

**Constraints**: No new charting/rendering dependency (constitution
Principle VII, research.md §7); heavy/blocking work must not freeze the
UI thread (Principle V) — this feature's data volumes (a few dozen
countries × ~293 years × up to 3 metrics, well under the map feature's
~28,573-location scale) are expected to stay comfortably within a
single main-thread query/render cycle, consistent with this codebase's
existing main-thread query precedent (`queries.ts`), but implementation
should confirm against a full real save's worst case (a many-human
multiplayer save, `is_human_played` potentially selecting 20+ countries
by default) rather than assume; every line must remain identifiable via
tooltip text independent of color (Principle VI).

**Scale/Scope**: Up to 2,470 country slots per save (~2,467
`country_type = 'Real'`, per research.md §4), ~293 years of history per
country per metric, 3 metrics, one new table (`nation_history`, up to
~2.1M rows in the parsed worst case per data-model.md), one extended
table (`nations` +1 column), two new query functions, one new UI page
replacing an existing placeholder.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1
design — still holds.*

| Principle | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | ✅ Pass | This feature only reads more fields from data already being parsed (client-side); nothing about save-file handling changes, no new server-side component. |
| II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE) | ✅ Pass (planned, with a prerequisite) | Every new field (`historical_population`/`historical_tax_base`/`historical_economical_base`, `is_human_played`) gets extraction code in `1.3.11.ts` plus a fixture-backed regression test — but the current fixture doesn't carry this data yet, so extending `tests/fixtures/rus-1628-minimal.eu5` is an explicit, ordered-first task, not assumed. |
| III. Explicit Format-Version Compatibility | ✅ Pass | No new version handling needed — extends the existing single `1.3.11` adapter with fields confirmed present for that version (research.md §1). |
| IV. Accurate, Unembellished Representation | ✅ Pass | Every plotted value traces to a real raw save field (research.md §1); the one derived judgment call — suppressing leading-zero years as "didn't exist yet" (research.md §8) — is explicitly called out as a presentation-layer rule applied to real data, not a fabricated value, and is documented in both data-model.md and the contract, not silently baked in. |
| V. Performance & Scalability for Large Saves | ✅ Pass (with a verify task) | Query scoped to the selected-country subset, not a full-table load (`listNationHistoryArrow`, contracts/leaderboard-data-contract.md) — unlike feature 005's deliberate load-everything-once, this data volume is large enough in the worst case (§ Scale/Scope) that scoping to selection matters; `tasks.md` should include a verification step against a real multiplayer-scale save (many `is_human_played` countries), not just the trimmed fixture. |
| VI. Visualization Clarity & Accessibility | ✅ Pass (with a design constraint) | Hover/point inspection surfaces country name as text (spec FR-012) — the non-color-dependent identification path this principle requires; quickstart.md's step 5 is a dedicated spot-check for the "similar colors" edge case. |
| VII. Simplicity & Incremental Scope | ✅ Pass | No new dependency (research.md §7); new `nation_history` table uses the narrowest shape that serves the spec (one metric column, not three, so a future metric doesn't need a schema change) without speculatively generalizing further; reuses the existing `country_type = 'Real'` filter convention rather than inventing a new one (research.md §4). |
| VIII. Grounded AI Query Agent | N/A | This feature adds no agent-facing capability; `nation_history` could later be exposed as an agent tool like any other query, but that's not in this feature's scope. |
| Technical Constraints — parsing/visualization decoupling | ✅ Pass | The Leaderboard page is purely a new consumer of the parsed/stored representation (`nations`/`nation_history`); no parsing logic lives in the rendering layer. |
| Technical Constraints — no Paradox asset redistribution | ✅ Pass | All data (population/wealth values, colors) is derived from the user's own loaded save; no new game-derived asset is added. |

**Gate result**: PASS, no exceptions needed — no Complexity Tracking
entries below.

## Project Structure

### Documentation (this feature)

```text
specs/006-country-leaderboard/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── leaderboard-data-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Existing single-project web app layout (no new top-level directory);
this feature touches the parser, storage, and one new UI area, and
removes one line of placeholder wiring:

```text
src/
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts          # extended: +nations.is_human_played,
│                                #           +nation_history rows,
│                                #           +asNumberArray helper
├── storage/
│   ├── schema.sql              # extended: ALTER TABLE + new nation_history table/index
│   └── queries.ts              # extended: + listLeaderboardCountriesArrow, listNationHistoryArrow
└── components/
    └── Overview/                # flat — no subdirectories anywhere in this
                                  # tree today; this feature follows that
                                  # convention rather than introducing the
                                  # first nested folder
        ├── FileLoader.tsx      # extended: encyclopediaTab === "leaderboard"
                                  #           renders LeaderboardTab, not
                                  #           ComingSoonPlaceholder (line ~441)
        ├── tabs.ts              # unchanged (EncyclopediaTab already has "leaderboard")
        ├── LeaderboardTab.tsx   # owns selected-country state; renders one
                                  #   LeaderboardChart per metric (population,
                                  #   economical_base, tax_base — no toggle)
        ├── LeaderboardTab.css
        ├── LeaderboardChart.tsx # hand-rolled SVG line chart with zoom/pan
                                  #   and expanded tick labels (research.md §7);
                                  #   one instance per graph, three per page
        ├── LeaderboardChart.css
        ├── CountrySearchOverlay.tsx  # search bar overlay (spec User Story 2)
        ├── CountrySearchOverlay.css
        └── leaderboardData.ts   # decode listLeaderboardCountriesArrow/listNationHistoryArrow → chart-ready shape (data-model.md)

tests/
├── parser/
│   └── adapter.test.ts         # extended: is_human_played + nation_history assertions
└── storage/                     # extended: kept-save-compatibility assertions for the new column/table
```

**Structure Decision**: Reuses the existing single-project web app
structure exactly (no new top-level directory, flat `Overview/`
component convention per feature 005's precedent). The one structural
change outside new files is `FileLoader.tsx`'s existing
`encyclopediaTab === "leaderboard"` branch, which already exists today
as a `ComingSoonPlaceholder` call and only needs its target component
swapped.

## Complexity Tracking

*No entries — Constitution Check gate passed without exceptions.*
