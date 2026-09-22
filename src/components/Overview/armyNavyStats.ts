// specs/012-firepower-tab: the service-layer reduction combining raw
// query rows with the three static reference tables
// (unitTypeReference.ts, unitUnlockReference.ts,
// militaryModifierReference.ts) into Army Stats / Navy Stats. Plain,
// testable functions outside any chart/table component — same
// precedent as compassPosition.ts.
import { UNIT_TYPE_REFERENCE } from "./unitTypeReference";
import { UNIT_UNLOCK_REFERENCE } from "./unitUnlockReference";
import { MILITARY_MODIFIER_REFERENCE, type ModifierStat } from "./militaryModifierReference";
import { classifyRegiments, type RegimentSummaryRow } from "./regimentClassifier";
import type { ModifierBreakdownEntry, PartialStat, RegimentBreakdownEntry } from "./militaryStatFormat";
import type { UnitTypeTotals } from "./regimentClassifier";

function toRegimentBreakdown(entries: readonly UnitTypeTotals[]): RegimentBreakdownEntry[] {
  return entries.map((e) => ({
    unitType: e.unitType,
    displayCategory: e.displayCategory,
    isLevy: e.isLevy,
    regimentCount: e.regimentCount,
    totalNumber: e.totalNumber,
    stats: e.stats,
    age: e.age,
  }));
}

/** listRegimentSummaryArrow's actual row shape — nationIdx plus
 * everything regimentClassifier.ts's RegimentSummaryRow needs. Multiple
 * nations' rows are expected together here; computeArmyStats/
 * computeNavyStats group by nationIdx before handing each nation's own
 * subset (nationIdx stripped) to classifyRegiments, which only ever
 * classifies one nation's rows at a time. */
export interface NationRegimentSummaryRow extends RegimentSummaryRow {
  nationIdx: number;
}

export type DisplayCategory = "Infantry" | "Cavalry" | "Artillery" | "Supply" | "Heavies" | "Lights" | "Transports" | "Galleys";

export interface NationSourceRow {
  nationIdx: number;
  sourceKind: "advance" | "reform" | "privilege" | "law";
  sourceName: string;
}

export interface NationSocietalValueRow {
  nationIdx: number;
  axis: string;
  value: number;
}

export interface NationMilitaryScalars {
  nationIdx: number;
  manpower: number | null;
  sailors: number | null;
  monthlyManpower: number | null;
  monthlySailors: number | null;
  armyTradition: number | null;
  navyTradition: number | null;
  lastMonthsArmyMaintenance: number | null;
  lastMonthsNavyMaintenance: number | null;
}

export interface NationDamageRow {
  nationIdx: number;
  direction: "given" | "taken";
  totalDamage: number;
}

// research.md §5: a societal_value-kind modifier source only contributes
// at the axis's extreme — 100 with float tolerance, since the real save
// stores non-integer values (e.g. 99.88381 was seen for a genuinely
// maxed-out axis in the real save).
const SOCIETAL_VALUE_EXTREME_THRESHOLD = 99;

function groupBy<T>(rows: readonly T[], key: (row: T) => number): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const list = map.get(key(row));
    if (list) list.push(row);
    else map.set(key(row), [row]);
  }
  return map;
}

/** Sums every `militaryModifierReference.ts` entry for `stat` whose
 * source is actually active for this nation — `sourceKind: 'dynamic'`
 * and `'other'` entries are never summed (spec Assumptions: an accepted,
 * documented partial total, not a bug). Always returns a real value
 * (0 when nothing matches), never omits the stat — spec FR-006. Also
 * returns the exact matched sources (`breakdown`) so a UI can show "why"
 * a number is what it is on hover, not just the total. */
function computeModifierTotal(
  stat: ModifierStat,
  activeSourceNames: ReadonlySet<string>,
  societalValues: ReadonlyMap<string, number>,
): PartialStat {
  let total = 0;
  const breakdown: ModifierBreakdownEntry[] = [];
  for (const entry of MILITARY_MODIFIER_REFERENCE) {
    if (entry.stat !== stat || entry.value === null) continue;
    if (entry.sourceKind === "dynamic" || entry.sourceKind === "other") continue;
    if (entry.sourceKind === "societal_value") {
      const value = societalValues.get(entry.sourceName);
      if (value !== undefined && Math.abs(value) >= SOCIETAL_VALUE_EXTREME_THRESHOLD) {
        total += entry.value;
        breakdown.push({ sourceKind: "societal_value", sourceName: entry.sourceName, value: entry.value });
      }
      continue;
    }
    if (activeSourceNames.has(entry.sourceName)) {
      total += entry.value;
      breakdown.push({ sourceKind: entry.sourceKind, sourceName: entry.sourceName, value: entry.value });
    }
  }
  return { value: total, isPartial: true, breakdown };
}

