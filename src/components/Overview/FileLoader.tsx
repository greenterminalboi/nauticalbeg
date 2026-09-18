import { useEffect, useRef, useState } from "react";
import type {
  ErrorKind,
  ErrorMessage as WorkerErrorMessage,
  ParsePhase,
  ProgressMessage,
  ReadyMessage,
  WorkerToMainMessage,
} from "../../parser/protocol";
import { closeSaveDatabase, openSaveDatabase, type SaveDatabase } from "../../storage/db";
import {
  cleanupSaveIfNotKept,
  forgetKeptSave,
  getNationOverview,
  getPlayerNationOverview,
  getSaveMeta,
  listKeptSave,
  listNations,
  recordKeptSave,
  type KeptSaveSummary,
  type NationOverview,
  type NationSummary,
} from "../../storage/queries";
import { ErrorMessage } from "./ErrorMessage";
import { KeepSaveToggle } from "./KeepSaveToggle";
import { KeptSaveOffer } from "./KeptSaveOffer";
import { NationSelector } from "./NationSelector";
import { OverviewCard } from "./OverviewCard";

type ReadyStatus = {
  kind: "ready";
  nations: NationSummary[];
  selectedNationIdx: number;
  overview: NationOverview;
  inGameDate: string;
  kept: boolean;
  keepPending: boolean;
  keepError: string | null;
};

type Status =
  | { kind: "idle" }
  | { kind: "kept-save-offer"; summary: KeptSaveSummary }
  | { kind: "resuming" }
  | { kind: ParsePhase; percent: number | null }
  | { kind: "loading-overview" } // parsing succeeded; fetching the overview to display
  | ReadyStatus
  // errorKind is "unknown" for a failure outside FR-009's three worker
  // kinds (e.g. the save parsed but reading its overview afterward
  // failed) — see ErrorMessage.tsx.
  | { kind: "error"; errorKind: ErrorKind | "unknown"; message: string };

/**
 * File picker + worker orchestration. Once parsing succeeds, this opens a
 * read-only connection to the save that stays open for the rest of the
 * "ready" session (see `readDbRef`) — FR-015's nation selector re-queries
 * that same connection on every selection change rather than reopening
 * it, since switching the viewed nation must not require re-parsing or
 * re-uploading the save. `NationSelector` + `getNationOverview` are
 * intentionally generic (pick an idx, re-render) — the pattern is meant
 * to extend to future selectable views, not stay nation-specific.
 *
 * FR-011/FR-014 ("keep"/quota handling) route through the worker rather
 * than being called directly against `readDbRef` — see `KeepMessage`'s
 * doc comment in `parser/protocol.ts`: writing to the save's database
 * requires a write-capable connection, and that can only be opened from
 * within a dedicated Worker in this browser, never the main thread.
 * `forgetKeptSave` is the one exception that's safe to call directly
 * here — it only touches OPFS directory entries and `localStorage`,
 * never opens a SQLite connection at all.
 */
