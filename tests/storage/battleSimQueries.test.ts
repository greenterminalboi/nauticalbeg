import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applySchema, closeSaveDatabase, openSaveDatabase, type SaveDatabase } from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { listArmiesForNation, loadArmyForSim } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const fixtureText = readFileSync(path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5"), "utf-8");

describe("storage/queries battle simulator (specs/019-battle-simulator)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function freshParsedDb(name: string): Promise<SaveDatabase> {
    db = await openSaveDatabase(name);
    await applySchema(db);
    await parseAndStore(db, name, "rus-1628-minimal.eu5", toBytes(fixtureText));
    return db;
  }

  it("lists a nation's land armies with regiment count and total strength, excluding captured regiments", async () => {
    await freshParsedDb("battlesim-armies.db");
    // RUS army 1000001: pikemen 0.9 + peasant levy 0.6 + crossbowmen (no
    // strength) — the captured baggage train is excluded, the navy isn't an army.
    expect(await listArmiesForNation(db, 2025)).toEqual([
      { armyIdx: 1000001, nameKey: "ARMY_NAME", regimentCount: 3, totalStrength: 1.5, leaderIdx: 100 },
    ]);
    expect(await listArmiesForNation(db, 3)).toEqual([
      { armyIdx: 1000003, nameKey: "ARMY_NAME", regimentCount: 2, totalStrength: 0.65, leaderIdx: 102 },
    ]);
    expect(await listArmiesForNation(db, 0)).toEqual([]);
  });

  it("loads one army's regiments, formation and general", async () => {
    await freshParsedDb("battlesim-load-army.db");
    const army = await loadArmyForSim(db, { armyIdx: 1000003 });
    expect(army.formation).toBe("cav_inf_cav");
    expect(army.general).toEqual({ idx: 102, mil: 100, generalTrait: "inspirational_leader_general" });
    expect(army.regiments).toEqual([
      { unitType: "a_armored_horsemen", strength: 0.2, morale: 2.8, experience: 12.5, box: "Right" },
      { unitType: "a_archers", strength: 0.45, morale: 2.6, experience: 3, box: null },
    ]);
  });

  it("loads every land regiment of a nation for the whole-nation option, with no general", async () => {
    await freshParsedDb("battlesim-whole-nation.db");
    const army = await loadArmyForSim(db, { wholeNation: 2025 });
    expect(army.general).toBeNull();
    expect(army.regiments.map((r) => r.unitType)).toEqual(["a_pikemen", "a_peasant_levy", "a_crossbowmen"]);
    // The crossbowmen have no strength line in the save — kept as null (U-46).
    expect(army.regiments[2].strength).toBeNull();
  });
});
