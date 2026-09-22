# Phase 0 Research: Firepower Tab

All findings below were confirmed against the real save
(`/Users/halda/Downloads/Russia (Melted).eu5`, plaintext, 642MB) and the
real local EU5 game install, never against the test fixture (per
[[never_guess_map_mode_fields_from_fixture]] convention) — the fixture is
extended from these findings, not the other way around.

## 1. Military Doctrine data source

**Decision**: Reuse `nation_societal_values` (feature 010's table/adapter)
unchanged; read `land_vs_naval`, `offensive_vs_defensive`,
`quality_vs_quantity` rows the same way the Compass already reads its 11
axes, applying the same `-999` "not applicable" exclusion rule.

**Rationale**: These three axes live in the exact same
`government.societal_values` block feature 010 already parses in full —
it only *excluded* them from the compass's position math, it never
stopped storing them. No new parsing.

**Alternatives considered**: A dedicated radar-chart component reusing
`compassPosition.ts`'s vector math conceptually but rendering 3 spokes
instead of 11 — appropriate for Phase 1 design, not a data-source
question.

## 2. Regiment/ship aggregation for Army/Navy Stats

**Decision**: A SQL aggregate query over `subunit_manager`-derived rows,
grouped by `owner` and filtered by `type` prefix (`a_` = army, `n_` =
navy), computed in DuckDB — never a row-by-row JS loop over a save that
can have tens of thousands of subunit rows (Constitution Principle V).

**Rationale**: `subunit_manager.database[*]` already carries `owner`,
`type`, `morale`, `number` directly — everything Army/Navy Stats' base
counts and morale need is a single grouped aggregate away.

## 3. Unit Type Reference (category + age lookup)

**Decision**: A static, pre-generated reference table (TS/JSON, same
precedent as `rgoGameColors.ts`) mapping every concrete unit type id to
`{category, age, isLevy}`, built once from
`game/in_game/common/unit_types/*.txt` and committed to the repo per the
constitution's Encyclopedia-data exception (structured mechanics data,
not art).

**Rationale/Scope**: 31 files under `unit_types/`; excluding the two
abstract age-template files and the readme, **~259 concrete unit type
definitions** exist (army + navy + culture/country uniques). Each
declares `category` (e.g. `navy_heavy_ship`, `army_heavy_cavalry`) and
`age` (`age_1_traditions`..`age_6_revolutions`, mapped to roman I-VI)
directly. `levy = yes/no` is also a real per-type field (confirmed via
`readme.txt` and live examples like `a_matchlock` vs. `a_matchlock_levy`,
`a_peasant_levy`) — folding it into this same table answers spec FR-011's
open levy/regulars question with a real "yes, compute it" rather than the
FR-011 fallback (omit).

**Alternatives considered**: Deriving age/category from unit *name*
string patterns instead of the definition files — rejected, some unique
unit ids don't follow a guessable naming convention (culture-specific
units), and this project's established convention
([[eu5_save_format_gotchas]]) is to source structural facts from
definition files, not guessed patterns.

## 4. Unit Unlock Reference (advance → recruitable unit type)

