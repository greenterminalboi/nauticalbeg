// The real orchestration behind worker.ts's `load` handling — extracted
// into a plain async function (rather than living directly in the
// postMessage handler) so it's unit-testable without needing an actual
// Worker thread. worker.ts just wires these callbacks to postMessage.
import {
  applySchema,
  closeSaveDatabase,
  deleteSaveDatabase,
  openSaveDatabase,
  type SaveDatabase,
} from "../storage/db";
import { getPlayerNationOverview, getSaveMeta } from "../storage/queries";
import { readFileAsBytes } from "./save-reader";
import { parseSaveHeader, type HeaderErrorKind } from "./save-format";
import { detectVersion } from "./version-detect";
import { MelterUnavailableError, MeltFailedError, meltSave } from "./melter/melt";
import { parseAndStore as parseAndStore_1_3_11 } from "./version-adapters/1.3.11";
import type { ErrorKind, LoadWarning, ParsePhase } from "./protocol";

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
    warnings?: LoadWarning[];
  }) => void;
  onError: (
    kind: ErrorKind,
    message: string,
    detectedVersion?: string,
  ) => void;
}

const PROGRESS_INTERVAL_MS = 1000; // FR-008: at least once per second

// Player-facing copy for 015's error kinds — verbatim from
// specs/015-save-format-support/contracts/worker-protocol-delta.md.
const HEADER_ERROR_MESSAGES: Record<HeaderErrorKind, string> = {
  "not-a-save": "This doesn't look like a recognized EU5 save file.",
  "damaged-save":
    "This save file appears damaged or incomplete. Try copying it again from your EU5 save games folder.",
  "unrecognized-format":
    "This save uses a format NauticalBeg doesn't recognize. It may come from a newer game version.",
};
const BINARY_UNAVAILABLE_MESSAGE =
  "Ironman and binary saves can't be read right now. You can still load a text save (a debug-mode save, or one converted with rakaly melt).";

/**
 * Reads, validates, detects the version of, and parses `file` into a new
 * per-save DuckDB database, reporting progress/result/error via
 * `callbacks`. Resolves once a terminal callback (`onReady`/`onError`) has
 * fired, or once `signal` is aborted (in which case neither fires —
 * FR-010's cancel is meant to look like the load never happened, not like
 * a reported failure).
 *
 * This runs inside the parser Worker and always fully closes its
 * connection *before* calling `onReady` — DuckDB-Wasm allows only one
 * open handle per OPFS file at a time (confirmed via a real Chrome
 * session), so the main thread's `FileLoader.tsx` (which opens its own
 * connection to the same path the moment it receives `ready`) would race
 * the worker's own close otherwise. See ARCHITECTURE.md's storage-engine
 * decision log.
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
 */
