---
description: "Task list for 019 Battle Simulator"
---

# Tasks: Battle Simulator

**Input**: Design documents from `/specs/019-battle-simulator/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md,
contracts/, quickstart.md, combat-unknowns.md

**Tests**: Included where they are required:
- Constitution II requires parser fixture and regression tests.
- contracts/engine-api.md lists engine guarantees that each need a test.
- SC-003 and SC-006 need calibration and replay tests.

**Uncertainty rule (applies to every task)**: any code that relies on an
unverified combat rule MUST cite its ledger ID from
[combat-unknowns.md](./combat-unknowns.md) as `// ASSUMPTION U-xx`, and
list that ID in `BattleResult.approximations` whenever it affects a
run. A new uncertainty found during implementation gets a **new ledger
entry first**, then the code.

**Worktree**: all work happens in `/Users/halda/Projects/nauticalbeg-019`
(branch `019-battle-simulator`). Never touch
`/Users/halda/Projects/nauticalbeg` (feature 018 is in progress there).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Create the directories `src/battleSim/`, `src/components/BattleSimulator/`, `tools/battle-sim-reference/`, `tests/battleSim/`, and `tests/fixtures/battle-sim/` (per the plan.md Project Structure)

---

## Phase 2: Foundational (engine, reference data, section shell)

**⚠️ No user story work can start until this phase is complete.**

- [X] T002 Write `tools/battle-sim-reference/generate.ts` (pattern: `tools/firepower-reference/generate-unit-types.ts`, parsed with `jomini`), taking `--install <EU5 game dir>` and emitting `src/battleSim/combatRulesReference.ts`, which contains:
  - every `NCombat` and `NUnit` constant listed in research.md §1;
  - base `local_frontage_allowed` from `main_menu/common/static_modifiers/location.txt`;
  - the topography/vegetation tables `{ defenderDice, frontageDelta }`;
  - location-rank frontage deltas;
  - formation preferences from `in_game/common/unit_formation_preference/army.txt` (section weights and `max_frontage`);
  - general traits from `in_game/common/traits/01_general.txt` (`commanderCombatBonus` plus any `discipline` / `military_tactics` / `land_morale_modifier` / `army_*_power` modifiers);
  - a `gameVersion` field.

  The header comment follows `unitTypeReference.ts`'s provenance style.
- [X] T003 Run the T002 generator against the local install (path in the project memory notes) and commit `src/battleSim/combatRulesReference.ts`. Spot-check: `HOURS_PER_PHASE=5`, mountains `{defenderDice: 2, frontageDelta: -4}`, and `balanced_army` present.
- [X] T004 [P] Define `BattleInput`, `BattleConditions`, `BattleSide`, `CompositionRow`, `SideStats`, `GeneralInput`, `BattleResult`, `PhaseRecord`, `HourSample`, and `ValidationIssue` exactly as in data-model.md §C–D, in `src/battleSim/types.ts`. Include `crossing: 'none'|'river'|'strait'|'sea_landing'`, `locationRank: 'rural'|'town'|'city'|'megalopolis'`, `outcome: 'attacker'|'defender'|'draw'|'unresolved'`, `endReason: 'morale'|'stackwipe'|'mutual'|'hour-limit'`, and `simulated: true`.
- [X] T005 [P] Implement a seeded PRNG (sfc32 or mulberry32; `next()`, `int(min,max)`, `chance(p)`), with no `Math.random`, in `src/battleSim/rng.ts`, plus a determinism test in `tests/battleSim/rng.test.ts`.
- [X] T006 Implement section frontage and placement in `src/battleSim/frontage.ts`:
  - per-section frontage = base 10 + topography + vegetation + rank deltas, floor 1 (`// ASSUMPTION U-20`);
  - flank overstack of 1.25 on the flanks;
  - initial placement by formation weights (`// ASSUMPTION U-21`), or by each regiment's save `box` when provided (`// ASSUMPTION U-25`);
  - the reserves list.
