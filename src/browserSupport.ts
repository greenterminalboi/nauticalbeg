// Checks for the browser features NauticalBeg can't run without (016
// FR-008), so a visitor on an unsupported browser or in a private window
// sees a plain explanation instead of a blank page or a stuck loader.
// Doesn't load DuckDB, so it's instant.

/** Names of required features the current browser is missing. */
export async function checkBrowserSupport(): Promise<string[]> {
  const missing: string[] = [];
  if (typeof WebAssembly !== "object") missing.push("WebAssembly");
  if (typeof Worker !== "function") missing.push("Web Workers");

  // Saves are stored in the Origin Private File System. Firefox private
  // windows expose getDirectory() but reject the call, so it has to
  // actually be called, not just feature-detected.
  const STORAGE = "private file storage (blocked in private/incognito windows)";
  if (typeof navigator.storage?.getDirectory !== "function") {
    missing.push(STORAGE);
  } else {
    try {
      await navigator.storage.getDirectory();
    } catch {
      missing.push(STORAGE);
    }
  }
  return missing;
}
