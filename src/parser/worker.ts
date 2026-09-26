/// <reference lib="webworker" />
// Thin postMessage plumbing around load-save.ts's actual orchestration —
// see contracts/worker-protocol.md for the message contract this
// implements, and load-save.ts for the real logic (kept separate so it's
// unit-testable without a real Worker thread).
//
// As of the 2026-09-18 DuckDB migration, this worker only ever does
// file-reading + parsing + storing (`load`/`cancel`) — "keep" moved to
// the main thread (see FileLoader.tsx) since DuckDB has no SQLite-style
// restriction requiring writes to originate from a dedicated Worker.
import type { LoadWarning, MainToWorkerMessage, WorkerToMainMessage } from "./protocol";
import { loadSave, resumeSave } from "./load-save";
import { importSnapshot } from "./import-snapshot";
import { downloadShare, ShareDownloadError } from "./download-share";
import { cleanupSaveIfNotKept } from "../storage/queries";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let currentAbortController: AbortController | null = null;

// The saveId of the last load/resume that reached `ready`, if its
// database hasn't been cleaned up yet. Used to enforce FR-005/FR-012 (a
// session-only save isn't retained forever) when a new `load`/resume
// supersedes it — see T035.
let lastReadySaveId: string | null = null;

function post(message: WorkerToMainMessage): void {
  ctx.postMessage(message);
}

/** Shared by handleLoad/handleResume once either reaches `ready`:
 * reports it, then cleans up whatever save it superseded (unless kept).
 * `supersededSaveId` must be captured by the caller *before* starting
 * the load/resume, not read fresh here — it needs to reflect whatever
 * was ready when this one started, regardless of how long it took. */
async function reportReadyAndSupersede(
  result: {
    saveId: string;
    inGameDate: string;
    playerNationTag: string;
    warnings?: LoadWarning[];
    shared?: { id: string; expiresAt: string };
  },
  supersededSaveId: string | null,
): Promise<void> {
  lastReadySaveId = result.saveId;
  post({ type: "ready", ...result });

  if (supersededSaveId && supersededSaveId !== result.saveId) {
    try {
      await cleanupSaveIfNotKept(supersededSaveId);
    } catch (err) {
      // The new load/resume has already been reported; don't let a
      // cleanup failure surface as though that failed too.
      console.error(`Failed to clean up superseded save ${supersededSaveId}`, err);
    }
  }
}

async function handleLoad(file: File): Promise<void> {
  const supersededSaveId = lastReadySaveId;
  lastReadySaveId = null;

  const abortController = new AbortController();
  currentAbortController = abortController;

  await loadSave(
    file,
    {
      onProgress: (phase, percent) => post({ type: "progress", phase, percent }),
      onReady: (result) => void reportReadyAndSupersede(result, supersededSaveId),
      onError: (kind, message, detectedVersion) =>
        post({ type: "error", kind, message, detectedVersion }),
    },
    abortController.signal,
  );

  if (currentAbortController === abortController) {
    currentAbortController = null;
  }
}

async function handleResume(saveId: string): Promise<void> {
  const supersededSaveId = lastReadySaveId;
  lastReadySaveId = null;

  await resumeSave(saveId, {
    onReady: (result) => void reportReadyAndSupersede(result, supersededSaveId),
    onError: (kind, message, detectedVersion) =>
      post({ type: "error", kind, message, detectedVersion }),
  });
}

/** 017: open a shared game from `/s/<id>`. Superseding and cancel work like `load`. */
async function handleImportShare(id: string): Promise<void> {
  const supersededSaveId = lastReadySaveId;
  lastReadySaveId = null;

  const abortController = new AbortController();
  currentAbortController = abortController;
  const { signal } = abortController;
  try {
    const { container, expiresAt } = await downloadShare(
      id,
      (percent) => {
        if (!signal.aborted) post({ type: "progress", phase: "downloading", percent });
      },
      signal,
    );
    if (signal.aborted) return;
    await importSnapshot(
      container,
      {
        onProgress: (phase, percent) => {
          if (!signal.aborted) post({ type: "progress", phase, percent });
        },
        onReady: (result) => void reportReadyAndSupersede({ ...result, shared: { id, expiresAt } }, supersededSaveId),
        onError: (kind, message) => post({ type: "error", kind, message }),
      },
      signal,
    );
  } catch (err) {
    if (signal.aborted) return;
    const kind = err instanceof ShareDownloadError ? err.kind : "share-unavailable";
    post({ type: "error", kind, message: "This shared game couldn't be opened." });
  } finally {
    if (currentAbortController === abortController) currentAbortController = null;
  }
}

ctx.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "load":
      // FR-010: a new load always supersedes any in-progress one, so
      // callers don't have to remember to send `cancel` first.
      currentAbortController?.abort();
      if (message.keepAsDefaultSession && message.saveId) {
        void handleResume(message.saveId);
      } else if (message.file) {
        void handleLoad(message.file);
      }
      break;
    case "import-share":
      currentAbortController?.abort();
      void handleImportShare(message.id);
      break;
    case "cancel":
      currentAbortController?.abort();
      break;
  }
};
