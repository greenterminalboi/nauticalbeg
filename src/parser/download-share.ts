// Downloads a shared game's container (017, contracts/shares-api.md GET).
// The server sends the stored Brotli bytes with `Content-Encoding: br`, so
// the browser decompresses natively and this reads the plain container.
// Progress is measured against X-Uncompressed-Length for that reason.
import type { ErrorKind } from "./protocol";

export class ShareDownloadError extends Error {
  constructor(readonly kind: ErrorKind) {
    super(kind);
    this.name = "ShareDownloadError";
  }
}

const KIND_BY_CODE: Record<string, ErrorKind> = {
  expired: "share-expired",
  deleted: "share-deleted",
  not_found: "share-not-found",
};

export async function downloadShare(
  id: string,
  onProgress: (percent: number | null) => void,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<{ container: Uint8Array; expiresAt: string }> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/shares/${encodeURIComponent(id)}`, { signal });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new ShareDownloadError("share-unavailable");
  }
  if (!res.ok) {
    let code = "";
    try {
      code = String(((await res.json()) as { error?: string }).error ?? "");
    } catch {
      // Not our JSON (e.g. a platform error page): treat as unavailable.
    }
    throw new ShareDownloadError(KIND_BY_CODE[code] ?? (res.status === 404 ? "share-not-found" : "share-unavailable"));
  }

  const total = Number(res.headers.get("X-Uncompressed-Length")) || 0;
  const expiresAt = res.headers.get("X-Expires-At") ?? "";
  if (!res.body) throw new ShareDownloadError("share-unavailable");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  let lastPost = 0;
  onProgress(total ? 0 : null);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const now = Date.now();
    if (now - lastPost >= 1000) {
      lastPost = now;
      onProgress(total ? Math.min(99, Math.round((received / total) * 100)) : null);
    }
  }
  const container = new Uint8Array(received);
  let at = 0;
  for (const c of chunks) {
    container.set(c, at);
    at += c.length;
  }
  onProgress(100);
  return { container, expiresAt };
}
