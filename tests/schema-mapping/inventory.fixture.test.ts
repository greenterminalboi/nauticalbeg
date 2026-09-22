// Fixture-based regression test (Clarifications: the committed fixture
// drives repeatable automated tests; the real save drives this
// feature's actual completeness claims — see quickstart.md Scenario 2).
import { describe, expect, it, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { Jomini } from "jomini";
import { buildSaveInventory } from "../../tools/schema-mapping/inventory";
import type { SaveInventory } from "../../tools/schema-mapping/types";

const FIXTURE_PATH = path.resolve(process.cwd(), "tests/fixtures/rus-1628-minimal.eu5");

function findEntry(inventory: SaveInventory, sectionKey: string, path: string) {
  const section = inventory.sections.find((s) => s.sectionKey === sectionKey);
  return section?.entries.find((e) => e.path === path);
}

describe("buildSaveInventory against the committed fixture", () => {
  let inventory: SaveInventory;

  beforeAll(async () => {
    const parser = await Jomini.initialize();
    const bytes = readFileSync(FIXTURE_PATH);
    const root = parser.parseText(bytes, { typeNarrowing: "unquoted" }) as Record<string, unknown>;
    inventory = buildSaveInventory(root, "rus-1628-minimal.eu5");
  });

  it("covers every top-level key jomini returns for this fixture, not only the ~5 sections the app currently interprets", () => {
    const sectionKeys = inventory.sections.map((s) => s.sectionKey).sort();
    expect(sectionKeys).toEqual(
      [
        "cheats",
        // ruler_history stretch goal (specs/006-country-leaderboard,
        // post-ship 2026-09-21): rulerterm_manager/character_db added to
        // the fixture for that feature's own extraction tests.
        "character_db",
        "countries",
        // specs/011-atlas-map-modes: culture_manager/religion_manager
        // added to the fixture for the Primary Culture/Religion map
        // layers' own extraction tests.
        "culture_manager",
        "religion_manager",
        "locations",
        "market_manager",
        "metadata",
        "played_country",
        "population",
        "provinces",
        "rulerterm_manager",
        "war_manager",
        // specs/012-firepower-tab: unit_manager/subunit_manager added
        // to the fixture for the Firepower tab's own extraction tests.
        "unit_manager",
        "subunit_manager",
      ].sort(),
    );
  });

  it("reads metadata.version as the inventory's gameVersion", () => {
    expect(inventory.gameVersion).toBe("1.3.11");
  });

  it("classifies countries.database.*.currency_data.gold as an always-present number", () => {
    const entry = findEntry(inventory, "countries", "countries.database.*.currency_data.gold");
    expect(entry?.observedTypes).toEqual(["number"]);
    expect(entry?.presence).toBe("always");
  });

  it("classifies countries.database.*.previous_tags as sometimes-present (only RUS has one)", () => {
    const entry = findEntry(inventory, "countries", "countries.database.*.previous_tags");
    expect(entry?.presence).toBe("sometimes");
  });

  it("classifies countries.database.*.currency_data as a fixed_object, not variable", () => {
    const entry = findEntry(inventory, "countries", "countries.database.*.currency_data");
    expect(entry?.observedTypes).toEqual(["fixed_object"]);
    expect(entry?.childKeys).toContain("gold");
  });

  it("classifies provinces.database.*.army as empty_object (both sampled provinces have {})", () => {
    const entry = findEntry(inventory, "provinces", "provinces.database.*.army");
    expect(entry?.observedTypes).toEqual(["empty_object"]);
  });

  it("captures war_manager participant status as a real field, demonstrating a never-before-queried section is now inventoried", () => {
    const entry = findEntry(inventory, "war_manager", "war_manager.database.*.all.*.status");
    expect(entry?.observedTypes).toEqual(["string"]);
    expect(entry?.observedEntryCount).toBe(2);
  });
});
