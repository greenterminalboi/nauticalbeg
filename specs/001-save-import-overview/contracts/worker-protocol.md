# Contract: Main Thread ↔ Parser Worker

This is the internal message contract between the UI (main thread) and the
parsing Web Worker (`src/parser/worker.ts`). It's documented as a contract
because both the overview UI and, later, any richer visualization/AI-agent
loading flow depend on it staying stable.

## Main thread → Worker

| Message | Payload | Meaning |
|---|---|---|
| `load` | `{ file?: File, keepAsDefaultSession: boolean, saveId?: string }` | Start parsing the given file. `keepAsDefaultSession` is false for a normal load (`file` set, `saveId` omitted); true only for resuming a previously kept save (`saveId` set, `file` omitted — worker opens its existing OPFS database directly rather than re-parsing, via `load-save.ts`'s `resumeSave`). |
| `cancel` | `{}` | Abort an in-progress parse (e.g., user selects a different file mid-parse, per Edge Cases). |
| `keep` | `{ saveId: string }` | **Added 2026-09-18 (FR-011/T036-T038).** Mark `saveId` as kept. Routed through the worker rather than called directly from the UI because writing `save_meta.kept = 1` needs a write-capable SQLite connection, and that can only be opened from within a dedicated Worker in this browser — a main-thread open fails outright (`createSyncAccessHandle` isn't available there; see `storage/db.ts`'s `openSaveDatabase` doc comment). |

## Worker → Main thread

| Message | Payload | Meaning |
|---|---|---|
| `progress` | `{ phase: "validating" \| "decompressing" \| "detecting-version" \| "parsing", percent: number \| null }` | Sent at least once per second during any phase expected to exceed 1s (FR-008). `percent` is `null` when it can't yet be estimated (e.g., before the total size to parse is known). Not sent for a `keepAsDefaultSession` resume — there's nothing to parse. |
| `error` | `{ kind: "not-a-save" \| "unsupported-version" \| "parse-failed" \| "unrecognized-format" \| "damaged-save" \| "binary-unavailable", detectedVersion?: string, message: string }` | Terminal — parsing (or resuming) has stopped. `kind` maps 1:1 to the three FR-009 error categories; a resume failure (e.g. the kept save's data is missing/incomplete) is reported as `parse-failed`. |
| `ready` | `{ saveId: string, inGameDate: string, playerNationTag: string, warnings?: LoadWarning[] }` | Parsing (or resuming) succeeded; `saveId` identifies the SQLite database the UI should now query via `storage/queries.ts`. |
| `kept` | `{ saveId: string, filename: string, inGameDate: string \| null }` | **Added 2026-09-18.** `keep` succeeded — the worker only did the SQL write; the main thread still needs to run `storage/queries.ts`'s `recordKeptSave` with this payload to finish the job, since that touches `localStorage`, which doesn't exist in a Worker's global scope at all (confirmed: this crashed outright the first time `keep`'s handler tried to do both from inside the worker). |
| `keep-failed` | `{ saveId: string, message: string, quotaExceeded: boolean }` | **Added 2026-09-18 (FR-014).** `keep` failed — `quotaExceeded` distinguishes a storage-quota failure from any other. Never corrupts a previously kept save (see `storage/queries.ts`'s `markSaveKept`/`recordKeptSave` split and their ordering). |

**Added 2026-09-24 (015 — save format support)**: the `decompressing`
phase, the `unrecognized-format` / `damaged-save` / `binary-unavailable`
error kinds, and `ready.warnings`. See
`specs/015-save-format-support/contracts/worker-protocol-delta.md` for
their exact meaning and player-facing messages.

## Rules

- Exactly one terminal message (`error` or `ready`) is sent per `load`
  request (including a resume); `progress` messages only occur strictly
  between `load` and the terminal message, and only for a real parse.
- Exactly one terminal message (`kept` or `keep-failed`) is sent per `keep`
  request.
- The worker owns all writes to the SQLite database; the main thread only
  ever reads from it via `storage/queries.ts` (enforces the parser/UI
  decoupling required by the constitution's Technical Constraints) — with
  the one exception that `localStorage`-only bookkeeping (`recordKeptSave`,
  `forgetKeptSave`) runs on the main thread, since it never touches SQLite
  at all.