- [X] T007 Implement the damage and morale formulas in `src/battleSim/combatFormula.ts`, reading constants **only** from `combatRulesReference.ts`. Tag each term with its ledger ID:
  - dice impact: U-01, U-02, U-03, U-04;
  - terrain and crossing dice: U-05, U-06;
  - commander bonus: U-07;
  - discipline: U-10;
  - tactics: U-09;
  - experience: U-11;
  - unit power: U-12;
  - flanking: U-13;
  - secure flanks: U-14;
  - levy efficiency: U-15;
  - not-engaged bonus: U-16;
  - unit done/taken modifiers: U-17;
  - artillery/bombard: U-19, U-35.

  Export a `usedAssumptions` set so the engine can report which IDs fired.
- [X] T008 Implement `simulateBattle`, `validateBattleInput`, and `hashBattleInput` in `src/battleSim/engine.ts`, per contracts/engine-api.md. The hourly loop:
  - a bombard phase of `BOMBARD_HOURS`, only if either side has artillery (U-37);
  - combat phases of `HOURS_PER_PHASE` hours, with a d`COMBAT_DICE_SIDE` roll per side at each phase start (U-08);
  - an engagement roll per hour using the defines formula (U-22);
  - reserve moves (U-23) and target selection (U-24);
  - regiment withdrawal at 0 morale (U-26);
  - the hourly morale tick for engaged regiments (U-29);
  - end checks: rout at average morale ≤ threshold × max after `MINIMUM_COMBAT_DURATION` (U-30, U-31); stackwipe at 0 strength (U-32); `draw` if both sides end in the same hour; `unresolved` at 2,400 hours.

  Record `phases[]` and per-hour `timeline[]`, and fill `approximations` from `usedAssumptions`.

  Validation rules to quote verbatim from data-model.md:
  - "`count` integer ≥ 0; each side ≥ 1 regiment with strength > 0"
  - "`strengthPct`, `experience` in [0, 100]"
  - "`startingMoralePct` in (0, 100]"
  - "`discipline`, power modifiers, `levyCombatEfficiency` in [−0.9, +5]"
  - "`militaryTactics` ≥ 0"
  - "`extraDiceBonus` integer in [−10, 10]"
  - "`unitType` must exist in `UNIT_TYPE_REFERENCE` with an army category"
- [X] T009 [P] Write the engine contract tests in `tests/battleSim/engine.contract.test.ts`, covering guarantees 1–7 of contracts/engine-api.md:
  - determinism with the same seed;
  - throwing on invalid input;
  - conservation (casualties = start − end, ≥ 0);
  - termination by 2,400 h;
  - monotonicity across 200 fixed seeds (more regiments / higher discipline never lowers the win rate);
  - `simulated === true`;
  - a grep-style test that `engine.ts` and `combatFormula.ts` contain no numeric literals other than 0 and 1.
- [X] T010 [P] Write the conditions test in `tests/battleSim/conditions.test.ts`: with mountains (defender 2) and a river crossing (−1), the attacker's `PhaseRecord.attackerEffective` equals raw roll − 3 (before any U-04 clamping).
- [X] T011 Implement the worker in `src/battleSim/battleSim.worker.ts`, per contracts/worker-protocol.md: messages `run` / `cancel` / `progress` / `done` / `error`, with a `runId` on each; progress at most once per phase. Follow the `src/share/compress.worker.ts` pattern.
- [X] T012 Add the `"battle-simulator"` member to `AppSection` in `src/components/Overview/tabs.ts`. Add a "Battle Simulator" nav entry and a render branch in `src/components/Overview/FileLoader.tsx` modelled on the `activeSection === "encyclopedia"` branch, rendering a placeholder `BattleSimulatorSection` from `src/components/BattleSimulator/BattleSimulatorSection.tsx`. It must render with **no save loaded**. Keep the edits minimal: 018 edits these files in parallel.

**Checkpoint**: the engine passes its contract tests, and an empty Battle Simulator section is reachable.

---

## Phase 3: User Story 1 — Simulate a battle between two nations from the save (P1) 🎯 MVP

**Goal**: pick an attacker and a defender nation (and an army), with the inputs pre-filled from the save, then simulate and see the result.

