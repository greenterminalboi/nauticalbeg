// Damage and dice formulas for one regiment hitting another (research.md
// §2). Every constant comes from COMBAT_RULES_REFERENCE or
// assumedConstants.ts — no numeric literals other than 0 and 1 here
// (contracts/engine-api.md guarantee 6, enforced by a test). Every
// unverified rule is tagged with its ledger ID from
// specs/019-battle-simulator/combat-unknowns.md and recorded in `used` so
// the result's Approximations panel can list it.
import { EXPERIENCE_SCALE, STRENGTH_DICE_SLOPE } from "./assumedConstants";
import { COMBAT_RULES_REFERENCE } from "./combatRulesReference";
import type { BattleConditions, GeneralInput } from "./types";

const C = COMBAT_RULES_REFERENCE.nCombat;
const U = COMBAT_RULES_REFERENCE.nUnit;

export type UsedAssumptions = Set<string>;

export function commanderBonus(general: GeneralInput, used: UsedAssumptions): number {
  const traitBonus = general.trait ? (COMBAT_RULES_REFERENCE.generalTraits[general.trait]?.commander_combat_bonus ?? 0) : 0;
  const total = traitBonus + general.extraDiceBonus;
  // ASSUMPTION U-07: the commander bonus is a flat add to that side's roll.
  if (total !== 0) used.add("U-07");
  return total;
}

/** Dice modifiers the *attacker* suffers from where the battle is fought. */
export function terrainDiceModifier(conditions: BattleConditions, used: UsedAssumptions): number {
  const r = COMBAT_RULES_REFERENCE;
  const topo = r.topography[conditions.topography]?.defenderDice ?? 0;
  const veg = conditions.vegetation ? (r.vegetation[conditions.vegetation]?.defenderDice ?? 0) : 0;
  const crossing =
    conditions.crossing === "river"
      ? C.RIVER_CROSSING_DICE
      : conditions.crossing === "strait"
        ? C.STRAIT_CROSSING_DICE
        : conditions.crossing === "sea_landing"
          ? C.SEA_LANDING_DICE
          : 0;
  // ASSUMPTION U-05: the terrain `defender` value is a penalty on the
  // attacker's roll. ASSUMPTION U-06: topography + vegetation add.
  if (topo !== 0 || veg !== 0) used.add("U-05");
  if (topo !== 0 && veg !== 0) used.add("U-06");
  if (topo !== 0 || veg !== 0) used.add("U-18"); // per-unit terrain penalties not applied
  return crossing - topo - veg;
}

/**
 * ASSUMPTION U-01/U-02: wiki `10 + (roll−1+mods)×2` and `0.05 + (roll−1+mods)×0.01`
 * both read as functions of one dice value `COMBAT_BASE + roll − 1 + mods`.
 * ASSUMPTION U-04: that value is clamped to [0, COMBAT_MAX].
 */
export function diceValue(roll: number, modifiers: number, used: UsedAssumptions): { effective: number; unclamped: number } {
  used.add("U-01");
  used.add("U-02");
  const unclamped = C.COMBAT_BASE + roll - 1 + modifiers;
  const effective = Math.min(C.COMBAT_MAX, Math.max(0, unclamped));
  if (effective !== unclamped) used.add("U-04");
  return { effective, unclamped };
}

export interface Attacker {
  men: number;
  combatPower: number;
  discipline: number;
  categoryPower: number;
  strengthDamageDone: number;
  moraleDamageDone: number;
  isLevy: boolean;
  levyCombatEfficiency: number;
  flankingAbility: number;
}

export interface Defender {
  discipline: number;
  militaryTactics: number;
  experience: number;
  strengthDamageTaken: number;
  moraleDamageTaken: number;
  /** Sum of secure-flanks defense from occupied neighbour sections. */
  secureFlanks: number;
  engaged: boolean;
}

export interface HitContext {
  dice: number;
  /** True when the target is not in the section opposite the attacker. */
  flanking: boolean;
}

function offenseMultiplier(a: Attacker, ctx: HitContext, used: UsedAssumptions): number {
  // ASSUMPTION U-10: discipline multiplies damage done by (1 + discipline).
  used.add("U-10");
  let m = (1 + a.discipline) * (1 + a.categoryPower);
  // ASSUMPTION U-12: category power multiplies damage done; the wiki's
  // defender-side 0.75/1.25 unit-type factors are not applied (unsourced).
  if (a.categoryPower !== 0) used.add("U-12");
  if (a.isLevy) {
    // ASSUMPTION U-15: levy efficiency applies to damage done only.
    used.add("U-15");
    m *= C.LAND_LEVY_COMBAT_IMPACT * (1 + a.levyCombatEfficiency);
  }
  if (ctx.flanking) {
    // ASSUMPTION U-13: flanking ability multiplies damage against a
    // non-opposing section.
    used.add("U-13");
    m *= a.flankingAbility;
  }
  return m;
}

