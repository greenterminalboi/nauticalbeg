// Turns any non-plain-text EU5 save (binary and/or zip-compressed — i.e.
// what the game actually writes, ironman included) into the plaintext the
// existing parser reads, entirely in the parser Worker. The heavy lifting
// is a small Rust->WASM module built from rakaly/jomini's MIT `eu5save`
// crate (tools/eu5-melter/, output committed under ./generated/); the
// token table is pdx.tools' (public/tokens/, used with permission — see
// that folder's README). See specs/015-save-format-support/research.md
// and contracts/melter-wasm.md.
import wasmUrl from "./generated/eu5_melter_bg.wasm?url";
import {
  __wbg_reset_state,
  create_resolver,
  estimate_output_size,
  initSync,
  melt,
  melt_metadata,
} from "./generated/eu5_melter.js";
import { detectVersion } from "../version-detect";
import { TOKEN_OVERRIDES } from "./token-overrides";

const TOKENS_URL = `${import.meta.env.BASE_URL}tokens/eu5.flat`;

export interface MelterAssets {
  wasm: Uint8Array<ArrayBuffer>;
  tokens: Uint8Array;
}

export interface MeltResult {
  /** Melted plaintext (`SAV…00` header + body), fed to detectVersion/adapter. */
  text: Uint8Array;
  unknownTokenCount: number;
  unknownLookupCount: number;
}

/** The token table or melter WASM couldn't be loaded → `binary-unavailable`. */
export class MelterUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`EU5 melter unavailable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "MelterUnavailableError";
  }
}

/** The melter rejected the file → `damaged-save` / `unrecognized-format`. */
export class MeltFailedError extends Error {
  constructor(
    readonly kind: "damaged-save" | "unrecognized-format",
    message: string,
  ) {
    super(message);
    this.name = "MeltFailedError";
  }
}

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

let loadAssets: () => Promise<MelterAssets> = async () => {
  const [wasm, tokens] = await Promise.all([fetchBytes(wasmUrl), fetchBytes(TOKENS_URL)]);
  return { wasm, tokens };
};

/** Tests (Node has no dev server to fetch from) supply the bytes directly. */
export function configureMelterAssetsForTesting(loader: () => Promise<MelterAssets>): void {
  loadAssets = loader;
  assetsPromise = null;
  initialized = false;
}

// Fetched once per worker and cached; a failed fetch isn't cached, so a
// later load can retry.
let assetsPromise: Promise<MelterAssets> | null = null;
let initialized = false;

async function ensureMelter(): Promise<MelterAssets> {
  assetsPromise ??= loadAssets().catch((err) => {
    assetsPromise = null;
    throw err;
  });
  let assets: MelterAssets;
  try {
    assets = await assetsPromise;
    if (!initialized) {
      initSync({ module: assets.wasm });
      initialized = true;
    }
  } catch (err) {
    throw new MelterUnavailableError(err);
  }
  return assets;
}

function resolverFor(tokens: Uint8Array, version: string | null) {
  const overrides = (version && TOKEN_OVERRIDES[version]) || {};
  const ids = Object.keys(overrides).map(Number);
  return create_resolver(
    tokens,
    Uint32Array.from(ids),
    ids.map((id) => overrides[id]),
  );
}

function toMeltError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("cancelled:")) {
    return new DOMException("Melt aborted", "AbortError");
  }
  if (message.startsWith("unrecognized:")) {
    return new MeltFailedError("unrecognized-format", message);
  }
  // `damaged:` prefixes, plus any WASM trap (RuntimeError: unreachable /
  // out of bounds) from a malformed file — never let those escape as an
  // uncaught crash (security constitution).
  return new MeltFailedError("damaged-save", message);
}

/**
 * Melts `save` to plaintext. `onProgress(percent)` is called as output is
 * produced (percent = bytes written / estimated size, capped at 99);
 * aborting `signal` cancels mid-melt with an `AbortError`.
 */
export async function meltSave(
  save: Uint8Array,
  options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {},
): Promise<MeltResult> {
  const { tokens } = await ensureMelter();
  try {
    // 1. Cheap metadata-only melt to learn the game version, so the right
    //    token overrides are applied to the full melt (research R6).
    const baseResolver = resolverFor(tokens, null);
    let version: string | null;
    try {
      version = await detectVersion(melt_metadata(save, baseResolver));
    } catch (err) {
      if (err instanceof Error && /^(damaged|unrecognized):/.test(err.message)) throw err;
      version = null; // version detection proper happens after the full melt
    } finally {
      baseResolver.free();
    }

    // 2. Full melt, streamed into a JS-owned buffer so the ~650MB result
    //    never has to exist inside WASM memory (research R8).
    const estimate = Math.max(1, estimate_output_size(save));
    let out = new Uint8Array(Math.min(estimate, 1024 * 1024 * 1024));
    let written = 0;
    let lastReported = -1;
    const write = (chunk: Uint8Array): boolean => {
      if (options.signal?.aborted) return false;
      if (written + chunk.length > out.length) {
        const grown = new Uint8Array(Math.max(out.length * 2, written + chunk.length));
        grown.set(out.subarray(0, written));
        out = grown;
      }
      out.set(chunk, written);
      written += chunk.length;
      const percent = Math.min(99, Math.floor((written / estimate) * 100));
      if (percent !== lastReported) {
        lastReported = percent;
        options.onProgress?.(percent);
      }
      return true;
    };

    const resolver = resolverFor(tokens, version);
    try {
      const stats = melt(save, resolver, write);
      const result: MeltResult = {
        text: out.subarray(0, written),
        unknownTokenCount: stats.unknown_tokens,
        unknownLookupCount: stats.unknown_lookups,
      };
      stats.free();
      return result;
    } finally {
      resolver.free();
    }
  } catch (err) {
    throw toMeltError(err);
  } finally {
    // WASM linear memory never shrinks: swap in a fresh instance so the
    // input copy + decompression buffers from this melt can be GC'd before
    // DuckDB ingestion (research R8).
    __wbg_reset_state();
  }
}
