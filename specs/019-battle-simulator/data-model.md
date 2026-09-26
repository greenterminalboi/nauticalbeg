# Data Model: Battle Simulator (019)

There are two layers: **stored save data** (DuckDB, filled at parse time)
and **in-memory simulator state** (plain TypeScript objects that are
never stored).

## A. Stored save data (additions to `src/storage/schema.sql`)

### `regiments` (existing, from 012): three new columns
| Column | Type | Source (real save) | Notes |
|---|---|---|---|
| `unit_idx` | BIGINT | `subunit_manager.database[i].unit` | parent army/navy stack; BIGINT like `idx` |
| `box` | TEXT | `….box` | `'Left'` / `'Right'` / `'Center'` / `'Reserves'`; NULL if absent |
| `experience` | DOUBLE | `….experience` | NULL if absent, never 0-filled |

The existing regiments `insertRows` call MUST supply these three columns
(insertRows full-column gotcha).

### `armies` (new): land stacks only
| Column | Type | Source |
|---|---|---|
| `idx` | BIGINT PK | `unit_manager.database` key where `is_army=yes` |
| `country_idx` | INTEGER | `.country` |
| `leader_idx` | BIGINT NULL | `.leader` |
| `formation` | TEXT NULL | `.unit_formation_preference` |
| `location_idx` | INTEGER NULL | `.location` |
| `name_key` | TEXT NULL | `.unit_name_2.key` (display resolved like other name keys; the raw key is the fallback) |

### `generals` (new): only characters referenced by `armies.leader_idx`
| Column | Type | Source |
|---|---|---|
| `idx` | BIGINT PK | character key |
| `mil` | DOUBLE | `.mil` |
| `general_trait` | TEXT NULL | `.general_trait` |

## B. Static reference data (generated, committed)

- `COMBAT_RULES_REFERENCE` (`src/battleSim/combatRulesReference.ts`):
  the `NCombat`/`NUnit` constants, base frontage, the terrain table
  (topography + vegetation: `defenderDice`, `frontageDelta`), the
  location-rank frontage deltas, formation preferences, and general
  traits (`commanderCombatBonus` plus other combat modifiers). The file
  records the game version it was generated from.
- `UNIT_TYPE_REFERENCE` (existing, 012): per-unit-type combat stats,
  reused as-is.

## C. In-memory simulator state

```text
BattleInput
├── seed: number
├── conditions: BattleConditions
├── attacker: BattleSide
└── defender: BattleSide

BattleConditions
├── topography: TopographyKey     (default 'flatland')
├── vegetation: VegetationKey     (default none)
├── locationRank: 'rural'|'town'|'city'|'megalopolis' (default 'rural')
└── crossing: 'none'|'river'|'strait'|'sea_landing' (default 'none')

BattleSide
├── sourceNationIdx?: number, sourceArmyIdx?: number | 'whole-nation'
├── formation: FormationKey       (default 'balanced_army')
├── regiments: RegimentInput[]    (expanded from composition rows at run time)
├── composition: CompositionRow[] (what the user edits)
├── stats: SideStats
└── general: GeneralInput

CompositionRow        { unitType, count, strengthPct (0–100), isLevy, experience (0–100) }
SideStats             { discipline, militaryTactics, landMoraleModifier,
                        infantryPower, cavalryPower, artilleryPower, auxiliaryPower,
                        levyCombatEfficiency, maxMorale (derived, shown), startingMoralePct }
GeneralInput          { trait?: string, extraDiceBonus: number, mil?: number (display-only) }

Sourced<T> = { value: T, source: 'save'|'default'|'user', saveValue?: T }
```

Every editable scalar in `SideStats`, `CompositionRow`, `GeneralInput`,
and `BattleConditions` is held as `Sourced<T>` in the UI state (FR-004):
- editing sets `source='user'`;
- resetting restores `saveValue` (or the default) and its original
  source.

The engine receives a plain unwrapped `BattleInput`.

### Validation rules (FR-011; enforced before a run, with an inline message per field)
- `count` is an integer ≥ 0, and each side has ≥ 1 regiment with
  strength > 0.
- `strengthPct` and `experience` are in [0, 100].
- `startingMoralePct` is in (0, 100].
- `discipline`, the power modifiers, and `levyCombatEfficiency` are in
  [−0.9, +5] (multipliers must stay positive).
- `militaryTactics` ≥ 0.
- `extraDiceBonus` is an integer in [−10, 10].
- `unitType` must exist in `UNIT_TYPE_REFERENCE` with `is_army` category
  (the navy is out of scope).

## D. Simulation result

```text
BattleResult
├── seed, inputHash                  (replay: same inputHash + seed ⇒ identical result, SC-006)
├── outcome: 'attacker'|'defender'|'draw'|'unresolved'
├── endReason: 'morale'|'stackwipe'|'mutual'|'hour-limit'
├── hours: number, days: number
├── perSide: { startStrength, endStrength, casualties, endMoralePct, regimentsRouted, regimentsDestroyed }
├── phases: PhaseRecord[]            { index, kind: 'bombard'|'combat', startHour, attackerRoll, defenderRoll, attackerEffective, defenderEffective }
├── timeline: HourSample[]           { hour, attacker: {strength, moralePct, casualtiesThisHour, engaged, reserves}, defender: {…} }
├── approximations: string[]         (which approximated rules influenced this run, §2/§4)
└── simulated: true                  (label contract, FR-010)
```

### State transitions (per battle)
`setup → bombard (only if either side has artillery, BOMBARD_HOURS) →
combat phases (5 h each, re-roll dice at each phase start) → ended`.

A side **ends** when its morale collapses (average morale ≤
`MORALE_COLLAPSE_THRESHOLD` × max, after at least
`MINIMUM_COMBAT_DURATION` hours unless it is wiped) or it is stackwiped
(0 strength). If both sides end in the same hour, the result is `draw`.
A safety limit of 2,400 hours ends the battle as `unresolved`.