function defenseMultiplier(d: Defender, used: UsedAssumptions): number {
  // ASSUMPTION U-10 (defense half): damage taken ÷ (1 + discipline).
  // ASSUMPTION U-09: military tactics divides damage taken by (1 + tactics).
  let m = 1 / ((1 + d.discipline) * (1 + d.militaryTactics));
  if (d.militaryTactics !== 0) used.add("U-09");
  if (d.experience > 0) {
    // ASSUMPTION U-11: experience on a 0–100 scale.
    used.add("U-11");
    m *= 1 - (d.experience / EXPERIENCE_SCALE) * C.LAND_EXPERIENCE_DAMAGE_REDUCTION;
  }
  if (d.secureFlanks > 0) {
    // ASSUMPTION U-14: secure-flanks defense per occupied neighbour.
    used.add("U-14");
    m *= Math.max(0, 1 - d.secureFlanks);
  }
  return m;
}

/** Men killed in one hour by one attacking regiment. */
export function strengthDamage(a: Attacker, d: Defender, ctx: HitContext, used: UsedAssumptions): number {
  // ASSUMPTION U-03: LAND_STRENGTH_DAMAGE_MODIFIER is a final multiplier.
  used.add("U-03");
  // ASSUMPTION U-17: unit *_damage_done / *_damage_taken multiply by (1 + x).
  if (a.strengthDamageDone !== 0 || d.strengthDamageTaken !== 0) used.add("U-17");
  let dmg =
    ctx.dice *
    STRENGTH_DICE_SLOPE *
    a.combatPower *
    (a.men / U.REGIMENT_SIZE) *
    C.LAND_STRENGTH_DAMAGE_MODIFIER *
    (1 + a.strengthDamageDone) *
    (1 + d.strengthDamageTaken) *
    offenseMultiplier(a, ctx, used) *
    defenseMultiplier(d, used);
  if (!d.engaged) {
    // ASSUMPTION U-16: units hit while not engaged take extra damage.
    used.add("U-16");
    dmg *= C.NOT_ENGAGED_STRENGTH_DAMAGE_MODIFIER;
  }
  return Math.max(0, dmg);
}

/** Morale lost in one hour by the target of one attacking regiment. */
export function moraleDamage(a: Attacker, d: Defender, ctx: HitContext, used: UsedAssumptions): number {
  if (a.moraleDamageDone !== 0 || d.moraleDamageTaken !== 0) used.add("U-17");
  let dmg =
    ctx.dice *
    C.COMBAT_DAMAGE_MULT *
    C.BASE_MORALE_DAMAGE *
    C.LAND_MORALE_DAMAGE_MODIFIER *
    a.combatPower *
    (a.men / U.REGIMENT_SIZE) *
    (1 + a.moraleDamageDone) *
    (1 + d.moraleDamageTaken) *
    offenseMultiplier(a, ctx, used) *
    defenseMultiplier(d, used);
  if (!d.engaged) {
    used.add("U-16");
    dmg *= C.NOT_ENGAGED_MORALE_DAMAGE_MODIFIER;
  }
  return Math.max(0, dmg);
}

/** ASSUMPTION U-28: max morale = LAND_MORALE × (1 + land_morale_modifier). */
export function maxMorale(landMoraleModifier: number, used: UsedAssumptions): number {
  used.add("U-28");
  return U.LAND_MORALE * (1 + landMoraleModifier);
}

/**
 * ASSUMPTION U-22: hourly engagement chance, per the defines' own comments:
 * base + min(initiative × each × (1 + army_initiative), max) + hours × per-hour.
 */
export function engagementChance(initiative: number, armyInitiative: number, hoursInCombat: number, used: UsedAssumptions): number {
  used.add("U-22");
  const fromInitiative = Math.min(C.INITIATIVE_CHANCE_MAX, initiative * C.INITIATIVE_CHANCE_EACH * (1 + armyInitiative));
  return C.INITIATIVE_BASE_CHANCE + fromInitiative + hoursInCombat * C.INITIATIVE_CHANCE_HOURS;
}

/** ASSUMPTION U-23: reserve → front chance per hour = COMBAT_SPEED_SCALE × combat speed. */
export function reserveMoveChance(combatSpeed: number, used: UsedAssumptions): number {
  used.add("U-23");
  return C.COMBAT_SPEED_SCALE * combatSpeed;
}

/** ASSUMPTION U-35: bombard fire chance = BOMBARD_BASE_CHANCE (no bombard-efficiency input yet). */
export function bombardChance(used: UsedAssumptions): number {
  used.add("U-35");
  return C.BOMBARD_BASE_CHANCE;
}
