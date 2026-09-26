// Calibration report for the battle simulator (specs/019-battle-simulator
// research.md §8, SC-003): replays each battle the real save recorded
// (tests/fixtures/battle-sim/reference-battles.json, from
// extract-reference-battles.ts) over many seeds and compares against what
// actually happened. A *report*, not a tuning loop — results update the
// ledger (combat-unknowns.md), constants are never fitted to them.
//
// Known limits (documented in research.md §8 / the ledger):
//   - the save records men per *category*, not unit types; each category
//     uses the real save's most common regular age-4 unit (the battles are
//     all 1620s, age_4_reformation starts 1537 per in_game/common/age);
//   - nation stats at battle time aren't recorded — every side uses game
//     defaults (no discipline/tactics), so only composition, terrain,
//     army experience and the general's trait differ between battles;
//   - settlement rank and river crossings aren't recorded — rural, none.
//
// Usage: npx tsx tools/battle-sim-reference/calibrate.ts [--seeds 100]
import { readFileSync } from "node:fs";
import { UNIT_TYPE_REFERENCE } from "../../src/components/Overview/unitTypeReference";
import { COMBAT_RULES_REFERENCE } from "../../src/battleSim/combatRulesReference";
import { simulateBattle, validateBattleInput } from "../../src/battleSim/engine";
import type { BattleInput, BattleSide, CompositionRow, SideStats } from "../../src/battleSim/types";
import { SLOT_CATEGORIES, type ReferenceBattle, type ReferenceSide } from "./extract-reference-battles";

/** Most common regular age-4 unit per category in the real kept save (2026-09-26). */
export const REPRESENTATIVE_UNIT: Record<(typeof SLOT_CATEGORIES)[number], string> = {
  army_light_infantry: "a_arquebusiers",
  army_heavy_infantry: "a_pikemen",
  army_light_cavalry: "a_pistoleers",
  army_heavy_cavalry: "a_heavy_lancers",
  army_artillery: "a_chambered_cannon",
  army_auxiliary: "a_baggage_train",
};

const DEFAULT_STATS: SideStats = {
  discipline: 0,
  militaryTactics: 0,
  landMoraleModifier: 0,
  levyCombatEfficiency: 0,
  armyInitiative: 0,
  startingMoralePct: 100,
  power: {
    army_light_infantry: 0,
    army_heavy_infantry: 0,
    army_light_cavalry: 0,
    army_heavy_cavalry: 0,
    army_artillery: 0,
    army_auxiliary: 0,
  },
};

function toSide(label: string, s: ReferenceSide): BattleSide {
  const composition: CompositionRow[] = [];
  SLOT_CATEGORIES.forEach((cat, i) => {
    const thousands = s.total[i];
    if (!(thousands > 0)) return;
    const unitType = REPRESENTATIVE_UNIT[cat];
    const max = UNIT_TYPE_REFERENCE[unitType].stats.maxStrength;
    const count = Math.ceil(thousands / max - 1e-9);
    composition.push({
      unitType,
      count,
      strengthPct: Math.min(100, (thousands / (count * max)) * 100),
      isLevy: false,
      experience: Math.min(100, Math.max(0, s.experience ?? 0)),
      section: null,
    });
  });
  const trait = s.generalTrait && COMBAT_RULES_REFERENCE.generalTraits[s.generalTrait] ? s.generalTrait : null;
  return {
    label,
    formation: "balanced_army",
    composition,
    stats: DEFAULT_STATS,
    general: { trait, extraDiceBonus: 0, mil: null },
  };
}

