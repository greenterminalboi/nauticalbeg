// specs/006-country-leaderboard data-model.md: decoded, in-memory forms
// of `listLeaderboardCountriesArrow`/`listNationHistoryArrow`'s Arrow IPC
// results, plus the leading-zero-suppression rule (research.md §8)
// applied client-side rather than in SQL (contracts/leaderboard-data-
// contract.md).
import { tableFromIPC } from "apache-arrow";
import {
  listLatestNationMetricArrow,
  listLeaderboardCountriesArrow,
  listNationHistoryArrow,
  listRulerHistoryArrow,
} from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";

export interface LeaderboardCountry {
  idx: number;
  tag: string;
  name: string | null;
  color: [number, number, number] | null; // null → neutral fallback (spec FR-005)
  isHumanPlayed: boolean;
}

export type LeaderboardMetric = "population" | "tax_base" | "economical_base";

/** Post-ship, 2026-09-21: the Leaderboard side nav's full set of pages —
 * the three `nation_history`-backed metrics above, plus Ruler History,
 * a fundamentally different data shape (`ruler_history`, not
 * `nation_history`) that reuses the same side nav/page-switch UI. */
export type LeaderboardPage = LeaderboardMetric | "ruler_history";

export interface LeaderboardSeriesPoint {
  year: number;
  value: number;
}

/** Post-ship, 2026-09-21 (Ruler History stretch goal): one ruler term,
 * decoded from `listRulerHistoryArrow`. `score` is `adm + dip + mil`
 * (0-300) — `null`, never a fabricated partial sum, unless all three
 * are confirmed numbers (constitution Principle IV). */
export interface RulerHistoryPoint {
  /** Decimal year (e.g. `1337.86` for a reign starting 1337.11.11) —
   * for the chart's numeric x-axis; not calendar-precise, just enough
   * to place a reign-start within its year. */
  year: number;
  regnalNumber: number | null;
  /** Raw `character_db.first_name` localization key (e.g.
   * "name_birger"), not display text — resolve via
   * `rulerNames.ts`'s `resolveRulerFirstName`. */
  firstNameKey: string | null;
  /** Already real display text in the save when present (e.g.
   * "Ladulas"), never a localization key — unlike `firstNameKey`. */
  nickname: string | null;
  adm: number | null;
  dip: number | null;
  mil: number | null;
  score: number | null;
}

/** 'YYYY.M.D' (no zero-padding, matching the save's own date format,
 * `formatGameDate` in 1.3.11.ts) -> a decimal year for chart x-axis
 * positioning. Returns null for anything that doesn't match — never a
 * guessed year. */
function parseGameDateToDecimalYear(dateStr: string): number | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(dateStr);
  if (!match) return null;
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  return year + (month - 1) / 12 + (day - 1) / 365;
}

function rgbOrNull(r: unknown, g: unknown, b: unknown): [number, number, number] | null {
  return typeof r === "number" && typeof g === "number" && typeof b === "number"
    ? [r, g, b]
    : null;
}

// spec FR-008: on first open, pre-select every human-played country. If
// the save has no human-played country recorded at all, fall back to
// some other non-empty, meaningful default (an implementation choice
// per spec's Assumptions) — the first few countries in the already-
// loaded, alphabetically-sorted list, rather than issuing an extra
// save-wide history query just to rank by population (which would
// contradict listNationHistoryArrow's deliberately-scoped design,
// contracts/leaderboard-data-contract.md).
const FALLBACK_SELECTION_SIZE = 5;

/** Shared by `LeaderboardTab` and `RulerHistoryChart` (post-ship,
 * 2026-09-21) — both default their country selection the same way. */
export function computeDefaultSelection(countries: readonly LeaderboardCountry[]): number[] {
  const humanPlayed = countries.filter((c) => c.isHumanPlayed).map((c) => c.idx);
  if (humanPlayed.length > 0) return humanPlayed;
  return countries.slice(0, FALLBACK_SELECTION_SIZE).map((c) => c.idx);
}

/** Decodes `listLeaderboardCountriesArrow`'s Arrow IPC buffer directly
 * via `apache-arrow` (same direct-decode approach `mapLocationData.ts`
 * and `src/storage/db.ts` itself already use). Backs both the search
 * overlay's list and the default-selection computation
 * (`isHumanPlayed` rows). */
export async function loadLeaderboardCountries(db: SaveDatabase): Promise<LeaderboardCountry[]> {
  const buffer = await listLeaderboardCountriesArrow(db);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();

  return rows.map((row) => {
    const r = row.toJSON();
    return {
      idx: typeof r.idx === "number" ? r.idx : -1,
      tag: String(r.tag),
      name: typeof r.name === "string" ? r.name : null,
      color: rgbOrNull(r.color_r, r.color_g, r.color_b),
      isHumanPlayed: Number(r.is_human_played) === 1,
    };
  });
}

/** Removes a *leading* run of `value === 0` entries — years before a
 * country existed, not a real zero (research.md §8) — up to the first
 * non-zero entry. A zero appearing after the line has already started is
 * a real, confirmed value (a population crash, etc.) and is left alone.
 * Assumes `points` is already sorted ascending by `year` (guaranteed by
 * `listNationHistoryArrow`'s `ORDER BY ... year`). */
