# Contract: Main Thread ↔ Parser Worker

This is the internal message contract between the UI (main thread) and the
parsing Web Worker (`src/parser/worker.ts`). It's documented as a contract
because both the overview UI and, later, any richer visualization/AI-agent
loading flow depend on it staying stable.

## Main thread → Worker

| Message | Payload | Meaning |
|---|---|---|
| `load` | `{ file: File, keepAsDefaultSession: boolean }` | Start parsing the given file. `keepAsDefaultSession` is false for a normal load; true only for resuming a previously kept save (worker opens its existing OPFS database instead of creating one). |
| `cancel` | `{}` | Abort an in-progress parse (e.g., user selects a different file mid-parse, per Edge Cases). |

## Worker → Main thread

| Message | Payload | Meaning |
|---|---|---|
| `progress` | `{ phase: "validating" \| "detecting-version" \| "parsing", percent: number \| null }` | Sent at least once per second during any phase expected to exceed 1s (FR-008). `percent` is `null` when it can't yet be estimated (e.g., before the total size to parse is known). |
| `error` | `{ kind: "not-a-save" \| "unsupported-version" \| "parse-failed", detectedVersion?: string, message: string }` | Terminal — parsing has stopped. `kind` maps 1:1 to the three FR-009 error categories. |
| `ready` | `{ saveId: string, inGameDate: string, playerNationTag: string }` | Parsing succeeded; `saveId` identifies the SQLite database the UI should now query via `storage/queries.ts`. |

## Rules

- Exactly one terminal message (`error` or `ready`) is sent per `load`
  request; `progress` messages only occur strictly between `load` and the
  terminal message.
- The worker owns all writes to the SQLite database; the main thread only
  ever reads from it via `storage/queries.ts` (enforces the parser/UI
  decoupling required by the constitution's Technical Constraints).
