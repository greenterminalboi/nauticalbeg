import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { SaveDatabase } from "../../storage/db";
import { exportSnapshot } from "../../share/exportSnapshot";
import {
  compressSnapshot,
  deleteShare,
  MAX_SHARE_BYTES,
  ShareError,
  uploadShare,
  type CreatedShare,
  type ShareFailure,
} from "../../share/shareClient";
import { canStoreShares, forgetShare, listShares, rememberShare, type StoredShare } from "../../share/shareLinks";
import "./ShareDialog.css";

const SHARE_DAYS = 7;

type Phase = "preparing" | "compressing" | "uploading";

type DialogState =
  | { kind: "confirm" }
  | { kind: "working"; phase: Phase; fraction: number | null }
  | { kind: "done"; share: CreatedShare; copied: boolean; confirmingDelete: boolean }
  | { kind: "deleted" }
  | { kind: "failed"; failure: ShareFailure | { kind: "error"; message: string } };

const PHASE_LABEL: Record<Phase, string> = {
  preparing: "Preparing game data…",
  compressing: "Compressing…",
  uploading: "Uploading…",
};

function formatExpiry(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function failureMessage(f: ShareFailure | { kind: "error"; message: string }): string {
  switch (f.kind) {
    case "too_large":
      return f.bytes
        ? `This game is ${mb(f.bytes)} MB compressed; the sharing limit is ${mb(f.limitBytes)} MB.`
        : `This game is over the ${mb(f.limitBytes)} MB sharing limit.`;
    case "rate_limited":
      return `You've shared a lot recently — try again in about ${Math.ceil(f.retryAfterSeconds / 60)} minutes.`;
    case "busy":
      return "Sharing is at capacity for today — try again tomorrow.";
    case "unavailable":
      return "Sharing is temporarily unavailable. Your game is unaffected.";
    case "cancelled":
      return "Sharing was cancelled. Nothing was uploaded.";
    case "error":
      return `Something went wrong while preparing the share: ${f.message}`;
  }
}

/**
 * 017's share flow (contracts/share-ui.md): confirm → preparing →
 * compressing → uploading → link. Nothing leaves the device until the
 * player clicks Share (spec FR-002, constitution I opt-in).
 */
export function ShareDialog({ db, onClose }: { db: SaveDatabase; onClose: () => void }) {
  const [state, setState] = useState<DialogState>({ kind: "confirm" });
  const [myShares, setMyShares] = useState<StoredShare[]>(() => listShares());
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const expiryPreview = formatExpiry(new Date(Date.now() + SHARE_DAYS * 86_400_000).toISOString());
  const storageAvailable = canStoreShares();

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [state.kind]);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function startShare(): Promise<void> {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    try {
      setState({ kind: "working", phase: "preparing", fraction: null });
      const container = await exportSnapshot(db, (done, total) => {
        if (!signal.aborted) setState({ kind: "working", phase: "preparing", fraction: done / total });
      });
      signal.throwIfAborted();
      setState({ kind: "working", phase: "compressing", fraction: 0 });
      const compressed = await compressSnapshot(
        container,
        (fraction) => setState({ kind: "working", phase: "compressing", fraction }),
        signal,
      );
      if (compressed.length > MAX_SHARE_BYTES) {
        throw new ShareError({ kind: "too_large", bytes: compressed.length, limitBytes: MAX_SHARE_BYTES });
      }
      setState({ kind: "working", phase: "uploading", fraction: 0 });
      const share = await uploadShare(
        compressed,
        container.length,
        (fraction) => setState({ kind: "working", phase: "uploading", fraction }),
        signal,
      );
      rememberShare({ id: share.id, url: share.url, expiresAt: share.expiresAt, deleteKey: share.deleteKey });
      setMyShares(listShares());
      setState({ kind: "done", share, copied: false, confirmingDelete: false });
    } catch (err) {
      if (err instanceof ShareError) setState({ kind: "failed", failure: err.failure });
      else if (signal.aborted) setState({ kind: "failed", failure: { kind: "cancelled" } });
      else setState({ kind: "failed", failure: { kind: "error", message: err instanceof Error ? err.message : String(err) } });
    } finally {
      abortRef.current = null;
    }
  }

  async function copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setState((s) => (s.kind === "done" ? { ...s, copied: true } : s));
    } catch {
      // Clipboard blocked: the link field is selectable, so select it instead.
      dialogRef.current?.querySelector<HTMLInputElement>(".share-dialog__link")?.select();
    }
  }

  async function removeShare(id: string, deleteKey: string): Promise<void> {
    const result = await deleteShare(id, deleteKey);
    if (result !== "failed") {
      forgetShare(id);
      setMyShares(listShares());
      if (state.kind === "done" && state.share.id === id) setState({ kind: "deleted" });
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    if (e.key === "Escape") {
      e.preventDefault();
      if (state.kind === "working") abortRef.current?.abort();
      else onClose();
      return;
    }
    if (e.key !== "Tab" || !dialogRef.current) return;
    // Keep focus inside the dialog.
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, a[href]")];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const otherShares = myShares.filter((s) => state.kind !== "done" || s.id !== state.share.id);

  return (
    <div className="share-dialog__backdrop">
      <div
        ref={dialogRef}
        className="share-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <h2 id="share-dialog-title" className="share-dialog__title">
          Share this game
        </h2>

        {state.kind === "confirm" && (
          <>
            <p>
              NauticalBeg will upload the analysed game data (not your save file) so{" "}
              <strong>anyone with the link can view it</strong>. Player names in multiplayer games are included.
            </p>
            <p>
              The link and data are deleted on <strong>{expiryPreview}</strong> ({SHARE_DAYS} days). You can't extend
              it, but you can share again for a new link.
            </p>
            <div className="share-dialog__actions">
              <button type="button" className="share-dialog__primary" onClick={() => void startShare()}>
                Share
              </button>
              <button type="button" className="share-dialog__secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {state.kind === "working" && (
          <>
            <p aria-live="polite">
              {PHASE_LABEL[state.phase]}
              {state.fraction !== null && ` ${Math.round(state.fraction * 100)}%`}
            </p>
            <progress
              className="share-dialog__progress"
              max={1}
              value={state.fraction ?? undefined}
              aria-label={PHASE_LABEL[state.phase]}
            />
            <div className="share-dialog__actions">
              <button type="button" className="share-dialog__secondary" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            </div>
          </>
        )}

        {state.kind === "done" && (
          <>
            <label className="share-dialog__field">
              <span>Link</span>
              <input className="share-dialog__link" readOnly value={state.share.url} onFocus={(e) => e.target.select()} />
            </label>
            <p>Expires {formatExpiry(state.share.expiresAt)}.</p>
            <div className="share-dialog__actions">
              <button type="button" className="share-dialog__primary" onClick={() => void copyLink(state.share.url)}>
                {state.copied ? "Copied" : "Copy link"}
              </button>
              {storageAvailable && !state.confirmingDelete && (
                <button
                  type="button"
                  className="share-dialog__danger"
                  onClick={() => setState({ ...state, confirmingDelete: true })}
                >
                  Delete this link
                </button>
              )}
              {state.confirmingDelete && (
                <>
                  <span>Delete it now? Anyone opening it will see it was taken down.</span>
                  <button
                    type="button"
                    className="share-dialog__danger"
                    onClick={() => void removeShare(state.share.id, state.share.deleteKey)}
                  >
                    Yes, delete
                  </button>
                  <button
                    type="button"
                    className="share-dialog__secondary"
                    onClick={() => setState({ ...state, confirmingDelete: false })}
                  >
                    Keep it
                  </button>
                </>
              )}
              <button type="button" className="share-dialog__secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {state.kind === "deleted" && (
          <>
            <p>Link deleted. Anyone opening it will see it was taken down.</p>
            <div className="share-dialog__actions">
              <button type="button" className="share-dialog__secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {state.kind === "failed" && (
          <>
            <p role="alert">{failureMessage(state.failure)}</p>
            <div className="share-dialog__actions">
              {state.failure.kind !== "too_large" && (
                <button type="button" className="share-dialog__primary" onClick={() => setState({ kind: "confirm" })}>
                  Try again
                </button>
              )}
              <button type="button" className="share-dialog__secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        )}

        {(state.kind === "confirm" || state.kind === "done" || state.kind === "deleted") && otherShares.length > 0 && (
          <details className="share-dialog__mine">
            <summary>Your shared links ({otherShares.length})</summary>
            <ul>
              {otherShares.map((s) => (
                <li key={s.id}>
                  <span>Expires {formatExpiry(s.expiresAt)}</span>
                  <button type="button" className="share-dialog__danger" onClick={() => void removeShare(s.id, s.deleteKey)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}

        <p className="share-dialog__note">
          Shared data is stored for {SHARE_DAYS} days, then deleted. No accounts, no tracking — see{" "}
          <a href="https://github.com/greenterminalboi/nauticalbeg/blob/main/docs/sharing.md" target="_blank" rel="noreferrer">
            Sharing &amp; privacy
          </a>
          .
        </p>
      </div>
    </div>
  );
}
