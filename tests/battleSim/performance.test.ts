// SC-002: a re-run with 100 regiments per side finishes in under 2 s; 300
// per side completes (in the app it runs in a Web Worker either way).
import { describe, expect, it } from "vitest";
import { simulateBattle } from "../../src/battleSim/engine";
import type { BattleInput } from "../../src/battleSim/types";
import { row, side } from "./helpers";

function big(perSide: number, seed: number): BattleInput {
  const mix = (n: number) => [
    row("a_arquebusiers", Math.round(n * 0.5)),
    row("a_pikemen", Math.round(n * 0.3)),
    row("a_heavy_lancers", Math.round(n * 0.15)),
    row("a_chambered_cannon", n - Math.round(n * 0.5) - Math.round(n * 0.3) - Math.round(n * 0.15)),
  ];
  return {
    seed,
    conditions: { topography: "flatland", vegetation: null, locationRank: "rural_settlement", crossing: "none" },
    attacker: side("Attacker", mix(perSide)),
    defender: side("Defender", mix(perSide)),
  };
}

describe("battle simulator performance", () => {
  it("100 regiments per side finishes in under 2 seconds", () => {
    const start = performance.now();
    const r = simulateBattle(big(100, 1));
    const ms = performance.now() - start;
    expect(r.hours).toBeGreaterThan(0);
    expect(ms).toBeLessThan(2000);
  });

  it("300 regiments per side completes", () => {
    const r = simulateBattle(big(300, 2));
    expect(["attacker", "defender", "draw", "unresolved"]).toContain(r.outcome);
  }, 30000);
});
