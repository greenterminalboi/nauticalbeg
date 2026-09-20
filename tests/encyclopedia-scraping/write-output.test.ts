// Unit tests for write-output.ts's buildOutput, against small
// hand-crafted RawEntry inputs — not the real game install.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_ASSIGNMENTS } from "../../tools/encyclopedia-scraping/categories";
import { warnOnUnlistedCategories } from "../../tools/encyclopedia-scraping/generate";
import { buildOutput } from "../../tools/encyclopedia-scraping/write-output";
import type { CategoryAssignment, LocalizationMap, RawEntry } from "../../tools/encyclopedia-scraping/types";

const ASSIGNMENTS: CategoryAssignment[] = [
  { id: "cat_a", excluded: false, domainGroup: "economy-production", label: "Category A" },
  { id: "cat_b", excluded: false, domainGroup: "economy-production", label: "Category B" },
  { id: "cat_internal", excluded: true, reason: "test exclusion" },
];
const LABELS = { "economy-production": "Economy & Production" };
const META = { generatedAt: "2026-01-01T00:00:00.000Z", gameVersion: "test", dlcs: [] };

describe("buildOutput", () => {
  it("keeps two entries with the same key in different categories distinguishable (FR-014)", () => {
    const entries: RawEntry[] = [
      { category: "cat_a", key: "shared_key", fields: { value: 1 }, source: { kind: "base" } },
      { category: "cat_b", key: "shared_key", fields: { value: 2 }, source: { kind: "base" } },
    ];
    const loc: LocalizationMap = new Map();
    const result = buildOutput(entries, loc, META, ASSIGNMENTS, LABELS);

    const a = result.categoryFiles.get("cat_a")?.find((e) => e.key === "shared_key");
    const b = result.categoryFiles.get("cat_b")?.find((e) => e.key === "shared_key");
    expect(a?.fields.value).toBe(1);
    expect(b?.fields.value).toBe(2);
    expect(result.searchIndex.filter((r) => r.key === "shared_key")).toHaveLength(2);
  });

  it("accounts for every category in either domainGroups or excludedCategories, never both or neither (FR-007)", () => {
    const result = buildOutput([], new Map(), META, ASSIGNMENTS, LABELS);
    const included = result.manifest.domainGroups.flatMap((g) => g.categories.map((c) => c.id));
    const excluded = result.manifest.excludedCategories.map((c) => c.id);
    expect(included.sort()).toEqual(["cat_a", "cat_b"]);
    expect(excluded).toEqual(["cat_internal"]);
    expect(included.filter((id) => excluded.includes(id))).toHaveLength(0);
  });

  it("still writes a category with zero entries rather than omitting it", () => {
    const result = buildOutput([], new Map(), META, ASSIGNMENTS, LABELS);
    expect(result.categoryFiles.get("cat_a")).toEqual([]);
  });

  it("the real CATEGORY_ASSIGNMENTS table has no duplicate category ids (FR-007)", () => {
    const ids = CATEGORY_ASSIGNMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves game_concepts entries via their game_concept_<key> localization prefix, not the bare key", () => {
    const entries: RawEntry[] = [
      { category: "game_concepts", key: "modifier", fields: {}, source: { kind: "base" } },
    ];
    const loc: LocalizationMap = new Map([
      ["game_concept_modifier", { name: "Modifier", description: "A value that influences the game." }],
    ]);
    const assignments: CategoryAssignment[] = [
      { id: "game_concepts", excluded: false, domainGroup: "government-society", label: "Game Concepts" },
    ];
    const result = buildOutput(entries, loc, META, assignments, LABELS);
    const entry = result.categoryFiles.get("game_concepts")?.find((e) => e.key === "modifier");
    expect(entry?.name).toBe("Modifier");
    expect(entry?.description).toBe("A value that influences the game.");
  });
});

describe("warnOnUnlistedCategories", () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("warns when a category folder exists on disk with no entry in categories.ts (spec edge case: future game update)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "encyclopedia-warn-test-"));
    const newCategoryDir = join(tmpDir, "in_game", "common", "totally_new_category");
    mkdirSync(newCategoryDir, { recursive: true });
    writeFileSync(join(newCategoryDir, "00.txt"), "x = { a = 1 }\n");

    const warnings: string[] = [];
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      warnings.push(msg);
    });

    warnOnUnlistedCategories(tmpDir);

    expect(warnings.some((w) => w.includes("totally_new_category"))).toBe(true);
  });

  it("warns about nothing for a folder set that exactly matches categories.ts", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "encyclopedia-warn-test-"));
    const knownDir = join(tmpDir, "in_game", "common", CATEGORY_ASSIGNMENTS[0].id);
    mkdirSync(knownDir, { recursive: true });

    const warnings: string[] = [];
    vi.spyOn(console, "error").mockImplementation((msg: string) => {
      warnings.push(msg);
    });

    warnOnUnlistedCategories(tmpDir);

    expect(warnings).toHaveLength(0);
  });
});
