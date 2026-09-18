// Shared setup for any test that needs a real, working SQLite database.
// Node has no OPFS and no fetch() that can load a local .wasm file, so
// tests use wa-sqlite's in-memory async VFS instead, with the wasm binary
// pre-read from disk. See src/storage/db.ts's configureSQLiteForTesting.
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryAsyncVFS } from "wa-sqlite/src/examples/MemoryAsyncVFS.js";
import { configureSQLiteForTesting } from "../../src/storage/db";

export const TEST_VFS_NAME = "memory-async";

let configured = false;

/** Idempotent — safe to call from every test file that needs it. */
export function ensureTestSQLiteConfigured(): void {
  if (configured) return;
  configured = true;

  const wasmPath = path.resolve(
    process.cwd(),
    "node_modules/wa-sqlite/dist/wa-sqlite-async.wasm",
  );
  const wasmBinary = readFileSync(wasmPath);

  configureSQLiteForTesting({
    moduleConfig: { wasmBinary },
    registerVfs: (sqlite3) => {
      const vfs = new MemoryAsyncVFS();
      sqlite3.vfs_register(vfs as unknown as SQLiteVFS, false);
    },
  });
}
