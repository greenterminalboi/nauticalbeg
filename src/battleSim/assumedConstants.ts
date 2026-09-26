// Constants the battle engine needs that do NOT come from the game's own
// files. Each one is either a pure unit conversion or a documented
// assumption from specs/019-battle-simulator/combat-unknowns.md — they
// live here (never as literals in engine.ts/combatFormula.ts, see
// contracts/engine-api.md guarantee 6) so every guess is in one place.

/** Percent ↔ fraction (unit conversion, not an assumption). */
export const PERCENT_SCALE = 100;

/** Hours per in-game day (unit conversion). */
export const HOURS_PER_DAY = 24;

/** ASSUMPTION U-01: the wiki's strength dice impact `10 + (roll−1+mods)×2`
 * equals `(COMBAT_BASE + roll − 1 + mods) × 2`; the ×2 slope has no
 * define of its own. */
export const STRENGTH_DICE_SLOPE = 2;

/** ASSUMPTION U-11: save experience values (e.g. 25.56) read as a 0–100
 * scale, so reduction = exp / 100 × LAND_EXPERIENCE_DAMAGE_REDUCTION. */
export const EXPERIENCE_SCALE = 100;

/** Safety cap so a battle that never resolves still ends (spec edge case:
 * reported as 'unresolved', never a forced winner). 100 days. */
export const HOUR_LIMIT = 2400;
