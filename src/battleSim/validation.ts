// Input validation for the battle simulator (spec FR-011; data-model.md
// "Validation rules"). The engine refuses to run on any issue returned
// here; the UI maps each issue's `path` to the matching field.
import { UNIT_TYPE_REFERENCE } from "../components/Overview/unitTypeReference";
import { COMBAT_RULES_REFERENCE } from "./combatRulesReference";
import { ARMY_CATEGORIES, type ArmyCategory, type BattleInput, type BattleSide, type ValidationIssue } from "./types";

/** Multipliers must stay positive: modifiers in [−0.9, +5]. */
export const MODIFIER_MIN = -0.9;
export const MODIFIER_MAX = 5;
export const DICE_BONUS_MIN = -10;
export const DICE_BONUS_MAX = 10;
const CROSSINGS = new Set(["none", "river", "strait", "sea_landing"]);
const SECTIONS = new Set(["left", "center", "right", "reserves"]);

export function isArmyUnitType(unitType: string): boolean {
  const ref = UNIT_TYPE_REFERENCE[unitType];
  return !!ref && (ARMY_CATEGORIES as readonly string[]).includes(ref.category);
}

export function unitCategory(unitType: string): ArmyCategory {
  return UNIT_TYPE_REFERENCE[unitType].category as ArmyCategory;
}

function checkRange(issues: ValidationIssue[], path: string, v: number, min: number, max: number, label: string) {
  if (!Number.isFinite(v)) issues.push({ path, message: `${label} must be a number.` });
  else if (v < min || v > max) issues.push({ path, message: `${label} must be between ${min} and ${max}.` });
}

function validateSide(side: BattleSide, key: "attacker" | "defender", issues: ValidationIssue[]) {
  const name = key === "attacker" ? "Attacker" : "Defender";
  if (!COMBAT_RULES_REFERENCE.formations[side.formation]) {
    issues.push({ path: `${key}.formation`, message: `Unknown formation "${side.formation}".` });
  }
  let fighting = 0;
  side.composition.forEach((row, i) => {
    const p = `${key}.composition[${i}]`;
    if (!isArmyUnitType(row.unitType)) {
      issues.push({ path: `${p}.unitType`, message: `"${row.unitType}" isn't a known land unit type.` });
    }
    if (!Number.isInteger(row.count) || row.count < 0) {
      issues.push({ path: `${p}.count`, message: "Regiment count must be a whole number, 0 or more." });
    }
    checkRange(issues, `${p}.strengthPct`, row.strengthPct, 0, 100, "Strength %");
    checkRange(issues, `${p}.experience`, row.experience, 0, 100, "Experience");
    if (row.section !== null && !SECTIONS.has(row.section)) {
      issues.push({ path: `${p}.section`, message: `Unknown section "${row.section}".` });
    }
    if (
      isArmyUnitType(row.unitType) &&
      unitCategory(row.unitType) !== "army_auxiliary" &&
      Number.isInteger(row.count) &&
      row.count > 0 &&
      row.strengthPct > 0
    ) {
      fighting += row.count;
    }
  });
  if (fighting === 0) {
    issues.push({ path: `${key}.composition`, message: `${name} has no fighting regiments (auxiliaries don't fight).` });
  }

  const s = side.stats;
  checkRange(issues, `${key}.stats.discipline`, s.discipline, MODIFIER_MIN, MODIFIER_MAX, "Discipline");
  checkRange(issues, `${key}.stats.militaryTactics`, s.militaryTactics, 0, MODIFIER_MAX, "Military tactics");
  checkRange(issues, `${key}.stats.landMoraleModifier`, s.landMoraleModifier, MODIFIER_MIN, MODIFIER_MAX, "Land morale modifier");
  checkRange(issues, `${key}.stats.levyCombatEfficiency`, s.levyCombatEfficiency, MODIFIER_MIN, MODIFIER_MAX, "Levy combat efficiency");
  checkRange(issues, `${key}.stats.armyInitiative`, s.armyInitiative, MODIFIER_MIN, MODIFIER_MAX, "Army initiative");
  for (const c of ARMY_CATEGORIES) {
    checkRange(issues, `${key}.stats.power.${c}`, s.power[c], MODIFIER_MIN, MODIFIER_MAX, "Unit power");
  }
  if (!Number.isFinite(s.startingMoralePct) || s.startingMoralePct <= 0 || s.startingMoralePct > 100) {
    issues.push({ path: `${key}.stats.startingMoralePct`, message: "Starting morale % must be above 0 and at most 100." });
  }

  const g = side.general;
  if (g.trait !== null && !COMBAT_RULES_REFERENCE.generalTraits[g.trait]) {
    issues.push({ path: `${key}.general.trait`, message: `Unknown general trait "${g.trait}".` });
  }
  if (!Number.isInteger(g.extraDiceBonus) || g.extraDiceBonus < DICE_BONUS_MIN || g.extraDiceBonus > DICE_BONUS_MAX) {
    issues.push({
      path: `${key}.general.extraDiceBonus`,
      message: `Extra dice bonus must be a whole number between ${DICE_BONUS_MIN} and ${DICE_BONUS_MAX}.`,
    });
  }
}

export function validateBattleInput(input: BattleInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Number.isInteger(input.seed)) issues.push({ path: "seed", message: "Seed must be a whole number." });
  const c = input.conditions;
  if (!COMBAT_RULES_REFERENCE.topography[c.topography]) {
    issues.push({ path: "conditions.topography", message: `Unknown topography "${c.topography}".` });
  }
  if (c.vegetation !== null && !COMBAT_RULES_REFERENCE.vegetation[c.vegetation]) {
    issues.push({ path: "conditions.vegetation", message: `Unknown vegetation "${c.vegetation}".` });
  }
  if (!COMBAT_RULES_REFERENCE.locationRanks[c.locationRank]) {
    issues.push({ path: "conditions.locationRank", message: `Unknown settlement rank "${c.locationRank}".` });
  }
  if (!CROSSINGS.has(c.crossing)) issues.push({ path: "conditions.crossing", message: `Unknown crossing "${c.crossing}".` });
  validateSide(input.attacker, "attacker", issues);
  validateSide(input.defender, "defender", issues);
  return issues;
}
