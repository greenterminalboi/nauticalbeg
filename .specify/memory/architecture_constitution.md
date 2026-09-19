# Architecture Constitution

> This is the architecture enforcement document that Architecture Guard reviews against.
> Keep project-level governance in `.specify/memory/constitution.md`.
> If a section does not apply, it is marked "Not applicable" rather than deleted.

**Version**: 1.1.0 | **Ratified**: 2026-09-18 | **Last Amended**: 2026-09-18

## Architecture Style

- **Style**: Monolith — a single client-only web application, one build, no service split.
- **Primary stack**: React 19 + Vite + TypeScript, `@duckdb/duckdb-wasm` (DuckDB via WASM) backed by OPFS for per-save storage, a dedicated Web Worker for the CPU-heavy parse/ingest step, `jomini` for Clausewitz save-format parsing. No backend server. **Amended 2026-09-18**: migrated from `wa-sqlite` to DuckDB-Wasm — see ARCHITECTURE.md's storage-engine decision log for why (Arrow-native for a planned Perspective-based visualization layer; better fit for OLAP-shaped cross-country/location aggregation).
- **Preset guidance**: None — kept intentionally framework-agnostic (project decision, 2026-09-18); no React-specific vocabulary is enforced beyond the generic layer boundaries below.

## Layer Boundaries

| Layer | Owns | May Depend On | Must Not Depend On |
| --- | --- | --- | --- |
| Entry (`src/components/**`, `src/app.tsx`) | Rendering, user interaction, the `activeTab`/`Status` UI state machine | Application's public functions (`loadSave`, `resumeSave`, `cancelSave`), Data's query functions (`src/storage/queries.ts`'s `list*`/`get*`/`keepSave`/`forgetKeptSave` functions) | Domain internals (`src/parser/version-adapters/*`), `@duckdb/duckdb-wasm` directly, raw SQL, the Worker protocol's internal message plumbing |
| Application (`src/parser/load-save.ts`, `src/parser/worker.ts`, `src/parser/protocol.ts`) | Orchestrating the load/parse/resume lifecycle, the Worker message protocol | Domain (`version-detect.ts`, `version-adapters/*`), Data (`src/storage/db.ts`, `schema.sql`) | Entry (React/components), any UI framework import |
| Domain (`src/parser/version-adapters/*.ts`, `src/parser/version-detect.ts`) | Interpreting what a parsed save field/section *means*, turning it into rows matching `schema.sql` | `jomini`, domain types only | HTTP/network, DuckDB connection lifecycle, React, UI, the Worker protocol's message types |
| Data (`src/storage/schema.sql`, `src/storage/db.ts`, `src/storage/queries.ts`) | The DuckDB schema, connection lifecycle, every SQL statement in the app | `@duckdb/duckdb-wasm`, OPFS | Entry, Domain's interpretation logic (Data stores/retrieves rows; it doesn't know what a `unit_manager` field means) |
| External (browser APIs) | OPFS (`navigator.storage`), Web Worker messaging, `File`/`FileReader` | — | Nothing — there is no third-party network service; the app makes zero outbound network calls for save processing (constitution Principle I) |

## Business Logic Placement

- Entry (components) render and dispatch only — no SQL, no direct `@duckdb/duckdb-wasm`/Worker-protocol imports. Components call `src/storage/queries.ts`'s `list*`/`get*`/`keepSave`/`forgetKeptSave` functions and `src/parser/load-save.ts`'s public functions exclusively.
- Save-format interpretation lives only in `src/parser/version-adapters/*.ts`, gated by the version `version-detect.ts` identifies — never inferred ad hoc in a component or query function.
- Every SQL statement (reads and writes) lives in `src/storage/` — no other file constructs or executes SQL.

## Contracts and Validation

- **Request contracts**: No server API exists; the equivalent is the Worker protocol message shapes in `src/parser/protocol.ts` (discriminated unions: `LoadMessage`, `CancelMessage`). **Amended 2026-09-18**: `KeepMessage`/`KeptMessage`/`KeepFailedMessage` were removed — DuckDB has no restriction requiring writes to originate from the Worker, so "keep" is a direct main-thread call now (see Async and Integration Rules).
- **Response contracts**: Query result shapes returned by `src/storage/queries.ts`, with derived/computed fields explicitly tagged (a `derived: Set<...>` field on the result, per constitution Principle IV) so a caller can never mistake a computed aggregate for raw save data.
- **Event contracts**: Worker→main-thread messages (`progress`, `error`, `ready`) are each a distinct discriminated-union variant with a `kind`/`type` tag, never a loosely-typed object.
- **Validation boundary**: An uploaded file is validated as a recognized save format (`looksLikeSaveFile` + `version-detect.ts`) before any adapter runs; an unrecognized or unsupported-version file is rejected with a typed error before parsing proceeds (constitution Principle III).

