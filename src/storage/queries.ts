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
  openSaveDatabase,
  queryRows,
  type SaveDatabase,
} from "./db";

export interface SaveMeta {
  filename: string;
  detectedVersion: string | null;
  inGameDate: string | null;
  kept: boolean;
}

export interface PlayerNationOverview {
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
  derived: Set<keyof PlayerNationOverview>;
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

export async function getPlayerNationOverview(
  db: SaveDatabase,
): Promise<PlayerNationOverview> {
  const nationRows = await queryRows(
    db,
    "SELECT idx, tag, name, treasury, stability, government_type FROM nations WHERE is_player = 1 LIMIT 1",
  );
  const nation = nationRows[0];
  if (!nation) {
    throw new Error(
      "No player nation found in this save (is_player was never set to 1)",
    );
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
    tag: String(nation.tag),
    // Falls back to the tag if a display name somehow wasn't set (only
    // possible if metadata.player_country_name itself was missing) —
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
 * Marks `saveId` as kept (FR-011), replacing any previously kept save —
 * only one may be kept at a time (Assumptions), so the previous kept
 * save's database is deleted. Storage-quota handling (FR-014) is left to
 * T036.
 */
export async function keepSave(db: SaveDatabase, saveId: string): Promise<void> {
  const previous = readKeptSavePointer();
  if (previous && previous.saveId !== saveId) {
    await deleteSaveDatabase(previous.saveId);
  }
  await db.sqlite3.exec(db.handle, "UPDATE save_meta SET kept = 1");
  const meta = await getSaveMeta(db);
  writeKeptSavePointer({
    saveId,
    filename: meta.filename,
    inGameDate: meta.inGameDate,
  });
}

/** Deletes the OPFS database for a previously kept save (FR-013). */
export async function forgetKeptSave(saveId: string): Promise<void> {
  await deleteSaveDatabase(saveId);
  const current = readKeptSavePointer();
  if (current?.saveId === saveId) {
    writeKeptSavePointer(null);
  }
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
 */
export async function cleanupSaveIfNotKept(
  saveId: string,
  vfsName?: string,
): Promise<void> {
  const db = await openSaveDatabase(saveId, vfsName, { readonly: true });
  let kept: boolean;
  try {
    kept = (await getSaveMeta(db)).kept;
  } finally {
    await closeSaveDatabase(db);
  }
  if (!kept) {
    await deleteSaveDatabase(saveId, vfsName);
  }
}
