// specs/012-firepower-tab: decodes Army/Navy Stats' Arrow IPC query
// results into the plain row shapes armyNavyStats.ts's compute functions
// take — same direct-decode-via-apache-arrow pattern societalValuesData.ts
// and marketData.ts already use.
import { tableFromIPC } from "apache-arrow";
import type { SaveDatabase } from "../../storage/db";
import {
  listNationAdvanceNamesArrow,
  listNationGovernanceSourcesArrow,
  listNationMilitaryScalarsArrow,
  listNavyDamageArrow,
  listRegimentSummaryArrow,
} from "../../storage/queries";
import {
  computeArmyStats,
  computeNavyStats,
  type ArmyStatSummary,
  type NationDamageRow,
  type NationMilitaryScalars,
  type NationRegimentSummaryRow,
  type NationSocietalValueRow,
  type NationSourceRow,
  type NavyStatSummary,
} from "./armyNavyStats";
import type { LeaderboardCountry } from "./leaderboardData";
import type { MilitaryDoctrineAxis, MilitaryDoctrinePoint } from "./MilitaryDoctrineChart";

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : Number(value);
}

function asNumberOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

export async function loadRegimentSummary(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<NationRegimentSummaryRow[]> {
  const rows = decodeRows(await listRegimentSummaryArrow(db, nationIdxs));
  return rows.map((r) => ({
    nationIdx: asNumber(r.nation_idx),
    unitType: String(r.unit_type),
    regimentCount: asNumber(r.regiment_count),
    totalNumber: asNumber(r.total_number),
    avgMorale: asNumberOrNull(r.avg_morale),
  }));
}

export async function loadAdvanceSources(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<NationSourceRow[]> {
  const rows = decodeRows(await listNationAdvanceNamesArrow(db, nationIdxs));
  return rows.map((r) => ({
    nationIdx: asNumber(r.nation_idx),
    sourceKind: "advance" as const,
    sourceName: String(r.advance),
  }));
}

export async function loadGovernanceSources(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<NationSourceRow[]> {
  const rows = decodeRows(await listNationGovernanceSourcesArrow(db, nationIdxs));
  return rows.map((r) => ({
    nationIdx: asNumber(r.nation_idx),
    sourceKind: r.source_kind as "reform" | "privilege" | "law",
    sourceName: String(r.source_name),
  }));
}

export async function loadNavyDamage(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<NationDamageRow[]> {
  const rows = decodeRows(await listNavyDamageArrow(db, nationIdxs));
  return rows.map((r) => ({
    nationIdx: asNumber(r.nation_idx),
    direction: r.direction as "given" | "taken",
    totalDamage: asNumber(r.total_damage),
  }));
}

export async function loadMilitaryScalars(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<NationMilitaryScalars[]> {
  const rows = decodeRows(await listNationMilitaryScalarsArrow(db, nationIdxs));
  return rows.map((r) => ({
    nationIdx: asNumber(r.nation_idx),
    manpower: asNumberOrNull(r.manpower),
    sailors: asNumberOrNull(r.sailors),
    monthlyManpower: asNumberOrNull(r.monthly_manpower),
    monthlySailors: asNumberOrNull(r.monthly_sailors),
    armyTradition: asNumberOrNull(r.army_tradition),
    navyTradition: asNumberOrNull(r.navy_tradition),
    lastMonthsArmyMaintenance: asNumberOrNull(r.last_months_army_maintenance),
    lastMonthsNavyMaintenance: asNumberOrNull(r.last_months_navy_maintenance),
  }));
}

// ---------------------------------------------------------------------
// specs/018-country-factbook-tabs research.md R11: the per-nation military
// assembly Firepower used to do inline, shared with the Countries tab's
// Military view so the two always show the same numbers.
// ---------------------------------------------------------------------

export interface NationIdentity {
  tag: string;
  name: string;
  colorRgb: [number, number, number] | null;
}

export type ArmyProfile = ArmyStatSummary & NationIdentity;
export type NavyProfile = NavyStatSummary & NationIdentity;

const MILITARY_DOCTRINE_AXES: MilitaryDoctrineAxis[] = ["land_vs_naval", "offensive_vs_defensive", "quality_vs_quantity"];

/** Flattens per-nation societal value readings into the row shape
 * computeArmyStats takes. */
export function toSocietalValueRows(axisReadings: Map<number, { axis: string; value: number }[]>): NationSocietalValueRow[] {
  const rows: NationSocietalValueRow[] = [];
  for (const [nationIdx, readings] of axisReadings) {
    for (const reading of readings) rows.push({ nationIdx, axis: reading.axis, value: reading.value });
  }
  return rows;
}

/** Attaches tag/name/color; a nation missing from `countries` is dropped. */
function withIdentity<T extends { nationIdx: number }>(
  summaries: T[],
  countries: readonly LeaderboardCountry[],
): Array<T & NationIdentity> {
  const byIdx = new Map(countries.map((c) => [c.idx, c]));
  return summaries.flatMap((summary) => {
    const country = byIdx.get(summary.nationIdx);
    return country ? [{ ...summary, tag: country.tag, name: country.name ?? country.tag, colorRgb: country.color }] : [];
  });
}

export async function loadArmyProfiles(
  db: SaveDatabase,
  nationIdxs: readonly number[],
  countries: readonly LeaderboardCountry[],
  societalValueRows: readonly NationSocietalValueRow[],
): Promise<ArmyProfile[]> {
  const [regimentRows, advanceRows, governanceRows, scalarRows] = await Promise.all([
    loadRegimentSummary(db, nationIdxs),
    loadAdvanceSources(db, nationIdxs),
    loadGovernanceSources(db, nationIdxs),
    loadMilitaryScalars(db, nationIdxs),
  ]);
  return withIdentity(
    computeArmyStats(regimentRows, advanceRows, governanceRows, [...societalValueRows], scalarRows),
    countries,
  );
}

/** Deliberately independent of the army load (never reads reforms,
 * privileges or laws), so navy numbers still show if that one fails. */
export async function loadNavyProfiles(
  db: SaveDatabase,
  nationIdxs: readonly number[],
  countries: readonly LeaderboardCountry[],
): Promise<NavyProfile[]> {
  const [regimentRows, advanceRows, scalarRows, damageRows] = await Promise.all([
    loadRegimentSummary(db, nationIdxs),
    loadAdvanceSources(db, nationIdxs),
    loadMilitaryScalars(db, nationIdxs),
    loadNavyDamage(db, nationIdxs),
  ]);
  return withIdentity(computeNavyStats(regimentRows, advanceRows, scalarRows, damageRows), countries);
}

/** One doctrine point per nation. A nation with none of the three
 * military-doctrine axes is left out, never plotted at a fabricated
 * centrist position. */
export function buildDoctrinePoints(
  nationIdxs: readonly number[],
  countries: readonly LeaderboardCountry[],
  axisReadings: Map<number, { axis: string; value: number }[]>,
): MilitaryDoctrinePoint[] {
  const byIdx = new Map(countries.map((c) => [c.idx, c]));
  const points: MilitaryDoctrinePoint[] = [];
  for (const idx of nationIdxs) {
    const country = byIdx.get(idx);
    if (!country) continue;
    const readings = axisReadings.get(idx) ?? [];
    const axes = MILITARY_DOCTRINE_AXES.map((axis) => ({
      axis,
      value: readings.find((r) => r.axis === axis)?.value ?? null,
    }));
    if (axes.every((a) => a.value === null)) continue;
    points.push({ nationIdx: country.idx, tag: country.tag, name: country.name ?? country.tag, colorRgb: country.color, axes });
  }
  return points;
}
