// quickstart.md §3 step 6: mountains (defender 2) + a river crossing (−1)
// cost the attacker 3 on every phase's dice, before any clamping (U-04).
import { describe, expect, it } from "vitest";
import { COMBAT_RULES_REFERENCE } from "../../src/battleSim/combatRulesReference";
import { simulateBattle } from "../../src/battleSim/engine";
import { sampleInput } from "./helpers";

describe("battle conditions", () => {
  it("mountains + river crossing lowers the attacker's dice by 3", () => {
    const input = sampleInput(11);
    input.conditions = { ...input.conditions, topography: "mountains", crossing: "river" };
    const r = simulateBattle(input);
    const base = COMBAT_RULES_REFERENCE.nCombat.COMBAT_BASE;
    for (const p of r.phases) {
      expect(p.attackerUnclamped).toBe(base + p.attackerRoll - 1 - 3);
      expect(p.defenderUnclamped).toBe(base + p.defenderRoll - 1);
    }
    expect(r.approximations).toEqual(expect.arrayContaining(["U-05", "U-18"]));
  });

  it("a general trait's commander bonus is added to that side's dice", () => {
    const input = sampleInput(12);
    input.attacker.general = { trait: "strategist", extraDiceBonus: 1, mil: null };
    const r = simulateBattle(input);
    const base = COMBAT_RULES_REFERENCE.nCombat.COMBAT_BASE;
    const bonus = (COMBAT_RULES_REFERENCE.generalTraits.strategist.commander_combat_bonus ?? 0) + 1;
    for (const p of r.phases) expect(p.attackerUnclamped).toBe(base + p.attackerRoll - 1 + bonus);
    expect(r.approximations).toEqual(expect.arrayContaining(["U-07", "U-39"]));
  });

  it("artillery opens the battle with a bombard phase", () => {
    const input = sampleInput(13);
    input.attacker.composition.push({ unitType: "a_chambered_cannon", count: 2, strengthPct: 100, isLevy: false, experience: 0, section: null });
    const r = simulateBattle(input);
    expect(r.phases[0].kind).toBe("bombard");
    expect(r.phases[1].startHour).toBe(COMBAT_RULES_REFERENCE.nCombat.BOMBARD_HOURS);
  });
});
