// Unit tests for parse-localization.ts against the fixture install's
// localization/english/*.yml files. See specs/008-game-encyclopedia/
// research.md §2 for why this is a dedicated regex parser, not YAML.
import { describe, expect, it } from "vitest";
import { parseLocalization } from "../../tools/encyclopedia-scraping/parse-localization";

const FIXTURE_INSTALL = "tests/fixtures/encyclopedia/install";

describe("parseLocalization", () => {
  it("pairs a key with its _desc-suffixed description", () => {
    const map = parseLocalization(FIXTURE_INSTALL);
    expect(map.get("fixture_horses")).toEqual({
      name: "Fixture Horses",
      description: "A fixture good used for testing.",
    });
  });

  it("gives a key with a name but no _desc pair a null description", () => {
    const map = parseLocalization(FIXTURE_INSTALL);
    expect(map.get("fixture_clay")).toEqual({ name: "Fixture Clay", description: null });
  });

  it("has no entry at all for a key present only in game definitions, never localization", () => {
    const map = parseLocalization(FIXTURE_INSTALL);
    // fixture_stable/fixture_academy/fixture_silk have no localization
    // anywhere in the fixture — confirms no fabricated fallback name
    // sneaks in from this layer (FR-004); the raw-key fallback is the
    // caller's job (write-output.ts), not this parser's.
    expect(map.has("fixture_stable")).toBe(false);
    expect(map.has("fixture_academy")).toBe(false);
  });
});
