# Quickstart / Validation: Battle Simulator (019)

## Prerequisites
- Work in the worktree `/Users/halda/Projects/nauticalbeg-019`
  (branch `019-battle-simulator`), then run `npm install`.
- Local EU5 install (only needed to regenerate reference data).
- The real kept save `Russia (Melted).eu5` for end-to-end checks.

## 1. Regenerate reference data (only when the game version changes)
```bash
npx tsx tools/battle-sim-reference/generate.ts --install "<EU5 game dir>"
npx tsx tools/battle-sim-reference/extract-reference-battles.ts --save "<real save>"
```
Expected: `src/battleSim/combatRulesReference.ts` and
`tests/fixtures/battle-sim/reference-battles.json` are rewritten, and a
git diff shows only value changes.

## 2. Automated checks
```bash
npx vitest run tests/battleSim tests/parser tests/storage
```
Expected:
- the engine contract guarantees pass ([contracts/engine-api.md](./contracts/engine-api.md));
- the parser regression test covers `armies`/`generals` and the new
  `regiments` columns;
- the calibration suite reports the SC-003 figures (winner agreement
  ≥ 80%, median losses within 25%) or records a documented shortfall
  (research §8).

## 3. Manual end-to-end (the real app, the real save)
1. `npm run dev`, then open **Battle Simulator** *before* loading a save.
   Both sides are manual, with default stats and empty armies, and
   Simulate is disabled with the reason shown.
2. Load the real save. Pick two nations with armies. Each side fills in
   with its largest army and `save` badges.
3. Click Simulate. A "Simulated result" appears in under 2 s (SC-002)
   with the winner, end reason, duration, casualties, and the timeline.
4. Click Replay seed. The result is identical. Click Re-roll. The result
   may differ.
5. Edit the defender's infantry count, which shows an `edited` badge.
   Re-run, then reset the field; the badge goes back to `save`.
6. Set topography to mountains with a river crossing. The attacker's
   effective dice in the phase list drop by 3.
7. Enter −5 regiments. An inline error appears and Simulate is disabled.
8. Build a 300-regiment-per-side battle. The page stays responsive and
   progress appears if the run takes longer than 1 s.
