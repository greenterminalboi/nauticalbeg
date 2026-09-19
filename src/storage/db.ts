// Opens/creates a per-save DuckDB database backed by DuckDB-Wasm's OPFS
// filesystem. See ARCHITECTURE.md's storage-engine decision log for why
// this replaced wa-sqlite/SQLite (2026-09-18): DuckDB is Arrow-native
// (feeds a future Perspective-based visualization layer directly, no
// row->Arrow conversion layer needed) and better suited to the
// cross-country/cross-location aggregation work this project is heading
// toward. See research.md's real-browser spike findings for what's
// actually confirmed to work (concurrent queries on one connection are
// safe, unlike wa-sqlite's Asyncify build; OPFS persistence round-trips
// correctly; a file may only be held by one handle at a time).
import * as duckdb from "@duckdb/duckdb-wasm";
import duckdb_wasm_mvp from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import {
  tableFromArrays as productionTableFromArrays,
  tableToIPC as productionTableToIPC,
} from "apache-arrow";
import schemaSql from "./schema.sql?raw";

// Test-only seam: Vitest resolves this file's static `apache-arrow`
// import to a different module instance than the one
// `@duckdb/duckdb-wasm/blocking`'s internal CJS bundle natively
// `require()`s at runtime (a real, confirmed dual-module-instance
// hazard — Vite's SSR/Node transform pipeline vs. plain Node `require`
// resolution, reproduced with `insertArrowTable` completing without
// error but inserting zero rows, in both `jsdom` and plain `node` test
// environments alike, so it isn't a jsdom-specific quirk). Production
// (a real browser, where Vite's browser bundling naturally converges on
// one instance) is unaffected — confirmed via real Chrome sessions.
// `duckdb-test-env.ts` calls `configureArrowForTesting` with the
// natively-`require()`d `apache-arrow` (via `createRequire`) so the
// Arrow tables this module builds or serializes are the exact instance
// the Node bindings' own internal Arrow code expects.
let tableFromArrays = productionTableFromArrays;
let tableToIPC = productionTableToIPC;
export function configureArrowForTesting(fns: {
  tableFromArrays: typeof tableFromArrays;
  tableToIPC: typeof tableToIPC;
}): void {
  tableFromArrays = fns.tableFromArrays;
  tableToIPC = fns.tableToIPC;
}

/** A single result row, column name -> value (BigInt already coerced to
 * number — see `toPlainRows` below). */
export type Row = Record<string, string | number | boolean | null>;

interface ArrowRowLike {
  toJSON(): Record<string, unknown>;
}
interface ArrowTableLike {
  toArray(): ArrowRowLike[];
}
interface PreparedStatementLike {
  query(...params: unknown[]): Promise<ArrowTableLike> | ArrowTableLike;
  close(): Promise<void> | void;
}
/** The minimal shape this module needs from a connection — satisfied by
 * both DuckDB-Wasm's real `AsyncDuckDBConnection` (production) and the
 * synchronous Node-native `DuckDBConnection` (tests — see
 * `configureDuckDBForTesting`). `await`ing a non-promise value resolves
 * it immediately, so every function below works unmodified against
 * either the async or the sync connection. */
export interface DuckDBConnectionLike {
  query(sql: string): Promise<ArrowTableLike> | ArrowTableLike;
  prepare(sql: string): Promise<PreparedStatementLike> | PreparedStatementLike;
  close(): Promise<void> | void;
  /** Bulk-load an Arrow table — see `insertRows` below for why this
   * replaced a row-by-row prepared-statement loop (that approach fell
   * over on a real ~650MB save with a WASM "memory access out of
   * bounds" crash, confirmed live). `create: false` is required to
   * insert into an already-existing table rather than attempting to
   * create a new one (also confirmed live — the option isn't optional
   * despite being typed as such). */
  insertArrowTable(
    table: import("apache-arrow").Table,
    options: { name: string; create: boolean },
  ): Promise<void> | void;
}

