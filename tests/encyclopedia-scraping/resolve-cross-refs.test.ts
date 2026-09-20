// Unit tests for resolve-cross-refs.ts against small hand-crafted
// RawEntry inputs. See research.md §7 for why matching runs against
// every parsed category, including excluded ones (that's what makes a
// genuine `resolved: false` possible at all).
import { describe, expect, it } from "vitest";
import { resolveCrossReferences } from "../../tools/encyclopedia-scraping/resolve-cross-refs";
import type { RawEntry } from "../../tools/encyclopedia-scraping/types";

describe("resolveCrossReferences", () => {
  it("resolves a field referencing an existing entry in another category (FR-008)", () => {
    const entries: RawEntry[] = [
      { category: "buildings", key: "academy", fields: { category: "infra" }, source: { kind: "base" } },
      { category: "building_categories", key: "infra", fields: {}, source: { kind: "base" } },
    ];
    const refs = resolveCrossReferences(entries, new Set());
    const buildingRefs = refs.get("buildings::academy");
    expect(buildingRefs).toEqual([
      { field: "category", targetCategory: "building_categories", targetKey: "infra", resolved: true },
    ]);
  });

  it("marks a field referencing an excluded category's key as unresolved, not absent (FR-008)", () => {
    const entries: RawEntry[] = [
      { category: "buildings", key: "academy", fields: { ai_hint: "internal_hint_key" }, source: { kind: "base" } },
      { category: "scripted_geography", key: "internal_hint_key", fields: {}, source: { kind: "base" } },
    ];
    const refs = resolveCrossReferences(entries, new Set(["scripted_geography"]));
    const buildingRefs = refs.get("buildings::academy");
    expect(buildingRefs).toEqual([
      { field: "ai_hint", targetCategory: "scripted_geography", targetKey: "internal_hint_key", resolved: false },
    ]);
  });

  it("produces no CrossReference when a field's value matches nothing anywhere (e.g. a DLC key absent from this install)", () => {
    const entries: RawEntry[] = [
      { category: "buildings", key: "academy", fields: { unlocked_by: "some_dlc_only_advance" }, source: { kind: "base" } },
    ];
    const refs = resolveCrossReferences(entries, new Set());
    expect(refs.has("buildings::academy")).toBe(false);
  });

  it("skips an ambiguous match where the same key exists in two categories", () => {
    const entries: RawEntry[] = [
      { category: "buildings", key: "academy", fields: { linked: "shared_key" }, source: { kind: "base" } },
      { category: "cat_a", key: "shared_key", fields: {}, source: { kind: "base" } },
      { category: "cat_b", key: "shared_key", fields: {}, source: { kind: "base" } },
    ];
    const refs = resolveCrossReferences(entries, new Set());
    expect(refs.has("buildings::academy")).toBe(false);
  });
});
