// specs/019-battle-simulator T019: pre-filling a side from a parsed save.
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applySchema, closeSaveDatabase, openSaveDatabase, type SaveDatabase } from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { buildSideFromSave, toBattleSide } from "../../src/components/BattleSimulator/battleSimData";
import { validateBattleInput, simulateBattle } from "../../src/battleSim/engine";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const fixtureText = readFileSync(path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5"), "utf-8");

describe("battle simulator pre-fill from a save", () => {
  let db: SaveDatabase;
  beforeAll(() => ensureTestDuckDBConfigured());
  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function parsed(name: string) {
    db = await openSaveDatabase(name);
    await applySchema(db);
    await parseAndStore(db, name, "rus-1628-minimal.eu5", toBytes(fixtureText));
  }

  it("groups an army's regiments by unit type and section, with sources marked honestly", async () => {
    await parsed("prefill-sca.db");
    const side = await buildSideFromSave(db, 3, 1000003, "SCA");
    expect(side.formation).toMatchObject({ value: "cav_inf_cav", source: "save" });
    expect(side.generalTrait).toMatchObject({ value: "inspirational_leader_general", source: "save" });
    expect(side.mil).toBe(100);
    const rows = side.rows.map((r) => ({
      unitType: r.unitType.value,
      count: r.count.value,
      strengthPct: r.strengthPct.value,
      source: r.strengthPct.source,
      experience: r.experience.value,
      section: r.section,
    }));
    // a_armored_horsemen max 0.2 → 100%; a_archers max 0.5, 0.45 → 90%.
    expect(rows).toEqual([
      { unitType: "a_armored_horsemen", count: 1, strengthPct: 100, source: "save", experience: 12.5, section: "right" },
      { unitType: "a_archers", count: 1, strengthPct: 90, source: "save", experience: 3, section: "center" },
    ]);
    // Stats 012's pipeline doesn't cover stay game defaults, never "save".
    expect(side.stats.landMoraleModifier.source).toBe("default");
    expect(side.power.army_artillery.source).toBe("default");
  });

  it("marks regiments with no strength in the save as a default 0% (U-46) and leaves captured ones out", async () => {
    await parsed("prefill-rus.db");
    const side = await buildSideFromSave(db, 2025, 1000001, "RUS");
    const crossbow = side.rows.find((r) => r.unitType.value === "a_crossbowmen");
    expect(crossbow?.strengthPct).toMatchObject({ value: 0, source: "default" });
    expect(crossbow?.section).toBe("reserves");
    expect(side.rows.some((r) => r.unitType.value === "a_baggage_train")).toBe(false);
    expect(side.notes.join(" ")).toMatch(/no strength value/);
  });

  it("produces a valid, simulatable battle from two real armies", async () => {
    await parsed("prefill-battle.db");
    const attacker = toBattleSide(await buildSideFromSave(db, 2025, 1000001, "RUS"));
    const defender = toBattleSide(await buildSideFromSave(db, 3, 1000003, "SCA"));
    const input = {
      seed: 7,
      conditions: { topography: "flatland", vegetation: null, locationRank: "rural_settlement", crossing: "none" as const },
      attacker,
      defender,
    };
    expect(validateBattleInput(input)).toEqual([]);
    expect(simulateBattle(input).simulated).toBe(true);
  });
});
