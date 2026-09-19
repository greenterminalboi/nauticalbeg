import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDefinitions } from "../../tools/map-generation/read-definitions";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/map-generation/fixtures/definitions_excerpt.txt",
);

describe("read-definitions parseDefinitions", () => {
  it("flattens the region/area/province tree into ProvinceGrouping[], discarding region/area nesting", () => {
    const content = readFileSync(FIXTURE_PATH, "utf-8");
    const result = parseDefinitions(content);

    expect(result).toEqual(
      expect.arrayContaining([
        { name: "solum_province", locationNames: ["alpha", "beta"] },
        { name: "insula_province", locationNames: ["gamma"] },
      ]),
    );
    expect(result).toHaveLength(2);
  });

  it("handles arbitrary nesting depth (not hardcoded to exactly region>area>province)", () => {
    const content = "outer = { inner = { deep = { leaf_province = { loc1 loc2 } } } }";
    const result = parseDefinitions(content);
    expect(result).toEqual([{ name: "leaf_province", locationNames: ["loc1", "loc2"] }]);
  });

  it("handles missing whitespace around '=' (real definitions.txt mixes 'name = {' and 'name= {'/'name={')", () => {
    const content = "outer= {inner={leaf_province={loc1 loc2}}}";
    const result = parseDefinitions(content);
    expect(result).toEqual([{ name: "leaf_province", locationNames: ["loc1", "loc2"] }]);
  });

  it("strips '#' comments to end of line, including ones containing stray braces", () => {
    const content = [
      "region = {",
      "\t# sea areas",
      "\tarea = {",
      "\t\t#commented_out_province = { }",
      "\t\treal_province = { loc1 loc2 } #real_province note",
      "\t}",
      "}",
    ].join("\n");
    const result = parseDefinitions(content);
    expect(result).toEqual([{ name: "real_province", locationNames: ["loc1", "loc2"] }]);
  });
});
