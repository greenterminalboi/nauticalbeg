// Abuse and cost limits for new shares (017, research R6, data-model.md "KV records").
//
// - Per visitor: at most 5 shares an hour. Visitors are identified only by a
//   salted, truncated hash of their IP; the raw IP is never stored (FR-018).
// - Globally: at most 1.3GB of new shares a day, which with 7-day retention
//   keeps storage under R2's free 10GB (FR-020).
//
// KV is eventually consistent, so both counts are approximate. That's fine
// for abuse limits.
import type { KVLike } from "./env";
import { sha256Hex } from "./ids";

export const SHARES_PER_VISITOR_PER_HOUR = 5;
export const DAILY_BYTE_BUDGET = 1_300_000_000;
export const MAX_UPLOAD_BYTES = 41_943_040; // 40 MiB

function hourKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 13).replace(/[-T]/g, ""); // yyyymmddhh
}

function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, ""); // yyyymmdd
}

export async function visitorHash(ip: string, salt: string): Promise<string> {
  return (await sha256Hex(`${ip}|${salt}`)).slice(0, 16);
}

export async function checkRate(
  kv: KVLike,
  hash: string,
  nowMs: number,
): Promise<{ ok: true; key: string; count: number } | { ok: false; retryAfterSeconds: number }> {
  const key = `rl:${hash}:${hourKey(nowMs)}`;
  const count = Number((await kv.get(key)) ?? "0");
  if (count >= SHARES_PER_VISITOR_PER_HOUR) {
    const nextHour = Math.ceil((nowMs + 1) / 3_600_000) * 3_600_000;
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((nextHour - nowMs) / 1000)) };
  }
  return { ok: true, key, count };
}

export async function checkBudget(
  kv: KVLike,
  bytes: number,
  nowMs: number,
): Promise<{ ok: boolean; key: string; used: number }> {
  const key = `bytes:${dayKey(nowMs)}`;
  const used = Number((await kv.get(key)) ?? "0");
  return { ok: used + bytes <= DAILY_BYTE_BUDGET, key, used };
}

/** Counts a successful share. Failures are ignored: a missed count only loosens a limit. */
export async function recordShare(
  kv: KVLike,
  rate: { key: string; count: number },
  budget: { key: string; used: number },
  bytes: number,
): Promise<void> {
  await Promise.allSettled([
    kv.put(rate.key, String(rate.count + 1), { expirationTtl: 3600 }),
    kv.put(budget.key, String(budget.used + bytes), { expirationTtl: 172_800 }),
  ]);
}
