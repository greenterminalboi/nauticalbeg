// The real orchestration behind worker.ts's `load` handling — extracted
// into a plain async function (rather than living directly in the
// postMessage handler) so it's unit-testable without needing an actual
// Worker thread. worker.ts just wires these callbacks to postMessage.
import {
  applySchema,
  closeSaveDatabase,
  deleteSaveDatabase,
  OPFS_VFS_NAME,
  openSaveDatabase,
  type SaveDatabase,
} from "../storage/db";
import { getPlayerNationOverview, getSaveMeta } from "../storage/queries";
import { readFileAsBytes } from "./save-reader";
import { detectVersion, looksLikeSaveFile } from "./version-detect";
import { parseAndStore as parseAndStore_1_3_11 } from "./version-adapters/1.3.11";
import type { ErrorKind, ParsePhase } from "./protocol";

type Adapter = typeof parseAndStore_1_3_11;

/** One entry per supported game version — see constitution Principle III
 * (explicit version-aware routing, never silent best-effort parsing). */
const ADAPTERS: Record<string, Adapter> = {
  "1.3.11": parseAndStore_1_3_11,
};

export interface LoadCallbacks {
  onProgress: (phase: ParsePhase, percent: number | null) => void;
  onReady: (result: {
    saveId: string;
    inGameDate: string;
    playerNationTag: string;
  }) => void;
  onError: (
    kind: ErrorKind,
    message: string,
    detectedVersion?: string,
  ) => void;
}

const PROGRESS_INTERVAL_MS = 1000; // FR-008: at least once per second

/**
 * Reads, validates, detects the version of, and parses `file` into a new
 * per-save SQLite database, reporting progress/result/error via
 * `callbacks`. Resolves once a terminal callback (`onReady`/`onError`) has
 * fired, or once `signal` is aborted (in which case neither fires —
 * FR-010's cancel is meant to look like the load never happened, not like
 * a reported failure).
 *
 * FR-005/FR-012: if a database was created (parsing got as far as
 * `openSaveDatabase`) but this exits without ever calling `onReady` —
 * cancelled mid-parse, or a genuine parse failure — that database is
 * deleted here. Found by actually exercising quickstart.md's "cancel
 * mid-parse" scenario: neither the FR-010 supersede-cleanup in
 * `worker.ts` nor the `beforeunload` cleanup in `FileLoader.tsx` ever
 * runs for a save that never reached "ready" in the first place (there's
 * nothing to supersede, and `currentSaveIdRef` is never set for it), so
 * without this it leaked forever — the same class of bug as T035, just
 * on a different trigger.
 *
 * `vfsName` defaults to production's OPFS VFS; tests override it to the
 * in-memory test VFS (see tests/helpers/sqlite-test-env.ts), since Node
 * has no OPFS.
 */
export async function loadSave(
  file: File,
  callbacks: LoadCallbacks,
  signal: AbortSignal,
  vfsName: string = OPFS_VFS_NAME,
): Promise<void> {
  let db: SaveDatabase | null = null;
  let saveId: string | null = null;
  let reachedReady = false;
  try {
    callbacks.onProgress("validating", null);

    let lastProgressPost = 0;
    const data = await readFileAsBytes(
      file,
      ({ bytesRead, totalBytes }) => {
        const now = Date.now();
        if (now - lastProgressPost >= PROGRESS_INTERVAL_MS) {
          lastProgressPost = now;
          callbacks.onProgress(
            "validating",
            totalBytes > 0 ? Math.round((bytesRead / totalBytes) * 100) : null,
          );
        }
      },
      signal,
    );

    if (!looksLikeSaveFile(data)) {
      callbacks.onError(
        "not-a-save",
        "This doesn't look like a recognized EU5 save file.",
      );
      return;
    }

    callbacks.onProgress("detecting-version", null);
    const version = await detectVersion(data);
    const adapter = version ? ADAPTERS[version] : undefined;
    if (!version || !adapter) {
      callbacks.onError(
        "unsupported-version",
        version
          ? `This save is from an unsupported game version (detected: ${version}).`
          : "Could not detect this save's game version.",
        version ?? undefined,
      );
      return;
    }

    callbacks.onProgress("parsing", null);
    saveId = crypto.randomUUID();
    db = await openSaveDatabase(saveId, vfsName);
    await applySchema(db);
    const summary = await adapter(db, saveId, file.name, data);

    callbacks.onReady({
      saveId,
      inGameDate: summary.inGameDate,
      playerNationTag: summary.playerNationTag,
    });
    reachedReady = true;
  } catch (err) {
    if (signal.aborted) return; // cancelled — not a reportable failure
    callbacks.onError(
      "parse-failed",
      err instanceof Error ? err.message : "Failed to parse the save file.",
    );
  } finally {
    if (db) await closeSaveDatabase(db);
    if (saveId && !reachedReady) {
      try {
        await deleteSaveDatabase(saveId, vfsName);
      } catch (cleanupErr) {
        console.error(`Failed to clean up abandoned save ${saveId}`, cleanupErr);
      }
    }
  }
}

export interface ResumeCallbacks {
  onReady: LoadCallbacks["onReady"];
  onError: LoadCallbacks["onError"];
}

/**
 * FR-011/Acceptance Scenario 2: resumes a previously kept save by
 * `saveId` — it's already fully parsed and sitting in OPFS, so this
 * skips file-reading/version-detection/parsing entirely and just opens
 * a read-only connection to confirm it's still there and pull the same
 * `inGameDate`/`playerNationTag` a fresh `loadSave` would have reported.
 * `readonly: true` because this never writes anything (see
 * `openSaveDatabase`'s doc comment for why that also matters for
 * avoiding a main-thread-style OPFS crash, though this runs in the
 * worker regardless, alongside the `keep`/`load` handlers).
 */
export async function resumeSave(
  saveId: string,
  callbacks: ResumeCallbacks,
  vfsName: string = OPFS_VFS_NAME,
): Promise<void> {
  let db: SaveDatabase | null = null;
  try {
    db = await openSaveDatabase(saveId, vfsName, { readonly: true });
    const meta = await getSaveMeta(db);
    if (!meta.inGameDate) {
      callbacks.onError(
        "parse-failed",
        "This kept save's data looks incomplete and can't be resumed.",
      );
      return;
    }
    // The player nation may no longer resolve to anything meaningful if
    // is_player was never set (shouldn't happen for a save that reached
    // "ready" once already, but onReady's playerNationTag is otherwise
    // unused downstream — see FileLoader.tsx — so fall back rather than
    // fail the whole resume over a cosmetic field).
    const playerNationTag = await getPlayerNationOverview(db)
      .then((overview) => overview.tag)
      .catch(() => "");
    callbacks.onReady({ saveId, inGameDate: meta.inGameDate, playerNationTag });
  } catch (err) {
    callbacks.onError(
      "parse-failed",
      err instanceof Error ? err.message : "Failed to resume this kept save.",
    );
  } finally {
    if (db) await closeSaveDatabase(db);
  }
}
