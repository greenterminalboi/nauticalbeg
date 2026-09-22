// specs/012-firepower-tab (post-ship): converts a pair of
// ArmyStatsTableRow/NavyStatsTableRow into the generic HeadToHeadRow
// shape HeadToHeadTable renders — kept separate from the table
// component so the field list per stat type is easy to scan and test.
import { formatBreakdownTooltip, formatRegimentBreakdownTooltip, toRomanAge, type PartialStat, type RegimentBreakdownEntry } from "./militaryStatFormat";
import type { ArmyStatsTableRow } from "./ArmyStatsTable";
import type { NavyStatsTableRow } from "./NavyStatsTable";
import type { HeadToHeadRow } from "./HeadToHeadTable";

function numberRow(label: string, a: number | null, b: number | null, digits = 1): HeadToHeadRow {
  return {
    label,
    aValue: a,
    bValue: b,
    aDisplay: a === null ? "—" : a.toFixed(digits),
    bDisplay: b === null ? "—" : b.toFixed(digits),
  };
}

function integerRow(
  label: string,
  a: number,
  b: number,
  breakdown?: { a: readonly RegimentBreakdownEntry[]; b: readonly RegimentBreakdownEntry[]; noun: "regiment" | "ship" },
): HeadToHeadRow {
  return {
    label,
    aValue: a,
    bValue: b,
    aDisplay: String(a),
    bDisplay: String(b),
    aTooltip: breakdown ? formatRegimentBreakdownTooltip(breakdown.a, breakdown.noun) : undefined,
    bTooltip: breakdown ? formatRegimentBreakdownTooltip(breakdown.b, breakdown.noun) : undefined,
  };
}

function partialStatRow(label: string, a: PartialStat, b: PartialStat): HeadToHeadRow {
  return {
    label,
    aValue: a.value,
    bValue: b.value,
    aDisplay: `${a.value.toFixed(2)} *`,
    bDisplay: `${b.value.toFixed(2)} *`,
    aTooltip: formatBreakdownTooltip(a),
    bTooltip: formatBreakdownTooltip(b),
  };
}

function ageRow(label: string, a: 1 | 2 | 3 | 4 | 5 | 6, b: 1 | 2 | 3 | 4 | 5 | 6): HeadToHeadRow {
  return { label, aValue: a, bValue: b, aDisplay: toRomanAge(a), bDisplay: toRomanAge(b) };
}

export function buildArmyHeadToHeadRows(a: ArmyStatsTableRow, b: ArmyStatsTableRow): HeadToHeadRow[] {
  return [
    numberRow("Morale", a.morale, b.morale, 2),
    partialStatRow("Discipline", a.discipline, b.discipline),
    partialStatRow("Tactics", a.tactics, b.tactics),
    numberRow("Manpower", a.manpower, b.manpower),
    integerRow("Regiments", a.regimentCount, b.regimentCount, {
      a: a.regimentBreakdown,
      b: b.regimentBreakdown,
      noun: "regiment",
    }),
    numberRow("Maintenance", a.armyMaintenanceCost, b.armyMaintenanceCost),
    numberRow("Levy Size", a.levySize, b.levySize, 0),
    numberRow("Regulars Size", a.regularsSize, b.regularsSize, 0),
    partialStatRow("Fort Limit", a.fortLimit, b.fortLimit),
    partialStatRow("Siege Ability", a.siegeAbility, b.siegeAbility),
    partialStatRow("Fort Defense", a.fortDefense, b.fortDefense),
    numberRow("Army Tradition", a.armyTradition, b.armyTradition),
    ageRow("Artillery Age", a.ageArtillery, b.ageArtillery),
    ageRow("Infantry Age", a.ageInfantry, b.ageInfantry),
    ageRow("Cavalry Age", a.ageCavalry, b.ageCavalry),
    ageRow("Supply Age", a.ageSupply, b.ageSupply),
  ];
}

export function buildNavyHeadToHeadRows(a: NavyStatsTableRow, b: NavyStatsTableRow): HeadToHeadRow[] {
  return [
    numberRow("Damage Given", a.damageGiven, b.damageGiven, 0),
    numberRow("Damage Taken", a.damageTaken, b.damageTaken, 0),
    numberRow("Sailors", a.sailors, b.sailors, 2),
    numberRow("Ship Levies", a.shipLevies, b.shipLevies, 0),
    numberRow("Ship Regulars", a.shipRegulars, b.shipRegulars, 0),
    integerRow("Heavy Ships", a.heavyShipCount, b.heavyShipCount, {
      a: a.heavyShipBreakdown,
      b: b.heavyShipBreakdown,
      noun: "ship",
    }),
    integerRow("Light Ships", a.lightShipCount, b.lightShipCount, {
      a: a.lightShipBreakdown,
      b: b.lightShipBreakdown,
      noun: "ship",
    }),
    integerRow("Transports", a.transportCount, b.transportCount, {
      a: a.transportBreakdown,
      b: b.transportBreakdown,
      noun: "ship",
    }),
    integerRow("Galleys", a.galleyCount, b.galleyCount, {
      a: a.galleyBreakdown,
      b: b.galleyBreakdown,
      noun: "ship",
    }),
    numberRow("Navy Tradition", a.navyTradition, b.navyTradition),
    ageRow("Heavies Age", a.ageHeavies, b.ageHeavies),
    ageRow("Transports Age", a.ageTransports, b.ageTransports),
    ageRow("Lights Age", a.ageLights, b.ageLights),
    ageRow("Galleys Age", a.ageGalleys, b.ageGalleys),
  ];
}
