// The UI-facing read interface for a loaded save. See
// specs/001-save-import-overview/contracts/data-access-contract.md for the
// contract this implements — signatures here must keep matching it.
//
// Note on the contract: each function here takes an already-open
// `SaveDatabase` (from `openSaveDatabase`) rather than a raw `saveId` as
// the contract doc originally sketched — a typical caller needs several
// of these queries against the same save and shouldn't reopen the
// connection for each one. The contract doc has been updated to match.
import {
  closeSaveDatabase,
  deleteSaveDatabase,
  execSql,
  openSaveDatabase,
  queryArrowIPC,
  queryRows,
  type SaveDatabase,
} from "./db";

export interface SaveMeta {
  filename: string;
  detectedVersion: string | null;
  inGameDate: string | null;
  kept: boolean;
}

export interface NationOverview {
  idx: number;
  tag: string;
  name: string;
  treasury: number;
  stability: number;
  governmentType: string;
  atWar: boolean;
  totalDevelopment: number;
  provinceCount: number;
  /** Field names in this object that are computed/aggregated rather than
   * read directly from a single save field (constitution Principle IV /
   * spec FR-007). The UI must visually distinguish these. */
  derived: Set<keyof NationOverview>;
}

/** One entry in the FR-015 nation selector. */
export interface NationSummary {
  idx: number;
  tag: string;
  name: string;
}

export interface KeptSaveSummary {
  saveId: string;
  filename: string;
  inGameDate: string | null;
}

export async function getSaveMeta(db: SaveDatabase): Promise<SaveMeta> {
  const rows = await queryRows(
    db,
    "SELECT filename, detected_version, in_game_date, kept FROM save_meta LIMIT 1",
  );
  const row = rows[0];
  if (!row) {
    throw new Error(
      "save_meta has no row — was the adapter's parseAndStore ever run against this database?",
    );
  }
  return {
    filename: String(row.filename),
    detectedVersion: row.detected_version === null ? null : String(row.detected_version),
    inGameDate: row.in_game_date === null ? null : String(row.in_game_date),
    kept: Boolean(row.kept),
  };
}

/**
 * FR-015: the same overview shape as `getPlayerNationOverview`, but for
 * any real nation by index — the generalized query the nation selector
 * (and, per FR-015's note, future selectable views) is built on.
 * `getPlayerNationOverview` is now a thin wrapper around this.
 */
export async function getNationOverview(
  db: SaveDatabase,
  nationIdx: number,
): Promise<NationOverview> {
  const nationRows = await queryRows(
    db,
    "SELECT idx, tag, name, treasury, stability, government_type FROM nations WHERE idx = ?1 LIMIT 1",
    [nationIdx],
  );
  const nation = nationRows[0];
  if (!nation) {
    throw new Error(`No nation found with idx ${nationIdx}`);
  }
  const idx = Number(nation.idx);

  // Total development / province count: per data-model.md, "province
  // count" is really a location count — see that doc for why.
  const [aggRow] = await queryRows(
    db,
    "SELECT SUM(development) as total_dev, COUNT(*) as loc_count FROM locations WHERE owner_idx = ?1",
    [idx],
  );
  const totalDevelopment = Number(aggRow?.total_dev ?? 0);
  const provinceCount = Number(aggRow?.loc_count ?? 0);

  const [warRow] = await queryRows(
    db,
    "SELECT EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = ?1 AND status = 'Active') as at_war",
    [idx],
  );
  const atWar = Number(warRow?.at_war ?? 0) === 1;

  return {
    idx,
    tag: String(nation.tag),
    // Falls back to the tag if a display name somehow wasn't set (true
    // for every non-player nation — see listNations's doc comment, and
    // for the player if metadata.player_country_name was missing) —
    // better than crashing the overview over a cosmetic gap.
    name: nation.name === null ? String(nation.tag) : String(nation.name),
    treasury: Number(nation.treasury ?? 0),
    stability: Number(nation.stability ?? 0),
    governmentType: nation.government_type === null ? "" : String(nation.government_type),
    atWar,
    totalDevelopment,
    provinceCount,
    derived: new Set(["atWar", "totalDevelopment", "provinceCount"]),
  };
}

export async function getPlayerNationOverview(db: SaveDatabase): Promise<NationOverview> {
  const [playerRow] = await queryRows(
    db,
    "SELECT idx FROM nations WHERE is_player = 1 LIMIT 1",
  );
  if (!playerRow) {
    throw new Error(
      "No player nation found in this save (is_player was never set to 1)",
    );
  }
  return getNationOverview(db, Number(playerRow.idx));
}

