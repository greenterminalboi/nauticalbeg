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
 *
 * `country_type = 'Real'` alone is NOT "currently exists" — confirmed
 * against a real save that it covers ~2,470 country slots, the
 * overwhelming majority long-defunct historical tags formed and
 * annexed centuries ago (the same finding `listLatestNationMetricArrow`
 * below was built around). "Exists" app-wide means also currently
 * owning territory (post-ship correction, 2026-09-21) — a real,
 * cheap-to-check fact (`EXISTS` against `locations.owner_idx`), not a
 * fabricated one.
 */
export async function listNations(db: SaveDatabase): Promise<NationSummary[]> {
  const rows = await queryRows(
    db,
    `SELECT idx, tag, name FROM nations
     WHERE country_type = 'Real'
       AND EXISTS (SELECT 1 FROM locations WHERE locations.owner_idx = nations.idx)
     ORDER BY COALESCE(name, tag)`,
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
 *
 * Deliberately NOT filtered by "currently exists" (unlike `listNations`/
 * `listLeaderboardCountriesArrow`, post-ship, 2026-09-21): a war is a
 * historical event, and its attacker/defender were real participants at
 * the time regardless of whether that tag has since been annexed —
 * hiding a since-defunct participant behind "Unknown" would make
 * genuine history less accurate, not more.
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

/**
 * specs/005-map-visualization: every location in the save, with
 * everything all four map layers need in one row — loaded once per save
 * (research.md §7/FR-017), not re-queried on every layer switch. Unlike
 * every other `list*` function here, this is save-wide (like
 * `listWarsArrow`), not scoped to a selected nation — the map shows
 * every country's territory at once.
 *
 * `idx` is the join key against the generated map geometry's decoded
 * `properties.idx` (research.md §1 — `locations.idx` was already this
 * table's primary key; no new column was needed). `name` is the save's
 * own rare rename-override field (present on well under 1% of real
 * locations) — kept for display as a secondary "known in-save as X" hint
 * where present, never used for joining; the geometry's own
 * `properties.name` (from the game's static `named_locations/*.txt`,
 * broadly populated) is the primary display name, read client-side
 * straight off the decoded feature rather than duplicated into this row.
 *
 * Two separate `LEFT JOIN`s to `nations` (once for `owner_idx`, once for
 * `controller_idx`, which can differ during occupation) mirror
 * `listWarsArrow`'s attacker/defender double-join, including its
 * `COALESCE(name, tag, 'Unknown')` display-name fallback. Population is
 * pre-aggregated per location in a subquery (`location_pops` joined to
 * `population`, summed) rather than a top-level `GROUP BY` across every
 * other selected column.
 *
 * `market_name` (post-ship correction, 2026-09-21, specs/011-atlas-map-
 * modes): joins `markets` then self-joins `locations` again (aliased
 * `market_center`) on `markets.center_location_idx`, reusing
 * `listMarketsArrow`'s exact `COALESCE(name, 'Location ' || idx, 'Market '
 * || idx)` fallback chain — the Location Market layer labels each market
 * by the real location it's centered on, not a bare numeric id.
 */
export async function listMapLocationsArrow(db: SaveDatabase): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       locations.idx as idx,
       locations.name as name,
       locations.owner_idx as owner_idx,
       owner.color_r as owner_color_r,
       owner.color_g as owner_color_g,
       owner.color_b as owner_color_b,
       COALESCE(owner.name, owner.tag, 'Unknown') as owner_name,
       locations.controller_idx as controller_idx,
       controller.color_r as controller_color_r,
       controller.color_g as controller_color_g,
       controller.color_b as controller_color_b,
       COALESCE(controller.name, controller.tag, 'Unknown') as controller_name,
       locations.control as control,
       locations.raw_material as raw_material,
       COALESCE(pop_totals.total_population, 0) as total_population,
       locations.development as development,
       locations.rank as rank,
       locations.market_idx as market_idx,
       COALESCE(market_center.name, 'Location ' || market_center.idx, 'Market ' || market.idx) as market_name,
       locations.possible_tax as possible_tax,
       locations.soldiers as soldiers,
       culture.name as culture_name,
       culture.color_r as culture_color_r,
       culture.color_g as culture_color_g,
       culture.color_b as culture_color_b,
       religion.name as religion_name,
       religion.color_r as religion_color_r,
       religion.color_g as religion_color_g,
       religion.color_b as religion_color_b
     FROM locations
     LEFT JOIN nations owner ON owner.idx = locations.owner_idx
     LEFT JOIN nations controller ON controller.idx = locations.controller_idx
     LEFT JOIN cultures culture ON culture.idx = locations.culture_idx
     LEFT JOIN religions religion ON religion.idx = locations.religion_idx
     LEFT JOIN markets market ON market.idx = locations.market_idx
     LEFT JOIN locations market_center ON market_center.idx = market.center_location_idx
     LEFT JOIN (
       SELECT location_pops.location_idx as location_idx,
              SUM(population.size) as total_population
       FROM location_pops
       JOIN population ON population.idx = location_pops.pop_idx
       GROUP BY location_pops.location_idx
     ) pop_totals ON pop_totals.location_idx = locations.idx
     ORDER BY locations.idx`,
  );
}

/**
 * specs/006-country-leaderboard: every selectable country for the
 * Leaderboard's search overlay and default-selection computation. Same
 * "currently exists" filter as `listNations` (above) — `country_type =
 * 'Real'` AND currently owns territory (post-ship correction,
 * 2026-09-21: the search overlay previously let a user search/select
 * from ~2,470 mostly-defunct historical tags, only 265 of which
 * actually exist right now) — extended with the three color columns
 * (already on `nations` since feature 005) and the new
 * `is_human_played` flag (research.md §5/§6). Save-wide, like
 * `listWarsArrow`/`listMapLocationsArrow` — not scoped to a selected
 * nation.
 */
export async function listLeaderboardCountriesArrow(db: SaveDatabase): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       idx,
       tag,
       name,
       color_r,
       color_g,
       color_b,
       is_human_played
     FROM nations
     WHERE country_type = 'Real'
       AND EXISTS (SELECT 1 FROM locations WHERE locations.owner_idx = nations.idx)
     ORDER BY COALESCE(name, tag)`,
  );
}

