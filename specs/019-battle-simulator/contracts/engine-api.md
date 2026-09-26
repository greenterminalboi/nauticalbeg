# Contract: Battle engine API (`src/battleSim/engine.ts`)

A pure, synchronous, deterministic module. It has no DOM, React,
DuckDB, `Math.random`, or `Date` access. Types are defined in
[data-model.md](../data-model.md) §C–D.

```ts
export function simulateBattle(
  input: BattleInput,
  onProgress?: (hour: number) => void, // called at most once per phase
): BattleResult;

export function validateBattleInput(input: BattleInput): ValidationIssue[];
// ValidationIssue = { path: string /* e.g. "attacker.composition[2].count" */, message: string }

export function hashBattleInput(input: BattleInput): string; // stable, excludes seed
```

## Guarantees (each backed by a unit test)

1. **Determinism**: two calls with identical `input` (including `seed`)
   return deep-equal results (SC-006).
2. **Refuses invalid input**: `simulateBattle` throws if
   `validateBattleInput` returns issues. Callers must validate first
   (FR-011).
3. **Conservation**: for each side, `casualties = startStrength −
   endStrength`, and nothing goes below 0.
4. **Termination**: every run ends within the 2,400-hour safety limit,
   with `outcome='unresolved'` if it hits the limit.
5. **Monotonic sanity** (property tests over fixed seeds): adding
   regiments to one side, or raising its discipline, never lowers that
   side's win rate across a 200-seed sample.
6. **Constants come from `COMBAT_RULES_REFERENCE` only**: no combat
   numeric literals in `engine.ts`/`combatFormula.ts` except 0 and 1
   (enforced by review; see research §1–2).
7. `result.simulated === true` always (FR-010).
