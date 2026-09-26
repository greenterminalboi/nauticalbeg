// @vitest-environment node
// 017: /api/shares status-code table (contracts/shares-api.md), against
// in-memory stand-ins for R2 and KV.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "../../functions/api/shares/index";
import { onRequestDelete, onRequestGet } from "../../functions/api/shares/[id]";
import type { KVLike, R2BucketLike, ShareEnv } from "../../functions/api/shares/_lib/env";
import {
  isValidShareId,
  newShareId,
  sha256Hex,
  shareIdCreatedAtMs,
  timingSafeEqualHex,
} from "../../functions/api/shares/_lib/ids";
import { DAILY_BYTE_BUDGET, MAX_UPLOAD_BYTES } from "../../functions/api/shares/_lib/limits";

class FakeR2 implements R2BucketLike {
  objects = new Map<string, { bytes: Uint8Array<ArrayBuffer>; customMetadata: Record<string, string> }>();
  failPut = false;
  async get(key: string) {
    const o = this.objects.get(key);
    return o ? { body: new Response(o.bytes).body!, customMetadata: o.customMetadata } : null;
  }
  async head(key: string) {
    const o = this.objects.get(key);
    return o ? { customMetadata: o.customMetadata } : null;
  }
  async put(key: string, value: unknown, options?: { customMetadata?: Record<string, string> }) {
    if (this.failPut) throw new Error("R2 down");
    const bytes = new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
    this.objects.set(key, { bytes, customMetadata: options?.customMetadata ?? {} });
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

class FakeKV implements KVLike {
  data = new Map<string, string>();
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.data.set(key, value);
  }
}

let r2: FakeR2;
let kv: FakeKV;
let env: ShareEnv;

beforeEach(() => {
  vi.useRealTimers();
  r2 = new FakeR2();
  kv = new FakeKV();
  env = { SHARES: r2, SHARE_LIMITS: kv, RATE_LIMIT_SALT: "salt", SHARE_TTL_SECONDS: "604800" };
});

function post(body = new Uint8Array([1, 2, 3]), headers: Record<string, string> = {}) {
  const request = new Request("https://nauticalbeg.pages.dev/api/shares", {
    method: "POST",
    body,
    headers: {
      "Content-Length": String(body.length),
      "X-Snapshot-Format": "1",
      "X-Uncompressed-Length": "100",
      "CF-Connecting-IP": "203.0.113.7",
      ...headers,
    },
  });
  return onRequestPost({ request, env, params: {} });
}

function get(id: string) {
  return onRequestGet({ request: new Request(`https://x/api/shares/${id}`), env, params: { id } });
}

function del(id: string, key?: string) {
  const request = new Request(`https://x/api/shares/${id}`, {
    method: "DELETE",
    headers: key ? { Authorization: `Bearer ${key}` } : {},
  });
  return onRequestDelete({ request, env, params: { id } });
}

describe("share IDs", () => {
  it("are 30 url-safe characters with the creation time embedded", () => {
    const now = Date.UTC(2026, 8, 25, 12, 0, 0);
    const id = newShareId(now);
    expect(isValidShareId(id)).toBe(true);
    expect(shareIdCreatedAtMs(id)).toBe(now);
    expect(newShareId(now)).not.toBe(id);
  });

  it("compare delete-key hashes in constant time", async () => {
    const h = await sha256Hex("k");
    expect(timingSafeEqualHex(h, await sha256Hex("k"))).toBe(true);
    expect(timingSafeEqualHex(h, await sha256Hex("j"))).toBe(false);
    expect(timingSafeEqualHex(h, "short")).toBe(false);
  });
});

describe("POST /api/shares", () => {
  it("stores the body and returns the link, expiry and a delete key whose hash (only) is stored", async () => {
    const res = await post();
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; url: string; expiresAt: string; deleteKey: string };
    expect(body.url).toBe(`https://nauticalbeg.pages.dev/s/${body.id}`);
    expect(new Date(body.expiresAt).getTime() - Date.now()).toBeGreaterThan(604_790_000);
    const stored = r2.objects.get(`shares/${body.id}`)!;
    expect([...stored.bytes]).toEqual([1, 2, 3]);
    expect(stored.customMetadata.deleteKeyHash).toBe(await sha256Hex(body.deleteKey));
    expect(JSON.stringify(stored.customMetadata)).not.toContain(body.deleteKey);
    expect(stored.customMetadata.uncompressedLength).toBe("100");
  });

  it("refuses bodies over 40 MiB with 413 and the limit", async () => {
    const res = await post(new Uint8Array(1), { "Content-Length": String(MAX_UPLOAD_BYTES + 1) });
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "too_large", limitBytes: MAX_UPLOAD_BYTES });
    expect(r2.objects.size).toBe(0);
  });

  it("refuses an unknown snapshot format with 400", async () => {
    expect((await post(undefined, { "X-Snapshot-Format": "2" })).status).toBe(400);
  });

  it("allows 5 shares per visitor per hour, then 429 with Retry-After", async () => {
    for (let i = 0; i < 5; i++) expect((await post()).status).toBe(201);
    const res = await post();
    expect(res.status).toBe(429);
    const body = (await res.json()) as { retryAfterSeconds: number };
    expect(body.retryAfterSeconds).toBeGreaterThan(0);
    expect(body.retryAfterSeconds).toBeLessThanOrEqual(3600);
    expect(res.headers.get("Retry-After")).toBe(String(body.retryAfterSeconds));
    // A different visitor is unaffected.
    expect((await post(undefined, { "CF-Connecting-IP": "198.51.100.1" })).status).toBe(201);
  });

  it("never stores a raw IP", async () => {
    await post();
    expect([...kv.data.keys()].join(" ")).not.toContain("203.0.113.7");
  });

  it("refuses with 503 busy once today's byte budget would be exceeded", async () => {
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    kv.data.set(`bytes:${day}`, String(DAILY_BYTE_BUDGET - 2));
    const res = await post();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "busy" });
  });

  it("returns 500 unavailable and counts nothing when storage fails", async () => {
    r2.failPut = true;
    expect((await post()).status).toBe(500);
    expect(kv.data.size).toBe(0);
  });
});

