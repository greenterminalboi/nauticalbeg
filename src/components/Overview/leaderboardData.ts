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

export interface LeaderboardSeriesPoint {
  year: number;
  value: number;
}

function rgbOrNull(r: unknown, g: unknown, b: unknown): [number, number, number] | null {
  return typeof r === "number" && typeof g === "number" && typeof b === "number"
    ? [r, g, b]
    : null;
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
