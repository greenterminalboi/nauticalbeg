import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tableFromIPC } from "apache-arrow";
import {
  applySchema,
  closeSaveDatabase,
  execSql,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import {
  listMapLocationsArrow,
  listNationEstates,
  listNationLaws,
  listNationLocations,
  listNationPrivileges,
  listNationProvincesArrow,
  listSubjectRelations,
} from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");
const RUS = 2025;

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries Countries tab tables (specs/018)", () => {
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

  it("lists the nation's provinces with the same totals the province map modes show", async () => {
    await loadFixture("country-provinces.db");
    const provinces = decodeRows(await listNationProvincesArrow(db, RUS));
    const map = decodeRows(await listMapLocationsArrow(db)).filter((r) => r.owner_idx === RUS);

    expect(provinces).toHaveLength(1);
    const [province] = provinces;
    const mapRow = map.find((r) => r.province_idx === province.idx)!;
    expect(province).toMatchObject({
      idx: 16777289,
      name: mapRow.province_name,
      development: mapRow.province_development,
      tax_base: mapRow.province_tax_base,
      soldiers: mapRow.province_soldiers,
      population: mapRow.province_population,
    });
    expect(Number(province.location_count)).toBe(1);
  });

  it("lists every location the nation owns with the location map-mode values", async () => {
    await loadFixture("country-locations.db");
    const locations = await listNationLocations(db, RUS);
    const map = decodeRows(await listMapLocationsArrow(db)).filter((r) => r.owner_idx === RUS);

    expect(locations.map((l) => l.idx)).toEqual(map.map((r) => r.idx));
    expect(locations[0]).toEqual({
      idx: 3975,
      name: map[0].name,
      provinceName: map[0].province_name,
      controllerName: map[0].controller_name,
      control: map[0].control,
      rawMaterial: map[0].raw_material,
      population: map[0].total_population,
      development: map[0].development,
      rank: map[0].rank,
      marketName: map[0].market_name,
      taxBase: map[0].possible_tax,
      soldiers: map[0].soldiers,
      cultureName: map[0].culture_name,
      religionName: map[0].religion_name,
    });
  });

  it("lists laws in force and granted privileges", async () => {
    await loadFixture("country-government.db");
    expect(await listNationLaws(db, RUS)).toEqual([
      { lawCategory: "maritime_law", object: "navy_audits", date: "1400.1.1" },
      { lawCategory: "recruitment_law", object: "expanded_levies_policy", date: "1400.1.1" },
    ]);
    expect(await listNationPrivileges(db, RUS)).toEqual([
      { object: "primacy_of_nobility", date: "1400.1.1" },
    ]);
  });

  it("lists the nation's existing estates with their population share", async () => {
    await loadFixture("country-estates.db");
    const { available, rows } = await listNationEstates(db, RUS);
    expect(available).toBe(true);
    expect(rows.map((r) => r.estateType)).toEqual(["crown_estate", "nobles_estate"]);

    const nobles = rows[1];
    expect(nobles).toMatchObject({
      satisfaction: 0.38433,
      taxRate: 0.35,
      gold: 36601.16471,
      balance: -95.92923,
      wealthImpact: 1.12571,
      lastMonth: { taxableIncome: 733.68057, infraExpense: 200 },
    });
    // No RUS pop belongs to the nobles estate: a confirmed zero share.
    expect(nobles.populationShare).toBe(0);
    // The crown record carries satisfaction only.
    expect(rows[0]).toMatchObject({ satisfaction: 1, gold: null, taxRate: null });
    expect(rows[0].lastMonth.taxableIncome).toBeNull();
  });

  it("flags estates unavailable when the save has no estate data", async () => {
    await loadFixture("country-estates-old.db");
    await execSql(db, "DELETE FROM nation_estates");
    expect(await listNationEstates(db, RUS)).toEqual({ available: false, rows: [] });
  });

  it("lists every subject relation save-wide", async () => {
    await loadFixture("country-subjects.db");
    const { available, rows } = await listSubjectRelations(db);
    expect(available).toBe(true);
    expect(rows).toEqual([
      {
        overlordIdx: 1961,
        subjectIdx: 50332944,
        subjectTag: "AAA13",
        subjectName: "AAA13",
        subjectType: "fiefdom",
        startDate: null,
      },
      { overlordIdx: RUS, subjectIdx: 1961, subjectTag: "KIE", subjectName: "KIE", subjectType: "vassal", startDate: "1601.3.2" },
    ]);
  });
});
