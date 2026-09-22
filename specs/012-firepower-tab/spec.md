# Feature Specification: Firepower Tab

**Feature Branch**: `012-firepower-tab`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Firepower tab: a new top-level tab with three sub-tabs analyzing the military and navy of countries — Military Doctrine (a radar/compass chart of the three military Societal Value axes deferred by feature 010: Land vs Naval, Offensive vs Defensive, Quantity vs Quality), Army Stats (morale, discipline, tactics, manpower, regiment count, monthly manpower, army maintenance cost, levy size, regulars size, fort limit, siege ability, fort defense, army tradition, plus unlocked-tier age columns for Artillery/Infantry/Cavalry/Supply shown as roman numerals I-VI), and Navy Stats (damage given, damage taken, sailors, ship levies, ship regulars, heavy/light/transport/galley counts, navy tradition, monthly sailors, plus unlocked-tier age columns for Heavies/Transports/Lights/Galleys)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See where a country sits on military doctrine (Priority: P1)

An analyst wants to understand a country's military character at a glance —
does it favor land or naval power, offense or defense, a large but rough
force or a small elite one — without reading raw advance/reform lists.

**Why this priority**: This sub-tab reuses infrastructure feature 010
(Societal Values Compass) already built and deliberately left these three
axes out of, so it's the cheapest of the three sub-tabs to deliver and
gives the Firepower tab a working first screen fast.

**Independent Test**: Load a save, open Firepower → Military Doctrine, and
confirm every country with at least one applicable axis (Land vs Naval,
Offensive vs Defensive, Quantity vs Quality) appears positioned on the
chart, with locked axes excluded rather than shown as neutral.

**Acceptance Scenarios**:

1. **Given** a loaded save, **When** the user opens Military Doctrine,
   **Then** each country with at least one applicable axis reading appears
   as a single point positioned by those readings, and hovering it shows
   the per-axis breakdown.
2. **Given** a country has not unlocked one of the three axes (raw value
   is the `-999` sentinel), **When** that country's position is computed,
   **Then** the locked axis is excluded from the calculation, never
   treated as a centrist/zero reading.
3. **Given** a country has no applicable axis at all, **When** the chart
   renders, **Then** that country is excluded from the chart rather than
   shown at a fabricated default position.

---

### User Story 2 - Compare countries' land armies (Priority: P2)

An analyst wants to compare countries' armies side by side: how large,
how experienced, how well-supplied, and what tier of troops they can
currently field.

**Why this priority**: This is the core "army" half of the Firepower ask
and the most data-intensive sub-tab — most of the underlying stats require
new parsing (regiment aggregation, and the discipline/tactics/fort
limit/siege ability/fort defense modifier calculations) that Navy Stats
will then reuse the pattern for.

**Independent Test**: Load a save, open Firepower → Army Stats, and
confirm every country with at least one land regiment shows a row with
morale, manpower, regiment count, and the four unlocked-tier age columns
populated from real save data.

**Acceptance Scenarios**:

1. **Given** a loaded save, **When** the user opens Army Stats, **Then**
   every country with at least one land regiment appears as a row showing
   morale, discipline, tactics, manpower, regiment count, monthly
   manpower, army maintenance cost, levy size, regulars size, fort limit,
   siege ability, fort defense, and army tradition.
2. **Given** a country's regiments, **When** morale is shown, **Then** it
   is a real aggregate (count-weighted mean) of that country's currently
   fielded regiments' own stored morale values, not a fabricated or
   formula-derived number.
3. **Given** a country's researched advances, implemented government
   reforms, implemented estate privileges, active military laws, and
   societal values, **When** discipline, tactics, fort limit, siege
   ability, and fort defense are computed, **Then** each reflects the sum
   of every matching modifier source found for that country, understood
   to be a partial total for discipline/tactics/siege ability (character
   and leader trait contributions are out of scope — see Assumptions).
4. **Given** a country has zero land regiments, **When** Army Stats
   renders, **Then** that country is either excluded or clearly marked as
   having no army, never shown with fabricated zero/default stats that
   look like real data.
5. **Given** a country's currently unlocked (researched) advances, **When**
   the Artillery/Infantry/Cavalry/Supply age columns are shown, **Then**
   each displays the highest age (roman numeral I-VI) among unit types in
   that category the country can currently recruit, independent of
   whether it has actually built any yet.

---

### User Story 3 - Compare countries' navies (Priority: P3)

