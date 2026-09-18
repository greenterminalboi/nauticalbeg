// Shared message types for the main-thread <-> parser-worker contract.
// See specs/001-save-import-overview/contracts/worker-protocol.md — this
// file is the TypeScript mirror of that contract; keep both in sync.

export interface LoadMessage {
  type: "load";
  file: File;
  /** True only when resuming a previously kept save (opens its existing
   * OPFS database instead of creating a new one). */
  keepAsDefaultSession: boolean;
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
