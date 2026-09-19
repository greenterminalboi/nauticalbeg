# Implementation Plan: DB Technology Migration (formerly "Country Portfolio")

**Branch**: `002-db-technology-migration` | **Date**: 2026-09-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-db-technology-migration/spec.md`

## Summary

Two layers of work, in priority order per the spec's clarified User
Story 1: first, replace today's flat stack of controls with a proper
application shell — a permanent top bar (file/keep/nation controls,
visible even before a save is loaded), a side navigation, and a
horizontally centered main content area. Second, populate that shell
with a data category per tab (Provinces, Military, Government, Economy,
Diplomacy, Trade, Building Registry, Characters) for the currently
selected nation, alongside the existing Overview, plus two permanently
disabled-feature placeholders ("AI Agent," "Map") that show a "coming
soon" message when selected. Changing the nation selector updates
whichever tab is active; changing tabs never resets the selected nation.
Every data tab beyond Provinces requires extending the 1.3.11 version
adapter to structurally parse a save section this project has so far
only captured as an opaque `raw_sections` JSON blob (per 001's "capture
everything, structure it later" decision) — genuinely new parser
research, not just new UI, for 7 of the 8 data tabs. The shell itself
(User Story 1) needs no parser or schema changes at all — it's pure UI
restructuring of already-available data and controls.

## Technical Context

**Language/Version**: TypeScript 5.x, targeting ES2022, running in evergreen
browsers — unchanged from 001.

**Primary Dependencies**: React 19, Vite, `@duckdb/duckdb-wasm` (existing
as of the 2026-09-18 storage-engine migration from `wa-sqlite` — see
ARCHITECTURE.md's decision log). No new
runtime dependency for tab navigation itself — tabs are local component
state (which category is active), not client-side routing; there is
nothing here that needs URL-addressable routes (no stated requirement for
deep-linking to a specific tab), so pulling in a router would be
unjustified complexity per constitution Principle VII. Large per-tab lists
(Provinces, Military, Buildings) are paginated client-side in plain React
state rather than adding a virtualization library — see Constitution
Check (Principle V) below for why pagination, not virtualization, is the
chosen technique. The shell's 3-region layout (top bar / side nav / main
content) is plain CSS Grid, styled with `src/styles/tokens.css`'s
existing custom properties — no CSS framework or layout library, same
"plain CSS, shared tokens" approach 001 already established for
`OverviewCard`/`ErrorMessage`/etc.

**UI state additions** (no new dependency, extends `FileLoader.tsx`'s
existing `Status` state machine): a `activeTab` field on the `"ready"`
status variant (`"overview" | "provinces" | "military" | "government" |
"economy" | "diplomacy" | "trade" | "buildings" | "characters" |
"ai-agent" | "map"`), read/written the same way `selectedNationIdx`
already is. `"ai-agent"`/`"map"` render a shared `ComingSoonPlaceholder`
component instead of querying the database at all — they need no data
fetch, so selecting them is instant and can't fail.

**Storage**: **User Story 1 (the shell) needs zero storage changes** —
no new table, no new query, no adapter work. It restructures existing
UI and existing data (the overview, the nation list) into the new
layout; nothing about *what* data exists changes, only *how* it's
arranged on screen. From User Story 2 onward, this extends 001's
per-save DuckDB schema with new tables, one family per tab (see
data-model.md) — `estates`, `policies`, `national_values`,
`military_units`, `loans`, `alliances` (extending the existing
`war_participants` for the Diplomacy tab), `trade_goods`, `buildings`,
and `characters`. Provinces needs **no new schema at all**: it reuses
001's existing `provinces`/`locations` tables directly. All new tables
are populated by the existing 1.3.11 version adapter at parse time
(consistent with 001's "structured table, not raw JSON, for anything a
real feature uses" pattern) — not read at query time from `raw_sections`,
even though the raw data is technically already sitting there. Per
constitution Principle VIII's rationale (a future AI agent needs
parameterized SQL-shaped tools, not ad-hoc JSON scanning), these new
tables are exactly the kind of queryable surface that principle expects
this project to keep building toward.

**Testing**: Vitest, extending 001's approach. For the shell (User
Story 1): React Testing Library component tests for `TopBar` and
`SideNav` — no fixture/parser tests needed, since nothing here touches
save data. From User Story 2 onward:
every new table needs its own fixture-based regression test
(constitution Principle II, NON-NEGOTIABLE) before its adapter logic
merges. `tests/fixtures/rus-1628-minimal.eu5` will likely need extending
with representative estate/military/building/etc. data (the same way it
grew during 001), or a second fixture added if a single file gets
unwieldy — that choice is left to implementation, per task. React
Testing Library for each new tab component too.

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
~~The shell MUST remain usable at a typical mobile viewport width
(FR-017)~~ — **removed 2026-09-18**: mobile/narrow-viewport support is
explicitly out of scope (spec.md Assumptions); the shell targets
desktop/tablet-width browsers only, no responsive collapse behavior.

**Scale/Scope**: Nine user stories. User Story 1 (the portfolio shell —
top bar, side navigation, centered content area, plus the "AI Agent"/
"Map" placeholders) is pure UI restructuring with no data-layer work.
User Stories 2-9 (Provinces, Military, Government, Economy, Diplomacy,
Trade, Building Registry, Characters) are each their own data tab
sitting inside that shell, alongside 001's existing Overview (kept
as-is in content, relocated in chrome — not itself one of the nine
stories). FR-001 through FR-020. Depends entirely on 001 (nation
selection, the read-only query-connection pattern, the overview UI this
feature wraps in a new shell).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Section | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS | Every new tab is a read-only query against the existing per-save database; nothing here writes to or mutates save data. Fully client-side, no new server component. |
| II. Parser Correctness & Test-First Fixtures | PASS (process gate) | Each new table (estates, policies, military_units, etc.) requires its own fixture + regression test before that table's adapter logic merges — enforced at task level, same as 001. User Story 1 (the shell) touches no parser code at all, so this gate doesn't apply to it. |
| III. Explicit Format-Version Compatibility | PASS | All new parsing extends the existing version-gated 1.3.11 adapter; a future game version missing a section falls back to FR-014's "not available for this save" state rather than guessing. |
| IV. Accurate, Unembellished Representation | PASS | Any aggregated/summarized stat a tab shows (e.g., Military's "total strength by unit type," if computed by summing individual units) must be marked derived per the same convention 001 established for FR-007 (`derived: Set<...>` in the query result shape) — carried into data-model.md and tasks, not a new pattern. |
| V. Performance & Scalability for Large Saves | PASS (with a stated technique) | Provinces/Military/Buildings tabs paginate client-side (plain React state, no new dependency) rather than rendering every row unconditionally, satisfying the "virtualization, pagination, or LOD" requirement without adding a virtualization library — see Technical Context. |
| VI. Visualization Clarity & Accessibility | PASS | Side navigation and tab items (including the "coming soon" AI Agent/Map items) are native, keyboard-operable controls (same pattern as 001's nation selector); "not yet available" is communicated via visible text/label, not color alone, for the same reason 001's "computed" badges and error titles are text-based, not color-only. The nation selector's disabled-until-loaded state (FR-020) uses the native `disabled` attribute, which assistive tech already announces correctly, rather than a custom visual-only affordance. |
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

**Re-checked again after the `/speckit-clarify` session added User
Story 1 (the shell) and FR-016-FR-020**: still PASS, no changes to the
table above needed beyond the II/VI notes already updated — the shell
is pure client-side UI restructuring with no new storage, parsing, or
server surface, so it doesn't touch Principles I/II/III/VIII at all
beyond what's already noted.

## Project Structure

### Documentation (this feature)

```text
specs/002-db-technology-migration/
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
        ├── FileLoader.tsx         # Extended: still owns the worker/Status
        │                          # state machine (unchanged from 001/T036-
        │                          # T038), now also owns activeTab; its JSX
        │                          # renders the shell components below
        │                          # instead of inline controls
        ├── TopBar.tsx             # New (User Story 1): file/keep controls
        │                          # + the independent, disabled-until-
        │                          # loaded nation selector (FR-018/FR-020)
        ├── SideNav.tsx            # New (User Story 1): the category list,
        │                          # including the AI Agent/Map placeholder
        │                          # items (FR-016)
        ├── ComingSoonPlaceholder.tsx # New (User Story 1): shared "not
        │                          # built yet" content for AI Agent/Map
        ├── ProvincesTab.tsx       # New (User Story 2)
        ├── MilitaryTab.tsx        # New (User Story 3)
        ├── GovernmentTab.tsx      # New (User Story 4)
        ├── EconomyTab.tsx         # New (User Story 5)
        ├── DiplomacyTab.tsx       # New (User Story 6)
        ├── TradeTab.tsx           # New (User Story 7)
        ├── BuildingRegistryTab.tsx # New (User Story 8)
        └── CharactersTab.tsx      # New (User Story 9)

tests/
├── fixtures/                 # Extended or new fixture(s), per Principle II
├── parser/                    # New adapter regression tests per table (US2+)
├── storage/                   # New query tests per tab (US2+)
└── components/                 # TopBar/SideNav/ComingSoonPlaceholder tests
                                 # (US1) + new tab component tests (US2+)
```

**Structure Decision**: No structural change from 001 — same
`parser/storage/components` boundary, extended with more adapter logic,
more tables, more query functions, and more (thin, presentational) tab
components. No new top-level directories.

## Complexity Tracking

*No new violations requiring justification — see Constitution Check above
(Principle V's pagination choice and Principle VII's reuse of 001's
existing SQLite justification are both compliant choices, not deviations).*