describe("GET /api/shares/:id", () => {
  it("streams the stored bytes with Content-Encoding: br and no caching", async () => {
    const { id } = (await (await post()).json()) as { id: string };
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Encoding")).toBe("br");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(res.headers.get("X-Uncompressed-Length")).toBe("100");
    expect(res.headers.get("X-Expires-At")).toBeTruthy();
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([1, 2, 3]);
  });

  it("returns 410 expired at exactly the TTL, and deletes the data", async () => {
    const { id } = (await (await post()).json()) as { id: string };
    env.SHARE_TTL_SECONDS = "0.001";
    await new Promise((r) => setTimeout(r, 5));
    const res = await get(id);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "expired" });
    expect(r2.objects.has(`shares/${id}`)).toBe(false);
  });

  it("reports a link whose data is already gone as expired when its ID is old enough", async () => {
    const old = newShareId(Date.now() - 8 * 86_400_000);
    expect((await get(old)).status).toBe(410);
  });

  it("returns 404 not_found for unknown or malformed IDs", async () => {
    expect((await get(newShareId(Date.now()))).status).toBe(404);
    expect((await get("not-a-valid-id")).status).toBe(404);
  });
});

describe("DELETE /api/shares/:id", () => {
  it("deletes with the right key, leaving a tombstone so the link reads 'deleted'", async () => {
    const { id, deleteKey } = (await (await post()).json()) as { id: string; deleteKey: string };
    expect((await del(id, deleteKey)).status).toBe(204);
    expect(r2.objects.has(`shares/${id}`)).toBe(false);
    const res = await get(id);
    expect(res.status).toBe(410);
    expect(await res.json()).toMatchObject({ error: "deleted" });
  });

  it("refuses a wrong or missing key with 403 and keeps the share", async () => {
    const { id } = (await (await post()).json()) as { id: string };
    expect((await del(id, "wrong")).status).toBe(403);
    expect((await del(id)).status).toBe(403);
    expect((await get(id)).status).toBe(200);
  });

  it("returns 404 for a share that doesn't exist", async () => {
    expect((await del(newShareId(Date.now()), "k")).status).toBe(404);
  });
});
