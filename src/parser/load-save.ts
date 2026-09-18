// The real orchestration behind worker.ts's `load` handling — extracted
// into a plain async function (rather than living directly in the
// postMessage handler) so it's unit-testable without needing an actual
// Worker thread. worker.ts just wires these callbacks to postMessage.
import {
  applySchema,
  closeSaveDatabase,
  OPFS_VFS_NAME,
  openSaveDatabase,
  type SaveDatabase,
} from "../storage/db";
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
 * Known gap (left for User Story 4, T034/T035): this always opens a new,
 * OPFS-backed database and never cleans it up if the save isn't
 * subsequently "kept" — FR-005's "not retained unless kept" default isn't
 * fully enforced until US4 implements that cleanup.
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
    const saveId = crypto.randomUUID();
    db = await openSaveDatabase(saveId, vfsName);
    await applySchema(db);
    const summary = await adapter(db, saveId, file.name, data);

    callbacks.onReady({
      saveId,
      inGameDate: summary.inGameDate,
      playerNationTag: summary.playerNationTag,
    });
  } catch (err) {
    if (signal.aborted) return; // cancelled — not a reportable failure
    callbacks.onError(
      "parse-failed",
      err instanceof Error ? err.message : "Failed to parse the save file.",
    );
  } finally {
    if (db) await closeSaveDatabase(db);
  }
}
