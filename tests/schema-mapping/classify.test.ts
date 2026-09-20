// Unit tests for classify.ts against small, hand-crafted inputs — no
// real save needed. See specs/004-full-schema-mapping/research.md §3
// for the fixed-vs-variable-keyed classification rule this exercises.
import { describe, expect, it } from "vitest";
import { classifyField } from "../../tools/schema-mapping/classify";

describe("classifyField", () => {
  it("classifies a field with the same type on every sampled entry as always-present", () => {
    const entry = classifyField("countries.database.*.currency_data.gold", [5493.12008, 6946.21937, 10], 3);
    expect(entry.observedTypes).toEqual(["number"]);
    expect(entry.presence).toBe("always");
    expect(entry.exampleValue).toBe(5493.12008);
    expect(entry.observedEntryCount).toBe(3);
  });

  it("marks a field absent on some entries as sometimes-present", () => {
    // Only 1 of 3 sampled entries actually had this field (e.g. previous_tags).
    const entry = classifyField("countries.database.*.previous_tags", [["MOS"]], 3);
    expect(entry.presence).toBe("sometimes");
  });

  it("classifies a nested object whose key-set recurs (with some optional sub-keys) as fixed_object", () => {
    // Mirrors real currency_data: DUMMY has 5 keys, RUS has 14 — a
    // recurring, bounded vocabulary, not per-instance arbitrary data.
    const dummy = { gold: 10, stability: 0.00199, government_power: 95, purity: 60, righteousness: 90 };
    const rus = {
      gold: 5493.12008,
      stability: 27.27082,
      manpower: 429.10362,
      sailors: 2.72637,
      prestige: 68.51231,
      army_tradition: 39.43998,
      navy_tradition: 1.02852,
      government_power: 100,
      karma: -11.40825,
      religious_influence: 86.41319,
      purity: 60,
      righteousness: 90,
      inflation: 0.00001,
      complacency: 3.68323,
    };
    const entry = classifyField("countries.database.*.currency_data", [dummy, rus], 2);
    expect(entry.observedTypes).toEqual(["fixed_object"]);
    expect(entry.childKeys).toBeDefined();
    expect(entry.childKeys).toContain("gold");
    expect(entry.childKeys).toContain("manpower");
    expect(entry.childKeys!.length).toBe(new Set([...Object.keys(dummy), ...Object.keys(rus)]).size);
  });

  it("classifies a nested object whose key-set is data-driven (varies per instance) as variable_object", () => {
    // Mirrors last_month_produced: each province's keys are whichever
    // trade goods it happens to produce, drawn from a much larger
    // catalog than any single instance uses.
    const province1 = { clay: 13.19736, lumber: 38.39616, fish: 29.89448, wheat: 24.69544, millet: 9.59808 };
    const province2 = { iron: 5.1, wine: 2.3 };
    const province3 = { salt: 1.2, sugar: 4.4, coffee: 0.9, tea: 3.3 };
    const province4 = { fur: 6.6 };
    const entry = classifyField(
      "provinces.database.*.last_month_produced",
      [province1, province2, province3, province4],
      4,
    );
    expect(entry.observedTypes).toEqual(["variable_object"]);
    expect(entry.childKeys).toBeUndefined();
  });

  it("classifies a field that is {} on every sampled entry as empty_object", () => {
    const entry = classifyField("provinces.database.*.army", [{}, {}, {}], 3);
    expect(entry.observedTypes).toEqual(["empty_object"]);
    expect(entry.childKeys).toBeUndefined();
  });

  it("records every type actually observed when a field is genuinely inconsistent, never collapsing to one", () => {
    const entry = classifyField("some.inconsistent.path", [42, "forty-two"], 2);
    expect(entry.observedTypes).toContain("number");
    expect(entry.observedTypes).toContain("string");
    expect(entry.observedTypes).toHaveLength(2);
  });
});
