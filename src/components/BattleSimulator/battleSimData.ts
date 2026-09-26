// specs/019-battle-simulator: the simulator's editable UI state
// ("drafts") and the pre-fill from a loaded save (research.md §5).
// Every editable value carries where it came from — `save`, a game
// `default`, or a `user` edit — so nothing default is ever shown as save
// data (spec FR-004; constitution IV).
import { COMBAT_RULES_REFERENCE } from "../../battleSim/combatRulesReference";
import { PERCENT_SCALE } from "../../battleSim/assumedConstants";
import { ARMY_CATEGORIES, type ArmyCategory, type BattleSide, type SectionKey } from "../../battleSim/types";
import type { SaveDatabase } from "../../storage/db";
import { listArmiesForNation, loadArmyForSim, type ArmyListItem } from "../../storage/queries";
import { computeArmyStats } from "../Overview/armyNavyStats";
import {
  loadAdvanceSources,
  loadGovernanceSources,
  loadMilitaryScalars,
  loadRegimentSummary,
} from "../Overview/firepowerData";
import { decodeSocietalValuesByNation } from "../Overview/societalValuesData";
import { UNIT_TYPE_REFERENCE } from "../Overview/unitTypeReference";

export type ValueSource = "save" | "default" | "user";

export interface Sourced<T> {
  value: T;
  source: ValueSource;
  /** What reset restores, and where that came from. */
  original: T;
  originalSource: "save" | "default";
}

export function sourced<T>(value: T, source: "save" | "default"): Sourced<T> {
  return { value, source, original: value, originalSource: source };
}

export function edited<T>(s: Sourced<T>, value: T): Sourced<T> {
  return { ...s, value, source: "user" };
}

export function resetValue<T>(s: Sourced<T>): Sourced<T> {
  return { ...s, value: s.original, source: s.originalSource };
}

export interface RowDraft {
  id: string;
  unitType: Sourced<string>;
  count: Sourced<number>;
  strengthPct: Sourced<number>;
  isLevy: Sourced<boolean>;
  experience: Sourced<number>;
  /** From the save's regiment box (U-25); not editable. null = formation decides. */
  section: SectionKey | null;
  /** True for a row the user added (removable; reset-side drops it). */
  userAdded: boolean;
}

export type StatKey =
  | "discipline"
  | "militaryTactics"
  | "landMoraleModifier"
  | "levyCombatEfficiency"
  | "armyInitiative"
  | "startingMoralePct";

export interface SideDraft {
  label: string;
  nationIdx: number | null;
  /** An army idx, "whole" for the whole nation, or null when manual. */
  armyChoice: number | "whole" | null;
  formation: Sourced<string>;
  rows: RowDraft[];
  stats: Record<StatKey, Sourced<number>>;
  power: Record<ArmyCategory, Sourced<number>>;
  generalTrait: Sourced<string | null>;
  extraDiceBonus: Sourced<number>;
  /** Display only (U-38). */
  mil: number | null;
  /** Explanations shown above the composition (e.g. "No land regiments"). */
  notes: string[];
}

let rowCounter = 0;
export function newRowId(): string {
  rowCounter += 1;
  return `row-${rowCounter}`;
}

export function defaultFormation(): string {
  const entry = Object.entries(COMBAT_RULES_REFERENCE.formations).find(([, f]) => f.isDefault);
  return entry ? entry[0] : Object.keys(COMBAT_RULES_REFERENCE.formations)[0];
}

function defaultPower(): Record<ArmyCategory, Sourced<number>> {
  return Object.fromEntries(ARMY_CATEGORIES.map((c) => [c, sourced(0, "default")])) as Record<ArmyCategory, Sourced<number>>;
}

/** A side with game-default stats and no regiments (no-save mode, FR-014). */
export function defaultSide(label: string): SideDraft {
  return {
    label,
    nationIdx: null,
    armyChoice: null,
    formation: sourced(defaultFormation(), "default"),
    rows: [],
    stats: {
      discipline: sourced(0, "default"),
      militaryTactics: sourced(0, "default"),
      landMoraleModifier: sourced(0, "default"),
      levyCombatEfficiency: sourced(0, "default"),
      armyInitiative: sourced(0, "default"),
      startingMoralePct: sourced(PERCENT_SCALE, "default"),
    },
    power: defaultPower(),
    generalTrait: sourced<string | null>(null, "default"),
    extraDiceBonus: sourced(0, "default"),
    mil: null,
    notes: [],
  };
}

