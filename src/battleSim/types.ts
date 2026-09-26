// specs/019-battle-simulator data-model.md §C–D. Plain data only — the
// engine receives these unwrapped (no Sourced<T>); the UI layer wraps
// each editable scalar with its save/default/edited source.

export type ArmyCategory =
  | "army_light_infantry"
  | "army_heavy_infantry"
  | "army_light_cavalry"
  | "army_heavy_cavalry"
  | "army_artillery"
  | "army_auxiliary";

export const ARMY_CATEGORIES: readonly ArmyCategory[] = [
  "army_light_infantry",
  "army_heavy_infantry",
  "army_light_cavalry",
  "army_heavy_cavalry",
  "army_artillery",
  "army_auxiliary",
];

export type SectionKey = "left" | "center" | "right" | "reserves";
export type FrontSection = "left" | "center" | "right";
export type Crossing = "none" | "river" | "strait" | "sea_landing";

export interface BattleConditions {
  /** Key into COMBAT_RULES_REFERENCE.topography (default 'flatland'). */
  topography: string;
  /** Key into COMBAT_RULES_REFERENCE.vegetation, or null for none. */
  vegetation: string | null;
  /** Key into COMBAT_RULES_REFERENCE.locationRanks (default 'rural_settlement'). */
  locationRank: string;
  crossing: Crossing;
}

export interface CompositionRow {
  /** Key into UNIT_TYPE_REFERENCE; must be an army_* category. */
  unitType: string;
  /** Integer ≥ 0. */
  count: number;
  /** Current strength as % of the unit type's max strength, [0, 100]. */
  strengthPct: number;
  isLevy: boolean;
  /** [0, 100] (ledger U-11). */
  experience: number;
  /** Starting section from the save's regiment `box` (ledger U-25); null =
   * placed by formation. */
  section: SectionKey | null;
}

export interface SideStats {
  discipline: number;
  militaryTactics: number;
  landMoraleModifier: number;
  /** Per-category `army_<category>_power` modifiers. */
  power: Record<ArmyCategory, number>;
  /** Modifier on the base LAND_LEVY_COMBAT_IMPACT (effective = base × (1 + x)). */
  levyCombatEfficiency: number;
  /** `army_initiative` modifier (engagement chance, ledger U-22). */
  armyInitiative: number;
  /** Starting morale as % of max morale, (0, 100]. */
  startingMoralePct: number;
}

export interface GeneralInput {
  /** Key into COMBAT_RULES_REFERENCE.generalTraits, or null. */
  trait: string | null;
  /** Integer in [-10, 10], added to every phase roll. */
  extraDiceBonus: number;
  /** Display only — combat effect not modelled (ledger U-38). */
  mil: number | null;
}

export interface BattleSide {
  label: string;
  /** Key into COMBAT_RULES_REFERENCE.formations. */
  formation: string;
  composition: CompositionRow[];
  stats: SideStats;
  general: GeneralInput;
}

export interface BattleInput {
  seed: number;
  conditions: BattleConditions;
  attacker: BattleSide;
  defender: BattleSide;
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type Outcome = "attacker" | "defender" | "draw" | "unresolved";
export type EndReason = "morale" | "stackwipe" | "mutual" | "hour-limit";

export interface SideSummary {
  startStrength: number;
  endStrength: number;
  casualties: number;
  endMoralePct: number;
  regimentsRouted: number;
  regimentsDestroyed: number;
}

export interface PhaseRecord {
  index: number;
  kind: "bombard" | "combat";
  startHour: number;
  attackerRoll: number;
  defenderRoll: number;
  /** Dice value after base, modifiers and clamping (ledger U-01, U-04). */
  attackerEffective: number;
  defenderEffective: number;
  /** Raw roll + modifiers, before clamping — for inspecting terrain effects. */
  attackerUnclamped: number;
  defenderUnclamped: number;
}

export interface HourSideSample {
  strength: number;
  moralePct: number;
  casualtiesThisHour: number;
  engaged: number;
  reserves: number;
}

export interface HourSample {
  hour: number;
  attacker: HourSideSample;
  defender: HourSideSample;
}

export interface BattleResult {
  seed: number;
  inputHash: string;
  outcome: Outcome;
  endReason: EndReason;
  hours: number;
  days: number;
  perSide: { attacker: SideSummary; defender: SideSummary };
  phases: PhaseRecord[];
  timeline: HourSample[];
  /** Ledger IDs (combat-unknowns.md) whose assumptions affected this run. */
  approximations: string[];
  simulated: true;
}
