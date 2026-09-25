// Picks where DuckDB-Wasm's engine files are loaded from (016,
// contracts/engine-loading.md). Cloudflare Pages rejects any file over
// 25 MiB, and both engine .wasm files are larger (34MB / 39MB), so
// production builds fetch just those two from jsDelivr, pinned to the
// exact installed package version. The worker scripts stay self-hosted
// (a cross-origin URL can't be passed to `new Worker()` directly).
import type { DuckDBBundles } from "@duckdb/duckdb-wasm";

export interface LocalEngineUrls {
  mvpWasm: string;
  ehWasm: string;
  mvpWorker: string;
  ehWorker: string;
}

export function jsDelivrWasmUrl(version: string, bundle: "mvp" | "eh"): string {
  return `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist/duckdb-${bundle}.wasm`;
}

export function duckdbBundleUrls(opts: {
  production: boolean;
  version: string;
  local: LocalEngineUrls;
}): DuckDBBundles & { eh: NonNullable<DuckDBBundles["eh"]> } {
  const { production, version, local } = opts;
  return {
    mvp: {
      mainModule: production ? jsDelivrWasmUrl(version, "mvp") : local.mvpWasm,
      mainWorker: local.mvpWorker,
    },
    eh: {
      mainModule: production ? jsDelivrWasmUrl(version, "eh") : local.ehWasm,
      mainWorker: local.ehWorker,
    },
  };
}
