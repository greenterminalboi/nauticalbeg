# Combat Unknowns Ledger: Battle Simulator (019)

A running list of every battle rule we are **not sure about**, one fact
per entry. It is kept up to date for the life of the feature (and
after).

**Rules for this file**
- Each entry has a stable ID (`U-01`…). IDs are never reused or renumbered.
- The code cites the ID wherever it relies on the assumption, for
  example `// ASSUMPTION U-09` in `src/battleSim/combatFormula.ts`.
- The result's **Approximations** panel lists the IDs that affected
  that run.
- **Status** is one of:
  - `open`: current assumption not verified;
  - `partial`: some evidence, not conclusive;
  - `confirmed`: verified, with a note on how;
  - `wrong`: the assumption was disproven, the fix is noted, and the
    entry is kept.
- **Resolve by** names the cheapest way to settle it:
  - `files`: grep the game files or localization;
  - `ingame`: a controlled test battle in the game;
  - `calib`: the calibration suite against recorded battles (research §8);
  - `save`: grep the real save.

**Sources**
- **wiki**: https://eu5.paradoxwikis.com/Combat
- **defines**: `game/loading_screen/common/defines/00_defines.txt`
- **concept**: a `game_concept_*_desc` localization string

---

## A. Dice and damage

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-01 | How the **strength damage dice impact** is built | Wiki: `10 + (roll−1+terrain+crossing)×2`. Defines: `COMBAT_BASE=5`, `COMBAT_MAX=15`, `COMBAT_DAMAGE_MULT=0.01`, which don't reproduce the wiki form **Calibration 2026-09-26 (32 recorded battles × 60 seeds):** simulated casualties are about **10–17× too low** (winner losses: 4% of battles within 25%, median error 84%). The strength chain (U-01 slope, U-03 modifier, or both) is off by an order of magnitude. | `dice = clamp(COMBAT_BASE + roll − 1 + mods, 0, COMBAT_MAX)`; strength impact = dice × 2 (`STRENGTH_DICE_SLOPE`, the only non-define part). **2026-09-26:** the wiki's `10 + (roll−1)×2` equals exactly `(COMBAT_BASE + roll − 1) × 2`, so base 5 is confirmed as the define; the ×2 slope and the clamp are still unconfirmed | calib, ingame | partial |
| U-02 | How the **morale damage dice impact** is built | Wiki: `0.05 + (…)×0.01`. Defines: `BASE_MORALE_DAMAGE=1.0`, `LAND_MORALE_DAMAGE_MODIFIER=1.0` | Morale impact = dice × `COMBAT_DAMAGE_MULT` × `BASE_MORALE_DAMAGE` × `LAND_MORALE_DAMAGE_MODIFIER`. **2026-09-26:** the wiki's `0.05 + (roll−1)×0.01` equals exactly `COMBAT_DAMAGE_MULT × (COMBAT_BASE + roll − 1)`, so both parts are defines; how the last two multipliers combine is still unconfirmed | calib, ingame | partial |
| U-03 | Where **`LAND_STRENGTH_DAMAGE_MODIFIER = 0.2`** enters the chain | Only its name and value are known **Calibration 2026-09-26 (32 recorded battles × 60 seeds):** see U-01. Casualties are 10–17× too low, and this ×0.2 is the largest single damping factor, so it's the prime suspect. | A final multiplier on strength damage | calib | open |
| U-04 | Whether the **effective roll is clamped** (below 1 or 0? capped at `COMBAT_MAX`?) | Terrain + crossing + commander can push it past 1–10 | Clamp to [0, `COMBAT_MAX`] | ingame | open |
| U-05 | **Which side the terrain `defender` value applies to** (attacker penalty or defender bonus) | Wiki says it reduces the attacker's roll. The files call it `defender = N` **Calibration 2026-09-26 (32 recorded battles × 60 seeds):** in 3 of the 4 wrong winners (mountains or hills), a larger attacker lost in the game but wins in the sim, so terrain effects are probably underweighted (see also U-06, U-18). | Subtract from the attacker (differs from a defender bonus only under clamping, U-04) | files, ingame | open |
| U-06 | Whether topography and vegetation `defender` values **add together** | Both files declare `defender` | They add (mountains + forest = 3) | ingame | open |
| U-07 | What the **commander combat bonus** applies to | Concept: "a flat dice bonus applied to every combat phase" | Added to that side's effective roll for both strength and morale damage | files | partial |
| U-08 | The **granularity of a dice roll**: one per side, per section, or per regiment? | Wiki: both sides roll once per phase | One roll per side per phase | ingame | partial |

