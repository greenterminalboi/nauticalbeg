import { describe, expect, it } from "vitest";
import {
  formatModifier,
  modifierTone,
  loadModifierLookup,
  policyEffects,
  privilegeEffects,
  type ModifierLookup,
} from "../../src/components/Overview/countryModifiers";

const lookup: ModifierLookup = {
  modifierTypes: {
    levy: { name: "Peasants Levy Size", percent: true },
    drift: { name: "Monthly Progress to Free Subjects", neutral: true },
    power: { name: "Nobles Power", percent: true, bad: true },
    flat_pct: { name: "Tax", alreadyPercent: true },
    unlocks: { name: "Can Recruit Mercenaries", boolean: true },
    precise: { name: "Precise", decimals: 3 },
  },
  policies: { expanded_levies_policy: [["levy", 0.05], ["drift", 0.1]] },
  privileges: { some_privilege: [["power", -1], ["custom", "Unlocks the Harem Law"]] },
};

describe("countryModifiers", () => {
  it("formats values the way the game does", () => {
    expect(formatModifier(lookup, "levy", 0.05)).toBe("+5% Peasants Levy Size");
    expect(formatModifier(lookup, "power", -1)).toBe("-100% Nobles Power");
    expect(formatModifier(lookup, "levy", 0.0025)).toBe("+0.25% Peasants Levy Size");
    expect(formatModifier(lookup, "drift", 0.1)).toBe("+0.1 Monthly Progress to Free Subjects");
    expect(formatModifier(lookup, "flat_pct", 12.5)).toBe("+12.5% Tax");
    expect(formatModifier(lookup, "precise", 0.0125)).toBe("+0.013 Precise");
    expect(formatModifier(lookup, "unlocks", true)).toBe("Can Recruit Mercenaries");
    expect(formatModifier(lookup, "unlocks", false)).toBe("Can Recruit Mercenaries: No");
  });

  it("shows a text effect as-is, and humanizes an unknown modifier", () => {
    expect(formatModifier(lookup, "custom", "Unlocks the Harem Law")).toBe("Unlocks the Harem Law");
    expect(formatModifier(lookup, "made_up_modifier", 2)).toBe("+2 Made Up Modifier");
  });

  it("lists a policy's or privilege's effects, empty when it has none", () => {
    expect(policyEffects(lookup, "expanded_levies_policy")).toEqual([
      { text: "+5% Peasants Levy Size", tone: "good" },
      { text: "+0.1 Monthly Progress to Free Subjects", tone: "neutral" },
    ]);
    expect(privilegeEffects(lookup, "some_privilege")).toEqual([
      { text: "-100% Nobles Power", tone: "good" },
      { text: "Unlocks the Harem Law", tone: "neutral" },
    ]);
    expect(policyEffects(lookup, "no_such_policy")).toEqual([]);
  });

  // Owner request 2026-09-26: green/red like the game.
  it("colors an effect by whether it helps the country, as the game does", () => {
    expect(modifierTone(lookup, "levy", 0.05)).toBe("good");
    expect(modifierTone(lookup, "levy", -0.05)).toBe("bad");
    // color=bad: more nobles power hurts, less helps.
    expect(modifierTone(lookup, "power", 1)).toBe("bad");
    expect(modifierTone(lookup, "power", -1)).toBe("good");
    expect(modifierTone(lookup, "drift", 0.1)).toBe("neutral");
    expect(modifierTone(lookup, "unlocks", true)).toBe("good");
    expect(modifierTone(lookup, "custom", "Unlocks the Harem Law")).toBe("neutral");
    expect(modifierTone(lookup, "levy", 0)).toBe("neutral");
  });

  it("loads the generated game data", async () => {
    const real = await loadModifierLookup();
    expect(policyEffects(real, "expanded_levies_policy")).toEqual([
      { text: "+5% Peasants Levy Size", tone: "good" },
      { text: "+0.1 Monthly Progress to Free Subjects", tone: "neutral" },
    ]);
    expect(privilegeEffects(real, "primacy_of_nobility")).toEqual(
      expect.arrayContaining([
        { text: "+100% Nobles Power", tone: "bad" },
        { text: "+5% Discipline", tone: "good" },
      ]),
    );
  });
});
