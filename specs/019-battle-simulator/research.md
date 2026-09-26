# Research: Battle Simulator (019)

**Date**: 2026-09-26 · **Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md)

Sources used: the EU5 wiki Combat page (https://eu5.paradoxwikis.com/Combat),
the local game install (path in the project memory notes), the real kept
save `Russia (Melted).eu5`, and the existing code from feature 012
(Firepower). Every field this plan depends on was checked by grepping the
**real** save, never the trimmed fixture.

---

## §1 Combat rules come from the game's own files, not only the wiki

**Decision**: Generate one reference file, `combatRulesReference.ts`, from
the local game install. The build tool is
`tools/battle-sim-reference/generate.ts`, following the precedent of
012's `tools/firepower-reference/*`. The file contains:

| Source (under `game/`) | What we take |
|---|---|
| `loading_screen/common/defines/00_defines.txt` → `NCombat` | `HOURS_PER_PHASE=5`, `COMBAT_DICE_SIDE=10`, `COMBAT_BASE=5`, `COMBAT_MAX=15`, `COMBAT_DAMAGE_MULT=0.01`, `COMBAT_HOURLY_MORALE_TICK=0.01`, `BOMBARD_BASE_CHANCE=0.2`, `BOMBARD_HOURS=5`, `RIVER_CROSSING_DICE=-1`, `STRAIT_CROSSING_DICE=-2`, `SEA_LANDING_DICE=-1`, `MAX_FRONTAGE_OVERSTACKING=1.25`, `LAND_LEVY_COMBAT_IMPACT=0.75`, `INITIATIVE_BASE_CHANCE=0.1`, `INITIATIVE_CHANCE_EACH=0.02`, `INITIATIVE_CHANCE_HOURS=0.01`, `INITIATIVE_CHANCE_MAX=0.1`, `COMBAT_SPEED_SCALE=0.05`, `LAND_EXPERIENCE_DAMAGE_REDUCTION=0.5`, `LAND_STRENGTH_DAMAGE_MODIFIER=0.2`, `LAND_MORALE_DAMAGE_MODIFIER=1.0`, `NOT_ENGAGED_STRENGTH_DAMAGE_MODIFIER=1.1`, `NOT_ENGAGED_MORALE_DAMAGE_MODIFIER=1.2`, `MORALE_COLLAPSE_THRESHOLD=0.05`, `MINIMUM_COMBAT_DURATION=24`, `BASE_MORALE_DAMAGE=1.0` |
| same file → `NUnit` | `REGIMENT_SIZE=1000`, `LAND_MORALE=3.0` |
| `main_menu/common/static_modifiers/location.txt` | base `local_frontage_allowed = 10` |
| `in_game/common/topography/00_default.txt` | per terrain: `defender` dice and `local_frontage_allowed` (mountains 2/−4, hills 1/−3, plateau 1/−1, wetlands 1/−3, narrows 1/−2, flatland 0/0) |
| `in_game/common/vegetation/00_default.txt` | woods 1/−2, forest 1/−3, jungle 1/−4 (others 0/0) |
| `in_game/common/location_ranks/00_default.txt` | town −1, city −2, megalopolis −3 frontage |
| `in_game/common/unit_formation_preference/army.txt` | per-formation section weights and `max_frontage` (`balanced_army` is the default) |
| `in_game/common/traits/01_general.txt` | every general trait's `commander_combat_bonus` (a flat dice bonus per phase, per `MODIFIER_TYPE_DESC_commander_combat_bonus`) plus any other combat modifiers the trait carries |

Per-unit stats (combat power, frontage, combat speed, initiative, flanking
ability, secure-flanks defense, damage done/taken, artillery barrage,
max strength, levy flag) are **reused unchanged** from 012's
`UNIT_TYPE_REFERENCE` (260 unit types). No second extraction is needed.

**Rationale**: Constitution IV and FR-006. The defines file holds the
engine's real constants. The wiki paraphrases them and is out of date in
places (see §2). This matches the Encyclopedia-data exception: only
structured numeric data is shipped, never art.

**Alternatives considered**: Hard-coding the wiki's numbers was rejected
because they drift from the game with each patch and the wiki disagrees
with the defines (§2).

## §2 Damage formula: where the wiki and the defines disagree

The wiki gives `dice_impact = 10 + (roll − 1 + terrain + crossing) × 2`
for strength and `0.05 + (…) × 0.01` for morale. The defines expose
`COMBAT_BASE=5`, `COMBAT_MAX=15`, `COMBAT_DAMAGE_MULT=0.01`, and
`LAND_STRENGTH_DAMAGE_MODIFIER=0.2`, which don't reproduce the wiki's
`10 + 2×` form directly.

**Decision**: The engine applies the formula **as structured on the
wiki**:
- multiplicative chain = combat power × (strength / `REGIMENT_SIZE`) ×
  discipline × unit-type power × flanking × levy efficiency × terrain
  unit penalty × not-engaged bonus × (1 − experience × 0.5) × defender
  tactics / secure flanks,
- with the base / slope / cap constants **read from the reference file**,
  not written as literals.

The base/slope mapping is recorded in one place (`combatFormula.ts`) and
flagged as an approximation in the UI (FR-006) until calibration (§8)
confirms it. The defender-tactics term ("Military Tactics — unclear
function" on the wiki; `game_concept_military_tactics_desc` only says it
"reduces damage taken") is modelled as a divisor
`1 / (1 + military_tactics)`. It is also listed as an approximation.

**Rationale**: The structure is well documented. Only the scalar
constants are uncertain, and keeping them together makes them cheap to
retune against real battles.

## §3 Dice and randomness

**Decision**: A seeded pseudo-random generator lives inside the engine
(a small sfc32/mulberry32 function, about 15 lines, no dependency). A
side's phase roll is `1..COMBAT_DICE_SIDE`. The effective roll is:

- **attacker**: roll + commander bonus + crossing penalty
  (river −1 / strait −2 / sea landing −1) − defender terrain bonus
  (topography `defender` + vegetation `defender`, taken as a penalty on
  the attacker, per the wiki);
- **defender**: roll + commander bonus.

Initiative (d100), reserve moves (d20 vs combat speed), and bombard
chance use the same generator. Every result stores its `seed` (FR-008,
SC-006).

**Rationale**: This is the user's own choice ("we do the dice rolls
ourselves… that's part of the simulation"). Seeding makes tests
deterministic and allows exact replay.

**Alternatives considered**: `Math.random` was rejected because it can't
replay (SC-006) or be tested. A many-run summary was excluded from 019
by the spec.

## §4 General: dice bonus from traits; the skill's effect is unconfirmed

Real save: a character record has `mil=51`, `general_trait=<key>`, and
`alive_data.unit=<army idx>`. An army record in `unit_manager` has
`leader=<character idx>`. The only documented combat effect is the
trait's `commander_combat_bonus` (for example +1, +2, or −1).
`game_concept_mil_desc` does not describe any combat effect of the `mil`
skill, and no define mentions it.

**Decision**: The General input has three parts:
- **trait**: a dropdown of `01_general.txt` traits, applying its
  `commander_combat_bonus` and other combat modifiers;
- **extra dice bonus**: a free number, so users can model effects we
  don't parse;
- **mil skill**: shown, pre-filled from the save, but **not applied** to
  combat. It is labelled "effect not modelled (not documented in game
  files)".