/**
 * specs/006-country-leaderboard: one row per `(nation, year, metric)`
 * for exactly the requested countries — deliberately **not** a
 * load-everything-once query like `listMapLocationsArrow` (contract's
 * own note: `nation_history` can be a few-million-row table across a
 * whole save, so this is re-queried each time the Leaderboard's
 * selected-country set changes, scoped down every time). Returns every
 * row including leading zeros — leading-zero suppression (research.md
 * §8) is applied client-side by `leaderboardData.ts`, not here.
 */
export async function listNationHistoryArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer> {
  if (nationIdxs.length === 0) {
    return queryArrowIPC(
      db,
      "SELECT nation_idx, year, metric, value FROM nation_history WHERE FALSE",
    );
  }
  const placeholders = nationIdxs.map((_, i) => `?${i + 1}`).join(", ");
  return queryArrowIPC(
    db,
    `SELECT nation_idx, year, metric, value
     FROM nation_history
     WHERE nation_idx IN (${placeholders})
     ORDER BY nation_idx, metric, year`,
    nationIdxs,
  );
}

/**
 * specs/006-country-leaderboard treemap stretch goal: one row per
 * currently-existing `country_type = 'Real'` country with its most-
 * recently-recorded value for `metric` — the "world total" the
 * treemap's box areas are shares of. "Currently existing" is checked
 * directly, not assumed from `country_type = 'Real'` alone: that flag
 * covers ~2,467 of ~2,470 country slots in a real save (research.md
 * §4) — the overwhelming majority of which are historical/defunct tags
 * that formed and were annexed centuries ago, still carrying a stale
 * `historical_*` value from whenever they were last alive rather than
 * a real current one. Per direct product correction, "actually exist"
 * means *currently owns at least one location* (`EXISTS` against
 * `locations.owner_idx`) — the same territory-ownership signal feature
 * 005's map already treats as authoritative for "is this country
 * alive," reused here rather than invented fresh. Deliberately a
 * SEPARATE, cheap query rather than reusing `listNationHistoryArrow`
 * against every real country's full history (which would load up to
 * ~2.1M rows just to find one value each, contradicting that
 * function's own deliberately-scoped design). Uses DuckDB's
 * `arg_max(value, year)` aggregate to get each country's value at its
 * own latest year in one pass, no self-join needed.
 */
