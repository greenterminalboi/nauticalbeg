# Implementation Plan: Full Save-File Schema Mapping (Tooling)

**Branch**: `004-full-schema-mapping` | **Date**: 2026-09-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-full-schema-mapping/spec.md`

## Summary

Build a maintainer-run, offline CLI tool (`tools/schema-mapping/`,
mirroring the existing `tools/map-generation/` pattern) that parses a
real EU5 save via the project's existing `jomini` dependency and
recursively walks **every** top-level section's field paths — not just
the handful the app currently interprets — recording each path's
observed type(s), presence/optionality across sampled entries, and a
real example value, into a version-controlled JSON inventory (Save
Inventory). A generated Markdown summary makes the inventory
human-reviewable without hand-parsing the JSON. That inventory then
drives real `schema.sql`/`version-adapters/1.3.11.ts` changes (User
Story 2) so previously-uninterpreted sections become real, typed,
queryable DuckDB columns instead of opaque blobs inside `raw_sections`
— following constitution Principle II's fixture-first testing
discipline for every such change. A second CLI mode (User Story 3)
diffs two Save Inventories and reports field additions/removals/type
changes, so a future EU5 patch's save-format drift is caught explicitly.
No UI, visualization, or Perspective wiring is in scope.

## Technical Context

**Language/Version**: TypeScript, run via `tsx` under plain Node (not
bundled through Vite, not run in a browser) — matching
`tools/map-generation`'s existing pattern exactly.

**Primary Dependencies**: `jomini` (already a project dependency, used
today only from the browser Worker — **confirmed via a real spike this
session that it works identically under plain Node/tsx**, see
research.md). No new runtime dependency is needed for User Story 1
(inventory discovery is pure tree-walking over jomini's parsed output).
User Story 2 reuses `@duckdb/duckdb-wasm`'s existing Node-native
bindings path already proven in `tests/helpers/duckdb-test-env.ts` for
any schema/fixture verification work, and touches
`src/storage/schema.sql`/`src/parser/version-adapters/1.3.11.ts`
directly (real application code, not new tooling-only code).

**Storage**: The inventory tool itself has no database — its output is a
JSON file (plus a generated Markdown summary) committed under
`tools/schema-mapping/inventories/`. Where User Story 2 applies findings,
it extends the existing per-save DuckDB schema (`src/storage/schema.sql`)
already established in `specs/002-db-technology-migration`.

**Testing**: `vitest`, consistent with the rest of the repo. The
inventory tool's classification logic (type/optionality/fixed-vs-variable
detection) is tested with plain unit tests against small, hand-crafted
jomini-shaped objects (fast, no real save needed) *and* a fixture-based
regression test against the committed
`tests/fixtures/rus-1628-minimal.eu5` (per the Clarifications: the real
save drives completeness, the fixture drives repeatable regression
tests). Any `schema.sql`/adapter change from User Story 2 follows this
project's existing non-negotiable fixture-first rule (constitution
Principle II) exactly like every prior adapter change.

**Target Platform**: Node (developer machine), invoked via an `npm run`
script — never the browser bundle.

**Project Type**: Single project — an addition of dev-tooling
(`tools/schema-mapping/`) plus, where User Story 2's findings apply,
ordinary extensions to the existing `src/storage/`/`src/parser/`
application code. No new top-level project or service.

**Performance Goals**: Not latency-sensitive (it's an offline tool a
maintainer runs by hand, not a runtime path). The real constraint is
memory: parsing a ~642MB save materializes its entire tree in memory at
once, same as `src/parser/worker.ts` already does today (that file's own
doc comment already accepts this tradeoff for the app's Worker context);
running in a plain Node process removes the browser tab's memory
ceiling, so this is expected to be *less* constrained than the existing
in-app parse, not more.

**Constraints**: Offline-only; must not require any EU5 game installation
(unlike `tools/map-generation`, which does) — only a save file path.
Must not mutate the input save file (constitution Principle I). Must
follow one consistent, documented rule for classifying a field path as
"gets a real column" vs. "gets lossless structured (JSON) capture" so
User Story 2's schema changes are principled, not ad hoc per section.

**Scale/Scope**: One real save today (~642MB, ~2,470 countries, ~28,573
locations) is the completeness benchmark (per Clarifications). Every
one of the save's top-level sections (research.md's save-format notes
put this at roughly 50, only ~5 of which the app currently interprets)
is in scope for User Story 1's inventory; User Story 2's actual
schema/adapter changes are scoped per-section as findings justify, not
required to land in one single change.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Principle I (Read-only, non-destructive)**: PASS. The tool only ever
  reads save files (the fixture and the designated real save); it never
  writes to, moves, or renames its input. The real save stays outside
  the repository (Clarifications/Assumptions) — nothing about this
  feature requires committing it.
- **Principle II (Parser correctness & test-first fixtures, NON-NEGOTIABLE)**:
  PASS by design — FR-007 makes this explicit: every `schema.sql`/adapter
  change from User Story 2 requires a committed fixture and a regression
  test written first, exactly like every prior adapter change in this
  project. User Story 1's own classification logic is additionally unit
  tested independent of any fixture (fast, deterministic tests against
  hand-crafted inputs), plus a fixture-based regression test of its own.
- **Principle III (Explicit format-version compatibility)**: PASS —
  this feature exists specifically to make future version drift
  *explicit and reported* (User Story 3) rather than silently guessed
  at, directly reinforcing this principle rather than working around it.
- **Principle IV (Accurate, unembellished representation)**: PASS — the
  inventory records only what was actually observed (FR-002); nothing is
  inferred, estimated, or guessed at for a section the sample didn't
  confirm (see spec's Edge Cases: an empty-in-sample section is reported
  as "shape unconfirmed," never a fabricated guess).
- **Principle V (Performance & scalability for large saves)**: PASS,
  with a documented rationale (Technical Context's Performance Goals) —
  this is an offline maintainer tool, not a runtime UI path, so the
  "MUST NOT block the main UI thread" clause doesn't apply; the
  full-scan-not-sampling choice was made deliberately (Clarifications)
  because the feature's entire value is catching rare/optional fields
  that sampling would miss, and the underlying parse cost is identical
  to what `src/parser/worker.ts` already accepts today.
- **Principle VI (Visualization clarity & accessibility)**: N/A — no
  visualization exists in this feature's scope (FR-009).
- **Principle VII (Simplicity & incremental scope)**: PASS, with one
  explicit tension flagged: "map everything, 1-to-1" could read as
  scope-creep, but this is a concrete, explicitly-requested current
  need (not speculative), and FR-006/FR-011 keep it from becoming
  unbounded — a field that's genuinely too variable to model as columns
  gets documented lossless (JSON) capture rather than an ever-expanding
  pile of speculative flat columns.
- **Module boundaries (`architecture_constitution.md`)**: User Story 1's
  tool lives entirely outside the existing layer table (like
  `tools/map-generation`) — it doesn't touch `src/storage/` or
  `src/parser/` at all. User Story 2's work **does** touch those layers,
  and MUST follow the existing rules exactly: schema/SQL changes only in
  `src/storage/schema.sql`, interpretation-of-meaning changes only in
  `src/parser/version-adapters/1.3.11.ts` — this plan does not introduce
  any new layer or bypass.

No violations requiring justification — Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-full-schema-mapping/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md         # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   └── cli-contract.md
└── tasks.md             # Phase 2 output (/speckit-tasks command)
```

