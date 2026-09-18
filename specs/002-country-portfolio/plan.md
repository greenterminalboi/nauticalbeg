# Implementation Plan: Country Portfolio

**Branch**: `002-country-portfolio` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-country-portfolio/spec.md`

## Summary

Replace the single Overview card with a portfolio view: a persistent side
navigation lets the user pick a data category (Provinces, Military,
Government, Economy, Diplomacy, Trade, Building Registry, Characters) for
the currently selected nation, alongside the existing Overview. Changing
the nation selector updates whichever tab is active; changing tabs never
resets the selected nation. Every tab beyond Provinces requires extending
the 1.3.11 version adapter to structurally parse a save section this
project has so far only captured as an opaque `raw_sections` JSON blob
(per 001's "capture everything, structure it later" decision) — this is
genuinely new parser research, not just new UI, for 7 of the 8 tabs.

## Technical Context

**Language/Version**: TypeScript 5.x, targeting ES2022, running in evergreen
browsers — unchanged from 001.

**Primary Dependencies**: React 19, Vite, `wa-sqlite` (existing). No new
runtime dependency for tab navigation itself — tabs are local component
state (which category is active), not client-side routing; there is
nothing here that needs URL-addressable routes (no stated requirement for
deep-linking to a specific tab), so pulling in a router would be
unjustified complexity per constitution Principle VII. Large per-tab lists
(Provinces, Military, Buildings) are paginated client-side in plain React
state rather than adding a virtualization library — see Constitution
Check (Principle V) below for why pagination, not virtualization, is the
chosen technique.

**Storage**: Extends 001's per-save SQLite schema with new tables, one
family per tab (see data-model.md) — `estates`, `policies`,
`national_values`, `military_units`, `loans`, `alliances` (extending the
existing `war_participants` for the Diplomacy tab), `trade_goods`,
`buildings`, and `characters`. Provinces needs **no new schema at all**:
it reuses 001's existing `provinces`/`locations` tables directly. All new
tables are populated by the existing 1.3.11 version adapter at parse time
(consistent with 001's "structured table, not raw JSON, for anything a
real feature uses" pattern) — not read at query time from `raw_sections`,
even though the raw data is technically already sitting there. Per
constitution Principle VIII's rationale (a future AI agent needs
parameterized SQL-shaped tools, not ad-hoc JSON scanning), these new
tables are exactly the kind of queryable surface that principle expects
this project to keep building toward.

**Testing**: Vitest, extending 001's approach — every new table needs its
own fixture-based regression test (constitution Principle II,
NON-NEGOTIABLE) before its adapter logic merges. `tests/fixtures/rus-1628-minimal.eu5`
will likely need extending with representative estate/military/building/
etc. data (the same way it grew during 001), or a second fixture added if
a single file gets unwieldy — that choice is left to implementation, per
task. React Testing Library for each new tab component and the side
navigation itself.

**Target Platform**: Web browser (evergreen Chrome/Edge/Firefox) — unchanged.

**Project Type**: Single-project client-only web application — unchanged;
this feature adds no server component.

**Performance Goals**: SC-001 — switching tabs or nations updates the
active view in under 1 second, no full-page reload (both are just a new
SQL query against the already-open read-only connection 001 established,
not a re-parse). SC-003 — the Provinces tab stays responsive for a
100+-province nation.

**Constraints**: Must run entirely client-side (Principle I); large
per-tab lists MUST use pagination or an equivalent technique rather than
rendering unboundedly (Principle V) — see Constitution Check.

**Scale/Scope**: Eight new user stories (Provinces, Military, Government,
Economy, Diplomacy, Trade, Building Registry, Characters), each its own
side-navigation tab sitting alongside 001's existing Overview (kept
as-is, not itself one of the eight). FR-001 through FR-015. Depends
entirely on 001 (nation selection, the read-only query-connection
pattern, the overview UI this feature adds a sibling navigation to).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Section | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS | Every new tab is a read-only query against the existing per-save database; nothing here writes to or mutates save data. Fully client-side, no new server component. |
| II. Parser Correctness & Test-First Fixtures | PASS (process gate) | Each new table (estates, policies, military_units, etc.) requires its own fixture + regression test before that table's adapter logic merges — enforced at task level, same as 001. |
| III. Explicit Format-Version Compatibility | PASS | All new parsing extends the existing version-gated 1.3.11 adapter; a future game version missing a section falls back to FR-014's "not available for this save" state rather than guessing. |
| IV. Accurate, Unembellished Representation | PASS | Any aggregated/summarized stat a tab shows (e.g., Military's "total strength by unit type," if computed by summing individual units) must be marked derived per the same convention 001 established for FR-007 (`derived: Set<...>` in the query result shape) — carried into data-model.md and tasks, not a new pattern. |
| V. Performance & Scalability for Large Saves | PASS (with a stated technique) | Provinces/Military/Buildings tabs paginate client-side (plain React state, no new dependency) rather than rendering every row unconditionally, satisfying the "virtualization, pagination, or LOD" requirement without adding a virtualization library — see Technical Context. |
| VI. Visualization Clarity & Accessibility | PASS | Side navigation and tab items are native, keyboard-operable controls (same pattern as 001's nation selector); no color-only state encoding planned (e.g., "at war" repeats as text, not just a colored badge, matching 001's ErrorMessage/computed-badge precedent). |
| VII. Simplicity & Incremental Scope | PASS (reuses 001's justification) | More tables is more surface area, but this doesn't newly violate Principle VII — 001's Complexity Tracking already justified SQLite specifically because a "structured, queryable store" would need to grow for exactly this kind of feature; this is that growth happening, not a fresh tradeoff to re-litigate. No new Complexity Tracking entry needed. |
| VIII. Grounded AI Query Agent | N/A (future feature), but directly served | Not built in this feature, but every new table here is exactly the kind of structured, parameterized-query surface that principle expects — this feature is concrete progress toward it, not orthogonal to it. |
| Technical Constraints (web-based, no asset redistribution, parser/viz decoupling) | PASS | No Paradox assets involved; the parser (adapter) / storage (`queries.ts`) / UI (`components/`) boundary from 001 is unchanged, just extended with more tables and more query functions. |
| Development Workflow (fixture PRs, accessibility notes) | PASS (process gate) | Carried into `/speckit-tasks` as per-task requirements, same as 001. |

**Post-Phase-1 re-check**: Confirmed still PASS after data-model.md,
contracts/, and quickstart.md were written — nothing in the concrete
design introduced a new violation. Two design choices worth calling out
as direct evidence the gates held, not just asserted: `data-model.md`
explicitly excludes `character_db`'s `dna` field from the `characters`
table (a real Principle VII "don't store what nothing needs" decision
made once the actual field was seen, not hypothetically), and every
table in data-model.md that couldn't be confirmed against the real save
this pass (Diplomacy's alliance flag, Trade, Economy's income/expense
breakdown, Cabinet/ruler-term detail) was left explicitly TBD rather than
guessed at, per Principle II.

## Project Structure

### Documentation (this feature)

```text
specs/002-country-portfolio/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts          # Extended: parses estates, policies, national
│                               # values, military units, loans, alliances,
│                               # trade goods, buildings, characters into their
│                               # own tables, same file as 001 (one adapter per
│                               # version, not one per tab)
├── storage/
│   ├── schema.sql               # Extended: new tables per data-model.md
│   └── queries.ts                # Extended: one listX(db, nationIdx)-shaped
│                                  # query per tab, following 001's
│                                  # listNations/getNationOverview pattern
└── components/
    └── Overview/
        ├── FileLoader.tsx         # Extended: owns which tab is active,
        │                          # alongside which nation is selected
        ├── PortfolioNav.tsx       # New: the side navigation
        ├── ProvincesTab.tsx       # New
        ├── MilitaryTab.tsx        # New
        ├── GovernmentTab.tsx      # New
        ├── EconomyTab.tsx         # New
        ├── DiplomacyTab.tsx       # New
        ├── TradeTab.tsx           # New
        ├── BuildingRegistryTab.tsx # New
        └── CharactersTab.tsx      # New

tests/
├── fixtures/                 # Extended or new fixture(s), per Principle II
├── parser/                    # New adapter regression tests per table
├── storage/                   # New query tests per tab
└── components/                 # New tab + nav component tests
```

**Structure Decision**: No structural change from 001 — same
`parser/storage/components` boundary, extended with more adapter logic,
more tables, more query functions, and more (thin, presentational) tab
components. No new top-level directories.

## Complexity Tracking

*No new violations requiring justification — see Constitution Check above
(Principle V's pagination choice and Principle VII's reuse of 001's
existing SQLite justification are both compliant choices, not deviations).*
