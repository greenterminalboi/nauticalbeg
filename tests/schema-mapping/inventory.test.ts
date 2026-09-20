// Unit tests for inventory.ts's tree-walker against small, hand-crafted
// jomini-shaped objects — no real save needed. See
// specs/004-full-schema-mapping/research.md §2/§3 for the rules this
// exercises.
import { describe, expect, it } from "vitest";
import { buildSaveInventory } from "../../tools/schema-mapping/inventory";

function findEntry(inventory: ReturnType<typeof buildSaveInventory>, sectionKey: string, path: string) {
  const section = inventory.sections.find((s) => s.sectionKey === sectionKey);
  return section?.entries.find((e) => e.path === path);
}

describe("buildSaveInventory", () => {
  it("covers every top-level key, including one it has never seen before", () => {
    const root = {
      metadata: { date: "1628.8.14", version: "1.3.11" },
      a_brand_new_section_from_a_future_patch: { widget: 42 },
    };
    const inventory = buildSaveInventory(root, "test.eu5");
    const sectionKeys = inventory.sections.map((s) => s.sectionKey);
    expect(sectionKeys).toContain("metadata");
    expect(sectionKeys).toContain("a_brand_new_section_from_a_future_patch");
    expect(findEntry(inventory, "a_brand_new_section_from_a_future_patch", "a_brand_new_section_from_a_future_patch.widget")).toBeDefined();
  });

  it("reads metadata.version as the inventory's gameVersion", () => {
    const inventory = buildSaveInventory({ metadata: { version: "1.3.11" } }, "test.eu5");
    expect(inventory.gameVersion).toBe("1.3.11");
  });

  it("marks a section that is present but empty as shape-unconfirmed, not a fabricated guess", () => {
    const inventory = buildSaveInventory({ cheats: {} }, "test.eu5");
    const section = inventory.sections.find((s) => s.sectionKey === "cheats");
    expect(section?.shapeConfirmed).toBe(false);
    expect(section?.entries).toEqual([]);
  });

  it("walks a database-shaped numeric-keyed collection as a repeated-entry scope, not per-index fields", () => {
    const root = {
      countries: {
        database: {
          "0": { country_type: "Pirates", currency_data: { gold: 10, stability: 0.001 } },
          "2025": {
            country_type: "Real",
            currency_data: { gold: 5493.12, stability: 27.27, manpower: 429.1 },
          },
        },
      },
    };
    const inventory = buildSaveInventory(root, "test.eu5");
    // Every country's field, not one entry per numeric index:
    const countryType = findEntry(inventory, "countries", "countries.database.*.country_type");
    expect(countryType).toBeDefined();
    expect(countryType!.presence).toBe("always");
    expect(countryType!.observedEntryCount).toBe(2);
    // No spurious per-index paths like "countries.database.0" or "countries.database.2025":
    const section = inventory.sections.find((s) => s.sectionKey === "countries")!;
    expect(section.entries.some((e) => e.path === "countries.database.0")).toBe(false);
    expect(section.entries.some((e) => e.path === "countries.database.2025")).toBe(false);
    // The nested fixed-shape object gets both its own classification and its leaf fields:
    const currencyData = findEntry(inventory, "countries", "countries.database.*.currency_data");
    expect(currencyData!.observedTypes).toEqual(["fixed_object"]);
    const gold = findEntry(inventory, "countries", "countries.database.*.currency_data.gold");
    expect(gold!.observedTypes).toEqual(["number"]);
    expect(gold!.presence).toBe("always");
    // manpower only appears on one of the two countries:
    const manpower = findEntry(inventory, "countries", "countries.database.*.currency_data.manpower");
    expect(manpower!.presence).toBe("sometimes");
  });

  it("walks a numeric-keyed map of plain scalars (e.g. tags) as a leaf collection, not a fixed record", () => {
    const root = { countries: { tags: { "0": "DUMMY", "1": "PIR", "2025": "RUS" } } };
    const inventory = buildSaveInventory(root, "test.eu5");
    const tagsValue = findEntry(inventory, "countries", "countries.tags.*");
    expect(tagsValue).toBeDefined();
    expect(tagsValue!.observedTypes).toEqual(["string"]);
    expect(tagsValue!.observedEntryCount).toBe(3);
  });

  it("walks an array of nested objects as a repeated-entry scope (e.g. a war's participants)", () => {
    const root = {
      war_manager: {
        database: {
          "1": {
            all: [
              { country: 2025, status: "Active" },
              { country: 220, status: "Declined" },
            ],
          },
        },
      },
    };
    const inventory = buildSaveInventory(root, "test.eu5");
    const status = findEntry(inventory, "war_manager", "war_manager.database.*.all.*.status");
    expect(status).toBeDefined();
    expect(status!.observedTypes).toEqual(["string"]);
    expect(status!.observedEntryCount).toBe(2);
  });
});