export interface SaveDatabase {
  conn: DuckDBConnectionLike;
  /** Closes the connection and tears down whatever instantiated it
   * (Worker + AsyncDuckDB instance in production; nothing extra in
   * tests) — always call this instead of `conn.close()` directly. */
  close(): Promise<void>;
}

// A real-browser spike confirmed DuckDB-Wasm's `eh` bundle tolerates
// concurrent plain `query()` calls against one connection without the
// wa-sqlite-style Asyncify corruption this project hit twice before (see
// ARCHITECTURE.md). That spike did not specifically exercise two
// concurrent PREPARED STATEMENTS on the same connection (this app's
// `insertRows`/parameterized `queryRows` both prepare-then-close per
// call), which is undocumented territory — so every `db.conn`-touching
// function below still routes through this per-connection queue as cheap
// insurance, exactly like the fix that closed out that class of bug for
// SQLite. Costs nothing when nothing overlaps; removes an entire category
// of doubt when something does (e.g. a React StrictMode double-mount).
const connectionQueues = new WeakMap<SaveDatabase, Promise<unknown>>();

function withConnectionQueue<T>(db: SaveDatabase, run: () => Promise<T>): Promise<T> {
  const previous = connectionQueues.get(db) ?? Promise.resolve();
  const result = previous.then(run, run);
  connectionQueues.set(db, result.then(() => undefined, () => undefined));
  return result;
}

type ConnectionFactory = (
  path: string,
) => Promise<{ conn: DuckDBConnectionLike; cleanup: () => Promise<void> }>;

let testConnectionFactory: ConnectionFactory | null = null;

/**
 * Test-only seam. Node/Vitest has no OPFS, so tests use DuckDB-Wasm's
 * real Node-native bindings (`@duckdb/duckdb-wasm/blocking`) against a
 * real temp file or `:memory:` path instead of `opfs://`. Call this once
 * before the first `openSaveDatabase` call, from test setup. Production
 * code never calls this.
 */
export function configureDuckDBForTesting(factory: ConnectionFactory): void {
  testConnectionFactory = factory;
}

async function createProductionConnection(
  path: string,
): Promise<{ conn: DuckDBConnectionLike; cleanup: () => Promise<void> }> {
  const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm_mvp, mainWorker: mvp_worker },
    eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
  };
  const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
  const worker = new Worker(bundle.mainWorker!);
  const logger = new duckdb.VoidLogger();
  const asyncDb = new duckdb.AsyncDuckDB(logger, worker);
  await asyncDb.instantiate(bundle.mainModule, bundle.pthreadWorker);
  // Every connection in this app is READ_WRITE — DuckDB has no
  // SQLite-style "write must come from a dedicated Worker" restriction
  // (confirmed via a real Chrome session), so write-safety here is a
  // matter of which functions the app chooses to call (see queries.ts),
  // not which connection mode was opened.
  await asyncDb.open({ path, accessMode: duckdb.DuckDBAccessMode.READ_WRITE });
  const conn = await asyncDb.connect();
  return {
    conn,
    cleanup: async () => {
      await conn.close();
      await asyncDb.terminate();
      worker.terminate();
    },
  };
}

/**
 * Opens (creating if it doesn't exist) the DuckDB database for a save.
 * `name` becomes the OPFS-level filename (data-model.md's `save_meta.id`)
 * — it must be stable and unique per save, and is also what
 * `deleteSaveDatabase` needs to remove it later.
 *
 * DuckDB-Wasm allows only one open handle per OPFS file at a time (a real
 * constraint, not a SQLite-style workaround) — callers must fully
 * `close()` a save's connection before another context opens the same
 * `name` again. See ARCHITECTURE.md for how the Worker (ingestion) and
 * the main thread (the rest of the session) hand off around this.
 */
export async function openSaveDatabase(name: string): Promise<SaveDatabase> {
  const { conn, cleanup } = testConnectionFactory
    ? await testConnectionFactory(name)
    : await createProductionConnection(`opfs://${name}`);
  return { conn, close: cleanup };
}

