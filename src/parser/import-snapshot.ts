// Opens a shared game (017): decodes a snapshot container into a fresh
// per-save database, then hands off exactly like `loadSave` does, so every
// tab, the map and "keep" work unchanged. Runs in the parser Worker.
//
// Shared data is untrusted (spec FR-012): table and column names are only
// ever used after being matched against the *current* schema, and anything
// the schema doesn't have is refused as "made with a different version"
// rather than guessed at (constitution III).
import {
  applySchema,
  closeSaveDatabase,
  deleteSaveDatabase,
  insertArrowIPC,
  openSaveDatabase,
  queryRows,
  execSql,
  EngineUnavailableError,
  type SaveDatabase,
} from "../storage/db";
import { decodeSnapshot, SnapshotError } from "../share/snapshotFormat";
import type { LoadCallbacks } from "./load-save";

const PROGRESS_INTERVAL_MS = 1000;

export async function importSnapshot(
  container: Uint8Array,
  callbacks: Pick<LoadCallbacks, "onProgress" | "onError"> & {
    onReady: (result: { saveId: string; inGameDate: string; playerNationTag: string }) => void;
  },
  signal: AbortSignal,
): Promise<void> {
  let db: SaveDatabase | null = null;
  let saveId: string | null = null;
  let reachedReady = false;
  try {
    const { manifest, streams } = decodeSnapshot(container);
    if (signal.aborted) return;

    saveId = crypto.randomUUID();
    db = await openSaveDatabase(saveId);
    await applySchema(db);

    // Every shipped table and column must exist in this version's schema.
    const columnRows = await queryRows(
      db,
      "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'main' ORDER BY table_name, ordinal_position",
    );
    const schema = new Map<string, Set<string>>();
    const orderedColumns = new Map<string, string[]>();
    for (const r of columnRows) {
      const t = String(r.table_name);
      if (!schema.has(t)) {
        schema.set(t, new Set());
        orderedColumns.set(t, []);
      }
      schema.get(t)!.add(String(r.column_name));
      orderedColumns.get(t)!.push(String(r.column_name));
    }
    for (const t of manifest.tables) {
      const columns = schema.get(t.name);
      const missing = columns ? t.columns.filter((c) => !columns.has(c)) : null;
      if (!columns || (missing && missing.length > 0)) {
        throw new SnapshotError(
          "incompatible",
          columns
            ? `Shared game has column(s) this version doesn't know: ${t.name}.${missing!.join(", ")}.`
            : `Shared game has a table this version doesn't know: ${t.name}.`,
        );
      }
    }

    const totalBytes = manifest.tables.reduce((n, t) => n + t.bytes, 0) || 1;
    let doneBytes = 0;
    let lastPost = 0;
    callbacks.onProgress("importing", 0);
    for (const [i, t] of manifest.tables.entries()) {
      signal.throwIfAborted();
      const rows = await insertArrowIPC(db, t.name, streams[i], orderedColumns.get(t.name)!, (soFar) => {
        const now = Date.now();
        if (now - lastPost >= PROGRESS_INTERVAL_MS) {
          lastPost = now;
          const within = t.rows > 0 ? (soFar / t.rows) * t.bytes : 0;
          callbacks.onProgress("importing", Math.round(((doneBytes + within) / totalBytes) * 100));
        }
      });
      if (rows !== t.rows) {
        throw new SnapshotError("corrupt", `Shared game table ${t.name} has ${rows} rows; expected ${t.rows}.`);
      }
      doneBytes += t.bytes;
      const now = Date.now();
      if (now - lastPost >= PROGRESS_INTERVAL_MS || i === manifest.tables.length - 1) {
        lastPost = now;
        callbacks.onProgress("importing", Math.round((doneBytes / totalBytes) * 100));
      }
    }
    signal.throwIfAborted();

    // The snapshot's save_meta row carries the sharer's database id; this
    // copy is a new database in the viewer's browser.
    await execSql(db, `UPDATE save_meta SET id = '${saveId}', loaded_at = '${new Date().toISOString()}', kept = 0`);

    await closeSaveDatabase(db);
    db = null;
    callbacks.onReady({
      saveId,
      inGameDate: manifest.summary.inGameDate,
      playerNationTag: manifest.summary.playerNationTag,
    });
    reachedReady = true;
  } catch (err) {
    if (signal.aborted) return;
    if (err instanceof SnapshotError) {
      callbacks.onError(
        err.kind === "incompatible" ? "share-incompatible" : "share-corrupt",
        err.kind === "incompatible"
          ? "This link was made with a different version of NauticalBeg and can't be opened here."
          : "The shared data is damaged and can't be opened.",
      );
    } else if (err instanceof EngineUnavailableError) {
      callbacks.onError("engine-unavailable", "Couldn't download the database engine. Check your connection and try again.");
    } else {
      // Anything the database rejected while inserting untrusted data.
      callbacks.onError("share-corrupt", "The shared data is damaged and can't be opened.");
    }
  } finally {
    if (db) await closeSaveDatabase(db);
    if (saveId && !reachedReady) {
      try {
        await deleteSaveDatabase(saveId);
      } catch (cleanupErr) {
        console.error(`Failed to clean up abandoned shared game ${saveId}`, cleanupErr);
      }
    }
  }
}