export function suppressLeadingZeros(
  points: readonly LeaderboardSeriesPoint[],
): LeaderboardSeriesPoint[] {
  const firstRealIndex = points.findIndex((p) => p.value !== 0);
  return firstRealIndex === -1 ? [] : points.slice(firstRealIndex);
}

/** Decodes `listNationHistoryArrow`'s Arrow IPC buffer into series
 * points grouped by `(nationIdx, metric)`, with leading-zero suppression
 * (above) already applied to each series. */
export async function loadNationHistory(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<Map<number, Map<LeaderboardMetric, LeaderboardSeriesPoint[]>>> {
  const buffer = await listNationHistoryArrow(db, nationIdxs);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();

  const byNation = new Map<number, Map<LeaderboardMetric, LeaderboardSeriesPoint[]>>();
  for (const row of rows) {
    const r = row.toJSON();
    const nationIdx = typeof r.nation_idx === "number" ? r.nation_idx : -1;
    const metric = r.metric as LeaderboardMetric;
    const point: LeaderboardSeriesPoint = {
      year: typeof r.year === "number" ? r.year : Number(r.year),
      value: typeof r.value === "number" ? r.value : Number(r.value),
    };

    let byMetric = byNation.get(nationIdx);
    if (!byMetric) {
      byMetric = new Map();
      byNation.set(nationIdx, byMetric);
    }
    const series = byMetric.get(metric);
    if (series) {
      series.push(point);
    } else {
      byMetric.set(metric, [point]);
    }
  }

  for (const byMetric of byNation.values()) {
    for (const [metric, series] of byMetric) {
      byMetric.set(metric, suppressLeadingZeros(series));
    }
  }
  return byNation;
}

/** Treemap stretch goal: decodes `listLatestNationMetricArrow`'s Arrow
 * IPC buffer into a `nationIdx -> latest value` map, one entry per
 * `country_type = 'Real'` country that has ever recorded a value for
 * `metric` (countries with none simply don't appear — never a
 * fabricated 0, constitution Principle IV). */
export async function loadLatestNationMetric(
  db: SaveDatabase,
  metric: LeaderboardMetric,
): Promise<Map<number, number>> {
  const buffer = await listLatestNationMetricArrow(db, metric);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();

  const byNation = new Map<number, number>();
  for (const row of rows) {
    const r = row.toJSON();
    const nationIdx = typeof r.nation_idx === "number" ? r.nation_idx : -1;
    const value = typeof r.value === "number" ? r.value : Number(r.value);
    byNation.set(nationIdx, value);
  }
  return byNation;
}

/** Post-ship, 2026-09-21 (Ruler History stretch goal): decodes
 * `listRulerHistoryArrow`'s Arrow IPC buffer into series points grouped
 * by nation, already in reign order (the query's own `ORDER BY
 * nation_idx, start_date`). A row whose `start_date` doesn't parse is
 * dropped rather than plotted at a guessed year. */
export async function loadRulerHistory(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<Map<number, RulerHistoryPoint[]>> {
  const buffer = await listRulerHistoryArrow(db, nationIdxs);
  const rows = tableFromIPC(new Uint8Array(buffer)).toArray();

  const byNation = new Map<number, RulerHistoryPoint[]>();
  for (const row of rows) {
    const r = row.toJSON();
    const nationIdx = typeof r.nation_idx === "number" ? r.nation_idx : -1;
    const year = parseGameDateToDecimalYear(String(r.start_date));
    if (year === null) continue;

    const adm = typeof r.adm === "number" ? r.adm : null;
    const dip = typeof r.dip === "number" ? r.dip : null;
    const mil = typeof r.mil === "number" ? r.mil : null;
    const point: RulerHistoryPoint = {
      year,
      regnalNumber: typeof r.regnal_number === "number" ? r.regnal_number : null,
      firstNameKey: typeof r.first_name_key === "string" ? r.first_name_key : null,
      nickname: typeof r.nickname === "string" ? r.nickname : null,
      adm,
      dip,
      mil,
      score: adm !== null && dip !== null && mil !== null ? adm + dip + mil : null,
    };

    const series = byNation.get(nationIdx);
    if (series) {
      series.push(point);
    } else {
      byNation.set(nationIdx, [point]);
    }
  }

  // The query's own `ORDER BY start_date` sorts that column as TEXT,
  // which is only *coincidentally* chronological — EU5's date strings
  // aren't zero-padded ("1400.2.1" vs "1400.12.1"), so two reigns
  // starting in the same year sort lexicographically ("1400.12.1" <
  // "1400.2.1", since '1' < '2') whenever one month/day is a longer
  // number than the other. Re-sorted here by the already-correctly-
  // parsed decimal `year` instead of trusting the SQL order — a real
  // bug found via a live save: an out-of-order pair inflated a nation's
  // weighted average (below) past 300, an impossible score.
  for (const series of byNation.values()) {
    series.sort((a, b) => a.year - b.year);
  }
  return byNation;
}