## B. Damage modifiers

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-09 | The **military tactics formula** | Concept: "reduces the damage taken". Wiki: "unclear function" | Damage taken ÷ (1 + tactics) | calib, ingame | open |
| U-10 | **Discipline** on offense and defense | Concept: more damage done, less taken | Damage done × (1 + discipline); damage taken ÷ (1 + discipline) | ingame | open |
| U-11 | **Experience** reduction and scale | `LAND_EXPERIENCE_DAMAGE_REDUCTION=0.5`. Save values like `25.56` and `0.00033` suggest a 0–100 scale | Damage taken × (1 − exp/100 × 0.5) | save, ingame | open |
| U-12 | **Unit-type power** (`army_*_power`) and the wiki's defender-side type factors (cavalry 0.75, artillery 1.25) | The modifiers exist in `modifier_types`. The source of the 0.75/1.25 factors isn't found in the files | Power: attacker's damage done × (1 + power). The 0.75/1.25 factors are **not applied** until sourced | files | open |
| U-13 | **Flanking ability** semantics (values 0.2–2.1; wiki says "100% = no bonus") | Applies when hitting a non-opposing section | Damage × flanking ability, only when the target is in a different section | ingame | open |
| U-14 | **Secure flanks** value | Wiki: 10% center / 5% flank. Unit stat `secure_flanks_defense` is about 0.05. Concept: doubled if both flanks are secure | Damage taken × (1 − stat per secured neighbour section) | files, ingame | open |
| U-15 | Whether **levy combat efficiency** (0.75) is offense only | Define `LAND_LEVY_COMBAT_IMPACT=0.75` | Applies to damage done only | ingame | open |
| U-16 | The direction of the **not-engaged bonus** (1.1 strength / 1.2 morale) | Define names only | Extra damage *taken* by units that are not engaged (hit while in reserve) | ingame | open |
| U-17 | How the unit stats **`*_damage_done` / `*_damage_taken`** combine | Values like −0.1 or 0.33 | Multiply by (1 + value) | files | partial |
| U-18 | **Terrain penalties per unit type** (for example cavalry −10% in mountains) | Wiki mentions them. Their file source isn't found yet | Not applied until sourced | files | open |
| U-19 | How **artillery combat power** scales, in the combat phase and in bombard ("deals its combat power as damage") | Cannons have 4–5, the helepolis 0.25 | Same strength formula as other units; bombard uses combat power × strength with no dice | ingame | open |

## C. Frontage, engagement, and targeting

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-20 | Whether **base frontage 10** is per section or total | `static_modifiers/location.txt`: `local_frontage_allowed = 10`; terrain subtracts; `MAX_FRONTAGE_OVERSTACKING=1.25` on the flanks | Per front section; flanks may overstack to 1.25× | ingame | open |
| U-21 | How **formation preference weights** place regiments (`2 = army_light_cavalry`: a priority or a ratio?) | `balanced_army` is the default; `max_frontage = 1.25` per section | Weights are relative priorities. Regiments fill sections in order of weight until each section's frontage is full; the rest go to reserves | files, ingame | open |
| U-22 | The **engagement chance formula** (three sources disagree) | Defines: `0.1 + min(init×0.02, 0.1) + hours×0.01`. Concept: `init×0.02 + 0.02×hours` vs d100. Wiki matches the defines | Use the defines form | ingame | partial |
| U-23 | **Reserve movement** | Concept: d20 < combat speed. Wiki / `COMBAT_SPEED_SCALE=0.05`: 0.05 × combat speed | Chance = 0.05 × combat speed (the same as d20 < speed when speed is an integer) | ingame | partial |
| U-24 | **Target selection** inside a section | Wiki: a unit keeps its target until the target is destroyed | Random target in the opposing section; if that is empty, the adjacent section | ingame | open |
| U-25 | Whether a regiment's save **`box`** is its battle section | **2026-09-26, real save (4,229 army regiments):** `box` is `Left` 1,075, `Right` 1,033, `Reserves` 983, `Captured` 16, and **absent** on 1,122. `Center` never appears, which fits the save-file convention of leaving out default values | Absent `box` ⇒ `center`; Left/Right/Reserves map directly; `Captured` regiments are left out of the pre-fill (not under the owner's command). Still unconfirmed that this is the *battle* section rather than a formation slot | save, ingame | partial |
| U-26 | When an **individual regiment withdraws** | Concept: "when a unit withdraws, it stops being engaged". `LOW_MORALE_THRESHOLD=0.5` (NUnit) | A regiment withdraws at 0 morale and doesn't come back | ingame | open |
| U-27 | What the **army's `frontage=5`** field means | Seen in `unit_manager` | Ignored (probably a cached UI value) | save | open |

