/// <reference lib="webworker" />
// Thin postMessage plumbing around load-save.ts's actual orchestration —
// see contracts/worker-protocol.md for the message contract this
// implements, and load-save.ts for the real logic (kept separate so it's
// unit-testable without a real Worker thread).
import type { MainToWorkerMessage, WorkerToMainMessage } from "./protocol";
import { loadSave } from "./load-save";
import { cleanupSaveIfNotKept } from "../storage/queries";

const ctx = self as unknown as DedicatedWorkerGlobalScope;

let currentAbortController: AbortController | null = null;

// The saveId of the last load that reached `ready`, if its database
// hasn't been cleaned up yet. Used to enforce FR-005/FR-012 (a
// session-only save isn't retained forever) when a new `load` supersedes
// it — see T035.
let lastReadySaveId: string | null = null;

function post(message: WorkerToMainMessage): void {
  ctx.postMessage(message);
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
      onReady: (result) => {
        lastReadySaveId = result.saveId;
        post({ type: "ready", ...result });
      },
      onError: (kind, message, detectedVersion) =>
        post({ type: "error", kind, message, detectedVersion }),
    },
    abortController.signal,
  );

  if (currentAbortController === abortController) {
    currentAbortController = null;
  }

  if (supersededSaveId) {
    try {
      await cleanupSaveIfNotKept(supersededSaveId);
    } catch (err) {
      // The new load has already been reported (ready or error); don't
      // let a cleanup failure surface as though the new load failed.
      console.error(`Failed to clean up superseded save ${supersededSaveId}`, err);
    }
  }
}

ctx.onmessage = (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "load":
      // FR-010: a new load always supersedes any in-progress one, so
      // callers don't have to remember to send `cancel` first.
      currentAbortController?.abort();
      void handleLoad(message.file);
      break;
    case "cancel":
      currentAbortController?.abort();
      break;
  }
};
