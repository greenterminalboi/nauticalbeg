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
| `getPlayerNationOverview(db)` | `{ tag, name, treasury, stability, governmentType, atWar, totalDevelopment, provinceCount, derived }` | Joins `nations` (raw fields) with the derived aggregates in Data Model §"Derived Values" |
| `keepSave(db, saveId)` | `void` | Sets `save_meta.kept = 1`; triggers moving/retaining the database in OPFS (FR-011) |
| `forgetKeptSave(saveId)` | `void` | Deletes the OPFS database for a previously kept save (FR-013) |
| `listKeptSave()` | `{ saveId, filename, inGameDate } \| null` | Used on app start to offer resuming a kept save (User Story 4, Acceptance Scenario 2) |

## Rules

- Every function is read-only from the caller's perspective except
  `keepSave`/`forgetKeptSave`, which only toggle persistence — neither ever
  mutates parsed game-state values (constitution Principle I).
- `getPlayerNationOverview` MUST tag which fields are raw vs. derived in
  its return shape (e.g., a `derived: Set<string>` alongside the values) so
  the UI can satisfy FR-007 without re-deriving that knowledge itself.
- No function accepts arbitrary SQL from its caller — this is what keeps
  the future AI agent's access constrained to well-defined, read-only
  tools per Principle VIII, rather than an open query surface.