export function toInput(b: ReferenceBattle, seed: number): BattleInput {
  return {
    seed,
    conditions: {
      topography: b.topography && COMBAT_RULES_REFERENCE.topography[b.topography] ? b.topography : "flatland",
      vegetation: b.vegetation && COMBAT_RULES_REFERENCE.vegetation[b.vegetation] ? b.vegetation : null,
      locationRank: "rural_settlement",
      crossing: "none",
    },
    attacker: toSide("Attacker", b.attacker),
    defender: toSide("Defender", b.defender),
  };
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface BattleCalibration {
  date: string;
  terrain: string;
  sizes: [number, number];
  recordedWinner: "attacker" | "defender";
  simWinShare: number;
  winnerAgrees: boolean;
  recordedLosses: [number, number];
  medianLosses: [number, number];
  /** |median − recorded| / recorded for the recorded winner's losses; null if recorded 0. */
  winnerLossError: number | null;
}

export function calibrate(battles: ReferenceBattle[], seeds: number) {
  // A side with only auxiliaries can't be simulated under ASSUMPTION U-45
  // (auxiliaries never fight) — counted, not silently dropped.
  const simulatable = battles.filter((b) => validateBattleInput(toInput(b, 1)).length === 0);
  const skipped = battles.filter((b) => !simulatable.includes(b));
  const perBattle: BattleCalibration[] = simulatable.map((b) => {
    const recordedWinner = b.attackerWon ? "attacker" : "defender";
    const wins: boolean[] = [];
    const attLoss: number[] = [];
    const defLoss: number[] = [];
    for (let s = 1; s <= seeds; s++) {
      const r = simulateBattle(toInput(b, s));
      wins.push(r.outcome === recordedWinner);
      attLoss.push(r.perSide.attacker.casualties);
      defLoss.push(r.perSide.defender.casualties);
    }
    const recordedLosses: [number, number] = [sum(b.attacker.losses) * 1000, sum(b.defender.losses) * 1000];
    const medianLosses: [number, number] = [median(attLoss), median(defLoss)];
    const wi = recordedWinner === "attacker" ? 0 : 1;
    const simWinShare = wins.filter(Boolean).length / seeds;
    return {
      date: b.date,
      terrain: `${b.topography}/${b.vegetation}`,
      sizes: [sum(b.attacker.total) * 1000, sum(b.defender.total) * 1000],
      recordedWinner,
      simWinShare,
      winnerAgrees: simWinShare > 0.5,
      recordedLosses,
      medianLosses,
      winnerLossError: recordedLosses[wi] > 0 ? Math.abs(medianLosses[wi] - recordedLosses[wi]) / recordedLosses[wi] : null,
    };
  });
  const withError = perBattle.filter((p) => p.winnerLossError !== null);
  return {
    skipped: skipped.map((b) => `${b.date} ${b.locationName ?? b.location}`),
    battles: perBattle.length,
    seeds,
    winnerAgreement: perBattle.filter((p) => p.winnerAgrees).length / perBattle.length,
    lossWithin25: withError.filter((p) => (p.winnerLossError ?? 1) <= 0.25).length / Math.max(1, withError.length),
    medianWinnerLossError: median(withError.map((p) => p.winnerLossError ?? 0)),
    perBattle,
  };
}

if (process.argv[1]?.endsWith("calibrate.ts")) {
  const i = process.argv.indexOf("--seeds");
  const seeds = i >= 0 ? Number(process.argv[i + 1]) : 100;
  const battles = JSON.parse(readFileSync("tests/fixtures/battle-sim/reference-battles.json", "utf-8")) as ReferenceBattle[];
  const report = calibrate(battles, seeds);
  const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
  console.log(`Battles: ${report.battles}, seeds each: ${report.seeds}; skipped (not simulatable, U-45): ${report.skipped.length} ${report.skipped.join(", ")}`);
  console.log(`Winner agreement (SC-003 target ≥ 80%): ${pct(report.winnerAgreement)}`);
  console.log(`Winner losses within 25% (SC-003 target): ${pct(report.lossWithin25)}; median error ${pct(report.medianWinnerLossError)}`);
  for (const p of report.perBattle) {
    console.log(
      `${p.date.padEnd(10)} ${p.terrain.padEnd(22)} ${Math.round(p.sizes[0]).toString().padStart(6)} v ${Math.round(p.sizes[1]).toString().padEnd(6)} ` +
        `rec ${p.recordedWinner.padEnd(8)} sim ${pct(p.simWinShare).padStart(4)} ` +
        `losses rec ${p.recordedLosses.map((x) => Math.round(x)).join("/")} sim ${p.medianLosses.map((x) => Math.round(x)).join("/")}`,
    );
  }
}
