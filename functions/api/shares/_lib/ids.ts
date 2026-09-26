// Share IDs and delete keys (017, data-model.md "Share ID").
//
// An ID is base64url(6-byte big-endian creation time in seconds ‖ 16 random
// bytes): 30 characters with 128 bits of randomness, so it can't be guessed
// (spec FR-007). The embedded time only lets a link whose data is already
// gone be reported as "expired" rather than "not found" (FR-011).

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{30}$/;

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function newShareId(nowMs: number): string {
  const bytes = new Uint8Array(22);
  const seconds = Math.floor(nowMs / 1000);
  // 6 bytes = 48 bits, far beyond any real timestamp.
  for (let i = 5; i >= 0; i--) bytes[i] = Math.floor(seconds / 2 ** (8 * (5 - i))) % 256;
  crypto.getRandomValues(bytes.subarray(6));
  return base64url(bytes);
}

export function isValidShareId(id: string): boolean {
  return SHARE_ID_PATTERN.test(id);
}

/** Creation time embedded in a valid ID, in ms since the epoch. */
export function shareIdCreatedAtMs(id: string): number {
  const bytes = fromBase64url(id);
  let seconds = 0;
  for (let i = 0; i < 6; i++) seconds = seconds * 256 + bytes[i];
  return seconds * 1000;
}

export function newDeleteKey(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two equal-length hex strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