export function newUserRow(unitType: string): RowDraft {
  const ref = UNIT_TYPE_REFERENCE[unitType];
  return {
    id: newRowId(),
    unitType: sourced(unitType, "default"),
    count: sourced(1, "default"),
    strengthPct: sourced(PERCENT_SCALE, "default"),
    isLevy: sourced(ref?.isLevy ?? false, "default"),
    experience: sourced(0, "default"),
    section: null,
    userAdded: true,
  };
}

/** Save `box` → simulator section. Absent box reads as center (U-25). */
function sectionFromBox(box: string | null): SectionKey {
  switch (box) {
    case "Left":
      return "left";
    case "Right":
      return "right";
    case "Reserves":
      return "reserves";
    default:
      return "center";
  }
}

export async function listArmies(db: SaveDatabase, nationIdx: number): Promise<ArmyListItem[]> {
  return listArmiesForNation(db, nationIdx);
}

/**
 * Pre-fills one side from the loaded save: the chosen army's regiments
 * (grouped per unit type + section, strength and experience averaged per
 * group — ASSUMPTION U-47), the nation's discipline and military tactics
 * from 012's Army Stats pipeline (partial totals, U-43), the general's
 * trait and mil, and starting morale from the regiments' own morale.
 * Stats that pipeline doesn't cover stay game defaults, marked `default`.
 */
