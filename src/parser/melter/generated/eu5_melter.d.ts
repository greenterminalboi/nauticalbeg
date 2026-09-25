/* tslint:disable */
/* eslint-disable */

export class MeltStats {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly unknown_lookups: number;
    readonly unknown_tokens: number;
}

export class Resolver {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
}

export function __wbg_reset_state(): void;

/**
 * `override_ids[i]` is renamed to `override_names[i]`.
 */
export function create_resolver(table: Uint8Array, override_ids: Uint32Array, override_names: string[]): Resolver;

/**
 * Estimated melted size in bytes, for pre-sizing the JS output buffer.
 */
export function estimate_output_size(save: Uint8Array): number;

/**
 * Full melt; `write(chunk)` receives views only valid during the call and
 * returns `false` to cancel.
 */
export function melt(save: Uint8Array, resolver: Resolver, write: Function): MeltStats;

export function melt_metadata(save: Uint8Array, resolver: Resolver): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_meltstats_free: (a: number, b: number) => void;
    readonly __wbg_resolver_free: (a: number, b: number) => void;
    readonly create_resolver: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly estimate_output_size: (a: number, b: number) => number;
    readonly melt: (a: number, b: number, c: number, d: any) => [number, number, number];
    readonly melt_metadata: (a: number, b: number, c: number) => [number, number, number, number];
    readonly meltstats_unknown_lookups: (a: number) => number;
    readonly meltstats_unknown_tokens: (a: number) => number;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
