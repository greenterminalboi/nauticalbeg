# Feature Specification: Battle Simulator

**Feature Branch**: `019-battle-simulator`

**Created**: 2026-09-26

**Status**: Draft

**Input**: User description: "Battle simulator: given the inputs of two nations, with each input modifiable, be able to simulate an EU5 battle between these two nations."

## Clarifications

### Session 2026-09-26

- Q: How should EU5's dice randomness be handled? → A: The simulator rolls
  the dice itself as part of the simulation, the way the game does (a d10
  per side per 5-hour phase, per the EU5 wiki Combat page). Each run is
  one battle. Re-running rerolls the dice.
- Q: Land, naval, or both? → A: Land battles only. Naval combat is out of
  scope for 019.
- Q: Does the simulator need a loaded save? → A: No. With a save, the user
  picks nations to pre-fill each side. Without one, sides start from
  blank/game-default values and the user fills them in.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Simulate a battle between two nations from the loaded save (Priority: P1)

A player wants to know "if my army met theirs right now, who would win?"
They pick an attacker nation and a defender nation from the loaded save.
Each side is pre-filled with that nation's real combat stats and army,
and the user runs the simulation to see who wins, how many casualties
each side takes, and roughly how long the battle lasts.

**Why this priority**: This is the core ask. Pre-filling from real save
data makes the simulator useful with zero typing and reuses the army
data feature 012 (Firepower) already extracts.

**Independent Test**: Load a save, open the Battle Simulator, pick two
nations that both field land regiments, run the simulation, and confirm
a result appears with a winner, per-side casualties, per-side remaining
strength and morale, battle length, and the dice rolled. All of it must
be labelled as a simulated result.

**Acceptance Scenarios**:

1. **Given** a loaded save, **When** the user selects two different
   nations as attacker and defender, **Then** each side's inputs are
   pre-filled from that nation's parsed data (army composition, morale,
   discipline, tactics, unit tiers, and so on) and each pre-filled value
   is marked as coming from the save.
