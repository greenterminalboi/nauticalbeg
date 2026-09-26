// GET / DELETE /api/shares/:id (017, contracts/shares-api.md).
import type { FunctionContext } from "./_lib/env";
import { shareTtlMs } from "./_lib/env";
import { isValidShareId, sha256Hex, shareIdCreatedAtMs, timingSafeEqualHex } from "./_lib/ids";
import { errorResponse } from "./_lib/responses";

function idParam(params: FunctionContext["params"]): string {
  const raw = params.id;
  return Array.isArray(raw) ? raw.join("/") : (raw ?? "");
}

export async function onRequestGet({ env, params }: FunctionContext): Promise<Response> {
  const id = idParam(params);
  if (!isValidShareId(id)) return errorResponse(404, "not_found");
  const ttl = shareTtlMs(env);
  const now = Date.now();

  const object = await env.SHARES.get(`shares/${id}`);
  if (object) {
    const createdAt = Number(object.customMetadata?.createdAt ?? "0");
    if (!(now - createdAt < ttl)) {
      // Expired links stop working exactly at 7 days; the lifecycle rule is
      // only the backstop for data nobody asks for again.
      await object.body.cancel();
      await env.SHARES.delete(`shares/${id}`);
      return errorResponse(410, "expired");
    }
    const init: ResponseInit & { encodeBody: "manual" } = {
      status: 200,
      // The stored bytes are already Brotli: tell the runtime not to
      // compress them again, and let the browser decode them natively.
      encodeBody: "manual",
      headers: {
        "Content-Encoding": "br",
        "Content-Type": "application/octet-stream",
        "X-Uncompressed-Length": object.customMetadata?.uncompressedLength ?? "",
        "X-Expires-At": new Date(createdAt + ttl).toISOString(),
        "Cache-Control": "private, no-store",
      },
    };
    return new Response(object.body, init);
  }

  if (await env.SHARES.head(`tombstones/${id}`)) return errorResponse(410, "deleted");
  if (now - shareIdCreatedAtMs(id) >= ttl) return errorResponse(410, "expired");
  return errorResponse(404, "not_found");
}

export async function onRequestDelete({ request, env, params }: FunctionContext): Promise<Response> {
  const id = idParam(params);
  if (!isValidShareId(id)) return errorResponse(404, "not_found");
  const object = await env.SHARES.head(`shares/${id}`);
  if (!object) return errorResponse(404, "not_found");

  const key = /^Bearer (.+)$/.exec(request.headers.get("Authorization") ?? "")?.[1] ?? "";
  const expected = object.customMetadata?.deleteKeyHash ?? "";
  if (!key || !expected || !timingSafeEqualHex(await sha256Hex(key), expected)) {
    return errorResponse(403, "forbidden");
  }
  await env.SHARES.delete(`shares/${id}`);
  await env.SHARES.put(`tombstones/${id}`, "", { customMetadata: { deletedAt: String(Date.now()) } });
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
