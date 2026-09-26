// The battle engine (contracts/engine-api.md). Pure and deterministic: no
// DOM/React/DuckDB, no Math.random, no Date. Plays one land battle hour by
// hour — an optional bombard phase, then 5-hour combat phases with a fresh
// d10 per side at each phase start — per spec FR-006/FR-008 and
// research.md §1–§3. No numeric literals other than 0 and 1 here
// (guarantee 6); unverified rules are tagged with their
// specs/019-battle-simulator/combat-unknowns.md IDs.
import { UNIT_TYPE_REFERENCE, type UnitTypeStats } from "../components/Overview/unitTypeReference";
import { HOURS_PER_DAY, HOUR_LIMIT, PERCENT_SCALE } from "./assumedConstants";
import {
  bombardChance,
  commanderBonus,
  diceValue,
  engagementChance,
  maxMorale,
  moraleDamage,
  reserveMoveChance,
  strengthDamage,
  terrainDiceModifier,
  type Attacker,
  type Defender,
  type UsedAssumptions,
} from "./combatFormula";
import { COMBAT_RULES_REFERENCE } from "./combatRulesReference";
import { FRONT_SECTIONS, NEIGHBOUR_SECTIONS, OPPOSING_SECTION, placeRegiments, sectionFrontage } from "./frontage";
import { createRng, fnv1a, stableStringify, type Rng } from "./rng";
import type {
  ArmyCategory,
  BattleInput,
  BattleResult,
  BattleSide,
  EndReason,
  FrontSection,
  HourSideSample,
  Outcome,
  PhaseRecord,
  SectionKey,
  SideStats,
  SideSummary,
} from "./types";
import { unitCategory, validateBattleInput } from "./validation";

export { validateBattleInput } from "./validation";

const C = COMBAT_RULES_REFERENCE.nCombat;
const U = COMBAT_RULES_REFERENCE.nUnit;

interface Regiment {
  category: ArmyCategory;
  unit: UnitTypeStats;
  men: number;
  startMen: number;
  morale: number;
  experience: number;
  isLevy: boolean;
  section: SectionKey;
  engaged: boolean;
  withdrawn: boolean;
  destroyed: boolean;
  target: Regiment | null;
  pendingMen: number;
  pendingMorale: number;
}

interface SideState {
  regs: Regiment[];
  stats: SideStats;
  maxMorale: number;
  diceBonus: number;
  dice: number;
  ended: boolean;
  endReason: EndReason | null;
}

/** Stable hash of everything except the seed (replay identity, SC-006). */
export function hashBattleInput(input: BattleInput): string {
  const { seed: _seed, ...rest } = input;
  return fnv1a(stableStringify(rest));
}

/** Nation stats plus the general's trait modifiers (ASSUMPTION U-39). */
function effectiveStats(side: BattleSide, used: UsedAssumptions): SideStats {
  const trait = side.general.trait ? (COMBAT_RULES_REFERENCE.generalTraits[side.general.trait] ?? {}) : {};
  const s: SideStats = { ...side.stats, power: { ...side.stats.power } };
  const add = (key: string) => {
    const v = trait[key] ?? 0;
    if (v !== 0) used.add("U-39");
    return v;
  };
  s.discipline += add("discipline");
  s.militaryTactics += add("military_tactics");
  s.landMoraleModifier += add("land_morale_modifier");
  s.armyInitiative += add("army_initiative");
  for (const c of Object.keys(s.power) as ArmyCategory[]) s.power[c] += add(`${c}_power`);
  return s;
}

function buildSide(side: BattleSide, frontage: number, used: UsedAssumptions): SideState {
  const stats = effectiveStats(side, used);
  const max = maxMorale(stats.landMoraleModifier, used);
  const regs: Regiment[] = [];
  for (const row of side.composition) {
    const unit = UNIT_TYPE_REFERENCE[row.unitType].stats;
    const category = unitCategory(row.unitType);
    const men = (row.strengthPct / PERCENT_SCALE) * unit.maxStrength * U.REGIMENT_SIZE;
    if (row.section) used.add("U-25");
    for (let i = 0; i < row.count; i++) {
      regs.push({
        category,
        unit,
        men,
        startMen: men,
        morale: (max * stats.startingMoralePct) / PERCENT_SCALE,
        experience: row.experience,
        isLevy: row.isLevy,
        section: "reserves",
        engaged: false,
        withdrawn: false,
        destroyed: men <= 0,
        target: null,
        pendingMen: 0,
        pendingMorale: 0,
      });
    }
  }
  // ASSUMPTION U-45: auxiliaries never leave reserves and take no part.
  if (regs.some((r) => r.category === "army_auxiliary")) used.add("U-45");
  used.add("U-20");
  used.add("U-21");
  const placement = placeRegiments(
    regs.map((r, i) => ({ category: r.category, frontage: r.unit.frontage, presetSection: presetSectionOf(side, i) })),
    side.formation,
    frontage,
  );
  regs.forEach((r, i) => (r.section = r.category === "army_auxiliary" ? "reserves" : placement[i]));
  return {
    regs,
    stats,
    maxMorale: max,
    diceBonus: commanderBonus(side.general, used),
    dice: 0,
    ended: false,
    endReason: null,
  };
}