export async function loadSave(
  file: File,
  callbacks: LoadCallbacks,
  signal: AbortSignal,
): Promise<void> {
  let db: SaveDatabase | null = null;
  let saveId: string | null = null;
  let reachedReady = false;
  // A cancelled/superseded load must go silent: before 015 the only
  // synchronous gaps were short, but a binary save's melt blocks the
  // Worker for many seconds, during which a cancel can only queue. Found
  // live in 015's browser check — a superseded binary load kept posting
  // "Parsing save…" over the newer load's result and left its database
  // behind. So: no progress once aborted, re-check after every long step,
  // and never report ready for an aborted load (see also throwIfAborted).
  const progress: LoadCallbacks["onProgress"] = (phase, percent) => {
    if (!signal.aborted) callbacks.onProgress(phase, percent);
  };
  try {
    progress("validating", null);

    let lastProgressPost = 0;
    const rawData = await readFileAsBytes(
      file,
      ({ bytesRead, totalBytes }) => {
        const now = Date.now();
        if (now - lastProgressPost >= PROGRESS_INTERVAL_MS) {
          lastProgressPost = now;
          progress(
            "validating",
            totalBytes > 0 ? Math.round((bytesRead / totalBytes) * 100) : null,
          );
        }
      },
      signal,
    );

    // 015: route by the header's declared format. Plain text (kind 00)
    // goes straight to the existing parser; everything else — what the
    // game actually writes, ironman included — is melted to that same
    // plaintext first, so version detection, the adapter, and every tab
    // are identical regardless of input format (FR-004).
    const format = parseSaveHeader(rawData);
    if ("error" in format) {
      callbacks.onError(format.error, HEADER_ERROR_MESSAGES[format.error]);
      return;
    }

    let data = rawData;
    const warnings: LoadWarning[] = [];
    if (format.kindCode !== 0) {
      progress("decompressing", 0);
      let lastMeltPost = 0;
      try {
        const melted = await meltSave(rawData, {
          signal,
          onProgress: (percent) => {
            const now = Date.now();
            if (now - lastMeltPost >= PROGRESS_INTERVAL_MS) {
              lastMeltPost = now;
              progress("decompressing", percent);
            }
          },
        });
        data = melted.text;
        const unknown = melted.unknownTokenCount + melted.unknownLookupCount;
        if (unknown > 0) {
          warnings.push({
            kind: "unknown-tokens",
            count: unknown,
            message: `${unknown} ${unknown === 1 ? "field" : "fields"} in this save weren't recognized; some data may be incomplete.`,
          });
        }
      } catch (err) {
        if (signal.aborted) return;
        if (err instanceof MelterUnavailableError) {
          callbacks.onError("binary-unavailable", BINARY_UNAVAILABLE_MESSAGE);
          return;
        }
        if (err instanceof MeltFailedError) {
          callbacks.onError(err.kind, HEADER_ERROR_MESSAGES[err.kind]);
          return;
        }
        throw err;
      }
      // melt is synchronous inside the Worker, so a cancel sent during it
      // is still sitting in the message queue — yield once so it's
      // processed before any database gets created.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (signal.aborted) return;
      progress("decompressing", 100);
    }

    progress("detecting-version", null);
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

    if (signal.aborted) return;
    progress("parsing", null);
    saveId = crypto.randomUUID();
    db = await openSaveDatabase(saveId);
    await applySchema(db);
    // Real, reached-milestone progress through the adapter's own
    // extraction passes (see 1.3.11.ts's PARSE_MILESTONES) — added once
    // 007/009 made "parsing" long enough on a real large save that
    // reporting it exactly once, with no update until the whole function
    // returned, read as stuck rather than merely pulsing-but-working.
    // Throwing from the milestone callback stops a cancelled adapter at
    // its next milestone rather than letting it run to completion; the
    // catch below treats it as a cancel and `finally` deletes the database.
    const summary = await adapter(db, saveId, file.name, data, (percent) => {
      signal.throwIfAborted();
      progress("parsing", percent);
    });
    signal.throwIfAborted();

    // Close before signaling ready — see this function's doc comment.
    await closeSaveDatabase(db);
    db = null;

    callbacks.onReady({
      saveId,
      inGameDate: summary.inGameDate,
      playerNationTag: summary.playerNationTag,
      ...(warnings.length > 0 ? { warnings } : {}),
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
        await deleteSaveDatabase(saveId);
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
 * skips file-reading/version-detection/parsing entirely and just opens a
 * connection to confirm it's still there and pull the same
 * `inGameDate`/`playerNationTag` a fresh `loadSave` would have reported.
 * Closes before signaling ready, for the same one-handle-per-file reason
 * documented on `loadSave` above.
 */
export async function resumeSave(
  saveId: string,
  callbacks: ResumeCallbacks,
): Promise<void> {
  let db: SaveDatabase | null = null;
  try {
    db = await openSaveDatabase(saveId);
    // A kept save's OPFS database was only ever schema'd once, at the
    // moment it was first parsed (see loadSave above) — a save kept
    // before a later feature added a new table (e.g. `wars`) would
    // otherwise resume straight into a hard "Catalog Error: Table ...
    // does not exist" the first time something queried it (a real crash
    // hit resuming a save kept before the Wars tab's schema addition).
    // `applySchema`'s statements are all `CREATE TABLE IF NOT EXISTS`, so
    // rerunning it here is a no-op for tables that already exist and just
    // adds ones that don't — the new table comes back empty rather than
    // populated (this save was never re-parsed with the adapter that
    // would fill it), which the affected tab's existing empty-state
    // handling already covers gracefully.
    await applySchema(db);
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

    await closeSaveDatabase(db);
    db = null;

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