### Source Code (repository root)

```text
tools/schema-mapping/          # NEW — this feature's own code, mirrors tools/map-generation/'s shape
├── inventory.ts                # Core tree-walker: builds a Save Inventory from a parsed jomini tree
├── classify.ts                  # Per-field classification: type(s), optionality, fixed-vs-variable-keyed
├── diff.ts                      # Drift Report: compares two Save Inventories (User Story 3)
├── format-markdown.ts           # Renders a Save Inventory as a human-readable Markdown summary
├── types.ts                     # Field Inventory Entry / Section Inventory / Save Inventory / Drift Report types
├── generate.ts                  # CLI entrypoint (mirrors tools/map-generation/generate.ts's shape: parseArgs, main(), exported for tests)
└── inventories/                 # Committed output — one JSON (+ generated .md) per save/version inventoried
    └── .gitkeep

tests/schema-mapping/            # NEW — unit tests for classify.ts/inventory.ts/diff.ts (hand-crafted inputs)
└── (flat layout, mirroring tests/map-generation/'s existing precedent exactly)

tests/fixtures/                  # EXISTING — rus-1628-minimal.eu5 reused for this feature's own
                                  # fixture-based regression test (Clarifications)

src/storage/schema.sql           # EXTENDED (User Story 2) — new tables/columns per inventory findings
src/parser/version-adapters/1.3.11.ts  # EXTENDED (User Story 2) — populate the new tables/columns
```

**Structure Decision**: Single project, no new top-level directory beyond
`tools/schema-mapping/` (mirroring the existing `tools/map-generation/`
precedent exactly) plus its own test directory. User Story 2's changes
are ordinary extensions of the existing `src/storage/`/`src/parser/`
application code, not a separate module — they follow the same
module-boundary rules every other schema/adapter change in this project
already follows.

## Complexity Tracking

*No entries — Constitution Check found no violations requiring
justification.*
