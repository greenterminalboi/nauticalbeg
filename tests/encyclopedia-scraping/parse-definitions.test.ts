// Unit tests for parse-definitions.ts against small fixture install
// files under tests/fixtures/encyclopedia/ — never against the real
// local game install (unavailable in CI). See
// specs/008-game-encyclopedia/research.md §1 for jomini's actual
// leniency, which is why bad.txt uses an unterminated string rather
// than an unclosed brace to reliably trigger a real parse error.
import { describe, expect, it } from "vitest";
import { parseDefinitionCategory } from "../../tools/encyclopedia-scraping/parse-definitions";

const FIXTURE_ROOT = "tests/fixtures/encyclopedia/install/in_game/common";

describe("parseDefinitionCategory", () => {
  it("extracts real entries with their fields from a category's .txt files", async () => {
    const { entries } = await parseDefinitionCategory(
      `${FIXTURE_ROOT}/fixture_goods`,
      "fixture_goods",
      { kind: "base" },
    );
    const horses = entries.find((e) => e.key === "fixture_horses");
    expect(horses).toBeDefined();
    expect(horses?.fields.category).toBe("raw_material");
    expect(horses?.fields.default_market_price).toBe(3);
    expect(horses?.source).toEqual({ kind: "base" });
  });

  it("skips a file that fails to parse and records why, without aborting the run", async () => {
    const { entries, skips } = await parseDefinitionCategory(
      `${FIXTURE_ROOT}/fixture_goods`,
      "fixture_goods",
      { kind: "base" },
    );
    // Entries from the OTHER (valid) file in the same directory still came through.
    expect(entries.some((e) => e.key === "fixture_clay")).toBe(true);
    expect(skips).toHaveLength(1);
    expect(skips[0].file).toContain("bad.txt");
    expect(skips[0].reason).toContain("Parse error");
  });

  it("preserves nested field structure verbatim rather than flattening it", async () => {
    const { entries } = await parseDefinitionCategory(
      `${FIXTURE_ROOT}/fixture_buildings`,
      "fixture_buildings",
      { kind: "base" },
    );
    const stable = entries.find((e) => e.key === "fixture_stable");
    expect(stable?.fields).toEqual({ category: "infrastructure_category", build_time: 10 });
  });
});
