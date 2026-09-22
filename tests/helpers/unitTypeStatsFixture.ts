// Shared test fixture: a zeroed UnitTypeStats, for tests that build a
// RegimentBreakdownEntry/UnitTypeReferenceEntry fixture and don't care
// about the actual combat-stat values (added 2026-09-22 alongside Army
// Composition's Regiment Composition stat columns) — avoids repeating
// all 15 fields inline in every test file that constructs one of these.
import type { UnitTypeStats } from "../../src/components/Overview/unitTypeReference";

export const ZERO_UNIT_TYPE_STATS: UnitTypeStats = {
  maxStrength: 0,
  combatPower: 0,
  frontage: 0,
  combatSpeed: 0,
  initiative: 0,
  flankingAbility: 0,
  secureFlanksDefense: 0,
  moraleDamageTaken: 0,
  strengthDamageTaken: 0,
  moraleDamageDone: 0,
  strengthDamageDone: 0,
  foodStoragePerStrength: 0,
  foodConsumptionPerStrength: 0,
  movementSpeed: 0,
  unitWeight: 0,
  artilleryBarrage: 0,
};