2. **Given** both sides are filled in, **When** the user runs the
   simulation, **Then** the result shows the winner (or a stalemate if
   the battle doesn't resolve), each side's casualties, each side's
   remaining strength and morale, how long the battle lasted (in hours
and days), and whether it ended by morale break or stackwipe.
4. **Given** a completed simulation, **When** the user re-runs it with
   unchanged inputs, **Then** new dice are rolled and the result may
   differ, just as the same battle can go differently in game.
3. **Given** a simulation result is shown, **When** the user reads it,
   **Then** it is clearly labelled as a simulated result, never as
   recorded game data (Constitution IV).

---

### User Story 2 - Modify any input and re-simulate (Priority: P2)

A player wants to test what-ifs: "what if I had 5 more cannons?", "what
if their discipline were 10% lower?", "what if we fought in the
mountains with a better general?" They change any input on either side,
re-run, and see how the outcome shifts.

**Why this priority**: This is what the user asked for explicitly
("each input modifiable"). It builds on Story 1's pre-filled inputs and
turns a one-shot answer into a planning tool.

**Independent Test**: With two nations loaded, change one input (for
example the defender's infantry count), re-run, and confirm the result
changes in the expected direction. Then reset that input and confirm it
returns to the save value.

**Acceptance Scenarios**:

1. **Given** a side's pre-filled inputs, **When** the user edits any of
   them, **Then** the edited value is visibly marked as user-modified
   and differs visibly from the save-derived values.
2. **Given** one or more edited inputs, **When** the user resets a
   single input or a whole side, **Then** those values go back to the
   save-derived values.
3. **Given** an input value outside its plausible range (for example
   negative regiments, or discipline above the allowed maximum),
   **When** the user enters it, **Then** the value is rejected or
   clamped with a clear inline message, and the simulation does not run
   on invalid input.
4. **Given** battle-level inputs (terrain, river or strait crossing,
   and each side's commanding general), **When** the user changes them, **Then**
   the simulation takes them into account.

---

### User Story 3 - See how the battle unfolded (Priority: P3)

A player wants to understand *why* one side won, not only *that* it
won. They view an hour-by-hour, phase-by-phase breakdown: each side's
strength and morale over the course of the battle, the dice each side
rolled each phase, and how regiments moved from reserves into the
center and flanks.

**Why this priority**: This adds insight but isn't needed for the core
"who wins" answer, so it follows the two stories that make the
simulator usable.

**Independent Test**: Run a simulation and confirm a timeline shows
both sides' strength and morale across the whole battle, marks each
5-hour phase with both sides' dice rolls, and marks the bombard phase
if artillery was present.

**Acceptance Scenarios**:

1. **Given** a completed simulation, **When** the user opens the battle
   timeline, **Then** both sides' strength and morale are shown over time,
   with phase boundaries and each phase's dice rolls marked.
2. **Given** a timeline is shown, **When** the user hovers a point in time,
   **Then** that moment's per-side values (strength, morale,
   casualties in that phase, and dice)
   are shown in the app's standard hover tooltip.

---

### User Story 4 - Send a matchup from Firepower (Priority: P2)

*Added 2026-09-26 at the owner's request.*

A player comparing armies in Factbook → Firepower → Army Stats wants to
go straight from "these two look close" to "who would actually win?"
With a save loaded and at least two countries selected, they choose
which selected country attacks and which defends, then send the matchup
to the Battle Simulator. Both sides arrive pre-filled from those
nations' largest armies and stay tied to those nations, so they can
still switch army or edit anything.

**Why this priority**: it links the existing comparison view to the
simulator, removing the manual re-selection step. It depends on User
Story 1's save pre-fill.

**Independent Test**: Load a save, open Firepower → Army Stats, select
two countries, click "Open in Battle Simulator", and confirm the
simulator opens with both sides pre-filled (source badges `save`) and a
note saying where the matchup came from.

**Acceptance Scenarios**:

1. **Given** at least two countries are selected in Army Stats, **When**
   the user opens the "Simulate a battle" bar, **Then** attacker and
   defender default to the first two selected countries, can be set to
   any two different selected countries, and can be swapped.
2. **Given** the same country is chosen for both sides, **When** the user
   tries to send the matchup, **Then** sending is blocked with an
   explanation.
3. **Given** a matchup is sent, **When** the Battle Simulator opens,
   **Then** each side is pre-filled from its nation's largest army
   exactly as if picked in the simulator, and a dismissible note names
   the matchup's origin.
4. **Given** the simulator has been set up, **When** the user switches to
   another section and back, **Then** both sides, the conditions, and
   the last result are still there.

---

### Edge Cases

- A nation with no land regiments is still selectable. Its army
  composition starts empty with an explanatory note, and the user must
  enter regiments manually before simulating. The app never invents a
  default army.
- With no save loaded, both sides start with game-default stats and an
  empty army, and the nation picker is replaced by manual entry.
- If the same nation is chosen for both sides, the simulation is allowed
  (useful for mirror tests), and each side stays independently editable.
- If one side has zero regiments after editing, the simulation does not
  run and an inline message explains why.
- A stat the save doesn't provide for a nation (for example a modifier
  source that isn't parsed) starts at the game's base value. It is
  marked as a default, not as save data.
- If a battle doesn't resolve within a safety limit on battle length,
  the result is reported as unresolved, never as a forced winner.
- If both sides break or are wiped in the same hour, the result is
  reported as a mutual rout or draw, not an arbitrary winner.
- Very large armies (hundreds of regiments per side) must simulate
  without freezing the page. Any run longer than one second shows
  progress (Constitution V).
- If the user loads a different save while the simulator is open, both
  sides reset to the new save's nations. No stale inputs from the
  previous save remain.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide a Battle Simulator view where the
  user picks one nation from the loaded save as the attacker and one as
  the defender, or fills in either side manually.
- **FR-002**: When a nation is picked, the app MUST pre-fill that side's
  inputs from the nation's parsed save data. That includes army
  composition by unit category (infantry, cavalry, artillery, and
  auxiliary/other categories if present) with counts and unit tier;
  the levy versus regular split; current regiment strength; morale;
  discipline; tactics; army experience; relevant combat modifiers
  already computed by the Firepower feature; and army tradition.
- **FR-003**: Every input on both sides MUST be editable by the user.
  This includes army composition, unit tiers, morale, discipline,
  tactics, the other combat modifiers, and the commanding general's
  skills.
- **FR-004**: Every input MUST show where it came from: parsed from the
  save, a game default, or edited by the user. Reset MUST work per input
  and per side.
- **FR-005**: The simulation MUST include battle-level inputs: terrain
  and vegetation, crossing type (none, river, or strait), and a
  commanding general per side, each with sensible defaults (flat
  terrain, no crossing, no general).
- **FR-006**: The simulation MUST follow EU5's land combat rules as
  described on the EU5 wiki Combat page and in the game's own files.
  That covers 5-hour combat phases resolved hour by hour; center, left
  flank, right flank, and reserve sections with terrain-limited
  frontage; engagement chance driven by initiative; reserves moving in
  by combat speed; an artillery bombard phase; strength and morale
  damage formulas including dice impact; the terrain and crossing dice
  penalties; multiplicative modifiers (discipline, unit-type power,
  flanking ability, levy combat efficiency, terrain unit penalties,
  non-engaged bonus, army experience, secure flanks); the constant
  hourly morale drain; and the end conditions (morale break or
  stackwipe).
  Constants MUST come from the base game files, following the existing
  Encyclopedia data-extraction precedent. Any rule that can't be
  sourced from game files MUST be listed and marked as an approximation
  in the UI.
- **FR-007**: The simulation MUST report the winner, or a stalemate or
  no result; each side's casualties; each side's remaining strength and
  morale; and battle length in days.
- **FR-008**: The simulation MUST roll its own dice the way the game
  does (a d10 per side per phase), with the terrain and crossing
  penalties applied to the attacker's roll. Each run is one battle.
  Re-running rerolls. Each result MUST record the seed that produced
  it so a run can be replayed exactly (for testing and for comparing
  what-ifs under identical dice).
- **FR-009**: The simulation covers land battles only. Naval combat is
  out of scope for 019.
- **FR-010**: Results MUST be labelled as simulated results everywhere
  they appear and MUST NOT be mixed with recorded battle data
  (Constitution IV).
- **FR-011**: Invalid inputs (negative counts, values outside
  game-allowed ranges, an empty army) MUST be blocked with inline
  messages. The simulation MUST NOT run until all inputs are valid.
- **FR-012**: The app MUST provide a timeline of both sides' strength
  and morale over the battle, with phase boundaries, each phase's dice
  rolls, and the bombard phase marked (User Story 3).
- **FR-013**: The simulation MUST NOT block the page. Runs longer than
  one second MUST show progress (Constitution V).
- **FR-014**: The simulator MUST work with or without a loaded save.
  Without one, sides start from game-default values with empty armies
  and are filled in manually.
- **FR-015**: Hover details MUST use the app's standard hover tooltip,
  not native browser title tooltips.
- **FR-016**: With a save loaded, Firepower's Army Stats view MUST let
  the user send any two different selected countries to the Battle
  Simulator as attacker and defender. The simulator MUST pre-fill both
  sides from those nations (User Story 4) and MUST keep its state when
  the user moves between sections.
- **FR-017**: The simulator MUST keep a running scoreboard across runs of
  the same matchup: a pie (donut) of victories (attacker, defender, no
  winner) and a pie of total casualties per side, with direct labels, a
  legend, and a numbers table (wins, win rate, total and average
  casualties). Runs with different inputs MUST NOT be mixed: changing any
  input restarts the tally, with a note. A replayed seed MUST NOT be
  counted twice. The user MUST be able to reset the scores. *(Added
  2026-09-26 at the owner's request.)*

### Key Entities

- **Battle Side**: One combatant (attacker or defender). It has a source
  nation (optional once edited), army composition, combat stats, a
  general, and a source marker (save, default, or user-edited) for each
  value.
- **Army Composition**: Regiment counts per unit category and tier,
  plus current strength per regiment.
- **Combat Stats**: Morale, discipline, tactics, and the other combat
  modifiers that feed the simulation, each with its source.
- **General**: The commander's skill values used in combat (defaults to
  "no general").
- **Battle Conditions**: Terrain and vegetation, crossing type, and any
  other battle-wide factors.
- **Simulation Result**: Winner (or draw or unresolved), how the battle
  ended, per-side casualties and remaining strength and morale, battle
  length, the dice seed, and the hourly timeline with per-phase dice.
  Always marked as simulated.
- **Combat Rules Data**: Unit stats and combat constants taken from the
  base game files, with version information.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user with a loaded save can go from opening the
  simulator to seeing a battle result in under 30 seconds, with no
  manual data entry.
- **SC-002**: Changing one input and re-running shows the new result in
  under 2 seconds for armies of up to 100 regiments per side.
- **SC-003**: For a set of reference battles recreated from real
  in-game battles (same armies, stats, terrain, and general),
  repeated simulations of each battle pick the correct winner in the
  majority of runs for at least 80% of the reference battles, and the
  median casualties are within 25% of the recorded values.
- **SC-004**: 100% of the values shown in the simulator are labelled
  with their source (save, default, or user-edited), and 100% of
  results are labelled as simulated.
- **SC-006**: Replaying a result's seed with the same inputs reproduces
  the identical battle 100% of the time.
- **SC-005**: 100% of invalid input combinations are blocked with an
  explanation, with no crashes or silent "no result" states.

## Assumptions

- The simulator is a separate view/tab and doesn't change or depend on
  feature 018 (Country Factbook tabs).
- Army data (regiment composition, morale, discipline, tactics, and
  the other modifiers) reuses the parsing and computation built for
  feature 012 (Firepower). Its known partial totals (for example, no
  character or leader-trait contributions) carry over. Users can
  override those values manually.
- The first version simulates one battle between two single armies. It
  does not simulate multiple stacks joining mid-battle, reinforcements,
  sieges, or whole wars.
- Combat constants are extracted from the locally installed base game.
  They are shipped as structured data, which the Constitution allows,
  and never as art or textures.
- The simulator matches the EU5 game version the app supports.
  Differences in combat rules between game versions follow the existing
  version-compatibility approach (Constitution III).
- The EU5 wiki Combat page (https://eu5.paradoxwikis.com/Combat) is the
  primary description of the rules. Where it is vague (for example "Military
  Tactics — unclear function"), planning checks the game files. Anything
  still unresolved is marked as an approximation (FR-006).
- A "win probability over many runs" summary is not part of 019. The
  user can re-run to see the variance, and it could be added later.
- Saved or shareable simulator scenarios are out of scope for the first
  version. Sharing via feature 017 links could be added later.