/** Highest age (I-VI) among `category`'s unit types whose unlocking
 * advance is researched (spec FR-007/FR-009: "unlocked/recruitable," not
 * "currently fielded"). Defaults to age 1 when no advance-gated unlock
 * is found for this category — a deliberate, documented assumption that
 * every country can field a category's baseline tier without special
 * research (unitUnlockReference.ts only catalogs *advance-gated*
 * unlocks; age-1 units are the game's default starting tier and were
 * never expected to appear there). Culture-group `potential` gates on a
 * unique unlock are NOT checked here (data-model.md's "known accepted
 * simplification" — may over-include a unique unit's age, never
 * under-include). */
function computeUnlockedAge(category: DisplayCategory, researchedAdvances: ReadonlySet<string>): 1 | 2 | 3 | 4 | 5 | 6 {
  let maxAge: 1 | 2 | 3 | 4 | 5 | 6 = 1;
  for (const unlock of UNIT_UNLOCK_REFERENCE) {
    if (!researchedAdvances.has(unlock.advance)) continue;
    for (const unitType of unlock.unlockedUnitTypes) {
      const entry = UNIT_TYPE_REFERENCE[unitType];
      if (!entry || entry.displayCategory !== category) continue;
      if (entry.age > maxAge) maxAge = entry.age;
    }
  }
  return maxAge;
}

export interface ArmyStatSummary {
  nationIdx: number;
  morale: number;
  discipline: PartialStat;
  tactics: PartialStat;
  manpower: number | null;
  regimentCount: number;
  armyMaintenanceCost: number | null;
  levySize: number;
  regularsSize: number;
  fortLimit: PartialStat;
  siegeAbility: PartialStat;
  fortDefense: PartialStat;
  armyTradition: number | null;
  ageArtillery: 1 | 2 | 3 | 4 | 5 | 6;
  ageInfantry: 1 | 2 | 3 | 4 | 5 | 6;
  ageCavalry: 1 | 2 | 3 | 4 | 5 | 6;
  ageSupply: 1 | 2 | 3 | 4 | 5 | 6;
  /** Every fielded regiment type and its real headcount — the source
   * data for the Regiments column's hover breakdown. */
  regimentBreakdown: RegimentBreakdownEntry[];
}

/**
 * Combines army-side (`a_`-prefixed) regiment rows with researched
 * advances, governance sources (reforms/privileges/laws), societal
 * values, and the military scalar columns into one Army Stat Summary
 * per nation that has at least one army regiment (spec FR-012 — a
 * nation with none is simply absent from the result, never a
 * fabricated zeroed row).
 */
export function computeArmyStats(
  regimentRows: readonly NationRegimentSummaryRow[],
  advanceRows: readonly NationSourceRow[],
  governanceRows: readonly NationSourceRow[],
  societalValueRows: readonly NationSocietalValueRow[],
  scalarRows: readonly NationMilitaryScalars[],
): ArmyStatSummary[] {
  // Army-only (a_-prefixed) — a navy ship row for the same nation must
  // never bleed into regiment count/morale/levy totals here.
  const armyRows = regimentRows.filter((r) => r.unitType.startsWith("a_"));
  const regimentsByNation = groupBy(armyRows, (r) => r.nationIdx);
  const advancesByNation = groupBy(advanceRows, (r) => r.nationIdx);
  const governanceByNation = groupBy(governanceRows, (r) => r.nationIdx);
  const societalByNation = groupBy(societalValueRows, (r) => r.nationIdx);
  const scalarsByNation = new Map(scalarRows.map((r) => [r.nationIdx, r]));

  const results: ArmyStatSummary[] = [];
  for (const [nationIdx, nationRegiments] of regimentsByNation) {
    const classification = classifyRegiments(nationRegiments, UNIT_TYPE_REFERENCE);
    if (classification.totalRegimentCount === 0 || classification.weightedMorale === null) continue;

    const researchedAdvances = new Set((advancesByNation.get(nationIdx) ?? []).map((r) => r.sourceName));
    const activeSources = new Set([
      ...researchedAdvances,
      ...(governanceByNation.get(nationIdx) ?? []).map((r) => r.sourceName),
    ]);
    const societalValues = new Map(
      (societalByNation.get(nationIdx) ?? []).map((r) => [r.axis, r.value] as const),
    );
    const scalars = scalarsByNation.get(nationIdx) ?? null;

    results.push({
      nationIdx,
      morale: classification.weightedMorale,
      discipline: computeModifierTotal("discipline", activeSources, societalValues),
      tactics: computeModifierTotal("military_tactics", activeSources, societalValues),
      manpower: scalars?.manpower ?? null,
      regimentCount: classification.totalRegimentCount,
      armyMaintenanceCost: scalars?.lastMonthsArmyMaintenance ?? null,
      levySize: classification.levyNumber,
      regularsSize: classification.regularsNumber,
      fortLimit: computeModifierTotal("fort_limit_modifier", activeSources, societalValues),
      siegeAbility: computeModifierTotal("siege_ability", activeSources, societalValues),
      fortDefense: computeModifierTotal("global_defensive", activeSources, societalValues),
      armyTradition: scalars?.armyTradition ?? null,
      ageArtillery: computeUnlockedAge("Artillery", researchedAdvances),
      ageInfantry: computeUnlockedAge("Infantry", researchedAdvances),
      ageCavalry: computeUnlockedAge("Cavalry", researchedAdvances),
      ageSupply: computeUnlockedAge("Supply", researchedAdvances),
      regimentBreakdown: toRegimentBreakdown(classification.byUnitType),
    });
  }
  return results;
}

