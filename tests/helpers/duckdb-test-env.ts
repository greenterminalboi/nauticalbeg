// Shared setup for any test that needs a real, working DuckDB database.
// Node has no OPFS, so tests use DuckDB-Wasm's real Node-native bindings
// (`@duckdb/duckdb-wasm/blocking`) instead of the browser Worker-based
// AsyncDuckDB — this is real DuckDB, not a shim (unlike wa-sqlite's old
// MemoryAsyncVFS test double). See src/storage/db.ts's
// `configureDuckDBForTesting`.
//
// Known Node-only limitation (found via real, repeated testing — not
// theoretical): the Node-native bindings' file-backed persistence did
// not survive a genuine close + fresh-instance reopen in this version
// (CHECKPOINT and flushFiles() didn't help; reusing one bindings
// instance across open/close instead hit a "file already locked
// exclusively" error). This only affects Node tests — production OPFS
// persistence is separately confirmed working via a real Chrome session
// (see ARCHITECTURE.md's storage-engine decision log). Tests that need
// to simulate "reopen an already-parsed save by id" (e.g. `resumeSave`)
// work around this by having `openSaveDatabase(name)` return the SAME
// live connection for a given `name` within one test file rather than
// truly closing and reconstructing it — this still exercises the real
// query logic those tests care about, just not literal disk durability
// (which is what the browser OPFS guarantee is for, verified separately).
import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import * as duckdbBlocking from "@duckdb/duckdb-wasm/blocking";
import {
  configureArrowForTesting,
  configureDuckDBForTesting,
  type DuckDBConnectionLike,
} from "../../src/storage/db";

// See db.ts's `configureArrowForTesting` doc comment: this must be the
// exact same `apache-arrow` module instance `@duckdb/duckdb-wasm`'s
// internal Node bindings natively `require()` — not the one Vitest's
// transform pipeline resolves for a static `import` — or
// `insertArrowTable` silently inserts nothing.
const nodeRequire = createRequire(import.meta.url);
const nativeArrow = nodeRequire("apache-arrow") as Parameters<typeof configureArrowForTesting>[0];

let configured = false;
const tempDir = mkdtempSync(path.join(tmpdir(), "nauticalbeg-duckdb-test-"));
const liveConnectionsByName = new Map<string, DuckDBConnectionLike>();

/** Idempotent — safe to call from every test file that needs it. */
export function ensureTestDuckDBConfigured(): void {
  if (configured) return;
  configured = true;
  configureArrowForTesting(nativeArrow);

  // `mainWorker` is unused by the blocking/synchronous bindings (no
  // actual Worker involved), but the type still requires a string.
  const NODE_BUNDLES = {
    mvp: {
      mainModule: path.resolve(
        process.cwd(),
        "node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm",
      ),
      mainWorker: "",
    },
    eh: {
      mainModule: path.resolve(
        process.cwd(),
        "node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm",
      ),
      mainWorker: "",
    },
  };

  configureDuckDBForTesting(async (name: string) => {
    const existing = liveConnectionsByName.get(name);
    if (existing) {
      // "Reopen" — see the module doc comment above for why this reuses
      // the live connection instead of a fresh file-backed one.
      return { conn: existing, cleanup: async () => {} };
    }

    const logger = new duckdbBlocking.VoidLogger();
    const bindings = await duckdbBlocking.createDuckDB(
      NODE_BUNDLES,
      logger,
      duckdbBlocking.NODE_RUNTIME,
    );
    await bindings.instantiate();
    const filePath = path.join(tempDir, name.replace(/[^a-z0-9.-]/gi, "_"));
    bindings.open({ path: filePath, accessMode: duckdbBlocking.DuckDBAccessMode.READ_WRITE });
    const conn = bindings.connect();
    liveConnectionsByName.set(name, conn);
    return { conn, cleanup: async () => {} };
  });
}
