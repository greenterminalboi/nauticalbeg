import { describe, expect, it } from "vitest";
import { duckdbBundleUrls } from "../../src/storage/engineUrls";

const local = {
  mvpWasm: "/assets/duckdb-mvp.wasm",
  ehWasm: "/assets/duckdb-eh.wasm",
  mvpWorker: "/assets/duckdb-browser-mvp.worker.js",
  ehWorker: "/assets/duckdb-browser-eh.worker.js",
};

describe("duckdbBundleUrls (016 contracts/engine-loading.md)", () => {
  it("uses the local engine files outside production", () => {
    const bundles = duckdbBundleUrls({ production: false, version: "1.32.0", local });
    expect(bundles.mvp.mainModule).toBe(local.mvpWasm);
    expect(bundles.eh.mainModule).toBe(local.ehWasm);
  });

  it("uses jsDelivr .wasm URLs pinned to the exact installed version in production", () => {
    const bundles = duckdbBundleUrls({ production: true, version: "1.32.0", local });
    expect(bundles.mvp.mainModule).toBe(
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/dist/duckdb-mvp.wasm",
    );
    expect(bundles.eh.mainModule).toBe(
      "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.32.0/dist/duckdb-eh.wasm",
    );
  });

  it("always self-hosts the worker scripts", () => {
    for (const production of [true, false]) {
      const bundles = duckdbBundleUrls({ production, version: "1.32.0", local });
      expect(bundles.mvp.mainWorker).toBe(local.mvpWorker);
      expect(bundles.eh.mainWorker).toBe(local.ehWorker);
    }
  });
});