export interface NavyStatSummary {
  nationIdx: number;
  damageGiven: number | null;
  damageTaken: number | null;
  sailors: number | null;
  shipLevies: number;
  shipRegulars: number;
  heavyShipCount: number;
  lightShipCount: number;
  transportCount: number;
  galleyCount: number;
  navyTradition: number | null;
  ageHeavies: 1 | 2 | 3 | 4 | 5 | 6;
  ageTransports: 1 | 2 | 3 | 4 | 5 | 6;
  ageLights: 1 | 2 | 3 | 4 | 5 | 6;
  ageGalleys: 1 | 2 | 3 | 4 | 5 | 6;
  /** Each per-class column's own hover breakdown (e.g. Heavy Ships'
   * hover shows exactly which heavy-ship types make up that count). */
  heavyShipBreakdown: RegimentBreakdownEntry[];
  lightShipBreakdown: RegimentBreakdownEntry[];
  transportBreakdown: RegimentBreakdownEntry[];
  galleyBreakdown: RegimentBreakdownEntry[];
}

/**
 * Combines navy-side (`n_`-prefixed) regiment rows with researched
 * advances (age columns only — no computed-stat modifiers apply to
 * Navy Stats per spec FR-008), military scalar columns, and navy damage
 * given/taken into one Navy Stat Summary per nation that has at least
 * one ship (spec FR-012). Never depends on `nation_reforms`/
 * `nation_privileges`/`nation_laws` (US2-only tables) — see tasks.md's
 * query-contract refinement note.
 */
export function computeNavyStats(
  regimentRows: readonly NationRegimentSummaryRow[],
  advanceRows: readonly NationSourceRow[],
  scalarRows: readonly NationMilitaryScalars[],
  damageRows: readonly NationDamageRow[],
): NavyStatSummary[] {
  // Navy-only (n_-prefixed) — an army regiment row for the same nation
  // must never bleed into ship counts/levy totals here.
  const navyRows = regimentRows.filter((r) => r.unitType.startsWith("n_"));
  const regimentsByNation = groupBy(navyRows, (r) => r.nationIdx);
  const advancesByNation = groupBy(advanceRows, (r) => r.nationIdx);
  const scalarsByNation = new Map(scalarRows.map((r) => [r.nationIdx, r]));
  const damageByNation = groupBy(damageRows, (r) => r.nationIdx);

  const results: NavyStatSummary[] = [];
  for (const [nationIdx, nationRegiments] of regimentsByNation) {
    const classification = classifyRegiments(nationRegiments, UNIT_TYPE_REFERENCE);
    if (classification.totalRegimentCount === 0) continue;

    const researchedAdvances = new Set((advancesByNation.get(nationIdx) ?? []).map((r) => r.sourceName));
    const scalars = scalarsByNation.get(nationIdx) ?? null;
    const damage = damageByNation.get(nationIdx) ?? [];
    const damageGiven = damage.find((d) => d.direction === "given")?.totalDamage ?? null;
    const damageTaken = damage.find((d) => d.direction === "taken")?.totalDamage ?? null;

    results.push({
      nationIdx,
      damageGiven,
      damageTaken,
      sailors: scalars?.sailors ?? null,
      shipLevies: classification.levyNumber,
      shipRegulars: classification.regularsNumber,
      heavyShipCount: classification.byCategory.Heavies?.totalNumber ?? 0,
      lightShipCount: classification.byCategory.Lights?.totalNumber ?? 0,
      transportCount: classification.byCategory.Transports?.totalNumber ?? 0,
      galleyCount: classification.byCategory.Galleys?.totalNumber ?? 0,
      navyTradition: scalars?.navyTradition ?? null,
      ageHeavies: computeUnlockedAge("Heavies", researchedAdvances),
      ageTransports: computeUnlockedAge("Transports", researchedAdvances),
      ageLights: computeUnlockedAge("Lights", researchedAdvances),
      ageGalleys: computeUnlockedAge("Galleys", researchedAdvances),
      heavyShipBreakdown: toRegimentBreakdown(classification.byUnitType.filter((u) => u.displayCategory === "Heavies")),
      lightShipBreakdown: toRegimentBreakdown(classification.byUnitType.filter((u) => u.displayCategory === "Lights")),
      transportBreakdown: toRegimentBreakdown(classification.byUnitType.filter((u) => u.displayCategory === "Transports")),
      galleyBreakdown: toRegimentBreakdown(classification.byUnitType.filter((u) => u.displayCategory === "Galleys")),
    });
  }
  return results;
}