export async function closeSaveDatabase(db: SaveDatabase): Promise<void> {
  await withConnectionQueue(db, async () => {
    // Without an explicit CHECKPOINT, writes can survive within the same
    // browser tab (closing/reopening a connection to the same OPFS file
    // still sees them) but are NOT guaranteed durable across a full page
    // reload — confirmed by a real failure: reloading and resuming a
    // kept save reported "Table with name save_meta does not exist!"
    // because the parsing Worker's connection had never been checkpointed
    // before this function closed it. Checkpointing on every close (not
    // just at specific write call sites) means no future write path can
    // reintroduce this by forgetting to do it explicitly.
    try {
      await db.conn.query("CHECKPOINT");
    } catch (err) {
      // Test-mode-only escape hatch: the Node-native bindings' global
      // `DUCKDB_RUNTIME` state (see its own type declarations) isn't
      // fully isolated between separate `createDuckDB()` instances in
      // one process — confirmed via a real failing test that opens two
      // named saves at once, where CHECKPOINT threw a WASM-level file-
      // descriptor error tied to *a different* instance's state. This
      // can't happen in production: each save's connection there lives
      // in its own real browser Worker, with a genuinely separate global
      // scope. Not swallowed outside test mode — a failed checkpoint on
      // real user data must be a loud, visible failure.
      if (!testConnectionFactory) throw err;
    }
    await db.close();
  });
}

/** Creates the save_meta/nations/provinces/locations/war_participants tables if they don't exist yet. */
export async function applySchema(db: SaveDatabase): Promise<void> {
  // DuckDB's `query()` runs one statement per call (unlike SQLite's
  // `exec`, which accepted a whole script) — schema.sql is fully
  // controlled by this project (no semicolons inside string literals),
  // but its `--` line comments do contain semicolons, so those must be
  // stripped before splitting on `;` rather than splitting the raw text.
  const withoutComments = schemaSql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
  const statements = withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  await withConnectionQueue(db, async () => {
    for (const statement of statements) {
      await db.conn.query(statement);
    }
  });
}

/**
 * Runs an arbitrary single-statement DDL/DML string with no bound
 * parameters and no returned rows (e.g. `markSaveKept`'s `UPDATE
 * save_meta SET kept = 1`). Callers that need bound parameters or result
 * rows should use `insertRows`/`queryRows` instead.
 */
export async function execSql(db: SaveDatabase, sql: string): Promise<void> {
  await withConnectionQueue(db, async () => {
    await db.conn.query(sql);
  });
}

/**
 * Runs one INSERT (or other single-statement DML) once per row in `rows`.
 *
 * For a plain `INSERT INTO table (col1, col2, ...) VALUES (?1, ?2, ...)`
 * where every row supplies every listed column, this bulk-loads via an
 * Arrow table (`conn.insertArrowTable`) instead of a row-by-row prepared-
 * statement loop. This isn't a micro-optimization: the row-by-row loop
 * was the actual root cause of a real production crash — parsing a real
 * ~650MB save (hundreds of thousands of `locations` rows) threw a WASM
 * `RuntimeError: memory access out of bounds` deep inside DuckDB's
 * `runPrepared`, confirmed live. The Arrow path inserted 300,000
 * synthetic rows in ~500ms in the same real-browser test where the
 * row-by-row loop was still crawling at >1ms/row (and had already been
 * shown to crash at real-save scale) — a difference in kind, not degree.
 *
 * Two real constraints found getting this working, both confirmed live
 * (neither is documented clearly by DuckDB-Wasm):
 * - `insertArrowTable`'s `create` option must be explicitly `false` to
 *   insert into an already-existing table — omitting it does not default
 *   to "insert," it defaults to attempting `CREATE TABLE` and throws
 *   `ENTRY_ALREADY_EXISTS`.
 * - It requires every column of the target table, positionally — no
 *   partial-column inserts (confirmed via a real "table X has N columns
 *   but M values were supplied" error). A table needing a synthetic key
 *   (`raw_sections.id`) must have it generated by the caller, not left to
 *   `schema.sql`'s `DEFAULT nextval(...)` — see that call site in
 *   `version-adapters/1.3.11.ts`.
 *
 * Any `sql` that isn't a simple, column-count-matching INSERT (the
 * single-row `is_player` UPDATE, and `save_meta`'s insert, which mixes
 * bound parameters with literal values) falls back to the original
 * row-by-row prepared-statement loop — correctness-only, never
 * performance-critical, since both are always exactly one row.
 */
