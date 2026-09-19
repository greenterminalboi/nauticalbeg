# Implementation Plan: Save Import & Overview

**Branch**: `001-save-import-overview` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-save-import-overview/spec.md`

> **Storage engine note (2026-09-18)**: this plan and the rest of this
> feature's docs (`research.md`, `data-model.md`, `contracts/`, `tasks.md`)
> describe the storage layer as SQLite/`wa-sqlite`, which is what was
> actually built and shipped for 001. The engine was later migrated to
> DuckDB (`@duckdb/duckdb-wasm`) during 002's implementation — see
> `ARCHITECTURE.md`'s decision log for why and what changed. These 001
> documents are left as a historical record of the original decision
> rather than rewritten; the current architecture is `ARCHITECTURE.md`.

## Summary

Let a player load a local EU5 save file (up to ~500-600MB uncompressed),
parse it entirely client-side, and see a basic stat overview of their
nation. Parsing runs in a Web Worker to keep the UI responsive; parsed data
lands in a per-save SQLite database (via `wa-sqlite` over OPFS) rather than
plain in-memory JS objects, both to handle the data volume safely and to
establish the queryable data-access layer that the future AI copilot
(constitution Principle VIII) and richer visualizations will reuse. A save
is session-only by default; the user can explicitly "keep" one save so it
persists across browser sessions (FR-011–FR-014).

## Technical Context

**Language/Version**: TypeScript 5.x, targeting ES2022, running in evergreen
browsers (no server-side runtime required for this feature).

**Primary Dependencies**: React 19 (UI) — newer than the React 18 originally
sketched here; no architectural impact, corrected 2026-09-18 during
`/speckit-analyze`. Vite (build/dev tooling),
`wa-sqlite` (SQLite compiled to WASM, OPFS virtual file system) for local
structured storage, native Web Workers for off-main-thread parsing. No
existing library parses EU5 saves — the parser itself is custom and is the
core deliverable of this feature.

**Storage**: Client-side only. Each loaded save gets its own SQLite database
via `wa-sqlite`/OPFS. A session-only save's database is discarded when the
tab closes (or explicitly replaced/cleared); a "kept" save's database
persists in OPFS across sessions until the user clears it or keeps a
different save (v1 keeps at most one). No server-side storage of any kind.

**Testing**: Vitest for unit/integration tests, including fixture-based
parser regression tests required by constitution Principle II. React
Testing Library for overview-component tests. End-to-end browser testing
(e.g., Playwright) is not required for this feature's scope and is deferred
to a later feature if needed.

**Target Platform**: Web browser (evergreen Chrome/Edge/Firefox). OPFS +
WASM support is required for the storage layer; exact Safari/OPFS
compatibility is a research risk tracked in `research.md`.

**Project Type**: Single-project client-only web application — no backend
service is needed for this feature (parsing, storage, and rendering all
happen in the browser, per constitution Principle I).

**Performance Goals**: SC-001 — a typical save (up to ~500-600MB
uncompressed) produces a visible overview within 60 seconds; FR-008 —
progress feedback appears within 1 second of any operation that will take
longer.

**Constraints**: Must run entirely client-side with save data never leaving
the browser (Principle I); must not block the main thread more than ~1s
without progress feedback (Principle V); must run in-browser without a
native install (Technical Constraints).

**Scale/Scope**: One active save per session, plus at most one additional
"kept" (persisted) save per browser profile in v1. Four user stories,
FR-001 through FR-015 (FR-015, a nation selector, was added 2026-09-18 —
see spec.md's Assumptions update; it generalized `getPlayerNationOverview`
into a `listNations`/`getNationOverview(idx)` pair the UI keeps one
long-lived read-only connection open against, a pattern meant to extend to
future selectable views, not stay nation-specific — see
ARCHITECTURE.md's "pick an entity, view it" section).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Section | Status | Notes |
|---|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS | Fully client-side; original file is only read via the File API, never written back. No server upload at all for this feature. |
| II. Parser Correctness & Test-First Fixtures | PASS (process gate) | `tests/fixtures/` + Vitest regression tests are required before any parser logic merges; enforced at task/PR level, not just design level. |
| III. Explicit Format-Version Compatibility | PASS | `parser/version-adapters/` isolates version-specific logic; unsupported versions fail loudly per FR-004, no silent best-effort parsing. |
| IV. Accurate, Unembellished Representation | PASS | Data model (below) tags aggregate/derived fields distinctly from raw fields so the UI can visually distinguish them per FR-007. |
| V. Performance & Scalability for Large Saves | PASS | Worker-based streaming parse directly into OPFS-backed SQLite avoids holding the whole 500-600MB save in JS memory at once; progress events satisfy FR-008. |
| VI. Visualization Clarity & Accessibility | PASS | Overview is plain labeled stats in v1 (no color-only encodings); standard accessible text/contrast defaults apply. Re-evaluated when richer visualizations arrive. |
| VII. Simplicity & Incremental Scope | JUSTIFY | See Complexity Tracking — using a real SQLite engine (vs. plain in-memory objects) for a 6-stat overview looks like more than v1 strictly needs. |
| VIII. Grounded AI Query Agent | N/A (future feature) | Not built in this feature; the SQLite-based storage layer is chosen partly so that feature can later expose read-only parameterized queries as agent tools. |
| Technical Constraints (web-based, no asset redistribution, parser/viz decoupling) | PASS | No Paradox assets involved (all rendered data comes from the user's own save); `storage/` and `domain/` are the stable boundary between `parser/` and `components/`. |
| Development Workflow (fixture PRs, accessibility notes) | PASS (process gate) | Carried into `/speckit-tasks` as per-task requirements, not enforced by the plan itself. |

## Project Structure

### Documentation (this feature)

```text
specs/001-save-import-overview/
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
├── parser/                 # EU5 save parsing (runs inside the worker)
│   ├── worker.ts            # Worker entry point: read file, parse, report progress
│   ├── save-reader.ts       # Streaming file access (File.slice / ReadableStream)
│   ├── version-detect.ts    # Detects save's game version
│   └── version-adapters/    # One adapter per supported game version (Principle III)
├── storage/                 # wa-sqlite/OPFS data-access layer
│   ├── db.ts                 # Open/create a per-save SQLite database
│   ├── schema.sql             # Table definitions (see data-model.md)
│   └── queries.ts             # Typed read queries used by the UI (and later the agent)
├── domain/                  # Planned for Parsed Game State / Player Nation types &
│                            # aggregation logic. As-built (2026-09-18): left empty —
│                            # every aggregation this feature needed turned out to fit
│                            # directly in storage/queries.ts's SQL, and nothing else
│                            # needed a home here (constitution Principle VII: don't
│                            # build the abstraction before something needs it). See
│                            # ARCHITECTURE.md's module-boundaries section.
├── components/               # React UI
│   └── Overview/
├── app.tsx
└── main.tsx

tests/
├── fixtures/                # Sample/minimized EU5 save excerpts (Principle II)
├── parser/
├── storage/
└── components/
```

**Structure Decision**: Single client-only web application (no backend
split) — this feature requires no server component, so a `backend/` +
`frontend/` split would be unnecessary structure for work that doesn't
exist yet. If a future feature needs a server (e.g., account-based save
sync), that split can be introduced then.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Using a full SQLite engine (`wa-sqlite`/OPFS) instead of plain in-memory JS objects, just to show 6 overview stats | (1) User Story 4 (opt-in persistence) already requires *some* durable client storage for a 500-600MB save in v1 — a structured, queryable store is far cheaper to persist and re-read than serializing a huge JS object graph to a blob. (2) This was an explicit, reasoned decision (not speculative gold-plating) to establish the stable queryable representation constitution Principle VIII calls for, so the future AI copilot can expose safe, parameterized read-only queries as tools instead of ad-hoc object traversal. | Plain in-memory objects: fails at 500-600MB scale without careful memory management and gives up persistence entirely. Plain IndexedDB blob-of-JSON: persists but isn't queryable, so it would need to be fully deserialized back into memory before showing even one stat, and would need to be redesigned anyway once the AI agent or map/time-series features arrive. |
