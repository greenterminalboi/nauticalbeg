import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseNamedLocations } from "../../tools/map-generation/read-named-locations";

const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "tests/map-generation/fixtures/named_locations_excerpt.txt",
);

describe("read-named-locations parseNamedLocations", () => {
  it("parses name = hex color lines into NamedLocation[] with correct hex->[r,g,b] conversion", () => {
    const content = readFileSync(FIXTURE_PATH, "utf-8");
    const result = parseNamedLocations(content);

    expect(result).toHaveLength(3);
    expect(result).toEqual(
      expect.arrayContaining([
        { name: "alpha", color: [255, 0, 0] },
        { name: "beta", color: [0, 255, 0] },
        { name: "gamma", color: [0, 0, 255] },
      ]),
    );
  });

  it("ignores blank lines", () => {
    const result = parseNamedLocations("alpha = ff0000\n\n\nbeta = 00ff00\n");
    expect(result).toHaveLength(2);
  });

  it("strips a trailing '# comment' after the color (real named_locations/00_default.txt carries ~5.9k of these — a human-readable real-world place name)", () => {
    const result = parseNamedLocations(
      "waren = 228d65 #Waren (Müritz)\nbytow = cc661f #Bytow\n",
    );
    expect(result).toEqual([
      { name: "waren", color: [34, 141, 101] },
      { name: "bytow", color: [204, 102, 31] },
    ]);
  });
});