/**
 * FR-015: every real (non-rebel/pirate/mercenary — see
 * research-save-format.md's `country_type` note) nation in the save, for
 * the nation selector. Most nations only ever get a `tag` (e.g. "FRA"),
 * never a display `name` — the save only records a human-readable name
 * for the player's own nation (see version-adapters/1.3.11.ts) — so this
 * falls back to the tag the same way `getNationOverview` does.
 */
export async function listNations(db: SaveDatabase): Promise<NationSummary[]> {
  const rows = await queryRows(
    db,
    "SELECT idx, tag, name FROM nations WHERE country_type = 'Real' ORDER BY COALESCE(name, tag)",
  );
  return rows.map((row) => ({
    idx: Number(row.idx),
    tag: String(row.tag),
    name: row.name === null ? String(row.tag) : String(row.name),
  }));
}

// Only one save may be kept at a time (Assumptions). Each save's SQLite
// database is its own separate OPFS file named by saveId, so there's no
// single place to enumerate "which one is kept" without scanning OPFS —
// this tiny localStorage pointer is that index. The database's own
// `save_meta.kept` column (set alongside this pointer) remains the
// source of truth for any code that already has the database open;
// this pointer only exists so `listKeptSave()` can answer without
// opening anything.
const KEPT_SAVE_POINTER_KEY = "nauticalbeg.keptSave";

function readKeptSavePointer(): KeptSaveSummary | null {
  try {
    const raw = localStorage.getItem(KEPT_SAVE_POINTER_KEY);
    return raw === null ? null : (JSON.parse(raw) as KeptSaveSummary);
  } catch {
    return null;
  }
}

function writeKeptSavePointer(pointer: KeptSaveSummary | null): void {
  if (pointer === null) {
    localStorage.removeItem(KEPT_SAVE_POINTER_KEY);
  } else {
    localStorage.setItem(KEPT_SAVE_POINTER_KEY, JSON.stringify(pointer));
  }
}

/**
 * The SQL-only half of "keep" (FR-011): sets `save_meta.kept = 1` and
 * returns enough to record the kept-save pointer afterward.
 *
 * Kept separate from `recordKeptSave` (rather than combined directly
 * into `keepSave`) purely to preserve FR-014's ordering guarantee — see
 * that function's doc comment — not because of any thread restriction:
 * as of the 2026-09-18 DuckDB migration, both halves run on the main
 * thread (DuckDB has no SQLite-style "writes must come from a dedicated
 * Worker" restriction), so `keepSave` below is the real production path,
 * not just a same-thread test convenience.
 */
export async function markSaveKept(
  db: SaveDatabase,
  saveId: string,
): Promise<KeptSaveSummary> {
  await execSql(db, "UPDATE save_meta SET kept = 1");
  // `db.ts`'s `closeSaveDatabase` also checkpoints, but this connection
  // stays open for the rest of the session (FileLoader.tsx's
  // `readDbRef`) — confirmed by a real failure: without checkpointing
  // here too, "kept" silently reverted to false after a page reload,
  // even though the save's actual data (checkpointed by the parsing
  // Worker's close) survived correctly. A write the app cares about
  // surviving a reload must checkpoint right after itself, not wait for
  // a close that may not happen until much later, if ever.
  await execSql(db, "CHECKPOINT");
  const meta = await getSaveMeta(db);
  return { saveId, filename: meta.filename, inGameDate: meta.inGameDate };
}

/**
 * The `localStorage`-pointer half of "keep" (FR-011). Replaces any
 * previously kept save, since only one may be kept at a time
 * (Assumptions).
 *
 * FR-014: callers must only invoke this *after* `markSaveKept`'s write
 * has already succeeded — that ordering is what keeps a write failure
 * (most notably a storage-quota error) from ever corrupting or deleting
 * an existing valid kept save; this function itself doesn't re-check
 * that ordering, so keep it that way at the call sites (`keepSave` below
 * is the only production caller, and already does this correctly).
 */
export async function recordKeptSave(summary: KeptSaveSummary): Promise<void> {
  const previous = readKeptSavePointer();
  if (previous && previous.saveId !== summary.saveId) {
    await deleteSaveDatabase(previous.saveId);
  }
  writeKeptSavePointer(summary);
}

/**
 * FR-011/FR-014: marks `saveId` kept, surfacing a clear, storage-quota-
 * aware error rather than a raw exception. Called directly by
 * `FileLoader.tsx`'s `KeepSaveToggle` handler on the main thread — no
 * worker round-trip needed (see `markSaveKept`'s doc comment).
 */
