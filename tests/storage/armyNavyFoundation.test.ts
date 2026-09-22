import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { tableFromIPC } from "apache-arrow";
import {
  applySchema,
  closeSaveDatabase,
  openSaveDatabase,
  type SaveDatabase,
} from "../../src/storage/db";
import { parseAndStore } from "../../src/parser/version-adapters/1.3.11";
import {
  listNationAdvanceNamesArrow,
  listNationGovernanceSourcesArrow,
  listNationMilitaryScalarsArrow,
  listNavyDamageArrow,
  listRegimentSummaryArrow,
} from "../../src/storage/queries";
import { ensureTestDuckDBConfigured } from "../helpers/duckdb-test-env";
import { toBytes } from "../helpers/encode";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");
const fixtureText = readFileSync(FIXTURE_PATH, "utf-8");

function decodeRows(buffer: ArrayBuffer): Record<string, unknown>[] {
  return tableFromIPC(new Uint8Array(buffer)).toArray().map((row) => row.toJSON());
}

describe("storage/queries Army/Navy foundation (specs/012-firepower-tab)", () => {
  let db: SaveDatabase;

  beforeAll(() => {
    ensureTestDuckDBConfigured();
  });

  afterEach(async () => {
    if (db) await closeSaveDatabase(db);
  });

  async function freshParsedDb(name: string, saveId: string): Promise<SaveDatabase> {
    db = await openSaveDatabase(name);
    await applySchema(db);
    await parseAndStore(db, saveId, "rus-1628-minimal.eu5", toBytes(fixtureText));
    return db;
  }

  it("listRegimentSummaryArrow groups by (nation, unit_type) and returns nothing for an unselected/unmatched nation", async () => {
    await freshParsedDb("regiment-summary.db", "save-1");

    const rows = decodeRows(await listRegimentSummaryArrow(db, [2025]));
    expect(rows.sort((a, b) => String(a.unit_type).localeCompare(String(b.unit_type)))).toEqual([
      { nation_idx: 2025, unit_type: "a_peasant_levy", regiment_count: 1, total_number: 20, avg_morale: 1.2 },
      { nation_idx: 2025, unit_type: "a_pikemen", regiment_count: 1, total_number: 40, avg_morale: 2.5 },
      { nation_idx: 2025, unit_type: "n_carrack", regiment_count: 1, total_number: 2, avg_morale: 3.1 },
    ]);

    // A real, alive country (SCA, idx 3) with zero regiments/ships in
    // the fixture returns no rows at all — never a zero-filled one
    // (spec FR-012).
    const scaRows = decodeRows(await listRegimentSummaryArrow(db, [3]));
    expect(scaRows).toEqual([]);

    // Empty selection returns an empty result, not every country.
    const emptyRows = decodeRows(await listRegimentSummaryArrow(db, []));
    expect(emptyRows).toEqual([]);
  });

  it("listNationAdvanceNamesArrow returns every researched advance for the given nations only", async () => {
    await freshParsedDb("advance-names.db", "save-2");
    const rows = decodeRows(await listNationAdvanceNamesArrow(db, [2025]));
    expect(rows.map((r) => r.advance).sort()).toEqual([
      "fort_limit_1_advance",
      "marine_regiments",
      "military_administration",
      "naval_morale_advance_2",
      "ship_building_techniques_discovery",
      "unlock_footmen_advance",
      "unlock_pikemen_advance",
    ]);
    expect(rows.every((r) => r.nation_idx === 2025)).toBe(true);
  });

  it("listNationMilitaryScalarsArrow returns the 8 military scalar columns for the given nations", async () => {
    await freshParsedDb("military-scalars.db", "save-3");
    const rows = decodeRows(await listNationMilitaryScalarsArrow(db, [2025]));
    expect(rows).toEqual([
      {
        nation_idx: 2025,
        manpower: 429.10362,
        sailors: 2.72637,
        monthly_manpower: 1.55,
        monthly_sailors: 0.12,
        army_tradition: 39.43998,
        navy_tradition: 1.02852,
        last_months_army_maintenance: 12.4,
        last_months_navy_maintenance: 8.1,
      },
    ]);
  });

  it("listNationGovernanceSourcesArrow unions reforms/privileges/laws into one (source_kind, source_name) shape, binding the reused placeholder correctly", async () => {
    await freshParsedDb("governance-sources.db", "save-4");
    const rows = decodeRows(await listNationGovernanceSourcesArrow(db, [2025]));
    expect(
      rows.sort(
        (a, b) =>
          String(a.source_kind).localeCompare(String(b.source_kind)) ||
          String(a.source_name).localeCompare(String(b.source_name)),
      ),
    ).toEqual([
      { nation_idx: 2025, source_kind: "law", source_name: "expanded_levies_policy" },
      { nation_idx: 2025, source_kind: "law", source_name: "navy_audits" },
      { nation_idx: 2025, source_kind: "privilege", source_name: "primacy_of_nobility" },
      { nation_idx: 2025, source_kind: "reform", source_name: "weapons_quality_standards" },
    ]);
  });

  it("listNavyDamageArrow attributes navy-category losses as 'taken' for the losing side and 'given' for its opponent", async () => {
    await freshParsedDb("navy-damage.db", "save-5");

    // RUS (2025) is the attacker in war 2030043139, whose attacker_losses
    // include navy_heavy_ship {Battle=12, Attrition=3} = 15 total — RUS's
    // own navy losses, so "taken" for RUS.
    const rusRows = decodeRows(await listNavyDamageArrow(db, [2025]));
    expect(rusRows).toEqual([{ nation_idx: 2025, direction: "taken", total_damage: 15 }]);

    // PLC (33556892) is the (first) defender in that same war — RUS's
    // losses count as damage PLC "given" to RUS.
    const plcRows = decodeRows(await listNavyDamageArrow(db, [33556892]));
    expect(plcRows).toEqual([{ nation_idx: 33556892, direction: "given", total_damage: 15 }]);

    // A nation with no navy-category losses in any war returns nothing.
    const noneRows = decodeRows(await listNavyDamageArrow(db, [3]));
    expect(noneRows).toEqual([]);
  });
});
