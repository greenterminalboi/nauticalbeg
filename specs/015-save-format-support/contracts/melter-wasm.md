# Contract: EU5 Melter (Rust WASM ↔ `src/parser/melter/melt.ts`)

Built from `tools/eu5-melter/` with `npm run build:melter`
(wasm-bindgen `--target web`) into `src/parser/melter/generated/`. The
output is committed. Only `melt.ts` imports the generated glue; nothing
else in the app does.

## Exports

```ts
/** Loads the flat token table (research R3) plus version overrides.
 *  Throws if `table` is malformed (header shorter than 4 bytes, or an
 *  entry running past the end). */
export function create_resolver(table: Uint8Array, overrides: Uint32Array /* [id, idx-into-names]… */, overrideNames: string[]): Resolver;

/** Melts only the metadata section — cheap; used to read metadata.version
 *  before choosing overrides (research R6). Returns plaintext metadata. */
export function melt_metadata(save: Uint8Array, resolver: Resolver): Uint8Array;

/** Full melt. Output is streamed: `write(chunk)` is called repeatedly with
 *  views that are only valid during the call (JS must copy them out).
 *  `write` returning `false` aborts the melt (cancellation). */
export function melt(save: Uint8Array, resolver: Resolver, write: (chunk: Uint8Array) => boolean): MeltStats;

export class MeltStats { readonly unknown_tokens: number; readonly unknown_lookups: number; }
```

## Behavior

- Accepts header kinds 1–5. Kind 0 (plain text) is never passed in, because
  `load-save.ts` routes it around the melter. Passing it anyway just copies
  the text through.
- Unknown tokens use `FailedResolveStrategy::Stringify` and are counted in
  `MeltStats`, never raised as errors.
- Zip-declared `gamestate` above 2GB, or melted output above 3GB → error `"damaged: decompressed size cap exceeded"`.
- The header declares a zip (kinds 2–5) but none is found → `"damaged: …"`.
- Zipped text (kinds 2/4) is unzipped directly; it doesn't require a `string_lookup` entry.
- Also exported: `estimate_output_size(save) -> number`, used to pre-size the JS output buffer.
- Every error string starts with a machine-readable prefix, which `melt.ts`
  maps to an `ErrorKind`:
  - `damaged:` for envelope/zip/header errors, early EOF, the size cap, or a
    `RuntimeError` trap. Maps to `damaged-save`.
  - `unrecognized:` for header kind > 5. Maps to `unrecognized-format`.
  - `cancelled:` when `write` returned false. `load-save.ts` treats it as an
    abort.
- Lookup-table strings in value position that contain whitespace or
  `={}"#` are written quoted (vendored patch, research R5).
- On the real 1.3.11 MP save, the output has no key-name differences from
  `rakaly melt` 0.8.19; only quoting style differs
  (`tools/eu5-melter/cross-check.mjs`).

## Lifetime

`melt.ts` initializes the module once per worker (`initSync`) and calls the
generated `__wbg_reset_state()` after **every** melt. That call re-instantiates
the module with fresh linear memory, so the previous memory (input +
decompression state) can be garbage-collected before DuckDB ingestion
(research R8). The
token table and the `.wasm` bytes are fetched once per worker and cached.
