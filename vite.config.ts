import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// The exact installed DuckDB-Wasm version. Production builds load the
// engine .wasm from jsDelivr at this version, so the CDN file always
// matches the JS glue bundled here (016 contracts/engine-loading.md).
const duckdbVersion: string = JSON.parse(
  readFileSync("node_modules/@duckdb/duckdb-wasm/package.json", "utf8"),
).version;

// Shown in the app footer for bug reports (016 FR-007): the commit being
// built — GITHUB_SHA in CI, the local HEAD otherwise.
function appVersion(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __DUCKDB_VERSION__: JSON.stringify(duckdbVersion),
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  // @perspective-dev/* ships ESM with top-level await (its WASM
  // bootstrapping) un-transpiled — Vite's default build/dev target
  // predates TLA support and fails to bundle it without this (a real,
  // documented issue: https://github.com/finos/perspective/issues/2795).
  build: {
    target: "esnext",
  },
  server: {
    // Originally required by wa-sqlite's OPFS VFS (SharedArrayBuffer needs
    // a cross-origin-isolated context). Left in place after the 2026-09-18
    // DuckDB migration as a known-working configuration — DuckDB-Wasm's
    // `eh` bundle doesn't appear to need these, but that hasn't been
    // specifically confirmed by removing them and retesting. See
    // ARCHITECTURE.md's "Cross-origin isolation headers" section.
    // Production sends the same two headers from public/_headers — keep
    // both in sync.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