**Independent test**:
1. Load the real save and pick two nations with armies.
2. Click Simulate.
3. Expect a "Simulated result" with the winner, end reason, duration, casualties, remaining strength and morale, dice, and seed.

### Save parsing (Constitution II: fixture and test first)

- [X] T013 [US1] **Before any parsing change**, resolve ledger U-40 (`strength` vs `number`) and U-25 (`box`) by grepping the **real** save `/Users/halda/Downloads/Russia (Melted).eu5`, not the fixture. Record the evidence and new status in `specs/019-battle-simulator/combat-unknowns.md`.
- [X] T014 [US1] Extend `tests/fixtures/rus-1628-minimal.eu5` with one real land army copied from the real save:
  - its `unit_manager.database` entry (`is_army`, `country`, `leader`, `unit_formation_preference`, `location`, `unit_name_2`);
  - two or more of its `subunit_manager.database` regiments (`unit`, `box`, `experience`, `strength`, `morale`, `type`, `owner`);
  - its leader's character entry (`mil`, `general_trait`).

  Regenerate the binary/zip fixture variants with `npm run generate:save-fixtures` if they must stay in sync.
- [X] T015 [US1] Write failing regression tests in `tests/parser/adapter.test.ts` asserting:
  - `armies` rows (`idx` BIGINT, `country_idx`, `leader_idx` nullable, `formation` nullable, `location_idx` nullable, `name_key` nullable);
  - `generals` rows (`idx`, `mil`, `general_trait` nullable);
  - the new `regiments` fields (`unit_idx` BIGINT; `box` in `'Left'|'Right'|'Center'|'Reserves'` or NULL; `experience` as "NULL if absent, never 0-filled");
  - an unknown `box` value produces a load warning rather than being silently dropped.
- [X] T016 [US1] In `src/storage/schema.sql`:
  - add `ALTER TABLE regiments ADD COLUMN IF NOT EXISTS unit_idx BIGINT`, plus `box TEXT` and `experience DOUBLE`;
  - add `CREATE TABLE IF NOT EXISTS armies (idx BIGINT PRIMARY KEY, country_idx INTEGER, leader_idx BIGINT, formation TEXT, location_idx INTEGER, name_key TEXT)`;
  - add `CREATE TABLE IF NOT EXISTS generals (idx BIGINT PRIMARY KEY, mil DOUBLE, general_trait TEXT)`;
  - add `CREATE INDEX IF NOT EXISTS idx_regiments_unit ON regiments (unit_idx)`;
  - write comments in the existing 012 style.
- [X] T017 [US1] Parse `unit_manager` land stacks (`is_army=yes`) into `armies`, and the leaders' characters into `generals`, in `src/parser/version-adapters/1.3.11.ts`. Add `unit`/`box`/`experience` to the existing `subunit_manager` → `regiments` path, and **update the existing regiments `insertRows` call to supply all three new columns** (insertRows full-column gotcha). T015 must now pass.
- [X] T018 [US1] Add `listArmiesForNation(db, nationIdx)` to `src/storage/queries.ts`: the nation's armies with regiment count and total men, largest first. Add `loadArmyForSim(db, armyIdx | {wholeNation: nationIdx})`, returning regiments (unit_type, strength, morale, experience, box) and the general (mil, general_trait). Use SQL aggregates, not row-by-row JS (Constitution V). Test both in `tests/storage/battleSimQueries.test.ts`.

### Pre-fill and UI

- [X] T019 [US1] Implement `buildSideFromSave(db, nationIdx, armyChoice)` in `src/components/BattleSimulator/battleSimData.ts`. It returns a `BattleSide` whose fields are `Sourced<T>`:
  - composition grouped by unit type, with strength %, levy flag from `UNIT_TYPE_REFERENCE.isLevy` (U-44), and experience;
  - nation stats via 012's `computeArmyStats` / `firepowerData.ts` loaders (discipline, military tactics; U-43 partial totals);
  - stats the pipeline doesn't cover (land morale modifier, unit-type powers, levy combat efficiency) set from game defaults with `source='default'`;
  - the general's trait and `mil` (U-38, U-39).

  Values that exist in the save are marked `source='save'`, and **nothing default is labelled save** (FR-004).