export async function buildSideFromSave(
  db: SaveDatabase,
  nationIdx: number,
  armyChoice: number | "whole",
  label: string,
): Promise<SideDraft> {
  const side = defaultSide(label);
  side.nationIdx = nationIdx;
  side.armyChoice = armyChoice;

  const army = await loadArmyForSim(db, armyChoice === "whole" ? { wholeNation: nationIdx } : { armyIdx: armyChoice });
  if (army.formation && COMBAT_RULES_REFERENCE.formations[army.formation]) {
    side.formation = sourced(army.formation, "save");
  }
  if (army.general) {
    side.mil = army.general.mil;
    if (army.general.generalTrait && COMBAT_RULES_REFERENCE.generalTraits[army.general.generalTrait]) {
      side.generalTrait = sourced<string | null>(army.general.generalTrait, "save");
    } else if (army.general.generalTrait) {
      side.notes.push(`General trait "${army.general.generalTrait}" isn't in the combat rules data, so it isn't applied.`);
    }
  }

  // Group regiments per (unit type, section, has-strength).
  interface Group {
    unitType: string;
    section: SectionKey;
    missingStrength: boolean;
    count: number;
    strengthSum: number;
    expWeighted: number;
    clamped: number;
  }
  const groups = new Map<string, Group>();
  let moraleMen = 0;
  let moraleWeighted = 0;
  let unknownTypes = 0;
  for (const r of army.regiments) {
    const ref = UNIT_TYPE_REFERENCE[r.unitType];
    if (!ref) {
      unknownTypes += 1;
      continue;
    }
    const section = sectionFromBox(r.box);
    const missingStrength = r.strength === null;
    const key = `${r.unitType}|${section}|${missingStrength}`;
    const g = groups.get(key) ?? { unitType: r.unitType, section, missingStrength, count: 0, strengthSum: 0, expWeighted: 0, clamped: 0 };
    g.count += 1;
    const pct = missingStrength ? 0 : ((r.strength ?? 0) / ref.stats.maxStrength) * PERCENT_SCALE;
    if (pct > PERCENT_SCALE) g.clamped += 1;
    g.strengthSum += Math.min(PERCENT_SCALE, pct);
    g.expWeighted += r.experience ?? 0;
    groups.set(key, g);
    if (!missingStrength && r.morale !== null && ref.category !== "army_auxiliary") {
      moraleMen += r.strength ?? 0;
      moraleWeighted += (r.strength ?? 0) * r.morale;
    }
  }

  for (const g of groups.values()) {
    const ref = UNIT_TYPE_REFERENCE[g.unitType];
    const avg = (v: number) => Math.round((v / g.count) * 10) / 10;
    side.rows.push({
      id: newRowId(),
      unitType: sourced(g.unitType, "save"),
      count: sourced(g.count, "save"),
      // U-46: a missing strength line is a default 0%, never "save".
      strengthPct: sourced(avg(g.strengthSum), g.missingStrength ? "default" : "save"),
      isLevy: sourced(ref.isLevy, "save"),
      experience: sourced(Math.min(PERCENT_SCALE, avg(g.expWeighted)), "save"),
      section: g.section,
      userAdded: false,
    });
    if (g.clamped > 0) {
      side.notes.push(`${g.clamped} ${g.unitType} regiment(s) had more than max strength in the save; capped at 100%.`);
    }
  }
  if (groups.size === 0) side.notes.push("This selection has no land regiments. Add regiments manually to simulate.");
  if ([...groups.values()].some((g) => g.missingStrength)) {
    side.notes.push("Some regiments have no strength value in the save; they start at 0% (U-46).");
  }
  if (unknownTypes > 0) side.notes.push(`${unknownTypes} regiment(s) of unknown unit types were left out.`);

  // Nation stats via 012's Army Stats pipeline (discipline, tactics).
  const [regimentRows, advanceRows, governanceRows, scalarRows, societal] = await Promise.all([
    loadRegimentSummary(db, [nationIdx]),
    loadAdvanceSources(db, [nationIdx]),
    loadGovernanceSources(db, [nationIdx]),
    loadMilitaryScalars(db, [nationIdx]),
    decodeSocietalValuesByNation(db),
  ]);
  const societalRows = (societal.get(nationIdx) ?? []).map((r) => ({ nationIdx, axis: r.axis, value: r.value }));
  const summary = computeArmyStats(regimentRows, advanceRows, governanceRows, societalRows, scalarRows)[0];
  if (summary) {
    side.stats.discipline = sourced(summary.discipline.value, "save");
    side.stats.militaryTactics = sourced(summary.tactics.value, "save");
  }

  // Starting morale from the regiments' own morale (U-28 for the max).
  if (moraleMen > 0) {
    const max = COMBAT_RULES_REFERENCE.nUnit.LAND_MORALE; // landMoraleModifier is a default 0 here
    const pct = Math.min(PERCENT_SCALE, Math.max(1, ((moraleWeighted / moraleMen) / max) * PERCENT_SCALE));
    side.stats.startingMoralePct = sourced(Math.round(pct * 10) / 10, "save");
  }
  return side;
}

/** Unwraps a draft into the engine's plain BattleSide. */
export function toBattleSide(d: SideDraft): BattleSide {
  return {
    label: d.label,
    formation: d.formation.value,
    composition: d.rows.map((r) => ({
      unitType: r.unitType.value,
      count: r.count.value,
      strengthPct: r.strengthPct.value,
      isLevy: r.isLevy.value,
      experience: r.experience.value,
      section: r.section,
    })),
    stats: {
      discipline: d.stats.discipline.value,
      militaryTactics: d.stats.militaryTactics.value,
      landMoraleModifier: d.stats.landMoraleModifier.value,
      levyCombatEfficiency: d.stats.levyCombatEfficiency.value,
      armyInitiative: d.stats.armyInitiative.value,
      startingMoralePct: d.stats.startingMoralePct.value,
      power: Object.fromEntries(ARMY_CATEGORIES.map((c) => [c, d.power[c].value])) as Record<ArmyCategory, number>,
    },
    general: { trait: d.generalTrait.value, extraDiceBonus: d.extraDiceBonus.value, mil: d.mil },
  };
}

/** Human label for an army picker option. */
export function armyLabel(a: ArmyListItem, index: number): string {
  const men = Math.round(a.totalStrength * COMBAT_RULES_REFERENCE.nUnit.REGIMENT_SIZE).toLocaleString();
  return `Army ${index + 1} · ${a.regimentCount} regiments · ${men} men`;
}