If implementation finds a real mil→combat link, it becomes a follow-up
task.

**Rationale**: Constitution IV. We don't invent a formula for a stat the
game doesn't document.

## §5 Pre-filling from the save: armies, not just nations

Real save findings:
- `unit_manager.database[idx]` has `is_army=yes`, `country`, `leader`,
  `unit_formation_preference`, `location`, and `frontage`.
- `subunit_manager.database[idx]` has `unit` (the parent army),
  `box` (`Left`/`Right`/`Center`/`Reserves` — the starting section),
  `experience`, `strength`, `morale`, `type`, and `owner`.

012 already stores `regiments(idx, owner_idx, unit_type, morale, number,
strength)`, but not `unit`, `box`, or `experience`.

**Decision**:
1. Add `unit_idx`, `box`, and `experience` columns to `regiments`, plus
   a new `armies` table (land stacks only) and a `generals` table
   (`idx`, `mil`, `general_trait`) holding just the characters who lead
   an army.
2. In the simulator, picking a nation lists its armies (largest first,
   default = largest). "Whole nation" is an extra option that combines
   every regiment of that nation.
3. Nation-level stats (discipline, military tactics, land morale
   modifier, per-category power modifiers, levy combat efficiency) come
   from 012's `computeArmyStats` and the `MILITARY_MODIFIER_REFERENCE`
   pipeline. Stats that pipeline doesn't cover start at the game default
   and are marked **default**, never presented as save data (FR-004).

**Constitution II**: this is a parser change, so the fixture
`rus-1628-minimal.eu5` must first gain a real army stack, its regiments
(with `unit`/`box`/`experience`), and its leader character. The
regression test comes first.

**Gotcha to honour**: adding columns to `regiments` means the existing
`insertRows` call for regiments **must also supply the new columns**
(see the project memory note on the insertRows full-column gotcha and
the "Firepower (012) ships" section of ARCHITECTURE.md).

## §6 Where the simulation runs