- [X] T020 [P] [US1] Build `src/components/BattleSimulator/BattleConditionsBar.tsx`: dropdowns for topography, vegetation, settlement rank, and crossing, populated from `combatRulesReference.ts`. Defaults: flatland, none, rural, none.
- [X] T021 [US1] Build `src/components/BattleSimulator/BattleSidePanel.tsx` (read-only display for now). It shows:
  - a nation picker (from the loaded save's nations);
  - an army picker (from `listArmiesForNation`, default the largest, plus "Whole nation", or "No land regiments" with an empty composition when there are none);
  - the composition table, stats, and general, each value with a source badge.
- [X] T022 [P] [US1] Build `src/components/BattleSimulator/BattleResultPanel.tsx`:
  - a "Simulated result" heading, styled differently from save-data panels (FR-010);
  - winner, end reason, duration in hours and days;
  - a per-side start → end strength / casualties / end morale table;
  - the phase list showing each side's raw and effective dice as text;
  - the seed;
  - a collapsible **Approximations** list mapping each `approximations` ID to its one-line description from `combat-unknowns.md`, bundled as a small generated map or a hand-kept `src/battleSim/unknowns.ts`.
- [X] T023 [US1] Wire everything together in `src/components/BattleSimulator/BattleSimulatorSection.tsx` (+ `.css`):
  - attacker and defender panels plus the conditions bar;
  - **Simulate** (new random seed), **Re-roll**, and **Replay seed** buttons;
  - worker orchestration with `runId`, ignoring stale runs, and a progress indicator only after 1 s (FR-013);
  - Simulate disabled with a reason when `validateBattleInput` fails;
  - both sides reset when a different save loads (spec edge case).

  Use CSS tokens from `src/styles/tokens.css`. The layout stacks below about 900px.

**Checkpoint**: US1 is fully usable read-only (MVP).

---

## Phase 4: User Story 2 — Modify any input and re-simulate (P2)

**Goal**: every input on both sides and every battle condition is editable, with source badges and resets; the simulator also works without a save.

**Independent test**:
1. Change the defender's infantry count.
2. Re-run and see the result shift, with an `edited` badge on the field.
3. Reset the field and see it return to the save value with a `save` badge.
4. Enter −5 regiments and see an inline error with Simulate disabled.

- [X] T024 [P] [US2] Build `src/components/BattleSimulator/SourcedField.tsx`:
  - a value input with a `save` / `default` / `edited` badge and a per-field reset (⟲);
  - an `edited` field shows its save value via `HoverTooltip.tsx`, never `title=` (FR-015);
  - an inline validation message slot.
- [X] T025 [US2] Make the composition table in `src/components/BattleSimulator/BattleSidePanel.tsx` editable using `SourcedField`:
  - add or remove rows, with the unit-type picker limited to army categories in `UNIT_TYPE_REFERENCE`, grouped by display category and age;
  - edit count, strength %, levy, and experience.
- [X] T026 [US2] Make the stats and general editable in `src/components/BattleSimulator/BattleSidePanel.tsx`:
  - discipline, military tactics, land morale modifier, the four powers, levy combat efficiency, and starting morale %;
  - the general's trait dropdown (from `combatRulesReference` traits, showing each trait's dice bonus) and extra dice bonus;
  - `mil` shown read-only, labelled "effect not modelled (U-38)".
- [X] T027 [US2] Add **Reset side** and per-field reset behaviour in `src/components/BattleSimulator/BattleSidePanel.tsx`. A reset restores `saveValue` or the default and its original `source`.
- [X] T028 [US2] Wire `validateBattleInput` issues to the matching `SourcedField` by `path` in `src/components/BattleSimulator/BattleSimulatorSection.tsx`, and show a summary next to the disabled Simulate button (FR-011, SC-005).
- [X] T029 [US2] Add no-save mode (FR-014) in `src/components/BattleSimulator/BattleSimulatorSection.tsx`:
  - when no save is ready, hide the nation and army pickers;
  - both sides start with default stats (`source='default'`) and an empty composition, with a note;
  - loading a save while the section is open offers the pickers without wiping manual edits until a nation is picked.

