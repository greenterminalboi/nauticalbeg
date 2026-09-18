// wa-sqlite ships type declarations for its main API, but not for the
// example VFS implementations under src/examples/ (they're JS, provided
// as "proof of concept" per the package README). This is a minimal
// ambient shim just for the one example we use. Cast to the global
// `SQLiteVFS` interface (declared by wa-sqlite's own types) at the call
// site in db.ts rather than duplicating that interface here.
declare module "wa-sqlite/src/examples/OriginPrivateFileSystemVFS.js" {
  export class OriginPrivateFileSystemVFS {
    constructor();
    close(): Promise<void>;
  }
}

// Same situation for the in-memory async VFS used in tests (Node has no
// OPFS at all) — see tests/helpers/sqlite-test-env.ts.
declare module "wa-sqlite/src/examples/MemoryAsyncVFS.js" {
  export class MemoryAsyncVFS {
    constructor();
    close(): Promise<void>;
  }
}