**Decision**: The engine is a pure TypeScript module (`src/battleSim/`)
with no React and no database. It runs in a **dedicated Web Worker**
(`battleSim.worker.ts`), following the existing
`share/compress.worker.ts` pattern. The worker reports hourly progress
so the page can show a progress indicator when a run takes more than
one second (FR-013, Constitution V). The UI sends a fully resolved
`BattleInput` (plain data), so the worker never touches DuckDB.

**Rationale**: Hour-by-hour simulation with hundreds of regiments per
side can run for thousands of ticks. A worker keeps the page responsive
at any size, and a pure engine is easy to unit-test.

## §7 Placement in the app

**Decision**: Add a new **top-level `AppSection`**, `"battle-simulator"`
(nav label "Battle Simulator"), rendered like `EncyclopediaSection`. It
is available whether or not a save is loaded (FR-014), and save-backed
pickers appear only when `isReady`.

**Rationale**: The simulator isn't a view of one save (it works without
one), so it doesn't belong among the Factbook tabs. It also keeps 019
away from the Factbook tab work feature 018 is doing in parallel. The
only shared edit is one union member in `tabs.ts` plus a nav entry,
which is a trivial merge.

## §8 Accuracy check against real battles (SC-003)

The real save records battles under war history
(`battle={ location date result attacker={ losses total who={ country size levy experience } character } defender={…} }`).
There are 38 in the kept save. `total`/`losses` are 10-slot arrays per
unit category (land slots first), in thousands.

**Decision**: A dev-only script,
`tools/battle-sim-reference/extract-reference-battles.ts`, pulls these
battles into `tests/fixtures/battle-sim/reference-battles.json`. It
records composition per category, location → terrain via
`location_templates.txt`, the general's trait, and the recorded
winner/losses. That file is derived data, not raw save bytes. A vitest
calibration suite runs each battle over N seeds and checks the winner
and the median losses against SC-003.

**Known limitation (documented, not hidden)**: per-battle stats at the
time of the battle (discipline, tactics, and so on) aren't recorded, so
the harness uses each nation's save-time stats. That makes this an
approximate calibration, not an exact replay. If SC-003 fails because
of this gap rather than a formula error, we record it in the research
notes rather than tuning constants to fit.

Recorded battles are **not** shown in the UI in 019 (a possible
"recreate this battle" follow-up).

## §9 Timeline chart

**Decision**: Use Apache ECharts (already the app's charting library,
per ARCHITECTURE.md's 007 entry). The chart shows a two-series line for
strength and a second axis for morale, with `markArea`/`markLine` for
the bombard phase and 5-hour phase boundaries and each phase's dice in
the tooltip. Hover uses the app's `HoverTooltip.tsx` wherever the chart
isn't handling it (FR-015). Colors must stay distinguishable under
common colour-vision deficiencies (Constitution VI).

## Resolved unknowns

Every Technical Context item is resolved. The approximations still open
are the defines↔wiki constant mapping (§2), the military tactics
function (§2), and the mil skill's effect (§4, not applied). Each of
these is shown to the user in an "Approximations" panel.

The full list of combat uncertainties is kept in
[combat-unknowns.md](./combat-unknowns.md): 44 entries (U-01…U-44), one
fact each, with a status and a way to resolve each one. That file is
the source of truth; the three items above are just the most
significant.

## §8 results: first calibration run (2026-09-26)

`tools/battle-sim-reference/calibrate.ts --seeds 60` against the 36 land
battles recorded in `Russia (Melted).eu5`
(`tests/fixtures/battle-sim/reference-battles.json`):

| Metric | Result | SC-003 target |
|---|---|---|
| Battles simulated | 32 (4 skipped: an auxiliary-only side, U-45) | – |
| Recorded winner wins most runs | **88%** (28/32) | ≥ 80% ✅ |
| Winner's losses within 25% of recorded | **4%** (median error 84%) | ≥ 80%-style bar ❌ |

What this shows (all recorded in combat-unknowns.md, **nothing tuned**):

- **Casualties are about 10–17× too low** (U-01, U-03, U-49).
- **Stackwipes happen far earlier than "0 men"**: 12 of 36 recorded losers
  lost 100%, at odds as low as 2.8× (U-32 → `wrong`).
- **A fixed 40% loss at overwhelming odds**: 10 battles at 10–67× odds
  show the loser losing exactly 40% (new U-48).
- **Terrain is probably underweighted**: 3 of the 4 wrong winners were in
  mountains or hills (U-05, U-06, U-18).

So the simulator picks winners well, but its casualty numbers are not
trustworthy yet. The UI already labels results as simulated and lists
these assumptions. Fixing the casualty model needs the in-game tests the
ledger lists, not constant fitting.
