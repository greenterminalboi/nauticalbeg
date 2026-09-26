// POST /api/shares: create a share (017, contracts/shares-api.md).
//
// The body (brotli(container)) is streamed straight into R2 and never read
// or parsed here, which keeps each request inside the free plan's 10ms CPU
// limit. An upload that's aborted part-way never commits an object.
import type { FunctionContext } from "./_lib/env";
import { shareTtlMs } from "./_lib/env";
import { newDeleteKey, newShareId, sha256Hex } from "./_lib/ids";
import { checkBudget, checkRate, MAX_UPLOAD_BYTES, recordShare, visitorHash } from "./_lib/limits";
import { errorResponse } from "./_lib/responses";

const SUPPORTED_FORMATS = new Set(["1"]);

export async function onRequestPost({ request, env }: FunctionContext): Promise<Response> {
  const length = Number(request.headers.get("Content-Length"));
  if (!Number.isFinite(length) || length <= 0 || length > MAX_UPLOAD_BYTES) {
    return errorResponse(413, "too_large", { limitBytes: MAX_UPLOAD_BYTES });
  }
  const format = request.headers.get("X-Snapshot-Format") ?? "";
  const uncompressedLength = request.headers.get("X-Uncompressed-Length") ?? "";
  if (!SUPPORTED_FORMATS.has(format) || !/^\d{1,10}$/.test(uncompressedLength) || !request.body) {
    return errorResponse(400, "bad_request");
  }

  const now = Date.now();
  let rate, budget;
  try {
    const hash = await visitorHash(request.headers.get("CF-Connecting-IP") ?? "unknown", env.RATE_LIMIT_SALT ?? "");
    rate = await checkRate(env.SHARE_LIMITS, hash, now);
    if (!rate.ok) {
      return errorResponse(
        429,
        "rate_limited",
        { retryAfterSeconds: rate.retryAfterSeconds },
        { "Retry-After": String(rate.retryAfterSeconds) },
      );
    }
    budget = await checkBudget(env.SHARE_LIMITS, length, now);
    if (!budget.ok) return errorResponse(503, "busy");
  } catch {
    // Can't check the limits, so don't accept data we can't account for.
    return errorResponse(503, "busy");
  }

  const id = newShareId(now);
  const deleteKey = newDeleteKey();
  try {
    await env.SHARES.put(`shares/${id}`, request.body, {
      customMetadata: {
        createdAt: String(now),
        deleteKeyHash: await sha256Hex(deleteKey),
        uncompressedLength,
        formatVersion: format,
      },
    });
  } catch {
    return errorResponse(500, "unavailable");
  }
  await recordShare(env.SHARE_LIMITS, rate, budget, length);

  return new Response(
    JSON.stringify({
      id,
      url: new URL(`/s/${id}`, request.url).href,
      expiresAt: new Date(now + shareTtlMs(env)).toISOString(),
      deleteKey,
    }),
    { status: 201, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}