export function FileLoader() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const workerRef = useRef<Worker | null>(null);
  // Tracks the most recently ready save's id so the beforeunload handler
  // below knows what to clean up — see handleReady and T035.
  const currentSaveIdRef = useRef<string | null>(null);
  // The read-only connection backing the current "ready" session, kept
  // open across nation-selector changes and closed only when superseded
  // by a new load or on unmount (see the two effects below).
  const readDbRef = useRef<SaveDatabase | null>(null);

  useEffect(() => {
    const worker = new Worker(new URL("../../parser/worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
      const message = event.data;
      switch (message.type) {
        case "progress":
          handleProgress(message);
          break;
        case "ready":
          void handleReady(message);
          break;
        case "error":
          handleError(message);
          break;
        case "kept":
          // The worker only did the SQL write (markSaveKept) — the
          // localStorage pointer bookkeeping runs here, on the main
          // thread, since localStorage doesn't exist in a Worker.
          void recordKeptSave({
            saveId: message.saveId,
            filename: message.filename,
            inGameDate: message.inGameDate,
          })
            .then(() => {
              setStatus((prev) =>
                prev.kind === "ready" ? { ...prev, kept: true, keepPending: false } : prev,
              );
            })
            .catch((err) => {
              setStatus((prev) =>
                prev.kind === "ready"
                  ? {
                      ...prev,
                      keepPending: false,
                      keepError:
                        err instanceof Error
                          ? err.message
                          : "Failed to record this save as kept.",
                    }
                  : prev,
              );
            });
          break;
        case "keep-failed":
          setStatus((prev) =>
            prev.kind === "ready"
              ? { ...prev, keepPending: false, keepError: message.message }
              : prev,
          );
          break;
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- worker is created once per mount
  }, []);

  useEffect(() => {
    // FR-011/Acceptance Scenario 2: offer to resume a kept save instead
    // of requiring an immediate re-upload. Only offered at startup,
    // before anything else has happened — a `cancelled` guard covers
    // React StrictMode's double-invoked effects in dev.
    let cancelled = false;
    void listKeptSave().then((summary) => {
      if (!cancelled && summary) {
        setStatus({ kind: "kept-save-offer", summary });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Best-effort cleanup for FR-005/FR-012's "not retained unless kept"
    // default when the user closes the tab without loading a replacement
    // save (the case worker.ts's supersede-cleanup can't cover). This is
    // fire-and-forget: beforeunload gives no reliable way to await async
    // work, so this can't be guaranteed to finish before the page closes.
    // The supersede path in worker.ts is the reliable mechanism; this is
    // a backstop for it.
    function handleBeforeUnload(): void {
      if (currentSaveIdRef.current) {
        void cleanupSaveIfNotKept(currentSaveIdRef.current);
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    // Close the read-only connection on unmount — it's a separate
    // lifecycle from the OPFS *file* cleanup above (this only releases
    // the in-memory connection, it never deletes anything).
    return () => {
      if (readDbRef.current) {
        void closeSaveDatabase(readDbRef.current);
        readDbRef.current = null;
      }
    };
  }, []);

  function handleProgress(message: ProgressMessage): void {
    setStatus({ kind: message.phase, percent: message.percent });
  }

  async function handleReady(message: ReadyMessage): Promise<void> {
    currentSaveIdRef.current = message.saveId;
    setStatus({ kind: "loading-overview" });

    // A new load always supersedes the old (FR-010) — close the previous
    // session's read connection before opening the new one.
    if (readDbRef.current) {
      await closeSaveDatabase(readDbRef.current);
      readDbRef.current = null;
    }

    // readonly: the main thread only ever reads (the worker owns writes)
    // — see openSaveDatabase's doc comment for why this also avoids a
    // real cross-context OPFS crash, not just signaling intent.
    const db = await openSaveDatabase(message.saveId, undefined, { readonly: true });
    readDbRef.current = db;
    try {
      // Sequential, not concurrent: wa-sqlite's async build runs on
      // Asyncify, which unwinds/rewinds a single WASM call stack per
      // module instance — issuing queries concurrently against the same
      // connection corrupts that shared state (observed in the browser
      // as a nonsensical "no such table" error, an OPFS NotFoundError,
      // and a WASM "memory access out of bounds" crash, depending on how
      // the race landed). Existing tests never caught this because they
      // always call one query at a time.
      const meta = await getSaveMeta(db);
      const nations = await listNations(db);
      const overview = await getPlayerNationOverview(db);
      setStatus({
        kind: "ready",
        nations,
        selectedNationIdx: overview.idx,
        overview,
        inGameDate: meta.inGameDate ?? message.inGameDate,
        kept: meta.kept,
        keepPending: false,
        keepError: null,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        errorKind: "unknown",
        message:
          err instanceof Error
            ? err.message
            : "Loaded the save but failed to read its overview.",
      });
      // Nothing to keep this connection open for — there's no "ready"
      // state, and thus no nation selector, to query it again from.
      await closeSaveDatabase(db);
      readDbRef.current = null;
    }
  }

  async function handleSelectNation(nationIdx: number): Promise<void> {
    const db = readDbRef.current;
    if (!db || status.kind !== "ready") return;
    try {
      const overview = await getNationOverview(db, nationIdx);
      setStatus({ ...status, overview, selectedNationIdx: nationIdx });
    } catch (err) {
      setStatus({
        kind: "error",
        errorKind: "unknown",
        message:
          err instanceof Error ? err.message : "Failed to load that nation's overview.",
      });
    }
  }

  function handleKeepToggle(): void {
    if (status.kind !== "ready") return;
    const saveId = currentSaveIdRef.current;
    if (!saveId) return;

    setStatus({ ...status, keepPending: true, keepError: null });

    if (status.kept) {
      // Safe directly on the main thread — see this component's doc
      // comment for why forget (unlike keep) never needs the worker.
      forgetKeptSave(saveId)
        .then(() => {
          setStatus((prev) =>
            prev.kind === "ready" ? { ...prev, kept: false, keepPending: false } : prev,
          );
        })
        .catch((err) => {
          setStatus((prev) =>
            prev.kind === "ready"
              ? {
                  ...prev,
                  keepPending: false,
                  keepError: err instanceof Error ? err.message : "Failed to forget this save.",
                }
              : prev,
          );
        });
    } else {
      workerRef.current?.postMessage({ type: "keep", saveId });
    }
  }

  function handleError(message: WorkerErrorMessage): void {
    setStatus({ kind: "error", errorKind: message.kind, message: message.message });
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file later
    if (!file || !workerRef.current) return;
    setStatus({ kind: "validating", percent: null });
    workerRef.current.postMessage({
      type: "load",
      file,
      keepAsDefaultSession: false,
    });
  }

  function handleResumeKeptSave(saveId: string): void {
    if (!workerRef.current) return;
    setStatus({ kind: "resuming" });
    workerRef.current.postMessage({
      type: "load",
      keepAsDefaultSession: true,
      saveId,
    });
  }

  function handleDismissKeptSaveOffer(): void {
    setStatus({ kind: "idle" });
  }

  return (
    <div>
      <label>
        Select an EU5 save file
        <input type="file" onChange={handleFileSelected} />
      </label>
      <StatusView
        status={status}
        onSelectNation={(idx) => void handleSelectNation(idx)}
        onKeepToggle={handleKeepToggle}
        onResumeKeptSave={handleResumeKeptSave}
        onDismissKeptSaveOffer={handleDismissKeptSaveOffer}
      />
    </div>
  );
}

function StatusView({
  status,
  onSelectNation,
  onKeepToggle,
  onResumeKeptSave,
  onDismissKeptSaveOffer,
}: {
  status: Status;
  onSelectNation: (idx: number) => void;
  onKeepToggle: () => void;
  onResumeKeptSave: (saveId: string) => void;
  onDismissKeptSaveOffer: () => void;
}) {
  switch (status.kind) {
    case "idle":
      return null;
    case "kept-save-offer":
      return (
        <KeptSaveOffer
          summary={status.summary}
          onResume={() => onResumeKeptSave(status.summary.saveId)}
          onDismiss={onDismissKeptSaveOffer}
        />
      );
    case "resuming":
      return <p>Resuming kept save…</p>;
    case "validating":
    case "detecting-version":
    case "parsing":
    case "loading-overview":
      return <p>{describePhase(status)}</p>;
    case "ready":
      return (
        <div>
          <NationSelector
            nations={status.nations}
            selectedIdx={status.selectedNationIdx}
            onSelect={onSelectNation}
          />
          <KeepSaveToggle
            kept={status.kept}
            pending={status.keepPending}
            error={status.keepError}
            onToggle={onKeepToggle}
          />
          <OverviewCard overview={status.overview} inGameDate={status.inGameDate} />
        </div>
      );
    case "error":
      return <ErrorMessage kind={status.errorKind} message={status.message} />;
  }
}

function describePhase(status: Status): string {
  if (status.kind === "loading-overview") return "Loading overview…";
  if (status.kind !== "validating" && status.kind !== "detecting-version" && status.kind !== "parsing") {
    return "";
  }
  const label: Record<ParsePhase, string> = {
    validating: "Validating file…",
    "detecting-version": "Detecting game version…",
    parsing: "Parsing save…",
  };
  const percent = status.percent !== null ? ` (${status.percent}%)` : "";
  return `${label[status.kind]}${percent}`;
}