An analyst wants the same side-by-side comparison for navies: fleet size
by ship class, combat performance, and current shipbuilding tier.

**Why this priority**: Mirrors Army Stats' data shape and computation
pattern (already proven by User Story 2), so it's lower risk and lower
priority than establishing that pattern in the first place — but it's
still core to "Firepower" and not a nice-to-have.

**Independent Test**: Load a save, open Firepower → Navy Stats, and
confirm every country with at least one ship shows a row with sailors,
per-class ship counts, and the four unlocked-tier age columns populated
from real save data.

**Acceptance Scenarios**:

1. **Given** a loaded save, **When** the user opens Navy Stats, **Then**
   every country with at least one ship appears as a row showing sailors,
   ship levies, ship regulars, heavy/light/transport/galley ship counts,
   navy tradition, and monthly sailors.
2. **Given** a country's ships, **When** damage given/taken is shown,
   **Then** it reflects real recorded combat data for that country (see
   Assumptions for the fallback if no such source is found during
   planning).
3. **Given** a country's currently unlocked (researched) advances, **When**
   the Heavies/Transports/Lights/Galleys age columns are shown, **Then**
   each displays the highest age (roman numeral I-VI) among ship types in
   that category the country can currently recruit.
4. **Given** a country has zero ships, **When** Navy Stats renders,
   **Then** that country is either excluded or clearly marked as having
   no navy, never shown with fabricated stats.

---

### Edge Cases

- A country with regiments/ships but none of the researched-advance,
  reform, privilege, or law sources for a given computed stat (discipline,
  tactics, fort limit, siege ability, fort defense) still gets a real
  value: the base/default for that stat, not a missing row.
- A unit type whose unlock is gated by culture or region (`potential=`
  conditions in the game files, e.g. a culture-group-specific ship) is
  only counted as unlocked for a country that both has the researched
  advance AND satisfies the gate — never credited just from the advance
  flag.
- Two countries in the same save can legitimately show different ages for
  the same category (e.g. one country's Cavalry age ahead of another's),
  unlike the compass's Age of Absolutism/Liberalism gating, which is
  save-wide.
- A brand-new or newly-formed country with no regiments/ships and no
  applicable societal-value axes should not appear as an empty/zeroed row
  on any of the three sub-tabs.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST add a "Firepower" top-level tab containing
  three sub-tabs: Military Doctrine, Army Stats, Navy Stats.
- **FR-002**: Military Doctrine MUST plot each country's `land_vs_naval`,
  `offensive_vs_defensive`, and `quality_vs_quantity` Societal Value axis
  readings, excluding any axis at the `-999` "not applicable" sentinel
  from that country's position rather than treating it as neutral.
- **FR-003**: Military Doctrine MUST reuse the existing Societal Values
  Compass data pipeline (the `nation_societal_values` table and its
  adapter) rather than re-parsing `government.societal_values`.
- **FR-004**: Army Stats MUST show, per country with at least one land
  regiment: morale, discipline, tactics, manpower, regiment count,
  monthly manpower, army maintenance cost, levy size, regulars size, fort
  limit, siege ability, fort defense, and army tradition.
- **FR-005**: Army Stats' morale column MUST be a count-weighted mean of
  that country's currently fielded land regiments' own stored `morale`
  values (from `subunit_manager`), not a formula-derived or fabricated
  number.
- **FR-006**: Army Stats' discipline, tactics, fort limit, siege ability,
  and fort defense columns MUST each be computed as the sum of every
  matching modifier source (researched advances, implemented government
  reforms, implemented estate privileges, active military laws, and
  applicable societal-value extremes) actually present for that country
  in the save, using a static source→value lookup table derived from the
  game's own definition files.
- **FR-007**: Army Stats MUST show, per country, an age (roman numeral
  I-VI) for each of Artillery, Infantry, Cavalry, and Supply/Baggage,
  equal to the highest age among that category's unit types whose
  unlocking advance the country has researched (and whose culture/region
  gate, if any, the country satisfies) — regardless of whether the
  country currently has any such unit fielded.
- **FR-008**: Navy Stats MUST show, per country with at least one ship:
  sailors, ship levies, ship regulars, heavy ship count, light ship
  count, transport count, galley count, navy tradition, and monthly
  sailors.
- **FR-009**: Navy Stats MUST show, per country, an age (roman numeral
  I-VI) for each of Heavies, Transports, Lights, and Galleys, using the
  same unlocked-tier methodology as FR-007.