**Decision**: A static reference table built once from
`2_army_unlocks.txt` (38 `unlock_unit` entries) + `2_ship_unlocks.txt` (34
entries) + roughly 42 additional scattered culture/country/region-specific
advance files (unique-unit unlocks, e.g. `country_chi.txt`,
`culture_thai.txt`), mapping each advance name to the unit type(s) it
unlocks, plus any `potential=` culture/region gate found on that unlock.
A country's currently-recruitable roster for a category = every unit type
whose unlocking advance is `=yes` in that country's `researched_advances`
AND whose `potential=` gate (if any) the country's already-parsed
culture/capital data satisfies. "Age column" value = the highest `age`
(via the Unit Type Reference, #3) among that recruitable roster for the
given category.

**Rationale**: Confirmed directly — `unlock_footmen_advance = { unlock_unit
= a_footmen ... }` in game files, and `unlock_footmen_advance=yes` /
`unlock_pikemen_advance=yes` both appear as flat boolean flags in a real
country's `researched_advances` block (save lines ~3155217, ~3155223).
No alternate/separate unlock mechanism exists — the flat advance-name
list is the real gate, confirmed against source, not inferred.

**Alternatives considered**: Deriving "unlocked age" from what a country
currently has *fielded* (`subunit_manager` types in play) instead of what
it can recruit — rejected per the earlier user decision (spec FR-007/
FR-009 explicitly want "unlocked/recruitable," not "currently fielded").

## 5. The five computed Army Stats (discipline, tactics, fort limit, siege ability, fort defense)

**Decision**: A static Modifier Source Reference table (per stat: source
type + source name → contributed value), built once from the game's
`advances/`, `government_reforms/`, `estate_privileges/`, `laws/`,
`societal_values/`, and `auto_modifiers/` files, then computed per country
at query time as the sum of every source actually present in that
country's `researched_advances`, `implemented_reforms`,
`implemented_privileges`, `implemented_laws` (see #6), and
`societal_values` (extreme-value bonuses only).

**Confirmed real internal keywords** (display name does not always match):
`discipline`, `military_tactics` (displayed "Tactics"), `fort_limit` +
`fort_limit_modifier`, `siege_ability`, `global_defensive` (displayed
"Fort Defense" — see [[eu5_modifier_keyword_mismatch]], do not re-search
for a literal `fort_defense` string).

**Confirmed source counts** (from the prior research pass in this
session, not re-derived here): discipline draws from ~10 distinct
sources (reforms, an age-5 advance choice, several military-law choices,
2 estate privileges, dynamic auto-modifiers, plus an out-of-scope
character-trait contribution); tactics from ~6 flagship per-age advances
plus 2 reforms, 1 estate privilege, law choices; fort_limit from a base
formula (`1 + owned_locations/10`) plus 6 age-gated advances (one per
age, +0.10 each), a societal-value extreme, a theocracy reform, an estate
privilege, and scattered culture/country flavor bonuses; siege_ability
from an army-tradition-scaled auto-modifier, 1 advance choice, 1 reform,
plus out-of-scope character traits; global_defensive (fort defense) from
the widest source set of the five — laws, reforms, advances, estate
privileges, societal values, chivalric orders, religions, subject types,
international organizations, gods/avatars, and bureaucracies (~50+ source
files touch this one keyword).

**Accepted gap** (unchanged from spec Assumptions): ruler/leader
character-trait contributions to discipline, tactics, and siege_ability
are excluded — no character/leader parsing exists in this codebase.
fort_limit and global_defensive have no trait dependency, so they're
unaffected.

## 6. Military law save-field shape

**Decision**: Parse `country.government.implemented_laws` (a new field,
sibling to the already-planned `implemented_reforms`/
`implemented_privileges` under the same `government` object), shaped per
law category:

```
implemented_laws={
    recruitment_law={ date=... days=... object=<choice_name> }
    battle_leadership_law={ date=... days=... object=<choice_name> }
    maritime_law={ date=... days=... object=<choice_name> }
    piracy_law={ date=... days=... object=<choice_name> }
    distribution_of_power_law={ date=... days=... object=<choice_name> }
    medieval_levy_law={ date=... days=... object=<choice_name> }
    ...
}
```

Confirmed in the real save (Sweden's country record, lines
3154592–3154886). `object` is the exact law-choice id used in
`game/in_game/common/laws/*.txt`, matched against the Modifier Source
Reference (#5) the same way `implemented_reforms`/`implemented_privileges`
entries are.

**Rationale**: Structurally identical to reforms/privileges (already
planned to parse), just grouped by category instead of a flat list —
minimal new adapter logic, one new table (or one wider table with a
`law_category` column).

## 7. Levy vs. regulars split

**Decision**: RESOLVED as real and save-derivable — spec FR-011's "omit
if no source found" fallback does NOT apply; build it. A fielded
regiment/ship's levy status is read directly off its `type` string
(`subunit_manager.database[*].type`, e.g. `a_matchlock_levy`,
`a_peasant_levy`) cross-referenced against the Unit Type Reference's
`isLevy` field (#3) — confirmed ~900 real matches for `type=a_*levy` in
the real save. Army/Navy Stats' levy-size/regulars-size columns = summed
`number` grouped by that boolean, per country.

**Rationale**: Two independent, corroborating sources were found: (a) the
unit-type-level `levy = yes/no` flag plus matching `_levy`-suffixed
concrete unit types, and (b) a full `game/in_game/common/levies/`
directory defining levy recruitment-pool formulas (base size × estate
modifiers × law/reform modifiers) — (a) is what's actually visible per
fielded unit and is sufficient for this feature; (b) would only matter
for a hypothetical "levy capacity" stat this feature doesn't ask for.

**Alternatives considered**: `combat_manager.database[*].battle.*.who`
carries an explicit per-battle-participant `size`/`levy`/`non_levy` split
— rejected as the primary source since `combat_manager` only holds
current/recent in-flight battles (~353 lines total in the real save), not
a stable per-country snapshot; noted as a possible cross-check, not used.

## 8. Navy damage given/taken

**Decision**: RESOLVED as computable, but requires widening existing
parser logic rather than reading a new field — spec FR-010's "omit if no
source found" fallback does NOT apply; build it. Reuse
`war_manager.database[*].attacker_losses`/`defender_losses` (`{losses:
{<category>: {Battle, Attrition, Capture}}}`), already partially parsed
by `sumLosses()` in `src/parser/version-adapters/1.3.11.ts:129-138` for
the existing `wars.attacker_casualties`/`defender_casualties` columns —
but `sumLosses()` currently collapses every category into one flat total.
Confirmed live: category keys include navy ones (`navy_transport` seen at
save lines ~32403251/32403835) alongside army ones (`army_heavy_infantry`,
etc.), separable by the same `army_*`/`navy_*` prefix convention as the
Unit Type Reference's `category` field. A country's navy "damage given" =
sum of `navy_*`-category opponent losses across every war where that
country is `attacker_idx`/`defender_idx`; "damage taken" = the mirror
(own losses).

**Rationale**: No separate country-level running damage counter exists in
the save (confirmed: zero hits for `damage_given`/`damage_taken`/
`last_months_damage`) — this is genuinely the only real source, and it's
already half-built (the existing `wars` table's casualty derivation).

**Impact on existing code**: `sumLosses()` needs to preserve the
category-level breakdown (or at least a navy-vs-army split) instead of
collapsing to one number — a small, scoped change to existing parsing
logic, not new parsing from scratch. Flagged for Phase 1 data-model /
tasks, since it touches code the `wars` table (feature 008) already
depends on and must not regress.

**Alternatives considered**: Treating this as "no real source, omit the
columns" per FR-010's fallback — rejected now that a real (if
somewhat indirect) source was confirmed; omitting would be settling for
less than the data actually supports.
