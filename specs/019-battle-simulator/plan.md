# Implementation Plan: Battle Simulator

**Branch**: `019-battle-simulator` | **Date**: 2026-09-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/019-battle-simulator/spec.md`

## Summary

A new top-level **Battle Simulator** section plays out one EU5 land
battle between two sides, hour by hour, rolling its own dice from a
seeded generator the way the game does (a d10 per side per 5-hour
phase). Each side can be pre-filled from a real army in the loaded save
(regiments, their section/experience/strength/morale, the nation's
combat modifiers, and the general's trait), or entered by hand when no
save is loaded. Every input is editable and shows where its value came
from.

The engine is a pure TypeScript module run in a Web Worker. All
constants come from a reference file generated from the game's own
files: the `NCombat`/`NUnit` defines, terrain, formations, and general
traits. It reuses 012's `UNIT_TYPE_REFERENCE` for per-unit stats. The
result shows a winner, casualties, duration, and a phase-marked
timeline, is always labelled as simulated, and lists the rules that are
approximated. Accuracy is checked against the 38 battles recorded in
the real save.

## Technical Context

**Language/Version**: TypeScript (React 19), same as the rest of the app

**Primary Dependencies**: no new ones. React, DuckDB-Wasm (reading armies
and nation stats), `jomini` (parsing), and ECharts (timeline) are all
already in use. The PRNG is an in-house function of about 15 lines.

**Storage**: DuckDB-Wasm (existing):
- `regiments` gains `unit_idx`, `box`, and `experience`;
- a new `armies` table;
- a new `generals` table.

Simulator state is in-memory only and never stored.

**Testing**: `vitest`:
- engine contract/property tests (deterministic via seed);
- a parser regression test with the extended fixture
  (Constitution II);
- storage query tests;
- a calibration suite against `reference-battles.json` extracted from
  the real save.

**Target Platform**: Evergreen browsers, client-side only (static hosting
from 016 is unchanged)

**Project Type**: Existing single web application

**Performance Goals**: a re-run shows its result in under 2 s at
100 regiments per side (SC-002). The main thread never blocks. A
progress indicator appears after 1 s.

**Constraints**:
- No combat constant is written as a literal in the engine; they all
  come from the generated reference file.
- Anything approximated is surfaced in the UI (Constitution IV).
- Land only.
- The simulator works without a save.

**Scale/Scope**:
- 1 new app section;
- about 6 UI components;
- 1 engine module plus a worker;
- 1 generated reference file and 2 dev tools;
- 2 new tables and 3 new columns.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- **I. Read-only save handling**: PASS. Only new read-only parsing. The
  simulator never writes to the save or the database.
- **II. Parser correctness and test-first fixtures**: PASS, with an
  obligation. Before the `armies`/`generals`/`regiments` adapter change
  merges:
  - the fixture `rus-1628-minimal.eu5` must gain a real `unit_manager`
    army, its `subunit_manager` regiments (with `unit`/`box`/
    `experience`), and the leading character (`mil`, `general_trait`);
  - each needs a regression test;
  - unknown `box` values surface as load warnings rather than being
    dropped.
- **III. Explicit format-version compatibility**: PASS. The parsing goes
  in the existing `1.3.11.ts` adapter. `COMBAT_RULES_REFERENCE` records
  the game version it came from.
- **IV. Accurate, unembellished representation**: PASS, with
  obligations:
  - results are always labelled "Simulated";
  - every input carries a `save`/`default`/`edited` badge;
  - the unconfirmed rules (defines↔wiki constant mapping, military
    tactics formula, and the effect of `mil` skill, which is not
    applied) are listed in the result's Approximations panel;
  - defaults are never shown as save data.
- **V. Performance for large saves**: PASS. The simulation runs in a
  Web Worker with progress reporting. Army lists use SQL aggregates
  over `regiments` (indexed by `unit_idx`), not row-by-row JS.
- **VI. Visualization clarity and accessibility**: PASS. The attacker
  and defender timeline series use a CVD-safe pair plus distinct line
  styles, the dice are also shown as text, and hover uses
  `HoverTooltip.tsx`.
- **VII. Simplicity and incremental scope**: PASS.
  - Deliberately excluded: naval combat, multi-stack or reinforcing
    battles, a many-run probability summary, saved scenarios, and a
    "recreate recorded battle" UI.
  - The engine models only the rules the spec lists. It is not a
    general modifier engine: nation stats reuse 012's pipeline as-is.
- **VIII. Grounded AI query agent**: N/A. No agent surface is involved.

Security (`security_constitution.md`): nothing new is exposed. There is
no network access, no upload, and no user-provided code. Numeric inputs
are validated and clamped in `validateBattleInput`.

## Project Structure

### Documentation (this feature)

```text
specs/019-battle-simulator/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/ (engine-api.md, worker-protocol.md, ui-contract.md)
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks (not created here)
```

### Source Code (repository root)

```text
src/battleSim/                          # new: pure engine, no React/DB
├── engine.ts                           # simulateBattle / validateBattleInput / hashBattleInput
├── combatFormula.ts                    # damage/morale formulas (research §2), single place for approximations
├── frontage.ts                         # sections, terrain frontage, formation placement, reserves
├── rng.ts                              # seeded PRNG
├── types.ts                            # BattleInput / BattleResult (data-model §C–D)
├── combatRulesReference.ts             # GENERATED from game files (research §1)
└── battleSim.worker.ts                 # worker wrapper (contracts/worker-protocol.md)

