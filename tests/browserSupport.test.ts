import { afterEach, describe, expect, it, vi } from "vitest";
import { checkBrowserSupport } from "../src/browserSupport";

function stubStorage(getDirectory: (() => Promise<unknown>) | undefined) {
  vi.stubGlobal("navigator", { storage: getDirectory ? { getDirectory } : undefined });
  // jsdom has no Worker; stand one in so each test controls just storage.
  vi.stubGlobal("Worker", function Worker() {});
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("checkBrowserSupport (016 FR-008)", () => {
  it("reports nothing missing when every feature works", async () => {
    stubStorage(() => Promise.resolve({}));
    expect(await checkBrowserSupport()).toEqual([]);
  });

  it("reports storage as missing when getDirectory rejects (Firefox private window)", async () => {
    stubStorage(() => Promise.reject(new DOMException("Security error", "SecurityError")));
    expect(await checkBrowserSupport()).toEqual([
      "private file storage (blocked in private/incognito windows)",
    ]);
  });

  it("reports storage as missing when the API doesn't exist", async () => {
    stubStorage(undefined);
    expect(await checkBrowserSupport()).toEqual([
      "private file storage (blocked in private/incognito windows)",
    ]);
  });

  it("reports missing WebAssembly and Web Workers", async () => {
    stubStorage(() => Promise.resolve({}));
    vi.stubGlobal("WebAssembly", undefined);
    vi.stubGlobal("Worker", undefined);
    expect(await checkBrowserSupport()).toEqual(["WebAssembly", "Web Workers"]);
  });
});