**Checkpoint**: US1 and US2 both work independently.

---

## Phase 5: User Story 3 — See how the battle unfolded (P3)

**Goal**: an hour-by-hour timeline with phases, dice, and reserve movement.

**Independent test**: after a run, the timeline shows both sides' strength and morale over time, 5-hour phase bands with dice, a bombard band if artillery was present, and hovering shows that moment's values.

- [X] T030 [P] [US3] Build `src/components/BattleSimulator/BattleTimelineChart.tsx` with ECharts (existing dependency):
  - attacker and defender strength on the left axis, morale % on the right;
  - a CVD-safe colour pair plus distinct line dashes (Constitution VI);
  - `markArea` for the bombard phase and alternating phase bands, with each phase's dice in the band label.
- [X] T031 [US3] Add hover on the timeline in `src/components/BattleSimulator/BattleTimelineChart.tsx`. Hovering shows the hour's per-side strength, morale %, casualties that hour, engaged and reserve counts, and the current phase's dice, using `HoverTooltip.tsx` (FR-015).
- [X] T032 [US3] Mount `BattleTimelineChart` under the result summary in `src/components/BattleSimulator/BattleResultPanel.tsx`, full width.

---

## Phase 6: Accuracy, uncertainty follow-up, and polish

- [X] T033 Write `tools/battle-sim-reference/extract-reference-battles.ts`. It reads the real save and writes `tests/fixtures/battle-sim/reference-battles.json` with, for each recorded `battle={…}`:
  - date and location → topography and vegetation via `location_templates.txt`;
  - per-side country, per-category `total` / `losses` (U-41);
  - the general's `general_trait`;
  - `result` (U-42).

  Before writing the extractor, confirm U-41 and U-42 against the real save and the unit_categories file order, and update the ledger.
- [X] T034 Write the calibration suite in `tests/battleSim/calibration.test.ts`. For each reference battle, build inputs from composition, terrain, and trait, and run 200 seeds. Report the share of battles where the recorded winner wins most runs (target ≥ 80%) and the median-loss error (target ≤ 25%). Mark the suite as a report rather than a hard CI gate until the ledger's open damage items (U-01…U-03, U-09) are resolved, and record the figures in research.md §8.
- [X] T035 Use the calibration results to update `specs/019-battle-simulator/combat-unknowns.md`: move any entries the evidence supports to `partial`, `confirmed`, or `wrong`, with notes. **Do not tune constants just to fit the data** (research §8). Unfitted gaps stay `open`.
- [X] T036 [P] Write the performance check in `tests/battleSim/performance.test.ts`: 100 regiments per side finishes in under 2 s (SC-002), and 300 per side completes (it runs in the worker in the app).
- [ ] T037 Validate in the real app per `specs/019-battle-simulator/quickstart.md` §3, steps 1–8, using the real save with `npm run dev`. Leave the dev server running afterwards.
  - **2026-09-26 progress:** step 1 (no save), manual sides, a run through the real Web Worker, the result labelling, the timeline, the approximations, seed replay and invalid-input blocking were all checked in the real app at `localhost:5190`. **Still open:** steps 2–8 with the real save loaded. The browser file upload can't be automated reliably, and kept saves don't carry over to the new dev-server port.
- [X] T038 Session wrap-up:
  - add a "Battle Simulator (019) ships" entry to `ARCHITECTURE.md` covering the engine/worker split, the generated combat rules reference, the new tables, and a pointer to `combat-unknowns.md`;
  - update `specs/spec-status.md`;
  - make a scoped commit on `019-battle-simulator` and push.

---

## Phase 7: User Story 4 — Send a matchup from Firepower (P2)

*Added 2026-09-26 at the owner's request.*

**Goal**: pick attacker and defender among Firepower's selected countries and open them, pre-filled, in the Battle Simulator.

**Independent test**:
1. With a save loaded, open Firepower → Army Stats and select two countries.
2. Click "Open in Battle Simulator".
3. Both sides are pre-filled, and an "Imported from Firepower" note shows.

