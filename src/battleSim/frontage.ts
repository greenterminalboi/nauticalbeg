// Section frontage and initial regiment placement (research.md §1;
// combat-unknowns.md U-20, U-21, U-25).
import { COMBAT_RULES_REFERENCE } from "./combatRulesReference";
import type { ArmyCategory, BattleConditions, FrontSection, SectionKey } from "./types";

export const FRONT_SECTIONS: readonly FrontSection[] = ["center", "left", "right"];

/** The enemy section a section faces: left fights the enemy's right. */
export const OPPOSING_SECTION: Record<FrontSection, FrontSection> = {
  left: "right",
  center: "center",
  right: "left",
};

/** Adjacent front sections — for secure flanks (U-14). */
export const NEIGHBOUR_SECTIONS: Record<FrontSection, readonly FrontSection[]> = {
  left: ["center"],
  center: ["left", "right"],
  right: ["center"],
};

/**
 * Frontage that can be *engaged* at once in each front section.
 * ASSUMPTION U-20: the location's `local_frontage_allowed` (base plus
 * terrain/rank deltas) applies per front section, not split across them.
 */
export function sectionFrontage(conditions: BattleConditions): number {
  const r = COMBAT_RULES_REFERENCE;
  const topo = r.topography[conditions.topography]?.frontageDelta ?? 0;
  const veg = conditions.vegetation ? (r.vegetation[conditions.vegetation]?.frontageDelta ?? 0) : 0;
  const rank = r.locationRanks[conditions.locationRank]?.frontageDelta ?? 0;
  return Math.max(1, r.baseFrontage + topo + veg + rank);
}

export interface PlacementInput {
  category: ArmyCategory;
  frontage: number;
  presetSection: SectionKey | null;
}

/**
 * Initial section per regiment.
 * ASSUMPTION U-25: a save-provided `box` is the regiment's battle section.
 * ASSUMPTION U-21: formation weights are relative priorities — each
 * regiment goes to the front section with the highest weight for its
 * category that still has room (capacity = frontage × the section's
 * max_frontage, falling back to MAX_FRONTAGE_OVERSTACKING); ties go to the
 * least-filled section; anything left over, and every category the
 * formation only lists under reserves (auxiliaries), goes to reserves.
 */
export function placeRegiments(regs: PlacementInput[], formationKey: string, frontage: number): SectionKey[] {
  const r = COMBAT_RULES_REFERENCE;
  const formation =
    r.formations[formationKey] ?? Object.values(r.formations).find((f) => f.isDefault) ?? Object.values(r.formations)[0];
  const overstack = r.nCombat.MAX_FRONTAGE_OVERSTACKING;
  const capacity: Record<FrontSection, number> = { left: 0, center: 0, right: 0 };
  const used: Record<FrontSection, number> = { left: 0, center: 0, right: 0 };
  for (const s of FRONT_SECTIONS) capacity[s] = frontage * (formation.sections[s].maxFrontage ?? overstack);

  const result: SectionKey[] = new Array(regs.length);
  const weightOf = (s: FrontSection, c: ArmyCategory) => formation.sections[s].weights[c] ?? 0;

  regs.forEach((reg, i) => {
    if (reg.presetSection) {
      result[i] = reg.presetSection;
      if (reg.presetSection !== "reserves") used[reg.presetSection] += reg.frontage;
    }
  });

  const order = regs
    .map((reg, i) => ({ reg, i, best: Math.max(...FRONT_SECTIONS.map((s) => weightOf(s, reg.category))) }))
    .filter(({ reg }) => !reg.presetSection)
    .sort((a, b) => b.best - a.best || a.i - b.i);

  for (const { reg, i } of order) {
    let chosen: FrontSection | null = null;
    for (const s of FRONT_SECTIONS) {
      const w = weightOf(s, reg.category);
      if (w <= 0 || used[s] + reg.frontage > capacity[s]) continue;
      if (
        chosen === null ||
        w > weightOf(chosen, reg.category) ||
        (w === weightOf(chosen, reg.category) && used[s] / capacity[s] < used[chosen] / capacity[chosen])
      ) {
        chosen = s;
      }
    }
    if (chosen) {
      used[chosen] += reg.frontage;
      result[i] = chosen;
    } else {
      result[i] = "reserves";
    }
  }
  return result;
}
