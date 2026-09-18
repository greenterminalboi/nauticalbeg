// Opens/creates a per-save SQLite database backed by wa-sqlite's OPFS VFS.
// See ARCHITECTURE.md "Why SQLite instead of plain JS objects" and
// research.md §2 for why this is the storage engine, and the
// "Cross-origin isolation requirement" note in ARCHITECTURE.md for the
// COOP/COEP headers this VFS depends on (configured in vite.config.ts).
import SQLiteAsyncESMFactory from "wa-sqlite/dist/wa-sqlite-async.mjs";
import * as SQLite from "wa-sqlite";
import { OriginPrivateFileSystemVFS } from "wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js";
import schemaSql from "./schema.sql?raw";

export const OPFS_VFS_NAME = "opfs";

let sqlite3Promise: Promise<SQLiteAPI> | null = null;
let moduleConfig: Record<string, unknown> = {};
let testVfsRegistrar: ((sqlite3: SQLiteAPI) => void) | null = null;

/**
 * Test-only seam. Node/Vitest has neither `navigator.storage` (so the OPFS
 * VFS can't be constructed) nor a `fetch()` that can load a local `.wasm`
 * file (so the Emscripten module factory needs a pre-read `wasmBinary`
 * instead). Call this once, before the first `openSaveDatabase`/
 * `applySchema` call, from test setup. Production code never calls this —
 * the OPFS VFS is registered automatically in `getSQLite`.
 */
export function configureSQLiteForTesting(options: {
  moduleConfig: Record<string, unknown>;
  registerVfs: (sqlite3: SQLiteAPI) => void;
}): void {
  if (sqlite3Promise) {
    throw new Error(
      "configureSQLiteForTesting must be called before the first database is opened",
    );
  }
  moduleConfig = options.moduleConfig;
  testVfsRegistrar = options.registerVfs;
}

async function getSQLite(): Promise<SQLiteAPI> {
  if (!sqlite3Promise) {
    sqlite3Promise = (async () => {
      const module = await SQLiteAsyncESMFactory(moduleConfig);
      const sqlite3 = SQLite.Factory(module);
      if (testVfsRegistrar) {
        testVfsRegistrar(sqlite3);
      } else {
        const vfs = new OriginPrivateFileSystemVFS();
        // Not the default VFS — every open() call is explicit about which
        // VFS name to use, so production (opfs) and tests (memory-async)
        // can coexist without either needing to know about the other.
        sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
      }
      return sqlite3;
    })();
  }
  return sqlite3Promise;
}

export interface SaveDatabase {
  /** Opaque SQLite database handle, as returned by wa-sqlite's open_v2. */
  handle: number;
  sqlite3: SQLiteAPI;
}

/**
 * Opens (creating if it doesn't exist) the SQLite database for a save.
 * `name` becomes the VFS-level filename — it must be stable and unique per
 * save (data-model.md's `save_meta.id`), and is also what
 * `deleteSaveDatabase` needs to remove it later. `vfsName` defaults to the
 * OPFS VFS used in production; tests pass a different registered VFS name
 * (see `configureSQLiteForTesting`).
 *
 * `readonly: true` opens without `SQLITE_OPEN_CREATE`/`READWRITE`. This
 * matters beyond intent-signaling: a read-write connection must be ready
 * to escalate to an exclusive lock, which is exactly what makes the OPFS
 * VFS (`OriginPrivateFileSystemVFS`) call `createSyncAccessHandle()` —
 * and that call only works from a dedicated Worker in some browsers,
 * throwing `createSyncAccessHandle is not a function` from the main
 * thread otherwise (confirmed in Chrome). A read-only connection never
 * needs more than a shared lock, so it never hits that path. Every
 * main-thread caller here only ever reads (writes go through the parser
 * worker), so it should always pass `readonly: true`.
 */
export async function openSaveDatabase(
  name: string,
  vfsName: string = OPFS_VFS_NAME,
  options?: { readonly?: boolean },
): Promise<SaveDatabase> {
  const sqlite3 = await getSQLite();
  const flags = options?.readonly
    ? SQLite.SQLITE_OPEN_READONLY
    : SQLite.SQLITE_OPEN_CREATE | SQLite.SQLITE_OPEN_READWRITE;
  const handle = await sqlite3.open_v2(name, flags, vfsName);
  return { handle, sqlite3 };
}

export async function closeSaveDatabase(db: SaveDatabase): Promise<void> {
  await db.sqlite3.close(db.handle);
}

/** Creates the save_meta/nations/provinces/locations/war_participants tables if they don't exist yet. */
export async function applySchema(db: SaveDatabase): Promise<void> {
  await db.sqlite3.exec(db.handle, schemaSql);
}

/**
 * Runs one INSERT (or other single-statement DML) once per row in `rows`,
 * using bound parameters (`?1`, `?2`, ...) rather than string
 * interpolation. Prepares the statement once and reuses it across all
 * rows. `sql` must be exactly one statement.
 */
export async function insertRows(
  db: SaveDatabase,
  sql: string,
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>,
): Promise<void> {
  for await (const stmt of db.sqlite3.statements(db.handle, sql)) {
    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        db.sqlite3.bind(stmt, i + 1, row[i]);
      }
      await db.sqlite3.step(stmt);
      await db.sqlite3.reset(stmt);
    }
    // `sql` is documented as exactly one statement, so there's only ever
    // one iteration of this loop — but `statements()` is an async
    // iterable regardless, hence the for-await.
  }
}

/**
 * Runs a single SELECT (or other statement returning rows) with bound
 * parameters, returning each row as a plain object keyed by column name.
 * Uses wa-sqlite's `execWithParams` convenience rather than `insertRows`'
 * hand-rolled prepare/bind/step loop — reading is comparatively rare
 * per-query (unlike bulk inserts), so the simpler wrapper is worth it.
 */
export async function queryRows(
  db: SaveDatabase,
  sql: string,
  params?: ReadonlyArray<string | number | null>,
): Promise<Array<Record<string, SQLiteCompatibleType>>> {
  const { rows, columns } = await db.sqlite3.execWithParams(
    db.handle,
    sql,
    params as SQLiteCompatibleType[] | undefined,
  );
  return rows.map((row) => {
    const record: Record<string, SQLiteCompatibleType> = {};
    columns.forEach((name, i) => {
      record[name] = row[i];
    });
    return record;
  });
}

/**
 * Permanently deletes a save's OPFS-backed database, including SQLite's
 * journal/WAL/shm sidecar files if present. Used when forgetting a kept
 * save (FR-013), when a new load supersedes a previous session-only save
 * (FR-005/FR-010), and on session teardown (FR-012). No-ops for non-OPFS
 * (test) VFSes, which don't persist beyond the process and have no
 * `navigator.storage` to call.
 */
export async function deleteSaveDatabase(
  name: string,
  vfsName: string = OPFS_VFS_NAME,
): Promise<void> {
  if (vfsName !== OPFS_VFS_NAME) return;
  const root = await navigator.storage.getDirectory();
  const candidates = [name, `${name}-journal`, `${name}-wal`, `${name}-shm`];
  for (const filename of candidates) {
    try {
      await root.removeEntry(filename);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "NotFoundError")) {
        throw err;
      }
    }
  }
}
