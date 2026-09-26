// Shared builders for battle-simulator tests.
import type { BattleInput, BattleSide, CompositionRow, SideStats } from "../../src/battleSim/types";

export function defaultStats(overrides: Partial<SideStats> = {}): SideStats {
  return {
    discipline: 0,
    militaryTactics: 0,
    landMoraleModifier: 0,
    levyCombatEfficiency: 0,
    armyInitiative: 0,
    startingMoralePct: 100,
    ...overrides,
    power: {
      army_light_infantry: 0,
      army_heavy_infantry: 0,
      army_light_cavalry: 0,
      army_heavy_cavalry: 0,
      army_artillery: 0,
      army_auxiliary: 0,
      ...(overrides.power ?? {}),
    },
  };
}

export function row(unitType: string, count: number, overrides: Partial<CompositionRow> = {}): CompositionRow {
  return { unitType, count, strengthPct: 100, isLevy: false, experience: 0, section: null, ...overrides };
}

export function side(label: string, composition: CompositionRow[], overrides: Partial<BattleSide> = {}): BattleSide {
  return {
    label,
    formation: "balanced_army",
    composition,
    stats: defaultStats(),
    general: { trait: null, extraDiceBonus: 0, mil: null },
    ...overrides,
  };
}

/** A plain age-1 infantry/cavalry/artillery mix on each side. */
export function sampleInput(seed = 1, attackerInfantry = 12, defenderInfantry = 12): BattleInput {
  return {
    seed,
    conditions: { topography: "flatland", vegetation: null, locationRank: "rural_settlement", crossing: "none" },
    attacker: side("Attacker", [row("a_archers", attackerInfantry), row("a_armored_horsemen", 3), row("a_champions", 4)]),
    defender: side("Defender", [row("a_archers", defenderInfantry), row("a_armored_horsemen", 3), row("a_champions", 4)]),
  };
}