export async function keepSave(db: SaveDatabase, saveId: string): Promise<void> {
  try {
    const summary = await markSaveKept(db, saveId);
    await recordKeptSave(summary);
  } catch (err) {
    if (isQuotaExceeded(err)) {
      throw new Error("Not enough storage space is available to keep this save.");
    }
    throw err;
  }
}

function isQuotaExceeded(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "QuotaExceededError") return true;
  return err instanceof Error && /quota/i.test(err.message);
}

/** Deletes the OPFS database for a previously kept save (FR-013). */
export async function forgetKeptSave(saveId: string): Promise<void> {
  await deleteSaveDatabase(saveId);
  const current = readKeptSavePointer();
  if (current?.saveId === saveId) {
    writeKeptSavePointer(null);
  }
}

/**
 * FR-004 (Provinces tab): reuses 001's existing `locations`/`provinces`
 * tables verbatim — no new schema (data-model.md's "Provinces tab: no
 * new schema" section). `locations` itself has no `name` column (see
 * `schema.sql`), so the display name comes from `provinces.name` (the
 * adapter's `province_definition` string) via a join on `province_idx`,
 * falling back to a synthetic label if a location has no matching
 * province row (the `COALESCE`) — corrected against the real schema
 * during US2 implementation (contracts/tab-data-contract.md has the
 * note).
 *
 * Returns every one of the nation's provinces as a single Arrow IPC
 * buffer (decision 2026-09-18: table tabs render via Perspective, whose
 * `<perspective-viewer>` virtualizes and paginates rows itself — no
 * `LIMIT`/`OFFSET` needed here, unlike the plain-HTML-table version this
 * replaced).
 */
export async function listProvincesArrow(db: SaveDatabase, nationIdx: number): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT locations.idx as idx,
            COALESCE(provinces.name, 'Location ' || locations.idx) as name,
            locations.development as development
     FROM locations
     LEFT JOIN provinces ON provinces.idx = locations.province_idx
     WHERE locations.owner_idx = ?1
     ORDER BY locations.idx`,
    [nationIdx],
  );
}

/**
 * Encyclopedia's Wars tab: every war in the save (not scoped to a
 * selected nation — a war belongs to no single country, per the
 * decision to make "Wars" a peer of "Countries," not nested under it).
 * `attacker`/`defender` are display names joined from `nations`
 * (falling back tag -> "Unknown" the same way `listNations` does, since
 * most non-player nations have no `name` set). `is_ongoing` is computed
 * here rather than stored (`schema.sql`'s `wars.end_date IS NULL`
 * already says the same thing unambiguously).
 */
export async function listWarsArrow(db: SaveDatabase): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       wars.idx as idx,
       COALESCE(attacker.name, attacker.tag, 'Unknown') as attacker,
       COALESCE(defender.name, defender.tag, 'Unknown') as defender,
       wars.start_date as start_date,
       wars.end_date as end_date,
       (wars.end_date IS NULL) as is_ongoing,
       wars.duration_days as duration_days,
       wars.attacker_score as attacker_score,
       wars.defender_score as defender_score,
       wars.attacker_casualties as attacker_casualties,
       wars.defender_casualties as defender_casualties,
       wars.war_name_key as war_type
     FROM wars
     LEFT JOIN nations attacker ON attacker.idx = wars.attacker_idx
     LEFT JOIN nations defender ON defender.idx = wars.defender_idx
     ORDER BY wars.start_date DESC`,
  );
}

/** Used on app start to offer resuming a kept save (Acceptance Scenario 2). */
export async function listKeptSave(): Promise<KeptSaveSummary | null> {
  return readKeptSavePointer();
}

/**
 * Deletes `saveId`'s OPFS database unless it has been kept — the
 * FR-005/FR-012 default that a loaded save is retained only for the
 * current session, not forever. Called (a) when a new load supersedes a
 * previous ready one (`worker.ts`) and (b) on session teardown
 * (`FileLoader.tsx`'s `beforeunload` handler). Opens the database itself
 * since callers at both sites only have a saveId, not an open handle, by
 * the time this runs.
 *
 * Idempotent: if `saveId` was already removed (most commonly, the user
 * explicitly forgot this exact save via `forgetKeptSave` earlier in the
 * same session — confirmed reachable via `beforeunload` after doing
 * that), opening it fails and there's nothing left to clean up. That's
 * not an error case here, just a no-op.
 */
export async function cleanupSaveIfNotKept(saveId: string): Promise<void> {
  let db: SaveDatabase;
  try {
    db = await openSaveDatabase(saveId);
  } catch {
    return;
  }
  let kept: boolean;
  try {
    kept = (await getSaveMeta(db)).kept;
  } finally {
    await closeSaveDatabase(db);
  }
  if (!kept) {
    await deleteSaveDatabase(saveId);
  }
}
