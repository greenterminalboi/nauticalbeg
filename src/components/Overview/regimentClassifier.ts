// specs/012-firepower-tab: classifies one country's grouped regiment/ship
// rows (from listRegimentSummaryArrow, already grouped by unit_type in
// SQL — Constitution Principle V, no per-row JS loop over the raw
// `regiments` table) against the static Unit Type Reference into the
// shape both Army Stats (overall count/morale/levy split) and Navy
// Stats (per-category ship counts + levy split, no morale — the spec's
// Navy Stats sub-tab doesn't ask for one) need.
//
// A unit_type missing from the reference (a future game version adding
// a type this table hasn't been regenerated for) is logged and excluded
// from the classification rather than crashing or silently miscounted
// into the wrong category (Constitution Principle IV).
import type { UnitTypeReferenceEntry, UnitTypeStats } from "./unitTypeReference";

export interface RegimentSummaryRow {
  unitType: string;
  regimentCount: number;
  totalNumber: number;
  avgMorale: number | null;
}

export interface CategoryTotals {
  regimentCount: number;
  totalNumber: number;
}

/** specs/012-firepower-tab (post-ship, explicit user request): per-raw-
 * unit_type totals (not collapsed into a display category), so a hover
 * breakdown can show e.g. "Pikemen: 40 (1 regiment)" rather than just
 * "Infantry: 60". */
export interface UnitTypeTotals extends CategoryTotals {
  unitType: string;
  displayCategory: string;
  isLevy: boolean;
  /** user request 2026-09-22: the unit type's own combat stats (max
   * strength, combat power, frontage, ...) straight from the reference
   * table — constant per unit type, so carried as-is rather than
   * aggregated across this nation's regiments of it. */
  stats: UnitTypeStats;
  /** user request 2026-09-22: this unit type's own age tier (I-VI),
   * for a small badge next to its name in Army Composition's Regiment
   * Composition table. */
  age: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface RegimentClassification {
  totalRegimentCount: number;
  totalNumber: number;
  /** Count-weighted mean morale across every classified row, or null
   * when there are no regiments to average (never a fabricated 0). */
  weightedMorale: number | null;
  levyNumber: number;
  regularsNumber: number;
  byCategory: Record<string, CategoryTotals>;
  /** Every classified row's own unit_type totals, unaggregated across
   * types — the source data for a "what's actually in this number"
   * hover breakdown. */
  byUnitType: UnitTypeTotals[];
  /** unit_type values present in the rows but missing from the
   * reference table — surfaced so a caller can log/warn, never silently
   * dropped without a trace. */
  unresolvedUnitTypes: string[];
}

export function classifyRegiments(
  rows: readonly RegimentSummaryRow[],
  reference: Record<string, UnitTypeReferenceEntry>,
): RegimentClassification {
  let totalRegimentCount = 0;
  let totalNumber = 0;
  let moraleWeightedSum = 0;
  let moraleWeightTotal = 0;
  let levyNumber = 0;
  let regularsNumber = 0;
  const byCategory: Record<string, CategoryTotals> = {};
  const byUnitType: UnitTypeTotals[] = [];
  const unresolvedUnitTypes: string[] = [];

  for (const row of rows) {
    const entry = reference[row.unitType];
    if (!entry) {
      unresolvedUnitTypes.push(row.unitType);
      continue;
    }

    totalRegimentCount += row.regimentCount;
    totalNumber += row.totalNumber;

    if (row.avgMorale !== null) {
      moraleWeightedSum += row.avgMorale * row.regimentCount;
      moraleWeightTotal += row.regimentCount;
    }

    if (entry.isLevy) {
      levyNumber += row.totalNumber;
    } else {
      regularsNumber += row.totalNumber;
    }

    const bucket = byCategory[entry.displayCategory] ?? { regimentCount: 0, totalNumber: 0 };
    bucket.regimentCount += row.regimentCount;
    bucket.totalNumber += row.totalNumber;
    byCategory[entry.displayCategory] = bucket;

    // listRegimentSummaryArrow already groups by (nation_idx, unit_type)
    // in SQL, so each row here is already exactly one unit_type's totals
    // — no further aggregation needed.
    byUnitType.push({
      unitType: row.unitType,
      displayCategory: entry.displayCategory,
      isLevy: entry.isLevy,
      regimentCount: row.regimentCount,
      totalNumber: row.totalNumber,
      stats: entry.stats,
      age: entry.age,
    });
  }

  byUnitType.sort((a, b) => b.totalNumber - a.totalNumber);

  return {
    totalRegimentCount,
    totalNumber,
    weightedMorale: moraleWeightTotal > 0 ? moraleWeightedSum / moraleWeightTotal : null,
    levyNumber,
    regularsNumber,
    byCategory,
    byUnitType,
    unresolvedUnitTypes,
  };
}