## D. Morale and ending the battle

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-28 | **Max morale** | `LAND_MORALE=3.0`, the modifier `land_morale_modifier`, regiment morale in the save about 2.2 | Max = 3.0 × (1 + land_morale_modifier) | save, calib | open |
| U-29 | The **hourly morale drain** (`COMBAT_HOURLY_MORALE_TICK=0.01`): flat or scaled, engaged only? | Wiki: "0.01 morale damage/hour to all engaged regiments" | Flat 0.01 for engaged regiments | ingame | partial |
| U-30 | What **`MORALE_COLLAPSE_THRESHOLD=0.05`** is measured against | Name only | The side routs when average morale ≤ 5% of max | ingame | open |
| U-31 | The meaning of **`MINIMUM_COMBAT_DURATION=24`** (hours) | Name only | No rout before hour 24; a stackwipe can still end it earlier | ingame | open |
| U-32 | **Stackwipe** rules (only 0 men, or an overwhelming ratio as in EU4?) | Wiki: "loses all soldiers" **Calibration 2026-09-26 (32 recorded battles × 60 seeds):** **contradicted.** In 12 of 36 recorded battles the loser lost 100% of its men, at winner/loser size ratios as low as 2.8. EU5 wipes a losing army well before it's fought down to zero. | 0 strength only | ingame | wrong |
| U-33 | Whether **retreat damage** (`RETREAT_STRENGTH_DAMAGE=0.1`) counts in the battle's casualties | Name only | Applied to the loser after the battle, shown separately, excluded from casualties | save, calib | open |
| U-34 | **Imprisoned** men (in the battle record's `imprisoned` array) | `COMBAT_IMPRISONED_UNIT_DEATH_RATE=0.4` | Not modelled | save | open |

## E. Bombard phase

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-35 | The **bombard fire chance** | `BOMBARD_BASE_CHANCE=0.2` vs the wiki's "bombard efficiency + 10%" | Chance = 0.2 + bombard efficiency (0 unless the user sets it) | files, ingame | open |
| U-36 | How the **`artillery_barrage`** unit stat is used | Declared only on artillery (1–5) | Not used in 019 | files | open |
| U-37 | **When bombard happens** (only at the start, or also later?) | Concept: "opening phase", `BOMBARD_HOURS=5` | Only the first 5 hours; skipped if neither side has artillery | ingame | partial |

## F. General

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-38 | The combat effect of the **`mil` skill** | The save has `mil` (0–100). No define or concept mentions a combat effect | **Not applied**; shown as "effect not modelled" | files, ingame | open |
| U-39 | Whether a **general trait's non-dice modifiers** (for example `discipline = 0.1`) apply to the army | Traits carry them | They add to the side's stats while that general leads | files | partial |

## G. Save data interpretation

| ID | What we're unsure of | What we know | Current assumption | Resolve by | Status |
|---|---|---|---|---|---|
| U-40 | Regiment **`strength` vs `number`** | **2026-09-26, real save:** `strength` values (0.066, 0.4, 1.5, 1.91542, 2, …) are on the same thousands scale as the unit types' `max_strength` (for example 0.5 at age 1). `number` is present on 3,087 regiments and is **always a whole number** (0–190), so it's a naming ordinal ("92nd regiment"), not a headcount. **Strong support:** of 3,875 army regiments with a `strength`, 3,145 (81%) are within 10% of their unit type's `max_strength` and 3,868 are ≤ max; 7 exceed it (max 21×, unexplained outliers) | Men = `strength` × `REGIMENT_SIZE`; `number` is ignored. **Knock-on for 012 (not fixed in 019):** Firepower's `listRegimentSummaryArrow` sums `number` as `total_number`, which Army Stats shows as "headcount" and levy/regular totals and Navy Stats uses as ship counts. If `number` is an ordinal, those figures are wrong. Flagged to the owner on 2026-09-26 | ingame | partial |
| U-41 | The slot order and units of the battle record's **10-slot arrays** (`total` / `losses`) | 10 slots; totals are small decimals (thousands of men?) **2026-09-26:** for war 1694498823, each side's non-zero battle slots match exactly the categories in that war's `attacker_losses` / `defender_losses` (light infantry, heavy infantry, light cavalry, heavy cavalry, artillery, auxiliary), and `who.size` equals the sum of `total`. | Slots follow `unit_categories` file order; values are in thousands | save, files | partial |
| U-42 | What **`result=yes`** in a battle record means | Paired with `war_attacker_win` **2026-09-26:** in all 18 battles where both sides have a prestige change, the side `result` names as winner gained more prestige. | `yes` = the battle's attacker won | save | confirmed |
| U-43 | How complete the **nation-level stats** are (012's discipline and tactics are partial totals: no characters or leaders) | Documented in 012 | Carried over, and flagged in the UI | calib | open |
| U-44 | Whether **levy status** belongs to a regiment or to its unit type | 012 uses the unit type's `isLevy` flag | By unit type | save | partial |
| U-45 | Whether **auxiliary (supply) regiments** take part in combat | The formations place `army_auxiliary` only in reserves (weight 100); their combat power is 0.25 **2026-09-26:** 4 of 36 recorded battles have a side with only auxiliaries (tysmenytsia, fayzabad, tondo, ibalong), so the game does fight battles against auxiliary-only stacks. Those can't be simulated under the current assumption. | They stay in reserves, never engage, and aren't counted in strength, morale, or casualties. Added 2026-09-26 during implementation | ingame | partial |
| U-46 | What a **missing `strength` line** on a regiment means | **2026-09-26, real save:** 354 of 4,229 army regiments have no `strength` (mostly `a_peasant_levy` 189, `a_men_at_arms` 82, `a_handgonners` 77), and most carry a `missing={…}` block of goods shortfalls. Other regiments have `strength=0` written explicitly, so absent ≠ 0 is possible | Pre-filled as **0% strength with source `default`** (visible and editable, never labelled as save data), so they don't fight unless the user edits them | save, ingame | open |
| U-47 | Whether **averaging strength and experience within a composition row** changes the outcome | The pre-fill groups a real army's regiments per (unit type, section) and averages strength % and experience inside each group, so individual regiments that differ become identical | Averaging is harmless because damage is linear in men. Total men are preserved; the spread between regiments is lost | calib | open |
| U-48 | Whether an **overwhelming-odds battle ends with a fixed 40% loss for the loser** | **Calibration 2026-09-26:** in 10 recorded battles with winner/loser size ratios of 10–67, the loser lost exactly 40% of its men (for example 0.40 at 66.6×, 14.5×, 10.1×). No define or concept names this rule | Not modelled. The simulator fights such battles out normally, which is a known mismatch | files, ingame | open |
| U-49 | **Losing-side casualty scale in contested battles** | **Calibration 2026-09-26:** where odds were within about 3×, recorded losers lost 30–98% (typically 70–98%) of their men; the simulator's losers lose about 5–15% before their morale breaks | Unknown mechanism: morale may break too fast (U-28, U-29, U-30), damage may be too low (U-01, U-03), or there may be a pursuit/retreat loss (U-33). Not tuned | calib, ingame | open |
