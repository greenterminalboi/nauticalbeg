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

/** 017: open a shared game (`/s/<id>`) instead of a file. */
export interface ImportShareMessage {
  type: "import-share";
  id: string;
}

export type MainToWorkerMessage = LoadMessage | CancelMessage | ImportShareMessage;

/** `decompressing` (added in 015) is sent only for non-plain-text saves,
 * while the melter converts them to plaintext. */
export type ParsePhase =
  | "validating"
  | "decompressing"
  | "detecting-version"
  | "parsing"
  // 017: opening a shared game.
  | "downloading"
  | "importing";

export interface ProgressMessage {
  type: "progress";
  phase: ParsePhase;
  percent: number | null;
}

/** The last three were added in 015 (see
 * specs/015-save-format-support/contracts/worker-protocol-delta.md). */
export type ErrorKind =
  | "not-a-save"
  | "unsupported-version"
  | "parse-failed"
  | "unrecognized-format"
  | "damaged-save"
  | "binary-unavailable"
  // 016: the DuckDB engine (served from jsDelivr in production) couldn't load.
  | "engine-unavailable"
  // 017: opening a shared game (contracts/share-ui.md's SharedLinkMessage).
  | "share-expired"
  | "share-deleted"
  | "share-not-found"
  | "share-unavailable"
  | "share-incompatible"
  | "share-corrupt";

export interface ErrorMessage {
  type: "error";
  kind: ErrorKind;
  detectedVersion?: string;
  message: string;
}

/** A non-blocking notice attached to a successful load (015 FR-009). */
export interface LoadWarning {
  kind: "unknown-tokens";
  count: number;
  message: string;
}

export interface ReadyMessage {
  type: "ready";
  saveId: string;
  inGameDate: string;
  playerNationTag: string;
  /** Omitted when empty. */
  warnings?: LoadWarning[];
  /** 017: set when this is a shared game opened from a link. */
  shared?: { id: string; expiresAt: string };
}

export type WorkerToMainMessage = ProgressMessage | ErrorMessage | ReadyMessage;
