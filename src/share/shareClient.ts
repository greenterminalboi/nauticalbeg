// Browser side of sharing (017): compress in a Worker, upload with progress,
// delete early. See contracts/shares-api.md and contracts/share-ui.md.
import type { CompressRequest, CompressResponse } from "./compress.worker";

/** Mirrors the server's cap (functions/api/shares/_lib/limits.ts). */
export const MAX_SHARE_BYTES = 41_943_040;

export type ShareFailure =
  | { kind: "too_large"; bytes: number; limitBytes: number }
  | { kind: "rate_limited"; retryAfterSeconds: number }
  | { kind: "busy" }
  | { kind: "unavailable" }
  | { kind: "cancelled" };

export class ShareError extends Error {
  constructor(readonly failure: ShareFailure) {
    super(failure.kind);
    this.name = "ShareError";
  }
}

export interface CreatedShare {
  id: string;
  url: string;
  expiresAt: string;
  deleteKey: string;
}

export function compressSnapshot(
  container: Uint8Array,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./compress.worker.ts", import.meta.url), { type: "module" });
    const finish = () => worker.terminate();
    signal.addEventListener(
      "abort",
      () => {
        worker.postMessage({ type: "cancel" } satisfies CompressRequest);
        finish();
        reject(new ShareError({ kind: "cancelled" }));
      },
      { once: true },
    );
    worker.onmessage = (event: MessageEvent<CompressResponse>) => {
      const msg = event.data;
      if (msg.type === "progress") onProgress(msg.done / msg.total);
      else if (msg.type === "done") {
        finish();
        resolve(msg.output);
      } else {
        finish();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      finish();
      reject(new Error(e.message || "Compression failed."));
    };
    // Copy so the caller's container can be garbage-collected independently.
    const input = container.slice();
    worker.postMessage({ type: "compress", input } satisfies CompressRequest, [input.buffer]);
  });
}

function failureFromResponse(status: number, body: unknown): ShareFailure {
  const b = (body ?? {}) as { error?: string; retryAfterSeconds?: number; limitBytes?: number };
  if (b.error === "rate_limited") return { kind: "rate_limited", retryAfterSeconds: Number(b.retryAfterSeconds) || 3600 };
  if (b.error === "busy") return { kind: "busy" };
  if (b.error === "too_large") return { kind: "too_large", bytes: 0, limitBytes: Number(b.limitBytes) || MAX_SHARE_BYTES };
  void status;
  return { kind: "unavailable" };
}

/** XMLHttpRequest because it's the only reliable upload-progress signal in every browser. */
export function uploadShare(
  compressed: Uint8Array,
  uncompressedLength: number,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<CreatedShare> {
  if (compressed.length > MAX_SHARE_BYTES) {
    return Promise.reject(
      new ShareError({ kind: "too_large", bytes: compressed.length, limitBytes: MAX_SHARE_BYTES }),
    );
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/shares");
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.setRequestHeader("X-Snapshot-Format", "1");
    xhr.setRequestHeader("X-Uncompressed-Length", String(uncompressedLength));
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201 && xhr.response && typeof xhr.response.id === "string") resolve(xhr.response as CreatedShare);
      else reject(new ShareError(failureFromResponse(xhr.status, xhr.response)));
    };
    xhr.onerror = () => reject(new ShareError({ kind: "unavailable" }));
    signal.addEventListener(
      "abort",
      () => {
        xhr.abort();
        reject(new ShareError({ kind: "cancelled" }));
      },
      { once: true },
    );
    xhr.send(compressed as Uint8Array<ArrayBuffer>);
  });
}

export async function deleteShare(id: string, deleteKey: string): Promise<"deleted" | "gone" | "failed"> {
  try {
    const res = await fetch(`/api/shares/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${deleteKey}` },
    });
    if (res.status === 204) return "deleted";
    if (res.status === 404) return "gone";
    return "failed";
  } catch {
    return "failed";
  }
}
