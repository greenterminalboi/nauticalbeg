# Contract: `storage/queries.ts` (UI-facing read interface)

This is the read-only query interface the overview UI calls against a
loaded save's SQLite database. It is deliberately narrow and typed rather
than exposing raw SQL to callers, both so the UI stays decoupled from
storage details (constitution Technical Constraints) and because this is
the same shape of interface constitution Principle VIII expects the future
AI copilot's tools to be built on — every function here is a candidate
"tool" for that later feature, unchanged.

**Implementation note (updated from the original plan-phase sketch)**:
`getSaveMeta` and `getPlayerNationOverview` take an already-open
`SaveDatabase` (from `storage/db.ts`'s `openSaveDatabase(saveId)`), not a
raw `saveId` string as originally sketched below — a typical caller (the
overview UI) needs both queries against the same save and shouldn't pay
the cost of reopening the connection for each one. `keepSave`,
`forgetKeptSave`, and `listKeptSave` still work in terms of `saveId`
directly, since their job is precisely to manage which database exists,
not to query an already-open one.

| Function | Returns | Backing query (see `data-model.md`) |
|---|---|---|
| `getSaveMeta(db)` | `{ filename, detectedVersion, inGameDate, kept }` | `SELECT ... FROM save_meta` |
| `getNationOverview(db, nationIdx)` | `{ idx, tag, name, treasury, stability, governmentType, atWar, totalDevelopment, provinceCount, derived }` | Joins `nations` (raw fields, by `idx`) with the derived aggregates in Data Model §"Derived Values" |
| `getPlayerNationOverview(db)` | Same shape as `getNationOverview` | Looks up the `is_player = 1` nation's `idx`, then delegates to `getNationOverview` |
| `listNations(db)` | `{ idx, tag, name }[]` | `SELECT ... FROM nations WHERE country_type = 'Real'`, for the FR-015 nation selector |
| `keepSave(db, saveId)` | `void` | Sets `save_meta.kept = 1`; triggers moving/retaining the database in OPFS (FR-011) |
| `forgetKeptSave(saveId)` | `void` | Deletes the OPFS database for a previously kept save (FR-013) |
| `listKeptSave()` | `{ saveId, filename, inGameDate } \| null` | Used on app start to offer resuming a kept save (User Story 4, Acceptance Scenario 2) |

**Update (2026-09-17, FR-015)**: `getPlayerNationOverview` was generalized
into `getNationOverview(db, nationIdx)`, with `getPlayerNationOverview` now
a thin wrapper around it, and `listNations(db)` was added alongside it. The
UI keeps one read-only connection open for the life of a "ready" session
(see `FileLoader.tsx`) specifically so a nation-selector change can
re-query `getNationOverview` without reopening the database or re-parsing
the save — this pair (`list*` + `get*ByIdx`) is the pattern future
selectable views (not just nations) should follow.

## Rules

- Every function is read-only from the caller's perspective except
  `keepSave`/`forgetKeptSave`, which only toggle persistence — neither ever
  mutates parsed game-state values (constitution Principle I).
- `getNationOverview`/`getPlayerNationOverview` MUST tag which fields are
  raw vs. derived in their return shape (e.g., a `derived: Set<string>`
  alongside the values) so the UI can satisfy FR-007 without re-deriving
  that knowledge itself.
- No function accepts arbitrary SQL from its caller — this is what keeps
  the future AI agent's access constrained to well-defined, read-only
  tools per Principle VIII, rather than an open query surface.
