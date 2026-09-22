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
import type {
  NationDamageRow,
  NationMilitaryScalars,
  NationRegimentSummaryRow,
  NationSourceRow,
} from "./armyNavyStats";

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