function presetSectionOf(side: BattleSide, regIndex: number): SectionKey | null {
  let i = regIndex;
  for (const row of side.composition) {
    if (i < row.count) return row.section;
    i -= row.count;
  }
  return null;
}

const fights = (r: Regiment) => r.category !== "army_auxiliary" && !r.destroyed;
const active = (r: Regiment) => fights(r) && !r.withdrawn;

function sideStrength(s: SideState): number {
  return s.regs.reduce((sum, r) => (fights(r) ? sum + r.men : sum), 0);
}

/** Men-weighted average morale of non-destroyed fighting regiments, as a fraction of max. */
function sideMoraleFraction(s: SideState): number {
  let men = 0;
  let weighted = 0;
  for (const r of s.regs) {
    if (!fights(r)) continue;
    men += r.men;
    weighted += r.men * Math.max(0, r.morale);
  }
  return men > 0 ? weighted / men / s.maxMorale : 0;
}

function occupiedSections(s: SideState): Set<FrontSection> {
  const out = new Set<FrontSection>();
  for (const r of s.regs) if (active(r) && r.section !== "reserves") out.add(r.section);
  return out;
}

/**
 * ASSUMPTION U-24: a regiment keeps its target until it is withdrawn or
 * destroyed; otherwise it picks a random active enemy in the opposing
 * section (engaged ones first), else anywhere on the enemy's front.
 */
function pickTarget(me: Regiment, enemy: SideState, rng: Rng, used: UsedAssumptions): Regiment | null {
  used.add("U-24");
  if (me.target && active(me.target) && me.target.section !== "reserves") return me.target;
  const facing = OPPOSING_SECTION[me.section as FrontSection];
  const inFacing = enemy.regs.filter((r) => active(r) && r.section === facing);
  const engagedFacing = inFacing.filter((r) => r.engaged);
  const pool = engagedFacing.length > 0 ? engagedFacing : inFacing;
  if (pool.length > 0) return pool[rng.int(0, pool.length - 1)];
  const front = enemy.regs.filter((r) => active(r) && r.section !== "reserves");
  if (front.length === 0) return null;
  const engagedFront = front.filter((r) => r.engaged);
  const any = engagedFront.length > 0 ? engagedFront : front;
  return any[rng.int(0, any.length - 1)];
}

function attackerOf(r: Regiment, s: SideState): Attacker {
  return {
    men: r.men,
    combatPower: r.unit.combatPower,
    discipline: s.stats.discipline,
    categoryPower: s.stats.power[r.category],
    strengthDamageDone: r.unit.strengthDamageDone,
    moraleDamageDone: r.unit.moraleDamageDone,
    isLevy: r.isLevy,
    levyCombatEfficiency: s.stats.levyCombatEfficiency,
    flankingAbility: r.unit.flankingAbility,
  };
}

function defenderOf(r: Regiment, s: SideState, occupied: Set<FrontSection>, engagedOverride?: boolean): Defender {
  let secure = 0;
  if (r.section !== "reserves") {
    for (const n of NEIGHBOUR_SECTIONS[r.section]) if (occupied.has(n)) secure += r.unit.secureFlanksDefense;
  }
  return {
    discipline: s.stats.discipline,
    militaryTactics: s.stats.militaryTactics,
    experience: r.experience,
    strengthDamageTaken: r.unit.strengthDamageTaken,
    moraleDamageTaken: r.unit.moraleDamageTaken,
    secureFlanks: secure,
    engaged: engagedOverride ?? r.engaged,
  };
}

