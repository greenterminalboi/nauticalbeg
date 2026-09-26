// contracts/engine-api.md guarantees 1–7.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hashBattleInput, simulateBattle, validateBattleInput } from "../../src/battleSim/engine";
import type { BattleInput } from "../../src/battleSim/types";
import { defaultStats, row, sampleInput, side } from "./helpers";

const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

function winRate(make: (seed: number) => BattleInput): number {
  return SEEDS.filter((s) => simulateBattle(make(s)).outcome === "attacker").length / SEEDS.length;
}

describe("battle engine contract", () => {
  it("1. is deterministic: same input and seed → identical result", () => {
    expect(simulateBattle(sampleInput(123))).toEqual(simulateBattle(sampleInput(123)));
  });

  it("1b. the input hash ignores the seed but not the armies", () => {
    expect(hashBattleInput(sampleInput(1))).toEqual(hashBattleInput(sampleInput(2)));
    expect(hashBattleInput(sampleInput(1, 12))).not.toEqual(hashBattleInput(sampleInput(1, 13)));
  });

  it("2. refuses invalid input", () => {
    const bad = sampleInput(1);
    bad.defender.composition = [row("a_archers", -5)];
    expect(validateBattleInput(bad).length).toBeGreaterThan(0);
    expect(() => simulateBattle(bad)).toThrow(/Invalid battle input/);
  });

  it("2b. a side with only auxiliaries has no fighting regiments", () => {
    const bad = sampleInput(1);
    bad.attacker.composition = [row("a_camp_followers", 3)];
    expect(validateBattleInput(bad).map((i) => i.path)).toContain("attacker.composition");
  });

  it("3. conserves strength: casualties = start − end, never negative", () => {
    for (const seed of SEEDS.slice(0, 30)) {
      const r = simulateBattle(sampleInput(seed));
      for (const s of [r.perSide.attacker, r.perSide.defender]) {
        expect(s.casualties).toBeCloseTo(s.startStrength - s.endStrength, 6);
        expect(s.endStrength).toBeGreaterThanOrEqual(0);
        expect(s.casualties).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("4. always terminates within the hour limit", () => {
    const r = simulateBattle(sampleInput(5));
    expect(r.hours).toBeLessThanOrEqual(2400);
    expect(["attacker", "defender", "draw", "unresolved"]).toContain(r.outcome);
  });

  it("5a. more regiments never lowers the win rate", () => {
    expect(winRate((s) => sampleInput(s, 16, 12))).toBeGreaterThanOrEqual(winRate((s) => sampleInput(s, 12, 12)));
  });

  it("5b. higher discipline never lowers the win rate", () => {
    const withDiscipline = (seed: number) => {
      const input = sampleInput(seed);
      input.attacker = side("Attacker", input.attacker.composition, { stats: defaultStats({ discipline: 0.2 }) });
      return input;
    };
    expect(winRate(withDiscipline)).toBeGreaterThanOrEqual(winRate((s) => sampleInput(s)));
  });

  it("6. engine.ts and combatFormula.ts contain no numeric literals other than 0 and 1", () => {
    for (const file of ["src/battleSim/engine.ts", "src/battleSim/combatFormula.ts"]) {
      const code = readFileSync(file, "utf-8")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, "");
      const literals = [...code.matchAll(/(?<![\w.$])\d+(?:\.\d+)?(?![\w])/g)].map((m) => m[0]);
      expect(literals.filter((l) => l !== "0" && l !== "1"), file).toEqual([]);
    }
  });

  it("7. results are always labelled simulated, and report the assumptions they used", () => {
    const r = simulateBattle(sampleInput(9));
    expect(r.simulated).toBe(true);
    expect(r.approximations).toContain("U-01");
    expect(r.approximations.every((id) => /^U-\d{2}$/.test(id))).toBe(true);
  });
});
