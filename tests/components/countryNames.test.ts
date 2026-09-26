import { describe, expect, it } from "vitest";
import {
  estateName,
  governmentPowerLabel,
  humanizeKey,
  lawName,
  popTypeName,
  policyName,
  privilegeEstate,
  privilegeName,
  subjectTypeName,
} from "../../src/components/Overview/countryNames";

describe("countryNames", () => {
  it("labels government power by government type", () => {
    expect(governmentPowerLabel("monarchy")).toBe("Legitimacy");
    expect(governmentPowerLabel("republic")).toBe("Republican Tradition");
    expect(governmentPowerLabel("theocracy")).toBe("Devotion");
    expect(governmentPowerLabel("steppe_horde")).toBe("Horde Unity");
    expect(governmentPowerLabel("tribe")).toBe("Tribal Cohesion");
  });

  it("falls back to a generic government power label", () => {
    expect(governmentPowerLabel("made_up_type")).toBe("Government Power");
    expect(governmentPowerLabel(null)).toBe("Government Power");
  });

  it("names laws, policies, privileges, estates, pop types and subject types", () => {
    expect(lawName("feudal_de_jure_law")).toBe("Feudal 'De Jure' Laws");
    expect(policyName("noble_levies")).toBe("Noble Levies");
    expect(privilegeName("formal_guilds")).toBe("Formal Guilds");
    expect(privilegeEstate("formal_guilds")).toBe("burghers_estate");
    expect(estateName("crown_estate")).toBe("Crown");
    expect(popTypeName("nobles")).toBe("Nobles");
    expect(subjectTypeName("pronoia")).toBe("Prónoia");
  });

  it("humanizes an unknown key instead of showing it raw", () => {
    expect(humanizeKey("some_unknown_policy")).toBe("Some Unknown Policy");
    expect(policyName("some_unknown_policy")).toBe("Some Unknown Policy");
    expect(estateName("martian_estate")).toBe("Martian Estate");
    expect(privilegeEstate("no_such_privilege")).toBeNull();
  });
});
