// Shared, lazy one-time bootstrap for every table tab that renders via
// Perspective (decision 2026-09-18: Perspective is the standard data-table
// tooling for this app "from the very get go," not a per-tab choice).
// Mirrors db.ts's lazy-fetch-on-first-use pattern for DuckDB-Wasm's own
// WASM binary rather than loading Perspective's engine up front — its
// ~4.6MB of WASM (server + viewer + client, uncompressed) is far smaller
// than DuckDB's, but there's still no reason to pay for it before a
// table tab is actually opened.
import perspective from "@perspective-dev/client";
import perspective_viewer from "@perspective-dev/viewer";
import "@perspective-dev/viewer-datagrid";
import "@perspective-dev/viewer-charts";
import "@perspective-dev/viewer/dist/css/themes.css";
import "./theme.css";

import SERVER_WASM from "@perspective-dev/server/dist/wasm/perspective-server.wasm?url";
import CLIENT_WASM from "@perspective-dev/viewer/dist/wasm/perspective-viewer.wasm?url";

import type { Client } from "@perspective-dev/client";

let workerPromise: Promise<Client> | null = null;

/**
 * Resolves to a single shared Perspective `Client` (a Web Worker running
 * the WASM engine) for the whole app. Safe to call from every table tab —
 * the underlying `init_server`/`init_client`/`worker()` calls only happen
 * once, on the first caller.
 */
export function getPerspectiveWorker(): Promise<Client> {
  if (!workerPromise) {
    workerPromise = Promise.all([
      perspective.init_server(fetch(SERVER_WASM)),
      perspective_viewer.init_client(fetch(CLIENT_WASM)),
    ]).then(() => perspective.worker());
  }
  return workerPromise;
}
