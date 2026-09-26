// The uncertainty ledger (specs/019-battle-simulator/combat-unknowns.md)
// is the source of truth: the generated unknowns.ts must match it, and
// every ID the engine cites or reports must exist in it.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMBAT_UNKNOWNS } from "../../src/battleSim/unknowns";
import { parseLedger } from "../../tools/battle-sim-reference/generate-unknowns";

const ledger = parseLedger(readFileSync("specs/019-battle-simulator/combat-unknowns.md", "utf-8"));

describe("combat unknowns ledger", () => {
  it("unknowns.ts is regenerated from the current ledger", () => {
    expect(COMBAT_UNKNOWNS).toEqual(ledger);
  });

  it("every U-xx cited in battle code exists in the ledger", () => {
    const dirs = ["src/battleSim", "src/components/BattleSimulator"];
    const cited = new Set<string>();
    for (const dir of dirs) {
      for (const file of readdirSync(dir)) {
        if (file === "unknowns.ts" || !/\.tsx?$/.test(file)) continue;
        for (const m of readFileSync(`${dir}/${file}`, "utf-8").matchAll(/U-\d{2}/g)) cited.add(m[0]);
      }
    }
    expect(cited.size).toBeGreaterThan(20);
    expect([...cited].filter((id) => !ledger[id])).toEqual([]);
  });
});