export async function insertRows(
  db: SaveDatabase,
  sql: string,
  rows: ReadonlyArray<ReadonlyArray<string | number | null>>,
): Promise<void> {
  if (rows.length === 0) return;

  const insertMatch = /^\s*INSERT INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES/i.exec(sql);
  const columns = insertMatch?.[2].split(",").map((c) => c.trim());

  if (insertMatch && columns && columns.length === rows[0].length) {
    const tableName = insertMatch[1];
    await withConnectionQueue(db, async () => {
      const columnArrays: Record<string, Array<string | number | null>> = {};
      columns.forEach((column, i) => {
        columnArrays[column] = rows.map((row) => row[i]);
      });
      const arrowTable = tableFromArrays(columnArrays);
      await db.conn.insertArrowTable(arrowTable, { name: tableName, create: false });
    });
    return;
  }

  await withConnectionQueue(db, async () => {
    const stmt = await db.conn.prepare(sql);
    for (const row of rows) {
      await stmt.query(...row);
    }
    await stmt.close();
  });
}

function toPlainRow(row: ArrowRowLike): Row {
  const raw = row.toJSON();
  const record: Row = {};
  for (const [key, value] of Object.entries(raw)) {
    // DuckDB returns BIGINT-typed values (e.g. COUNT(*)/SUM(...) results)
    // as JS BigInt via Arrow — coerce to number for this app's scale
    // (a save's row counts never approach Number.MAX_SAFE_INTEGER).
    record[key] = typeof value === "bigint" ? Number(value) : (value as Row[string]);
  }
  return record;
}

/**
 * Runs a single SELECT (or other statement returning rows), optionally
 * with bound parameters, returning each row as a plain object keyed by
 * column name.
 */
export async function queryRows(
  db: SaveDatabase,
  sql: string,
  params?: ReadonlyArray<string | number | null>,
): Promise<Row[]> {
  return withConnectionQueue(db, async () => {
    if (params && params.length > 0) {
      const stmt = await db.conn.prepare(sql);
      const result = await stmt.query(...params);
      await stmt.close();
      return result.toArray().map(toPlainRow);
    }
    const result = await db.conn.query(sql);
    return result.toArray().map(toPlainRow);
  });
}

/**
 * Runs a single SELECT, returning the raw result serialized as an Arrow
 * IPC stream (an `ArrayBuffer`) rather than plain rows — the input format
 * Perspective's `worker.table()` accepts directly (see
 * `perspective/setup.ts`), avoiding an Arrow → plain-object → Arrow
 * round-trip for tabs that feed a `<perspective-viewer>`. Unlike
 * `queryRows`, this does no BigInt coercion — Perspective is Arrow-native
 * and handles DuckDB's BIGINT columns natively.
 */
export async function queryArrowIPC(
  db: SaveDatabase,
  sql: string,
  params?: ReadonlyArray<string | number | null>,
): Promise<ArrayBuffer> {
  return withConnectionQueue(db, async () => {
    let result: ArrowTableLike;
    if (params && params.length > 0) {
      const stmt = await db.conn.prepare(sql);
      result = await stmt.query(...params);
      await stmt.close();
    } else {
      result = await db.conn.query(sql);
    }
    const bytes = tableToIPC(result as unknown as import("apache-arrow").Table, "stream");
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  });
}

/**
 * Permanently deletes a save's OPFS-backed database. Used when forgetting
 * a kept save (FR-013), when a new load supersedes a previous
 * session-only save (FR-005/FR-010), and on session teardown (FR-012).
 * No-ops in tests (no OPFS to delete from — see `configureDuckDBForTesting`).
 */
export async function deleteSaveDatabase(name: string): Promise<void> {
  if (testConnectionFactory) return;
  const root = await navigator.storage.getDirectory();
  try {
    await root.removeEntry(name);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "NotFoundError")) {
      throw err;
    }
  }
}
