// Unit tests for diff.ts against hand-crafted SaveInventory objects.
// See specs/004-full-schema-mapping/data-model.md's DriftReport shape.
import { describe, expect, it } from "vitest";
import { diffSaveInventories } from "../../tools/schema-mapping/diff";
import type { SaveInventory } from "../../tools/schema-mapping/types";

function inventory(sourceFile: string, gameVersion: string, sections: SaveInventory["sections"]): SaveInventory {
  return { sourceFile, gameVersion, generatedAt: "2026-01-01T00:00:00.000Z", sections };
}

function fieldEntry(path: string, observedTypes: SaveInventory["sections"][number]["entries"][number]["observedTypes"]) {
  return { path, observedTypes, presence: "always" as const, exampleValue: 1, observedEntryCount: 1 };
}

describe("diffSaveInventories", () => {
  it("reports a field present in candidate but not baseline as added", () => {
    const baseline = inventory("a.eu5", "1.3.11", [
      { sectionKey: "countries", entries: [fieldEntry("countries.database.*.gold", ["number"])], sampleSize: 1, shapeConfirmed: true },
    ]);
    const candidate = inventory("b.eu5", "1.4.0", [
      {
        sectionKey: "countries",
        entries: [
          fieldEntry("countries.database.*.gold", ["number"]),
          fieldEntry("countries.database.*.new_field", ["string"]),
        ],
        sampleSize: 1,
        shapeConfirmed: true,
      },
    ]);
    const report = diffSaveInventories(baseline, candidate);
    expect(report.added).toEqual(["countries.database.*.new_field"]);
    expect(report.removed).toEqual([]);
    expect(report.hasDrift).toBe(true);
  });

  it("reports a field present in baseline but not candidate as removed", () => {
    const baseline = inventory("a.eu5", "1.3.11", [
      {
        sectionKey: "countries",
        entries: [
          fieldEntry("countries.database.*.gold", ["number"]),
          fieldEntry("countries.database.*.old_field", ["string"]),
        ],
        sampleSize: 1,
        shapeConfirmed: true,
      },
    ]);
    const candidate = inventory("b.eu5", "1.4.0", [
      { sectionKey: "countries", entries: [fieldEntry("countries.database.*.gold", ["number"])], sampleSize: 1, shapeConfirmed: true },
    ]);
    const report = diffSaveInventories(baseline, candidate);
    expect(report.removed).toEqual(["countries.database.*.old_field"]);
    expect(report.added).toEqual([]);
    expect(report.hasDrift).toBe(true);
  });

  it("reports a field present in both with a different observed type as typeChanged", () => {
    const baseline = inventory("a.eu5", "1.3.11", [
      { sectionKey: "countries", entries: [fieldEntry("countries.database.*.gold", ["number"])], sampleSize: 1, shapeConfirmed: true },
    ]);
    const candidate = inventory("b.eu5", "1.4.0", [
      { sectionKey: "countries", entries: [fieldEntry("countries.database.*.gold", ["string"])], sampleSize: 1, shapeConfirmed: true },
    ]);
    const report = diffSaveInventories(baseline, candidate);
    expect(report.typeChanged).toEqual([
      { path: "countries.database.*.gold", before: ["number"], after: ["string"] },
    ]);
    expect(report.hasDrift).toBe(true);
  });

  it("reports hasDrift: false explicitly for two identical inventories, never an empty/ambiguous result", () => {
    const same = inventory("a.eu5", "1.3.11", [
      { sectionKey: "countries", entries: [fieldEntry("countries.database.*.gold", ["number"])], sampleSize: 1, shapeConfirmed: true },
    ]);
    const report = diffSaveInventories(same, same);
    expect(report.added).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.typeChanged).toEqual([]);
    expect(report.hasDrift).toBe(false);
  });
});
