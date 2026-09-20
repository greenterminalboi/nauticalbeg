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
  keepSave,
  listKeptSave,
  listNations,
  type KeptSaveSummary,
  type NationOverview,
  type NationSummary,
} from "../../storage/queries";
import { ComingSoonPlaceholder } from "./ComingSoonPlaceholder";
import { CountryViewerNav } from "./CountryViewerNav";
import { EncyclopediaNav } from "./EncyclopediaNav";
import { EncyclopediaSection } from "./EncyclopediaSection";
import { ErrorMessage } from "./ErrorMessage";
import { KeptSaveOffer } from "./KeptSaveOffer";
import { LeaderboardTab } from "./LeaderboardTab";
import { LeaderboardSideNav } from "./LeaderboardSideNav";
import type { LeaderboardMetric } from "./leaderboardData";
import { LoadingCircle } from "./LoadingCircle";
import { MapTab } from "./MapTab";
import { OverviewCard } from "./OverviewCard";
import { ProvincesTab } from "./ProvincesTab";
import type { AppSection, EncyclopediaTab, TabId } from "./tabs";
import { TopBar } from "./TopBar";
import { WarsTab } from "./WarsTab";
import "./Shell.css";

type ReadyStatus = {
  kind: "ready";
  nations: NationSummary[];
  selectedNationIdx: number;
  overview: NationOverview;
  inGameDate: string;
  filename: string;
  kept: boolean;
  keepPending: boolean;
  keepError: string | null;
  /** plan.md Technical Context — which side-nav category is displayed
   * within Encyclopedia's "Countries" sub-tab; component state, not
   * routing (research.md §4). Defaults to "overview" and is never reset
   * by a nation change (FR-003). Meaningless outside Countries, but kept
   * here (not on `AppSection`/`EncyclopediaTab` state) since it's really
   * "the save session's current view," which persists across section
   * switches (e.g. checking Map then coming back to Encyclopedia
   * shouldn't reset it). */
  activeTab: TabId;
};