export async function listLatestNationMetricArrow(
  db: SaveDatabase,
  metric: string,
): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       nation_history.nation_idx as nation_idx,
       arg_max(nation_history.value, nation_history.year) as value
     FROM nation_history
     JOIN nations ON nations.idx = nation_history.nation_idx
     WHERE nation_history.metric = ?1
       AND nations.country_type = 'Real'
       AND EXISTS (SELECT 1 FROM locations WHERE locations.owner_idx = nations.idx)
     GROUP BY nation_history.nation_idx`,
    [metric],
  );
}

/**
 * specs/010-societal-values-compass: one row per (nation_idx, axis,
 * value) for every currently-applicable Societal Value axis of every
 * real, currently-existing country. A missing row for a given
 * (nation_idx, axis) pair means "not applicable" — callers MUST NOT
 * default a missing axis to 0 (spec FR-005). Same country_type='Real' +
 * locations-liveness filter as `listLatestNationMetricArrow` above.
 */
export async function listSocietalValuesArrow(db: SaveDatabase): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       nation_societal_values.nation_idx as nation_idx,
       nation_societal_values.axis as axis,
       nation_societal_values.value as value
     FROM nation_societal_values
     JOIN nations ON nations.idx = nation_societal_values.nation_idx
     WHERE nations.country_type = 'Real'
       AND EXISTS (SELECT 1 FROM locations WHERE locations.owner_idx = nations.idx)`,
  );
}

/**
 * specs/006-country-leaderboard, post-ship 2026-09-21 (Ruler History
 * stretch goal): one row per ruler term for exactly the requested
 * countries, in reign order — same deliberately-scoped-per-call shape
 * as `listNationHistoryArrow`, for the same reason (never load every
 * country's whole ruler history just to chart a handful of player
 * nations).
 */
export async function listRulerHistoryArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer> {
  if (nationIdxs.length === 0) {
    return queryArrowIPC(
      db,
      "SELECT nation_idx, start_date, regnal_number, first_name_key, nickname, adm, dip, mil FROM ruler_history WHERE FALSE",
    );
  }
  const placeholders = nationIdxs.map((_, i) => `?${i + 1}`).join(", ");
  return queryArrowIPC(
    db,
    `SELECT nation_idx, start_date, regnal_number, first_name_key, nickname, adm, dip, mil
     FROM ruler_history
     WHERE nation_idx IN (${placeholders})
     ORDER BY nation_idx, start_date`,
    nationIdxs,
  );
}

/**
 * specs/007-production-trade-markets contracts/query-functions.md:
 * every tradeable good's save-wide total production, straight from the
 * save's own snapshot (`world_good_production`) — never summed
 * client-side from `market_goods`. Feeds `WorldGoodsOverview` (User
 * Story 1); no params, save-wide and unfiltered.
 *
 * specs/009-world-goods-production contracts/query-functions.md:
 * `has_production_coverage` is derived from whether this good appears
 * in `province_good_production` at all — never a hardcoded list of
 * covered goods (research.md's resolved decision).
 */
