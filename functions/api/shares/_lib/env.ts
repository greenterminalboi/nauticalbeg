// The minimal slices of Cloudflare's R2 and KV bindings these Functions use,
// typed locally so the same code type-checks in the app's vitest setup
// (tests/share/functions.test.ts runs it against in-memory fakes).

export interface R2ObjectLike {
  body: ReadableStream<Uint8Array>;
  customMetadata?: Record<string, string>;
}

export interface R2BucketLike {
  get(key: string): Promise<R2ObjectLike | null>;
  head(key: string): Promise<{ customMetadata?: Record<string, string> } | null>;
  put(
    key: string,
    value: ReadableStream<Uint8Array> | ArrayBuffer | Uint8Array | string | null,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
}

export interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface ShareEnv {
  SHARES: R2BucketLike;
  SHARE_LIMITS: KVLike;
  /** Secret salt for hashing visitor IPs (dashboard secret, never committed). */
  RATE_LIMIT_SALT?: string;
  /** "604800" (7 days) in production; may be lowered in preview only. */
  SHARE_TTL_SECONDS?: string;
}

export interface FunctionContext {
  request: Request;
  env: ShareEnv;
  params: Record<string, string | string[]>;
}

export function shareTtlMs(env: ShareEnv): number {
  const seconds = Number(env.SHARE_TTL_SECONDS ?? "604800");
  return (Number.isFinite(seconds) && seconds > 0 ? seconds : 604800) * 1000;
}