- **FR-010**: Navy Stats MUST show damage given and damage taken per
  country, sourced from real recorded combat data; if no such source
  exists in the save (to be confirmed during planning), these two columns
  MUST be omitted rather than showing a fabricated or placeholder value.
- **FR-011**: If no field or derivable distinction between levy and
  regular troops/ships exists in the save (to be confirmed during
  planning), the levy-size/regulars-size and ship-levies/ship-regulars
  column pairs MUST be omitted rather than showing a fabricated split.
- **FR-012**: A country with zero land regiments MUST NOT appear in Army
  Stats with fabricated zero/default values for the computed stats;
  likewise a country with zero ships MUST NOT appear in Navy Stats.
- **FR-013**: Each of the five computed Army Stats values (discipline,
  tactics, fort limit, siege ability, fort defense) MUST be visually or
  textually marked, where its formula omits a known contributing source
  (character/leader traits), as a partial total rather than presented as
  an exact, complete number.

### Key Entities *(include if feature involves data)*

- **Military Doctrine Axis Reading**: A country's raw value (or "not
  applicable") on one of the three military Societal Value axes
  (`land_vs_naval`, `offensive_vs_defensive`, `quality_vs_quantity`) —
  reuses the existing `nation_societal_values` entity from feature 010,
  not a new one.
- **Army Stat Summary**: One row per country with a land regiment,
  aggregating that country's `subunit_manager` regiments and computed
  modifier totals into the Army Stats columns.
- **Navy Stat Summary**: One row per country with a ship, aggregating that
  country's `subunit_manager` ships and computed modifier totals into the
  Navy Stats columns.
- **Unit Type Reference**: A static lookup, built once from the game's own
  unit-type definition files, mapping each concrete unit/ship type (e.g.
  `a_heavy_cavalrymen`, `n_carrack`) to its category (e.g. Cavalry, Heavy
  Ship) and age (I-VI).
- **Unit Unlock Reference**: A static lookup, built once from the game's
  advance definition files, mapping each advance to the unit/ship types
  it unlocks (plus any culture/region gate), used to derive each
  country's currently-recruitable age per category.
- **Modifier Source Reference**: A static lookup, built once from the
  game's advance, government-reform, estate-privilege, military-law, and
  societal-value definition files, mapping each source to which of the
  five computed Army Stats it contributes to and by how much.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can identify, within 10 seconds of opening Military
  Doctrine, which of two selected countries leans more toward land power,
  offense, or quantity.
- **SC-002**: A user can compare the army size (regiment count and
  manpower) of every major country in a loaded save from a single Army
  Stats view, without leaving the Firepower tab.
- **SC-003**: A user can compare the navy size (ship counts by class) of
  every major country in a loaded save from a single Navy Stats view,
  without leaving the Firepower tab.
- **SC-004**: Every numeric value shown on any of the three sub-tabs
  traces back to real save data or a documented, source-attributed
  computation — none are placeholder, hardcoded, or fabricated defaults.
- **SC-005**: A user can identify which countries currently have access to
  the newest tier (age VI) of any given unit category at a glance, across
  the whole save.

## Assumptions

- Countries default to the player's own country/countries (or, absent a
  clear player country, the top countries by score), with the same
  "add a country" search mechanism already established in Leaderboard,
  Markets, and the Societal Values Compass — consistent with this
  project's existing multi-country view convention.
- Each sub-tab reflects the currently loaded save's current date only
  (a single snapshot), consistent with the Societal Values Compass's
  existing "no date-scrubbing" precedent — there is no historical trail
  for regiment-level or modifier-source data in the save to scrub across.
- The five computed Army Stats (discipline, tactics, fort limit, siege
  ability, fort defense) intentionally exclude ruler and leader/general
  character-trait contributions, since no character/leader parsing exists
  anywhere in this codebase yet; advance/reform/law/privilege/societal
  sources are understood to dominate these totals, making this an
  accepted minor-to-moderate undercount rather than a blocking gap.
- Whether a levy/regulars distinction and a damage-given/damage-taken data
  source actually exist in the save is not yet confirmed; both are
  research questions for the planning phase, with "omit the column"
  as the fallback per FR-010/FR-011 if no real source is found — this
  project's established convention (e.g. the existing `wars` table) is to
  leave a value NULL/absent rather than fabricate it.
- Fort Defense's real internal keyword is `global_defensive` (its display
  name does not match its internal identifier) — confirmed via the game's
  own GUI and localization files, not to be re-derived during planning.