export async function listWorldGoodsArrow(db: SaveDatabase): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       world_good_production.good AS good,
       world_good_production.total AS total,
       EXISTS (
         SELECT 1 FROM province_good_production
         WHERE province_good_production.good = world_good_production.good
       ) AS has_production_coverage
     FROM world_good_production
     ORDER BY good`,
  );
}

/**
 * specs/009-world-goods-production contracts/query-functions.md: one
 * good's production summed by owning country (`provinces.owner_idx`,
 * which can be NULL for an unowned province) — deliberately no join to
 * `nations`; `WorldGoodsPage.tsx` joins against the already-loaded
 * `loadLeaderboardCountries` result client-side, bucketing anything not
 * found there (NULL, or a non-`country_type = 'Real'` owner) into one
 * "Unattributed" entry, mirroring `LeaderboardTab.tsx`'s existing
 * Other-bucket pattern (research.md's resolved decision).
 */
export async function listGoodProductionByOwnerArrow(
  db: SaveDatabase,
  good: string,
): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       provinces.owner_idx AS owner_idx,
       SUM(province_good_production.amount) AS amount
     FROM province_good_production
     JOIN provinces ON provinces.idx = province_good_production.province_idx
     WHERE province_good_production.good = ?1
     GROUP BY provinces.owner_idx`,
    [good],
  );
}

/**
 * specs/007-production-trade-markets contracts/query-functions.md
 * (renamed/re-owned post-ship, 2026-09-21): one row per market, named
 * from its center **location**, not its province — `locations.name`
 * (the save's own `metadata.compatibility.locations` array, broadly
 * populated, e.g. "stockholm") rather than the province's raw
 * `province_definition` key, per direct request that a market's
 * identity not be tied to a province at all. Falls back to `'Location '
 * || idx` for a location with no confirmed name, and `'Market ' || idx`
 * for the edge case where a market has no resolvable `center` at all —
 * never a fabricated name. Also surfaces the current owner of that
 * center location (the market's own "owner"), the same
 * `COALESCE(name, tag, 'Unknown')` display-name fallback
 * `listWarsArrow`/`listMapLocationsArrow` already use — shown as
 * whoever currently holds the location, not filtered to
 * `country_type = 'Real'`, since a Pirate- or rebel-held market center
 * is still a real, confirmed fact worth showing, not something to hide.
 * Feeds `MarketList` (User Story 1).
 */
export async function listMarketsArrow(db: SaveDatabase): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       markets.idx as idx,
       COALESCE(locations.name, 'Location ' || locations.idx, 'Market ' || markets.idx) as name,
       markets.member_count as member_count,
       markets.capacity as capacity,
       locations.owner_idx as owner_idx,
       COALESCE(owner.name, owner.tag, 'Unknown') as owner_name,
       owner.color_r as owner_color_r,
       owner.color_g as owner_color_g,
       owner.color_b as owner_color_b
     FROM markets
     LEFT JOIN locations ON locations.idx = markets.center_location_idx
     LEFT JOIN nations owner ON owner.idx = locations.owner_idx
     ORDER BY markets.idx`,
  );
}

/**
 * specs/007-production-trade-markets contracts/query-functions.md: the
 * full per-good breakdown for one market — only goods that market
 * actually trades (a market with no `market_goods` rows at all returns
 * an empty result, not a zero-filled one, per FR-006). Feeds
 * `MarketGoodsTable` (User Story 2).
 */
export async function listMarketGoodsArrow(
  db: SaveDatabase,
  marketIdx: number,
): Promise<ArrayBuffer> {
  return queryArrowIPC(
    db,
    `SELECT
       good, price, supply, demand, stockpile, is_importing, is_exporting,
       supply_raw_materials, supply_buildings, supply_trade,
       demand_population, demand_trade, demand_building_upkeep,
       demand_unit_upkeep, demand_construction
     FROM market_goods
     WHERE market_idx = ?1
     ORDER BY good`,
    [marketIdx],
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
