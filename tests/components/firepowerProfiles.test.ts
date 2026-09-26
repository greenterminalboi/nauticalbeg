import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { applySchema, closeSaveDatabase, openSaveDatabase, type SaveDatabase } from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import {
  buildDoctrinePoints,
  loadArmyProfiles,
  loadNavyProfiles,
  toSocietalValueRows,
} from "../../src/components/Overview/firepowerData";
import { decodeSocietalValuesByNation } from "../../src/components/Overview/societalValuesData";
import type { LeaderboardCountry } from "../../src/components/Overview/leaderboardData";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const fixtureText = readFileSync(path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5"), "utf-8");
const RUS: LeaderboardCountry = { idx: 2025, tag: "RUS", name: "Russia", color: [183, 136, 27], isHumanPlayed: true };

// specs/018 research.md R11: the per-nation military assembly shared by
// Firepower and Countries → Military.
describe("firepowerData shared military profiles", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function load(name: string) {
    db = await openSaveDatabase(name);
    await applySchema(db);
    await parseAndStore(db, "save-mil", "rus-1628-minimal.eu5", toBytes(fixtureText));
  }

  it("builds one army profile per nation, with its identity attached", async () => {
    await load("mil-army.db");
    const readings = await decodeSocietalValuesByNation(db);
    const [army, ...rest] = await loadArmyProfiles(db, [2025], [RUS], toSocietalValueRows(readings));
    expect(rest).toEqual([]);
    expect(army).toMatchObject({ nationIdx: 2025, tag: "RUS", name: "Russia", colorRgb: [183, 136, 27] });
    expect(army.regimentCount).toBe(2);
  });

  it("builds a navy profile from the nation's ships only", async () => {
    await load("mil-navy.db");
    const [navy] = await loadNavyProfiles(db, [2025], [RUS]);
    expect(navy).toMatchObject({ nationIdx: 2025, tag: "RUS" });
    // One n_carrack subunit with number=2: ship counts sum `number`.
    expect(navy.heavyShipCount + navy.lightShipCount + navy.galleyCount + navy.transportCount).toBe(2);
  });

  it("drops a nation that isn't in the country list", async () => {
    await load("mil-unknown.db");
    expect(await loadNavyProfiles(db, [2025], [])).toEqual([]);
  });

  it("plots a doctrine point from the nation's axes, null where an axis doesn't apply", () => {
    const readings = new Map([[2025, [{ axis: "land_vs_naval", value: 62.4 }, { axis: "offensive_vs_defensive", value: -18.9 }]]]);
    expect(buildDoctrinePoints([2025], [RUS], readings)).toEqual([
      {
        nationIdx: 2025,
        tag: "RUS",
        name: "Russia",
        colorRgb: [183, 136, 27],
        axes: [
          { axis: "land_vs_naval", value: 62.4 },
          { axis: "offensive_vs_defensive", value: -18.9 },
          { axis: "quality_vs_quantity", value: null },
        ],
      },
    ]);
    expect(buildDoctrinePoints([2025], [RUS], new Map())).toEqual([]);
  });
});
