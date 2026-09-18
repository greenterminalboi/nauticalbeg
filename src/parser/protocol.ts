// Shared message types for the main-thread <-> parser-worker contract.
// See specs/001-save-import-overview/contracts/worker-protocol.md — this
// file is the TypeScript mirror of that contract; keep both in sync.

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

/** FR-011: mark a loaded save as kept. Routed through the worker because
 * writing to the save's OPFS-backed SQLite database (setting
 * `save_meta.kept = 1`) requires a write-capable connection, and that
 * can only be opened from a dedicated Worker in this browser — a
 * main-thread open fails outright (confirmed: `createSyncAccessHandle`
 * isn't available there). See `storage/db.ts`'s `openSaveDatabase` doc
 * comment. */
export interface KeepMessage {
  type: "keep";
  saveId: string;
}

export type MainToWorkerMessage = LoadMessage | CancelMessage | KeepMessage;

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

/** FR-011: `markSaveKept` succeeded in the worker. Carries what the main
 * thread needs to finish the job via `recordKeptSave` (see that
 * function's doc comment for why it can't happen in the worker). */
export interface KeptMessage {
  type: "kept";
  saveId: string;
  filename: string;
  inGameDate: string | null;
}

/** FR-014: `keepSave` failed — distinguishes a storage-quota failure
 * (the case FR-014 specifically calls out) from any other failure, and
 * either way never corrupts a previously kept save (see
 * `storage/queries.ts`'s `keepSave` — the write is attempted before any
 * previous kept save is touched). */
export interface KeepFailedMessage {
  type: "keep-failed";
  saveId: string;
  message: string;
  quotaExceeded: boolean;
}

export type WorkerToMainMessage =
  | ProgressMessage
  | ErrorMessage
  | ReadyMessage
  | KeptMessage
  | KeepFailedMessage;