## Data Access Rules

- All reads go through `src/storage/queries.ts` — no component, tab, or hook may construct or execute a SQL string itself.
- Domain logic (the version adapters) does not depend on UI or Worker-protocol types — it only knows how to turn a parsed save section into rows matching `schema.sql`.
- There is a single per-save DuckDB database (via `@duckdb/duckdb-wasm`/OPFS); no cross-save queries, no database shared between saves. **DuckDB allows only one open handle per OPFS file at a time** — confirmed real constraint, not a workaround: two connections to the same save's file cannot coexist, which is why the ingestion connection (below) must fully close before the session connection opens.

## Async and Integration Rules

- The Worker owns a connection only for the duration of ingestion (parse + insert), then MUST `CHECKPOINT` and fully close it *before* signaling ready — never while still holding the file open. The main thread then opens the one session connection used for every read and for the keep-toggle write; **no separate write-only connection exists**. **Amended 2026-09-18**: DuckDB has no SQLite-style restriction requiring writes to originate from a dedicated Worker — confirmed by writing directly from the main thread in a real Chrome session — so "keep" is a plain `queries.ts` call now, not a Worker round-trip.
- The Worker MUST post a `progress` message at least once per second during a parse (constitution Principle V) rather than going silent on a large file.
- **Any write whose connection isn't immediately closed afterward MUST explicitly `CHECKPOINT` right after that write.** `closeSaveDatabase` always checkpoints before closing, but a long-lived connection (the main thread's session connection) may hold an uncommitted write for the rest of the session — confirmed real failure mode: the "keep" flag silently reverted to unset after a page reload until `markSaveKept` was given its own explicit `CHECKPOINT` immediately after its `UPDATE`, rather than relying on an eventual close that might not happen soon (or ever, if the tab is just closed).
- Exactly one async call may be in flight against a given DuckDB connection at a time, enforced by a per-connection queue in `db.ts` (`withConnectionQueue`) — kept as defensive insurance even though a real-browser spike found DuckDB-Wasm tolerates concurrent plain queries fine (that spike did not cover concurrent prepared statements, which this app also uses).

## Module Boundaries

| Module | Owns | Public Contracts | Must Not |
| --- | --- | --- | --- |
| `src/parser/` | Version detection, save-format adapters, Worker orchestration, the Worker protocol | `loadSave`, `resumeSave`, `cancelSave`, `protocol.ts`'s message types | Import React or any `src/components/` module; hold a UI-level "which tab is active" concept |
| `src/storage/` | `schema.sql`, connection lifecycle (`db.ts`), every SQL statement (`queries.ts`) | The `list*(db, nationIdx, ...)` / `get*ByIdx(db, nationIdx)` query functions and the `keepSave`-family write functions | Interpret what a save field *means* (the adapter's job); import React or the Worker protocol |
| `src/components/` | Rendering, user interaction, the `activeTab`/`Status` UI state machine | Nothing consumed by other modules — this is the leaf layer | Construct SQL; import `@duckdb/duckdb-wasm` directly; import anything from `src/parser/version-adapters/` |

## Framework-Specific Architecture Rules

Not applicable — this project is intentionally kept framework-agnostic (project decision, 2026-09-18). No React-specific vocabulary is enforced beyond the generic layer boundaries above.

## Blocking Architecture Violations (P0)

Deferred — not yet defined (2026-09-18 init interview). Revisit once Architecture Guard has run against real code and the project has signal on which violations are actually worth blocking release over, rather than pre-committing to a P0 list before any drift has been observed.

## Accepted Architecture Deviations

None recorded yet.

## Architecture Evolution Policy

- **Proposal-based evolution**: when Architecture Guard's drift detection finds repeated violations of a rule above, it generates a written Constitution Update Proposal (summarizing the drift, its impact, and a proposed rule change) rather than silently updating this file.
- No proposal is merged without explicit human sign-off in a conversation — this file is never auto-rewritten.
- A new pattern becomes a standard only once the project already consistently follows it, or the user explicitly accepts the rule (mirrors `constitution.md`'s own amendment discipline).

## Refactor and Drift Handling

- P1 drift (a violation of a rule promoted to P0 once any are defined) should become a near-term refactor task via Architecture Guard's refactor-generator.
- P2 drift (a violation of a non-blocking rule above) may be tracked as scheduled technical debt rather than blocking a feature's completion.
- P3 cleanup (naming/organization nits that don't cross a layer boundary) is opportunistic and must never block feature delivery, consistent with constitution Principle VII (Simplicity & Incremental Scope).
