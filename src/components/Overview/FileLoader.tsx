import { useEffect, useRef, useState } from "react";
import type {
  ErrorMessage,
  ParsePhase,
  ProgressMessage,
  ReadyMessage,
  WorkerToMainMessage,
} from "../../parser/protocol";
import { openSaveDatabase, closeSaveDatabase } from "../../storage/db";
import { getPlayerNationOverview, getSaveMeta } from "../../storage/queries";

type Status =
  | { kind: "idle" }
  | { kind: ParsePhase; percent: number | null }
  | { kind: "loading-overview" } // parsing succeeded; fetching name/date to display
  | { kind: "ready"; nationName: string; inGameDate: string }
  | { kind: "error"; message: string };

/**
 * File picker + worker orchestration for User Story 1. Once parsing
 * succeeds, this queries just enough (`getSaveMeta` +
 * `getPlayerNationOverview`) to show the player's nation name and
 * in-game date, satisfying US1's Independent Test. The full six-stat
 * overview (User Story 2) replaces this minimal display in
 * `OverviewCard.tsx` (T027) — this component's job stays scoped to
 * "get a save loaded," per the module boundaries in ARCHITECTURE.md.
 */
export function FileLoader() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const workerRef = useRef<Worker | null>(null);

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
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- worker is created once per mount
  }, []);

  function handleProgress(message: ProgressMessage): void {
    setStatus({ kind: message.phase, percent: message.percent });
  }

  async function handleReady(message: ReadyMessage): Promise<void> {
    setStatus({ kind: "loading-overview" });
    const db = await openSaveDatabase(message.saveId);
    try {
      const [meta, overview] = await Promise.all([
        getSaveMeta(db),
        getPlayerNationOverview(db),
      ]);
      setStatus({
        kind: "ready",
        nationName: overview.name,
        inGameDate: meta.inGameDate ?? message.inGameDate,
      });
    } catch (err) {
      setStatus({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Loaded the save but failed to read its overview.",
      });
    } finally {
      await closeSaveDatabase(db);
    }
  }

  function handleError(message: ErrorMessage): void {
    setStatus({ kind: "error", message: message.message });
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

  return (
    <div>
      <label>
        Select an EU5 save file
        <input type="file" onChange={handleFileSelected} />
      </label>
      <StatusView status={status} />
    </div>
  );
}

function StatusView({ status }: { status: Status }) {
  switch (status.kind) {
    case "idle":
      return null;
    case "validating":
    case "detecting-version":
    case "parsing":
    case "loading-overview":
      return <p>{describePhase(status)}</p>;
    case "ready":
      return (
        <p>
          {status.nationName} — {status.inGameDate}
        </p>
      );
    case "error":
      return <p role="alert">{status.message}</p>;
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
