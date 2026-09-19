// Shared message types for the main-thread <-> parser-worker contract.
// See specs/001-save-import-overview/contracts/worker-protocol.md — this
// file is the TypeScript mirror of that contract; keep both in sync.
//
// The `keep`/`kept`/`keep-failed` messages that existed here under
// SQLite are gone as of the 2026-09-18 DuckDB migration (see
// ARCHITECTURE.md's decision log): DuckDB has no SQLite-style
// "write-capable connections must come from a dedicated Worker"
// restriction, so `KeepSaveToggle`'s write now goes straight through
// `storage/queries.ts` on the main thread — no worker round-trip needed.

export interface LoadMessage {
  type: "load";
  /** Required for a normal load; omitted when resuming a kept save,
   * where `saveId` is set instead (see `keepAsDefaultSession`). */
  file?: File;
  /** True only when resuming a previously kept save (opens its existing
   * OPFS database instead of creating a new one) — `saveId` must be set
   * instead of `file` in that case (FR-011/Acceptance Scenario 2). */
  keepAsDefaultSession: boolean;
  /** The previously kept save's id; only used when `keepAsDefaultSession`. */
  saveId?: string;
}

export interface CancelMessage {
  type: "cancel";
}

export type MainToWorkerMessage = LoadMessage | CancelMessage;

export type ParsePhase = "validating" | "detecting-version" | "parsing";

export interface ProgressMessage {
  type: "progress";
  phase: ParsePhase;
  percent: number | null;
}

export type ErrorKind = "not-a-save" | "unsupported-version" | "parse-failed";

export interface ErrorMessage {
  type: "error";
  kind: ErrorKind;
  detectedVersion?: string;
  message: string;
}

export interface ReadyMessage {
  type: "ready";
  saveId: string;
  inGameDate: string;
  playerNationTag: string;
}

export type WorkerToMainMessage = ProgressMessage | ErrorMessage | ReadyMessage;