export function simulateBattle(input: BattleInput, onProgress?: (hour: number) => void): BattleResult {
  const issues = validateBattleInput(input);
  if (issues.length > 0) throw new Error(`Invalid battle input: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`);

  const used: UsedAssumptions = new Set();
  const rng = createRng(input.seed);
  const frontage = sectionFrontage(input.conditions);
  const sides: [SideState, SideState] = [
    buildSide(input.attacker, frontage, used),
    buildSide(input.defender, frontage, used),
  ];
  const [att, def] = sides;
  const attackerTerrain = terrainDiceModifier(input.conditions, used);
  // ASSUMPTION U-08: one roll per side per phase.
  used.add("U-08");

  const startStrength = [sideStrength(att), sideStrength(def)];
  const hasArtillery = sides.some((s) => s.regs.some((r) => active(r) && r.category === "army_artillery"));
  // ASSUMPTION U-37: bombard only opens the battle, and only with artillery.
  if (hasArtillery) used.add("U-37");
  const bombardHours = hasArtillery ? C.BOMBARD_HOURS : 0;

  const phases: PhaseRecord[] = [];
  const timeline: BattleResult["timeline"] = [];
  let hour = 0;

  const startPhase = (kind: "bombard" | "combat") => {
    const rolls = [rng.int(1, C.COMBAT_DICE_SIDE), rng.int(1, C.COMBAT_DICE_SIDE)];
    const a = diceValue(rolls[0], att.diceBonus + attackerTerrain, used);
    const d = diceValue(rolls[1], def.diceBonus, used);
    att.dice = a.effective;
    def.dice = d.effective;
    phases.push({
      index: phases.length,
      kind,
      startHour: hour,
      attackerRoll: rolls[0],
      defenderRoll: rolls[1],
      attackerEffective: a.effective,
      defenderEffective: d.effective,
      attackerUnclamped: a.unclamped,
      defenderUnclamped: d.unclamped,
    });
    onProgress?.(hour);
  };

  while (hour < HOUR_LIMIT) {
    const inBombard = hour < bombardHours;
    const combatHour = hour - bombardHours;
    if (inBombard ? hour === 0 : combatHour % C.HOURS_PER_PHASE === 0) startPhase(inBombard ? "bombard" : "combat");

    const occupied = [occupiedSections(att), occupiedSections(def)];

    if (inBombard) {
      // ASSUMPTION U-19: bombard hits use the ordinary strength formula
      // (no flanking, no not-engaged bonus), strength damage only.
      used.add("U-19");
      sides.forEach((s, si) => {
        const enemy = sides[1 - si];
        for (const r of s.regs) {
          if (!active(r) || r.category !== "army_artillery" || r.section === "reserves") continue;
          if (!rng.chance(bombardChance(used))) continue;
          const target = pickTarget(r, enemy, rng, used);
          if (!target) continue;
          target.pendingMen += strengthDamage(
            attackerOf(r, s),
            defenderOf(target, enemy, occupied[1 - si], true),
            { dice: s.dice, flanking: false },
            used,
          );
        }
      });
    } else {
      for (const s of sides) {
        // Reserves move up where there's room (ASSUMPTION U-23).
        const room: Record<FrontSection, number> = { left: 0, center: 0, right: 0 };
        for (const sec of FRONT_SECTIONS) {
          const cap = frontage * C.MAX_FRONTAGE_OVERSTACKING;
          const filled = s.regs.reduce((sum, r) => (active(r) && r.section === sec ? sum + r.unit.frontage : sum), 0);
          room[sec] = cap - filled;
        }
        for (const r of s.regs) {
          if (!active(r) || r.section !== "reserves" || r.category === "army_auxiliary") continue;
          if (!rng.chance(reserveMoveChance(r.unit.combatSpeed, used))) continue;
          const best = FRONT_SECTIONS.reduce((a, b) => (room[b] > room[a] ? b : a));
          if (room[best] < r.unit.frontage) continue;
          r.section = best;
          room[best] -= r.unit.frontage;
        }
        // Engagement rolls, limited to the section's engaged frontage.
        const engagedFrontage: Record<FrontSection, number> = { left: 0, center: 0, right: 0 };
        for (const r of s.regs) if (active(r) && r.engaged && r.section !== "reserves") engagedFrontage[r.section] += r.unit.frontage;
        for (const r of s.regs) {
          if (!active(r) || r.engaged || r.section === "reserves") continue;
          if (engagedFrontage[r.section] + r.unit.frontage > frontage) continue;
          if (!rng.chance(engagementChance(r.unit.initiative, s.stats.armyInitiative, combatHour, used))) continue;
          r.engaged = true;
          engagedFrontage[r.section] += r.unit.frontage;
        }
      }
      // Damage, computed from this hour's starting state, applied together.
      sides.forEach((s, si) => {
        const enemy = sides[1 - si];
        for (const r of s.regs) {
          if (!active(r) || !r.engaged || r.section === "reserves") continue;
          const target = pickTarget(r, enemy, rng, used);
          r.target = target;
          if (!target) continue;
          const ctx = { dice: s.dice, flanking: target.section !== OPPOSING_SECTION[r.section as FrontSection] };
          const a = attackerOf(r, s);
          const d = defenderOf(target, enemy, occupied[1 - si]);
          target.pendingMen += strengthDamage(a, d, ctx, used);
          target.pendingMorale += moraleDamage(a, d, ctx, used);
        }
      });
    }

    // Apply damage, the hourly morale drain, withdrawals and destruction.
    const casualties = [0, 0];
    sides.forEach((s, si) => {
      for (const r of s.regs) {
        if (!fights(r)) continue;
        const lost = Math.min(r.men, r.pendingMen);
        r.men -= lost;
        casualties[si] += lost;
        r.morale -= r.pendingMorale;
        if (r.engaged && !r.withdrawn) {
          // ASSUMPTION U-29: flat hourly morale drain on engaged regiments.
          used.add("U-29");
          r.morale -= C.COMBAT_HOURLY_MORALE_TICK;
        }
        r.pendingMen = 0;
        r.pendingMorale = 0;
        if (r.men <= 0) {
          r.destroyed = true;
          r.engaged = false;
        } else if (r.morale <= 0 && !r.withdrawn) {
          // ASSUMPTION U-26: a regiment withdraws at 0 morale, for good.
          used.add("U-26");
          r.withdrawn = true;
          r.engaged = false;
        }
      }
    });

    hour++;
    const sample = (s: SideState, si: number): HourSideSample => ({
      strength: sideStrength(s),
      moralePct: sideMoraleFraction(s) * PERCENT_SCALE,
      casualtiesThisHour: casualties[si],
      engaged: s.regs.filter((r) => active(r) && r.engaged).length,
      reserves: s.regs.filter((r) => active(r) && r.section === "reserves" && r.category !== "army_auxiliary").length,
    });
    timeline.push({ hour, attacker: sample(att, 0), defender: sample(def, 1) });

    for (const s of sides) {
      if (!s.regs.some(active)) {
        s.ended = true;
        // ASSUMPTION U-32: a stackwipe is losing every man, nothing else.
        used.add("U-32");
        s.endReason = sideStrength(s) <= 0 ? "stackwipe" : "morale";
      } else if (hour >= C.MINIMUM_COMBAT_DURATION && sideMoraleFraction(s) <= C.MORALE_COLLAPSE_THRESHOLD) {
        // ASSUMPTION U-30/U-31: rout when average morale ≤ threshold × max,
        // never before MINIMUM_COMBAT_DURATION hours.
        used.add("U-30");
        used.add("U-31");
        s.ended = true;
        s.endReason = "morale";
      }
    }
    if (att.ended || def.ended) break;
  }

  let outcome: Outcome;
  let endReason: EndReason;
  if (att.ended && def.ended) {
    outcome = "draw";
    endReason = "mutual";
  } else if (att.ended) {
    outcome = "defender";
    endReason = att.endReason ?? "morale";
  } else if (def.ended) {
    outcome = "attacker";
    endReason = def.endReason ?? "morale";
  } else {
    outcome = "unresolved";
    endReason = "hour-limit";
  }

  const summary = (s: SideState, si: number): SideSummary => {
    const end = sideStrength(s);
    return {
      startStrength: startStrength[si],
      endStrength: end,
      casualties: startStrength[si] - end,
      endMoralePct: sideMoraleFraction(s) * PERCENT_SCALE,
      regimentsRouted: s.regs.filter((r) => fights(r) && r.withdrawn).length,
      regimentsDestroyed: s.regs.filter((r) => r.category !== "army_auxiliary" && r.destroyed && r.startMen > 0).length,
    };
  };

  return {
    seed: input.seed,
    inputHash: hashBattleInput(input),
    outcome,
    endReason,
    hours: hour,
    days: hour / HOURS_PER_DAY,
    perSide: { attacker: summary(att, 0), defender: summary(def, 1) },
    phases,
    timeline,
    approximations: [...used].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    simulated: true,
  };
}