src/components/BattleSimulator/         # new UI section
├── BattleSimulatorSection.tsx / .css   # layout + run orchestration
├── BattleConditionsBar.tsx
├── BattleSidePanel.tsx                 # nation/army pickers, composition, stats, general
├── SourcedField.tsx                    # value + save/default/edited badge + reset
├── BattleResultPanel.tsx               # summary, per-side table, approximations
├── BattleTimelineChart.tsx             # ECharts timeline
└── battleSimData.ts                    # DB → BattleSide pre-fill (reuses 012 computeArmyStats)

src/components/Overview/tabs.ts         # + "battle-simulator" AppSection (one-line union change)
src/components/Overview/FileLoader.tsx  # + nav entry and section render (like EncyclopediaSection)
src/parser/version-adapters/1.3.11.ts   # + armies, generals, regiments.unit/box/experience
src/storage/schema.sql, queries.ts      # + tables/columns, listArmiesForNation, loadArmyForSim

tools/battle-sim-reference/
├── generate.ts                         # game files → combatRulesReference.ts
└── extract-reference-battles.ts        # real save → tests/fixtures/battle-sim/reference-battles.json

tests/battleSim/                        # engine contract, property, calibration tests
tests/parser/, tests/storage/           # extended for new parsing/queries
tests/fixtures/rus-1628-minimal.eu5     # + army/regiments/general (Constitution II)
```

**Structure Decision**: This stays in the existing single web app.

The engine gets its own folder, `src/battleSim/`, because it's the
first logic in the app that runs without a save and that other features
could reuse. Keeping it free of React and the database makes it
testable and lets it run in a worker.

The UI is a new top-level section, not a Factbook tab. It works without
a save, and it stays out of the Factbook tab files that feature 018 is
editing in parallel. The only overlap with 018 is `tabs.ts` and the nav
in `FileLoader.tsx`, which will be a small merge.

## Constitution Check (post-Phase 1 re-check)

Unchanged: all gates PASS. Two design choices are recorded against
Principle IV:
- The `mil` skill is shown but explicitly **not applied**, because the
  game files don't document its combat effect (research §4).
- The calibration suite compares against recorded battles using
  **save-time** nation stats. Its limitation is documented, and
  constants are not tuned to hide it (research §8).

## Complexity Tracking

No constitution violations to justify.
