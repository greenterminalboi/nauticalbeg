import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
