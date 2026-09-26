import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  applySchema,
  closeSaveDatabase,
  execSql,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import { getCountryCard, getPopulationMakeup } from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

// RUS owns one location (mazyr, 3975) with two pops: peasants (0.22409,
// literacy 39.1474) and tribesmen (1.80333, literacy 10).
const RUS = 2025;
const POP_A = 0.22409;
const POP_B = 1.80333;
const EXPECTED_LITERACY = (POP_A * 39.1474 + POP_B * 10) / (POP_A + POP_B);

describe("storage/queries country card (specs/018 Overview)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function loadFixture(name: string): Promise<SaveDatabase> {
    db = await openSaveDatabase(name);
    await applySchema(db);
    await parseAndStore(db, "save-018", "rus-1628-minimal.eu5", toBytes(fixtureText));
    return db;
  }

  it("returns every Overview card field for a nation", async () => {
    await loadFixture("country-card-basic.db");
    const card = await getCountryCard(db, RUS);

    expect(card).toMatchObject({
      idx: RUS,
      tag: "RUS",
      name: "RUS",
      governmentType: "monarchy",
      treasury: 5493.12008,
      stability: 27.27082,
      governmentPower: 100,
      prestige: 68.51231,
      monthlyIncome: 1024.17507,
      economicBase: 13.47501,
      locationCount: 1,
      worksOfArt: 1,
      available: { loans: true, worksOfArt: true },
    });
    expect(card.totalDebt).toBeCloseTo(1000.5 + 250.25, 6);
    expect(card.literacy).toBeCloseTo(EXPECTED_LITERACY, 6);
  });

  it("marks exactly the computed fields as derived", async () => {
    await loadFixture("country-card-derived.db");
    const card = await getCountryCard(db, RUS);
    expect([...card.derived].sort()).toEqual(
      ["economicBase", "literacy", "locationCount", "totalDebt", "worksOfArt"].sort(),
    );
  });

  it("shows debt as a confirmed 0 for a nation with no loans", async () => {
    await loadFixture("country-card-no-debt.db");
    const card = await getCountryCard(db, 3);
    expect(card.totalDebt).toBe(0);
    expect(card.monthlyIncome).toBeNull();
  });

  it("returns null debt and flags loans unavailable when the save has no loan data at all", async () => {
    await loadFixture("country-card-old-save.db");
    await execSql(db, "DELETE FROM loans");
    const card = await getCountryCard(db, RUS);
    expect(card.available.loans).toBe(false);
    expect(card.totalDebt).toBeNull();
  });

  it("throws for an unknown nation", async () => {
    await loadFixture("country-card-missing.db");
    await expect(getCountryCard(db, 999_999)).rejects.toThrow();
  });

  it("groups the nation's pops four ways, sized by population", async () => {
    await loadFixture("country-card-makeup.db");
    const makeup = await getPopulationMakeup(db, RUS);

    expect(makeup.estate.map((s) => [s.key, s.size])).toEqual([
      ["tribes_estate", POP_B],
      ["peasants_estate", POP_A],
    ]);
    expect(makeup.socialClass.map((s) => [s.key, s.size])).toEqual([
      ["tribesmen", POP_B],
      ["peasants", POP_A],
    ]);
    expect(makeup.culture.map((s) => s.key)).toEqual(["1019", "873"]);
    expect(makeup.religion.map((s) => s.key)).toEqual(["186", "18"]);

    for (const group of [makeup.estate, makeup.socialClass, makeup.culture, makeup.religion]) {
      const total = group.reduce((n, s) => n + s.size, 0);
      expect(total).toBeCloseTo(POP_A + POP_B, 6);
    }
  });

  it("returns empty groups for a nation with no pops", async () => {
    await loadFixture("country-card-no-pops.db");
    const makeup = await getPopulationMakeup(db, 3);
    // SCA owns location 1, which has no pops in the fixture.
    expect(makeup).toEqual({ religion: [], culture: [], estate: [], socialClass: [] });
  });
});