const UNBUILT_TAB_LABELS: Partial<Record<TabId, string>> = {
  military: "Military",
  government: "Government",
  economy: "Economy",
  diplomacy: "Diplomacy",
  trade: "Trade",
  buildings: "Building Registry",
  characters: "Characters",
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
 * File picker + worker orchestration, plus the app-level section switch
 * (NauticalBot / Atlas / Factbook / Encyclopedia / Settings — decision
 * 2026-09-18, renamed 2026-09-19, "Map"→"Atlas" and "Encyclopedia"→
 * "Factbook" plus new "Encyclopedia" placeholder added 2026-09-20) and
 * Factbook's own sub-tab switch (Countries / Wars, decision 2026-09-19).
 * The save/keep controls (TopBar) are global — a loaded save stays
 * loaded regardless of which section is active. The nation selector/
 * category tabs (CountryViewerNav) only render within Factbook's
 * "Countries" sub-tab, since they're meaningless anywhere else
 * (including Factbook's own "Wars" sub-tab, which spans multiple
 * countries rather than belonging to one).
 *
 * Once parsing succeeds, this opens the one connection to the save that
 * stays open for the rest of the "ready" session (see `readDbRef`) —
 * FR-015's nation selector re-queries that same connection on every
 * selection change rather than reopening it, since switching the viewed
 * nation must not require re-parsing or re-uploading the save.
 * `NationSelector` + `getNationOverview` are intentionally generic (pick
 * an idx, re-render) — the pattern is meant to extend to future
 * selectable views, not stay nation-specific.
 *
 * FR-011/FR-014 ("keep"/quota handling) run directly against `readDbRef`
 * on the main thread — DuckDB has no SQLite-style restriction requiring
 * writes to originate from a dedicated Worker (see queries.ts's
 * `keepSave` doc comment), so there's no worker round-trip for this.
 */
export function FileLoader() {
  const [activeSection, setActiveSection] = useState<AppSection>("factbook");
  const [encyclopediaTab, setEncyclopediaTab] = useState<EncyclopediaTab>("countries");
  const [leaderboardMetric, setLeaderboardMetric] = useState<LeaderboardMetric>("population");
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

    // The worker that parsed this save already closed its own connection
    // before signaling ready (see load-save.ts) — DuckDB allows only one
    // open handle per OPFS file at a time, so this is the first (and,
    // for the rest of this session, only) connection to it. It's used
    // for every read AND for the keep-toggle write below; `db.ts`'s
    // per-connection queue serializes concurrent calls defensively.
    const db = await openSaveDatabase(message.saveId);
    readDbRef.current = db;
    try {
      const meta = await getSaveMeta(db);
      const nations = await listNations(db);
      const overview = await getPlayerNationOverview(db);
      setStatus({
        kind: "ready",
        nations,
        selectedNationIdx: overview.idx,
        overview,
        inGameDate: meta.inGameDate ?? message.inGameDate,
        filename: meta.filename,
        kept: meta.kept,
        keepPending: false,
        keepError: null,
        activeTab: "overview",
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
    const db = readDbRef.current;
    if (!saveId || !db) return;

    setStatus({ ...status, keepPending: true, keepError: null });

    if (status.kept) {
      // Forgetting the currently active save deletes its OPFS data
      // outright (FR-013 — "its persisted data is removed from local
      // storage"), so the live connection to that exact file must be
      // closed first: DuckDB-Wasm holds an OPFS file open exclusively for
      // as long as a connection to it lives, and deleting the file out
      // from under that open connection throws a real
      // "InvalidModificationError" (confirmed against a real kept save —
      // this path is untestable in the unit-test harness, since
      // deleteSaveDatabase no-ops there with no real OPFS to delete from).
      // There's nothing left to browse once the data is actually gone, so
      // this returns to idle rather than trying to keep showing a save
      // whose connection was just closed out from under it.
      closeSaveDatabase(db)
        .then(() => forgetKeptSave(saveId))
        .then(() => {
          readDbRef.current = null;
          currentSaveIdRef.current = null;
          setStatus({ kind: "idle" });
        })
        .catch((err) => {
          readDbRef.current = null;
          currentSaveIdRef.current = null;
          setStatus({
            kind: "error",
            errorKind: "unknown",
            message: err instanceof Error ? err.message : "Failed to forget this save.",
          });
        });
      return;
    }

    keepSave(db, saveId)
      .then(() => {
        setStatus((prev) => (prev.kind === "ready" ? { ...prev, kept: true, keepPending: false } : prev));
      })
      .catch((err) => {
        setStatus((prev) =>
          prev.kind === "ready"
            ? {
                ...prev,
                keepPending: false,
                keepError: err instanceof Error ? err.message : "Failed to keep this save.",
              }
            : prev,
        );
      });
  }

  function handleError(message: WorkerErrorMessage): void {
    setStatus({ kind: "error", errorKind: message.kind, message: message.message });
  }

  function handleFileSelected(file: File): void {
    if (!workerRef.current) return;
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

  function handleSelectTab(tab: TabId): void {
    setStatus((prev) => (prev.kind === "ready" ? { ...prev, activeTab: tab } : prev));
  }

  const isReady = status.kind === "ready";
  const isLoadingSave = isLoadingStatus(status);
  // Named for the section's internal id, not its display label — this
  // is Factbook (formerly "Encyclopedia"; renamed 2026-09-20 once a
  // separate, new "Encyclopedia" section existed too — see tabs.ts).
  const isFactbook = activeSection === "factbook";
  const showCountriesNav = isFactbook && encyclopediaTab === "countries" && isReady;
  // Same gating as showCountriesNav (isReady + a loaded db), so the side
  // nav only appears once there's actually a save to page metrics for —
  // mirrors Wars/Map's own isReady + readDbRef.current guard elsewhere
  // in this file.
  const showLeaderboardNav =
    isFactbook && encyclopediaTab === "leaderboard" && isReady && !!readDbRef.current;
  const shellClassName =
    showCountriesNav || showLeaderboardNav
      ? "shell shell--with-nav"
      : isFactbook
        ? "shell shell--with-subnav"
        : "shell";
  // Decision 2026-09-19: every Perspective-backed data table (not
  // Overview/placeholders) uses the full main content width — see
  // Shell.css's `--full-width` modifier doc comment. Extend this
  // condition as more Perspective tabs get built (Characters/Markets
  // are still ComingSoonPlaceholder for now). Leaderboard
  // (specs/006-country-leaderboard) is real now too, but isn't
  // Perspective-backed — its own CSS bounds its width instead.
  const isTableTab =
    (isFactbook && encyclopediaTab === "wars" && isReady) ||
    (showCountriesNav && status.kind === "ready" && status.activeTab === "provinces");
  // The Map tab (once a save is actually loaded — the pre-load "select a
  // save" message stays in the normal padded/centered layout) wants the
  // full remaining viewport edge-to-edge, not just the full width
  // --full-width alone gives table tabs — see Shell.css's `--flush`
  // modifier doc comment.
  const isMapTab = activeSection === "map" && isReady && !!readDbRef.current;
  const mainClassName = isMapTab ? "shell__main shell__main--flush" : "shell__main";
  const mainInnerClassName = isMapTab
    ? "shell__main-inner shell__main-inner--full-width shell__main-inner--flush"
    : isTableTab
      ? "shell__main-inner shell__main-inner--full-width"
      : "shell__main-inner";

  return (
    <div className={shellClassName}>
      <TopBar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        onFileSelected={handleFileSelected}
        keepState={isReady ? { kept: status.kept, pending: status.keepPending, error: status.keepError } : null}
        onKeepToggle={handleKeepToggle}
        loadedFilename={isReady ? status.filename : null}
      />
      {isFactbook && <EncyclopediaNav activeTab={encyclopediaTab} onSelectTab={setEncyclopediaTab} />}
      {showCountriesNav && (
        <CountryViewerNav
          nations={status.nations}
          selectedNationIdx={status.selectedNationIdx}
          onSelectNation={(idx) => void handleSelectNation(idx)}
          activeTab={status.activeTab}
          onSelectTab={handleSelectTab}
        />
      )}
      {showLeaderboardNav && (
        <LeaderboardSideNav activeMetric={leaderboardMetric} onSelectMetric={setLeaderboardMetric} />
      )}
      <main className={mainClassName}>
        <div className={mainInnerClassName}>
          {isLoadingSave ? (
            <LoadingCircle
              percent={computeLoadingPercent(status)}
              pulsing={isLoadingStagePulsing(status)}
              label={loadingLabel(status)}
            />
          ) : (
            <>
              {activeSection === "nauticalbot" && <ComingSoonPlaceholder feature="NauticalBot" />}
              {activeSection === "map" &&
                // Save-wide, not nation-scoped, like Wars above — same
                // isReady + readDbRef.current gate and idle wording.
                (isReady && readDbRef.current ? (
                  <MapTab db={readDbRef.current} />
                ) : (
                  <p>Select a save file above to get started.</p>
                ))}
              {activeSection === "settings" && <ComingSoonPlaceholder feature="Settings" />}
              {activeSection === "encyclopedia" && <EncyclopediaSection />}
              {isFactbook && encyclopediaTab === "countries" && (
                <StatusView
                  status={status}
                  db={readDbRef.current}
                  onResumeKeptSave={handleResumeKeptSave}
                  onDismissKeptSaveOffer={handleDismissKeptSaveOffer}
                />
              )}
              {isFactbook && encyclopediaTab === "wars" && (
                // Wars is save-wide, not nation-scoped (research.md-style
                // decision 2026-09-19 — see tabs.ts), so it only needs a
                // loaded save, not a selected nation. Reuses the same idle
                // wording StatusView's "idle" case uses, for consistency.
                isReady && readDbRef.current ? (
                  <WarsTab db={readDbRef.current} />
                ) : (
                  <p>Select a save file above to get started.</p>
                )
              )}
              {isFactbook && encyclopediaTab === "leaderboard" && (
                // Save-wide, not nation-scoped, same isReady + readDbRef.current
                // gate and idle wording as Wars/Map above.
                isReady && readDbRef.current ? (
                  <LeaderboardTab db={readDbRef.current} activeMetric={leaderboardMetric} />
                ) : (
                  <p>Select a save file above to get started.</p>
                )
              )}
              {isFactbook && encyclopediaTab === "characters" && (
                <ComingSoonPlaceholder feature="Characters" />
              )}
              {isFactbook && encyclopediaTab === "markets" && <ComingSoonPlaceholder feature="Markets" />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatusView({
  status,
  db,
  onResumeKeptSave,
  onDismissKeptSaveOffer,
}: {
  status: Status;
  db: SaveDatabase | null;
  onResumeKeptSave: (saveId: string) => void;
  onDismissKeptSaveOffer: () => void;
}) {
  switch (status.kind) {
    case "idle":
      return <p>Select a save file above to get started.</p>;
    case "kept-save-offer":
      return (
        <KeptSaveOffer
          summary={status.summary}
          onResume={() => onResumeKeptSave(status.summary.saveId)}
          onDismiss={onDismissKeptSaveOffer}
        />
      );
    case "resuming":
    case "validating":
    case "detecting-version":
    case "parsing":
    case "loading-overview":
      // Unreachable in practice: FileLoader's top-level render checks
      // isLoadingStatus() and renders the global LoadingCircle instead of
      // StatusView at all for every one of these kinds (see the render
      // function below) — kept here only so this switch stays exhaustive
      // over the full Status union.
      return null;
    case "ready":
      return db ? <ActiveTabContent status={status} db={db} /> : null;
    case "error":
      return <ErrorMessage kind={status.errorKind} message={status.message} />;
  }
}

function ActiveTabContent({ status, db }: { status: ReadyStatus; db: SaveDatabase }) {
  switch (status.activeTab) {
    case "overview":
      return <OverviewCard overview={status.overview} inGameDate={status.inGameDate} />;
    case "provinces":
      return <ProvincesTab db={db} nationIdx={status.selectedNationIdx} />;
    default: {
      // Military through Characters: each gets its own real tab component
      // in a later user story (US3-US9). Until then this is a bare,
      // deliberately temporary placeholder — not the app-level
      // ComingSoonPlaceholder (that's for NauticalBot/Map/Settings, whole
      // sections that are permanently unbuilt); these tabs vary by save
      // and will be filled in soon.
      const label = UNBUILT_TAB_LABELS[status.activeTab] ?? status.activeTab;
      return <p>{label} hasn't been implemented yet.</p>;
    }
  }
}

// Decision 2026-09-19: every one of these Status kinds means "a save is
// actively loading" — LoadingCircle takes over the whole main content
// area (regardless of which app section/tab is selected) for all of
// them, not just Countries (previously the only tab with any loading
// feedback at all; every other tab just showed its own "select a save"
// idle text while a load was clearly already in progress).
const LOADING_STATUS_KINDS = ["resuming", "validating", "detecting-version", "parsing", "loading-overview"] as const;

function isLoadingStatus(status: Status): boolean {
  return (LOADING_STATUS_KINDS as readonly string[]).includes(status.kind);
}

// Ordered, known milestones a normal load passes through ("resuming" a
// kept save is a separate, single-stage path with no phase breakdown at
// all, handled separately below). Overall percent = how many of these
// stages have been *reached* (a real, known event) plus how far real
// sub-progress has gotten within the current one — never a fabricated
// estimate of time remaining within a stage that reports no progress of
// its own (constitution Principle IV).
const LOADING_STAGE_ORDER = ["validating", "detecting-version", "parsing", "loading-overview"] as const;

function loadingLabel(status: Status): string {
  switch (status.kind) {
    case "resuming":
      return "Resuming kept save…";
    case "validating":
      return "Validating file…";
    case "detecting-version":
      return "Detecting game version…";
    case "parsing":
      return "Parsing save…";
    case "loading-overview":
      return "Loading overview…";
    default:
      return "";
  }
}

/** null only for "resuming" (no phase-progress events exist for that
 * path at all) — every other loading kind always resolves to a real
 * milestone-based number, per LOADING_STAGE_ORDER's doc comment. */
function computeLoadingPercent(status: Status): number | null {
  if (status.kind === "resuming") return null;
  const idx = LOADING_STAGE_ORDER.indexOf(status.kind as (typeof LOADING_STAGE_ORDER)[number]);
  if (idx === -1) return null;
  const withinStage =
    status.kind === "validating" && "percent" in status && status.percent !== null ? status.percent / 100 : 0;
  return ((idx + withinStage) / LOADING_STAGE_ORDER.length) * 100;
}

/** True whenever the current stage has no real sub-progress of its own
 * to show — i.e. always, except partway through "validating"'s real
 * byte-read progress — so LoadingCircle can add a gentle pulse instead
 * of looking frozen while a long stage (e.g. parsing a large save) with
 * no granular signal is genuinely still working. */
function isLoadingStagePulsing(status: Status): boolean {
  return !(status.kind === "validating" && "percent" in status && status.percent !== null);
}
