// The sharer's own links (017, data-model.md "Client share record"): kept in
// this browser only, because the delete key is what proves the right to
// take a link down early (US4). Storage can be blocked (private windows,
// site-data settings), so every access is guarded; without it, sharing
// still works but early delete isn't offered.

const STORAGE_KEY = "nauticalbeg.shares";
const SHARE_PATH = /^\/s\/([A-Za-z0-9_-]{30})\/?$/;

export interface StoredShare {
  id: string;
  url: string;
  expiresAt: string;
  deleteKey: string;
}

function isStoredShare(v: unknown): v is StoredShare {
  const s = v as Record<string, unknown>;
  return (
    typeof s === "object" &&
    s !== null &&
    typeof s.id === "string" &&
    typeof s.url === "string" &&
    typeof s.expiresAt === "string" &&
    typeof s.deleteKey === "string"
  );
}

export function canStoreShares(): boolean {
  try {
    localStorage.setItem(`${STORAGE_KEY}.probe`, "1");
    localStorage.removeItem(`${STORAGE_KEY}.probe`);
    return true;
  } catch {
    return false;
  }
}

/** This browser's unexpired shares, newest first. Prunes expired ones. */
export function listShares(now = Date.now()): StoredShare[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    const all = Array.isArray(raw) ? raw.filter(isStoredShare) : [];
    const live = all.filter((s) => new Date(s.expiresAt).getTime() > now);
    if (live.length !== all.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(live));
    return live.sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
  } catch {
    return [];
  }
}

export function rememberShare(share: StoredShare): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([share, ...listShares().filter((s) => s.id !== share.id)]));
  } catch {
    // Storage blocked: the link still works, it just can't be deleted early.
  }
}

export function forgetShare(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(listShares().filter((s) => s.id !== id)));
  } catch {
    // Nothing to forget if storage is blocked.
  }
}

/** The share ID in a `/s/<id>` path, or null. */
export function parseShareIdFromPath(pathname: string): string | null {
  return SHARE_PATH.exec(pathname)?.[1] ?? null;
}
