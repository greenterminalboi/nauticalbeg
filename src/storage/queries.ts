// The UI-facing read interface for a loaded save. See
// specs/001-save-import-overview/contracts/data-access-contract.md for the
// contract this implements — signatures here must keep matching it.
//
// Note on the contract: each function here takes an already-open
// `SaveDatabase` (from `openSaveDatabase`) rather than a raw `saveId` as
// the contract doc originally sketched — a typical caller needs several
// of these queries against the same save and shouldn't reopen the
// connection for each one. The contract doc has been updated to match.
import { queryRows, type SaveDatabase } from "./db";

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

export async function keepSave(_db: SaveDatabase, _saveId: string): Promise<void> {
  throw new Error("Not implemented — see tasks.md T034 (User Story 4)");
}

export async function forgetKeptSave(_saveId: string): Promise<void> {
  throw new Error("Not implemented — see tasks.md T034 (User Story 4)");
}

export async function listKeptSave(): Promise<KeptSaveSummary | null> {
  throw new Error("Not implemented — see tasks.md T034 (User Story 4)");
}
