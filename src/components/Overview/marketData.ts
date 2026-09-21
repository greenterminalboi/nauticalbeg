// specs/007-production-trade-markets data-model.md/contracts/query-
// functions.md: decoded, in-memory forms of the four new list*Arrow
// query functions' Arrow IPC results — mirrors leaderboardData.ts's
// direct-decode-via-apache-arrow pattern.
import { tableFromIPC } from "apache-arrow";
import {
  listGoodProductionByOwnerArrow,
  listMarketGoodsArrow,
  listMarketsArrow,
  listWorldGoodsArrow,
} from "../../storage/queries";
import type { SaveDatabase } from "../../storage/db";

export interface WorldGood {
  good: string;
  total: number;
  /** specs/009-world-goods-production: whether a per-country production-
   * share breakdown is available for this good (derived from
   * province_good_production's real contents, never a hardcoded list). */
  hasProductionCoverage: boolean;
}

/** specs/009-world-goods-production: one country's (or the unowned/
 * non-Real "unattributed" case, `ownerIdx: null`) summed production of
 * one good. */
export interface GoodProductionByOwner {
  ownerIdx: number | null;
  amount: number;
}

export interface Market {
  idx: number;
  name: string;
  memberCount: number | null;
  capacity: number | null;
  /** The current owner of the market's center location — logically
   * REFERENCES nations(idx); null if the location is unowned or the
   * market has no resolvable center at all. */
  ownerIdx: number | null;
  ownerName: string;
  ownerColor: [number, number, number] | null;
}

export interface MarketGood {
  good: string;
  price: number | null;
  supply: number | null;
  demand: number | null;
  stockpile: number | null;
  isImporting: boolean | null;
  isExporting: boolean | null;
  supplyRawMaterials: number | null;
  supplyBuildings: number | null;
  supplyTrade: number | null;
  demandPopulation: number | null;
  demandTrade: number | null;
  demandBuildingUpkeep: number | null;
  demandUnitUpkeep: number | null;
  demandConstruction: number | null;
}

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer))
    .toArray()
    .map((row) => row.toJSON());
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** 0/1 (or DuckDB's native boolean, for a hand-built test row) -> a real
 * tri-state boolean; NULL stays NULL — never coerced to `false`
 * (FR-011). */
function flagOrNull(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" || typeof value === "bigint") return Number(value) === 1;
  return null;
}

/** Same pattern as leaderboardData.ts's rgbOrNull — a fabricated color
 * is never acceptable (constitution Principle IV), so all three
 * components must be confirmed numbers or the whole triple is null. */
function rgbOrNull(r: unknown, g: unknown, b: unknown): [number, number, number] | null {
  return typeof r === "number" && typeof g === "number" && typeof b === "number" ? [r, g, b] : null;
}

export async function decodeWorldGoods(db: SaveDatabase): Promise<WorldGood[]> {
  const rows = decodeRows(await listWorldGoodsArrow(db));
  return rows.map((r) => ({
    good: String(r.good),
    total: numberOrNull(r.total) ?? 0,
    // Defaults to false (no treemap offered), never true, if somehow
    // unparseable -- the safe direction for a flag that gates whether a
    // real breakdown is promised.
    hasProductionCoverage: flagOrNull(r.has_production_coverage) ?? false,
  }));
}

/** specs/009-world-goods-production: decodes `listGoodProductionByOwnerArrow`'s
 * Arrow IPC buffer into one entry per owning country (or `ownerIdx: null`
 * for an unowned province's production). */
export async function decodeGoodProductionByOwner(
  db: SaveDatabase,
  good: string,
): Promise<GoodProductionByOwner[]> {
  const rows = decodeRows(await listGoodProductionByOwnerArrow(db, good));
  return rows.map((r) => ({
    ownerIdx: numberOrNull(r.owner_idx),
    amount: numberOrNull(r.amount) ?? 0,
  }));
}

export async function decodeMarkets(db: SaveDatabase): Promise<Market[]> {
  const rows = decodeRows(await listMarketsArrow(db));
  return rows.map((r) => ({
    idx: typeof r.idx === "number" ? r.idx : -1,
    name: String(r.name),
    memberCount: numberOrNull(r.member_count),
    capacity: numberOrNull(r.capacity),
    ownerIdx: numberOrNull(r.owner_idx),
    ownerName: String(r.owner_name),
    ownerColor: rgbOrNull(r.owner_color_r, r.owner_color_g, r.owner_color_b),
  }));
}

export async function decodeMarketGoods(db: SaveDatabase, marketIdx: number): Promise<MarketGood[]> {
  const rows = decodeRows(await listMarketGoodsArrow(db, marketIdx));
  return rows.map((r) => ({
    good: String(r.good),
    price: numberOrNull(r.price),
    supply: numberOrNull(r.supply),
    demand: numberOrNull(r.demand),
    stockpile: numberOrNull(r.stockpile),
    isImporting: flagOrNull(r.is_importing),
    isExporting: flagOrNull(r.is_exporting),
    supplyRawMaterials: numberOrNull(r.supply_raw_materials),
    supplyBuildings: numberOrNull(r.supply_buildings),
    supplyTrade: numberOrNull(r.supply_trade),
    demandPopulation: numberOrNull(r.demand_population),
    demandTrade: numberOrNull(r.demand_trade),
    demandBuildingUpkeep: numberOrNull(r.demand_building_upkeep),
    demandUnitUpkeep: numberOrNull(r.demand_unit_upkeep),
    demandConstruction: numberOrNull(r.demand_construction),
  }));
}