- [X] T039 [P] [US4] Build `src/components/Overview/SimulateMatchupBar.tsx` (+ styles in `FirepowerTab.css`). It has attacker and defender selects limited to Firepower's selected countries (defaulting to the first two), a swap button, and "Open in Battle Simulator →", disabled with a hint when both sides are the same country.
- [X] T040 [US4] Render the bar in `src/components/Overview/FirepowerTab.tsx` on the Army Stats view when ≥2 countries are selected and an `onSimulateBattle` callback is supplied.
- [X] T041 [US4] Accept a one-shot `matchup` request (`{ id, attackerIdx, defenderIdx }`) in `src/components/BattleSimulator/BattleSimulatorSection.tsx`. It pre-fills both sides via the existing `prefill` (largest army) once the country list has loaded, applies each request `id` only once, and shows a dismissible "Imported from Firepower" note.
- [X] T042 [US4] In `src/components/Overview/FileLoader.tsx`, have `openBattleSimulator` store the request and switch to the Battle Simulator section. Mount the simulator on its first visit and keep it mounted but hidden afterwards, so its state survives section switches (acceptance scenario 4).
- [X] T043 [P] [US4] Tests: `tests/components/SimulateMatchupBar.test.tsx` covers defaults, swap, and the same-country block. `tests/components/BattleSimulatorMatchup.test.tsx` checks that a matchup pre-fills both sides from the real parsed fixture.
- [ ] T044 [US4] Validate in the real app with the real save loaded: Firepower → Army Stats → two countries → Open in Battle Simulator → Simulate, then switch sections and back (state kept). Blocked on the same manual save load as T037.

---

## Phase 8: Scoreboard across runs (FR-017)

*Added 2026-09-26 at the owner's request.*

- [X] T045 Build `src/components/BattleSimulator/BattleScoreboard.tsx`:
  - `addToScoreboard` keeps runs keyed by `inputHash` (restarting with a note when the inputs change) and doesn't count a replayed seed twice;
  - a victories donut and a casualties donut (ECharts pie) in Okabe-Ito blue/orange/reddish purple, passing the dataviz skill's validator for the app's light surface. The contrast warning is covered by direct labels and a numbers table;
  - a 2px surface gap between slices, text in `--color-on-surface`, and a reset button.
- [X] T046 Wire it into `BattleSimulatorSection.tsx`. Every finished run (worker or inline) is recorded; the tally clears on a save change or a Firepower matchup import; the scoreboard shows above the latest result.
- [X] T047 Tests in `tests/components/BattleScoreboard.test.tsx`: counting, replay dedupe, restart on input change, and accumulation/reset in the section. Checked in the real app: 13 runs, replay not recounted, whole-number percentage labels.

---

## Dependencies and execution order

- **Setup (T001)** → **Foundational (T002–T012)** → user stories.
  - Inside Foundational: T002 → T003; T004 comes before T006 and T007; T006 and T007 come before T008; T008 comes before T009, T010, and T011.
- **US1 (T013–T023)**:
  - T013 → T014 → T015 → T016 → T017 → T018 → T019 → T021 → T023;
  - T020 and T022 can run in parallel after Foundational.
- **US2 (T024–T029)**: depends on the US1 panels (T021 and T023). T024 can run in parallel.
- **US3 (T030–T032)**: depends only on Foundational (the engine timeline) and T022. It can run in parallel with US2.
- **Polish**: T033 → T034 → T035. T036 can run any time after T008. T037 and T038 come last.

## Parallel examples

- Foundational: T004 ∥ T005, then T009 ∥ T010 ∥ T011 once T008 is done.
- US1: T020 ∥ T022 while T013–T019 go ahead.
- US2 ∥ US3: T024 ∥ T030.

## Implementation strategy

1. **MVP = Phases 1–3 (US1)**: real armies against each other with read-only inputs and a labelled simulated result. Demo, then continue.
2. Add **US2** (the what-ifs the user explicitly asked for), then **US3** (the timeline).
3. Treat the calibration (T033–T035) as a way to learn which ledger items are wrong, not as tuning. The ledger is the main record of what we believe about EU5 combat and why.
