# Feature Specification: Societal Values Compass

**Feature Branch**: `010-societal-values-compass`
**Created**: 2026-09-21
**Status**: Draft

## Post-Implementation Course Correction (2026-09-21)

After the first implementation shipped, the user reviewed the live
feature and requested six changes. These supersede the corresponding
parts of the spec below rather than being tracked as a separate
feature — recorded here for traceability, not re-litigated in the
sections that follow.

1. **The chart wasn't centered.** The ideological origin must sit at
   the visual center of the plot regardless of which countries are
   selected. Fixed by sharing one symmetric domain across both axes,
   computed from the actual plotted spread (still FR-008's auto-scale,
   just forced symmetric).
2. **Default view is the player's own country/countries only**, not
   every country in the save — with the same "add a country" search
   mechanism already established in Leaderboard and Markets
   (`computeDefaultSelection` + `AddCountryInput`), not a new one.
   This supersedes FR-001/FR-007's "every applicable country" default.
3. Confirmed (no change): the radial vector-sum-then-2D-projection
   approach in §5/`compassPosition.ts` is correct as specced.
4. **Dots are colored by the country's own real map color** (not a
   great-power/neutral split), with the country's tag always shown as
   a label. Supersedes FR-012 (see point 6 below — the great-power
   color mode this originally described was removed entirely, not
   replaced).
5. **The quadrant corner labels are replaced with four axis-end
   labels** (top/bottom/left/right), each naming the Societal Value
   axes that dominate that direction — e.g. "Authoritarian
   (Centralization, Absolutism)" — rather than an unexplained quadrant
   name. Supersedes FR-014's corner-label approach (the "static,
   decorative, data-independent" requirement itself is unchanged).
6. **The quadrant orientation was corrected**: Authoritarian Right
   belongs top-right, Market Libertarian bottom-right, State Collective
   top-left, Libertarian Collective bottom-left. This is a real fix to
   the position formula (`compassPosition.ts` negates the y-component
   of the vector sum), not just a label swap — see that file's comment
   for the derivation.
7. **Great-power status is removed from this feature entirely** —
   no `great_powers` table, no query, no color mode, no tooltip line.
   This supersedes FR-012 outright (not merely its default color, the
   entire requirement) and the `great_power_manager` parsing added in
   the first pass was reverted.
8. **The axis-end labels became two composite axes** (Authority on y,
   Economic on x), each combining several Societal Value axes, per
   explicit user direction — `aristocracy_vs_plutocracy` and
   `individualism_vs_communalism` moved from the x-axis to the y-axis
   for this, overriding the angle-proximity-only scheme point 5
   originally used. `serfdom_vs_free_subjects`, `mercantilism_vs_free_trade`,
   and `capital_economy_vs_traditional_economy` were tightened onto the
   x-axis so all three are genuinely represented.
9. **The three cultural/religious-sphere conditional axes
   (`sinicized_vs_unsinicized`, `mysticism_vs_jurisprudence`,
   `latinization_vs_hellenization`) were removed entirely** — explicit
   user request. This also resolves FR-016 by removing what it was
   about; the compass now projects 11 axes, not 14.

## User Scenarios & Testing

### User Story 1 - See every country's ideological position at a glance (Priority: P1)

An analyst opens a loaded save and wants to understand the ideological
landscape of the world in one view: which countries lean authoritarian,
which lean liberal, which are collectivist versus individualist, without
reading each country's stats one by one.

**Why this priority**: This is the entire point of the feature. Without
this, there is no compass — everything else is refinement on top of it.

**Independent Test**: Load a save, open the Compass, and confirm that
every country with at least one applicable Societal Value reads as a
single dot positioned somewhere on the chart, and that hovering a dot
explains why it sits where it does.

**Acceptance Scenarios**:

1. **Given** a loaded save with countries at varying stages of
   development, **When** the user opens the Societal Values Compass,
   **Then** every country that has at least one applicable (unlocked)
   Societal Value axis appears as exactly one dot, positioned by the
   vector-sum of its applicable axes.
2. **Given** a country has not yet unlocked a given axis (e.g. it hasn't
   reached the Age that unlocks Absolutism/Liberalism), **When** that
   country's position is computed, **Then** the locked axis contributes
   nothing to the position — it is excluded from the calculation, not
   treated as a neutral/centrist reading.
3. **Given** the user hovers over a country's dot, **When** the tooltip
   appears, **Then** it names the country and shows enough of a
   per-axis breakdown that the user can see why the dot landed there.
4. **Given** a save with 50 or more countries, **When** the compass
   renders, **Then** it does not show a permanent label for every
   country at once (to avoid an unreadable label pile-up) — labels
   appear on hover, or as space allows.

---

### User Story 2 - Tell countries apart by size and status (Priority: P2)

An analyst wants to distinguish major powers from minor ones without
switching views, by seeing dot size and color reflect each country's
scale and standing.

**Why this priority**: Turns a flat scatter of identical dots into a
readable picture of the world's actual power balance — valuable, but
the compass is still useful without it.

**Independent Test**: With the compass open, confirm dot size varies
with the chosen size metric and dot color reflects great-power status,
and that both can be changed without leaving the view.

**Acceptance Scenarios**:

1. **Given** the compass is showing all countries, **When** the user
   selects a size metric (population or total development), **Then**
   every dot resizes to reflect that metric for its country.
2. **Given** the default color mode, **When** the compass renders,
   **Then** countries currently holding great-power status are visually
   distinguished from those that are not.
3. **Given** the user switches to "color by axis" mode and picks one of
   the three excluded military-doctrine axes (or another single axis),
   **When** the compass re-renders, **Then** dot color reflects that
   axis's value as a gradient, independent of the x/y position math.

---

### User Story 3 - Read the compass against an ideological reference (Priority: P3)

An analyst unfamiliar with exactly which axes feed which quadrant wants
a lightweight visual reference — quadrant labels and gridlines — to
interpret the chart without memorizing the axis list.

**Why this priority**: Nice-to-have context layer; the compass is
usable without it once a user learns the layout, but it lowers the
learning curve for first-time and infrequent users.

**Independent Test**: With the compass open, confirm faint quadrant
gridlines and labels are visible in the background and do not obscure
or interfere with reading the dots.

**Acceptance Scenarios**:

1. **Given** the compass is rendered, **When** the user looks at the
   background, **Then** faint gridlines divide the chart into four
   quadrants, each labeled with its ideological character (e.g.
   "Authoritarian-Left", "Libertarian-Right").
2. **Given** the reference overlay is present, **When** a country's
   axis values change (different save loaded), **Then** the quadrant
   gridlines/labels stay fixed — they are a static reference, not
   derived from the loaded data.

---

## Edge Cases

- **Locked-axis sentinel must never leak into the math.** The raw save
  marks a not-yet-applicable axis with a specific out-of-range sentinel
  value (confirmed as `-999` against real save data, far outside the
  normal reading range). If this sentinel were ever treated as a real
  reading, it would blow the affected country's position far off the
  chart. The system MUST recognize and exclude the sentinel for every
  affected axis, every time, before any position math runs.
- **A country with zero applicable axes** (extremely early game, or a
  newly formed country with no meaningful Societal Value history yet)
  has nothing to sum. It MUST NOT be plotted at a fabricated origin
  position indistinguishable from a real "centrist" country; it is
  either excluded from the chart or visually marked as having no data.
- **A country whose applicable axes genuinely cancel out** lands at or
  near the origin through real, intentional cancellation. This case
  must be visually indistinguishable from "genuinely centrist" and
  distinguishable from "no data" (previous edge case) — the two must
  not be conflated.
- **Overlapping dots**: two or more countries computing to the same or
  a visually indistinguishable position must remain individually
  identifiable on hover, even though their dots visually coincide.
- **Save-wide axis unlock**: because the in-game Age that gates several
  axes is a single save-wide value (not per-country), an early-game
  save will show the *same* set of axes excluded for every country at
  once. The chart must read correctly in that state — it should not
  look "broken" just because, say, Absolutism/Liberalism is unavailable
  for the entire world.
- **A country reading for the Latinization/Hellenization axis with no
  confirmed gating condition** (see FR-002 and its Assumption) must be
  excluded the same way any other not-yet-applicable axis is excluded,
  never guessed at or defaulted to a value, until its real gating
  condition is confirmed.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST compute one compass position per country
  per loaded save, derived only from that country's currently
  applicable Societal Value axes.
- **FR-002**: The system MUST treat each of the 14 named axes (see the
  feature's source axis list: Centralization/Decentralization,
  Traditionalist/Innovative, Spiritualist/Humanist, Aristocracy/
  Plutocracy, Serfdom/Free Subjects, Mercantilism/Free Trade,
  Belligerent/Conciliatory, Capital Economy/Traditional Economy,
  Individualism/Communalism, Outward/Inward, Absolutism/Liberalism,
  Sinicized/Unsinicized, Mysticism/Jurisprudence, and Latinization/
  Hellenization) as a candidate input to a country's position, and MUST
  exclude the three military-doctrine axes (Quality/Quantity,
  Offensive/Defensive, Land/Naval) from the position calculation
  entirely.
- **FR-003**: The system MUST assign each of the 13 included axes a
  fixed placement angle, grouped into the four ideological quadrant
  bands described in the source material (0°-90° market-libertarian;
  90°-180° libertarian-collective; 180°-270° state-collective/
  authoritarian-left; 270°-360° authoritarian-right), such that the
  angle-to-axis mapping is stored as configuration and can be adjusted
  without changing how positions are calculated.
- **FR-004**: The system MUST normalize every applicable axis reading
  to a common signed scale before combining it with any other axis's
  reading, so that no single axis's raw storage range gives it
  outsized or undersized influence relative to the others.
- **FR-005**: The system MUST exclude a country's not-yet-applicable
  axes from that country's position calculation entirely — a
  not-yet-applicable axis MUST NOT be treated as a neutral/centrist
  (zero) reading.
- **FR-006**: The system MUST normalize a country's summed position by
  the number of axes actually applicable to that country (an averaged
  vector), rather than using the raw, un-divided sum, so that a country
  with fewer unlocked axes is not automatically pulled toward the
  origin purely because it has fewer applicable axes than a
  further-progressed country.
- **FR-007**: The system MUST render one dot per plottable country on a
  single two-dimensional chart.
- **FR-008**: The system MUST auto-scale the chart's visible range to
  the actual spread of computed positions present in the loaded save,
  rather than a fixed domain — so an early-game save (where positions
  cluster near the origin) still renders as a readable spread rather
  than an unreadable clump.
- **FR-009**: The system MUST show, on hovering a dot, the country's
  identity and enough of a per-axis breakdown for a user to understand
  why that country landed at that position.
- **FR-010**: The system MUST NOT permanently label every country's dot
  at once when the save contains 50 or more countries; permanent
  labels, if shown, MUST be limited to what fits without overlap.
- **FR-011**: The system MUST let the user choose the metric driving dot
  size, with population and total development as the available
  options.
- **FR-012**: The system MUST visually distinguish countries currently
  holding great-power status from those that are not, in the default
  color mode.
- **FR-013**: The system MUST offer an alternate color mode that maps
  dot color to a single chosen axis's value (including, at minimum,
  the three excluded military-doctrine axes), independent of the
  position calculation.
- **FR-014**: The system MUST render a static, decorative quadrant
  reference layer (gridlines and quadrant labels) that does not
  participate in or influence the position calculation.
- **FR-015**: The system MUST distinguish, in the rendered chart, a
  country with zero applicable axes (no data) from a country whose
  applicable axes genuinely computed to a near-origin position
  (genuinely centrist).
- **FR-016**: The system MUST include the Latinization/Hellenization
  axis as a 14th conditional axis in the vector-sum projection, gated
  and band-placed the same way the other cultural/religious-sphere
  conditional axes are (Sinicized/Unsinicized, Mysticism/
  Jurisprudence): given a fixed placement angle, and omitted from a
  country's calculation wherever the axis reads as not applicable to
  that country.

### Key Entities

- **Country Compass Position**: The single (x, y) point plotted for one
  country as of the save's current date, derived from that country's
  applicable axis readings. Recomputed whenever a save is (re)loaded.
- **Societal Value Axis**: One ideological spectrum (e.g.
  "Centralization vs. Decentralization"), with two named poles, a fixed
  placement angle used in the vector-sum projection, and — for some
  axes — an unlock condition that determines when it becomes applicable
  to a given save or country.
- **Country Axis Reading**: One country's own measured value for one
  axis: either a signed reading toward one of the axis's two poles, or
  an explicit "not yet applicable" state when the axis hasn't unlocked.
- **Quadrant Reference Overlay**: The decorative background labeling of
  the four ideological quadrant bands; independent of, and never
  derived from, the loaded save's actual data.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Every country in a loaded save with at least one
  applicable axis appears as exactly one dot — none silently dropped,
  none duplicated.
- **SC-002**: A country's computed position is provably unaffected by
  the presence or absence of any axis not yet applicable to it (verified
  by comparing positions with and without the locked axis's raw
  placeholder present in the source data).
- **SC-003**: A user can, from a single hover interaction on any dot,
  identify the country and reconstruct — from the shown per-axis detail
  — why it landed at that position, without consulting any other view.
- **SC-004**: On a save with 50 or more countries, no permanent on-chart
  label visually overlaps another to the point of being unreadable.
- **SC-005**: A small set of ideologically well-known archetype
  countries (e.g. a strongly centralized/aristocratic country versus a
  strongly decentralized/plutocratic one) lands in the quadrant that
  matches its known real-world or in-game ideological character,
  validating the angle assignment.
- **SC-006**: Changing the size metric or color mode updates every dot
  on the existing chart without requiring the user to reload the save
  or navigate away.
- **SC-007**: Two saves at different points in the same playthrough, one
  with fewer unlocked axes than the other, do not show the earlier save
  systematically clustered nearer the origin purely because it has
  fewer unlocked axes than the later one.

## Assumptions

- **Raw value shape (confirmed against a real save)**: each axis is
  already stored as a single signed number per country (not separate
  magnitude+direction fields), on an observed range of roughly -100 to
  +100, rather than the -1.0 to +1.0 range referenced in the feature's
  source material. The system normalizes this raw range to a common
  internal scale before any position math, so the exact stored range is
  an internal detail, not a user-facing one.
- **Locked-axis representation (confirmed against a real save)**: an
  axis not yet applicable to a country reads as a specific out-of-range
  sentinel value in the raw data (observed as `-999`), not a missing
  key or a genuine zero. The system treats this sentinel as "not
  applicable," never as a centrist reading.
- **Age gating is save-wide, not per-country (confirmed against the
  save schema)**: the in-game Age that unlocks several axes is a single
  value for the whole save. Two different countries in the same save
  never differ on whether an Age-gated axis is unlocked; they can still
  differ on axes gated by a country-level condition (e.g. cultural or
  religious sphere).
- **No existing radar-chart feature to route the excluded axes to**:
  the source material assumed the three military-doctrine axes route to
  "the existing radar chart feature," but no such feature currently
  exists in this codebase. This spec treats those three axes as simply
  out of scope for display anywhere except the optional "color by axis"
  mode in User Story 2 — building a dedicated radar chart is left as
  separate future work, not part of this feature.
- **Single snapshot, no date-scrubbing**: the compass reflects the
  currently loaded save's current date only. Raw societal-value axes
  are current-state readings with no historical trail recorded in the
  save, so there is no underlying data to scrub across dates; this is
  deferred rather than a deliberate cut of existing capability.
- **Hover-only interactivity for this feature**: the source material's
  goal of being "interactive enough to explain itself on hover" is met
  by a hover tooltip; click-to-pin and country search/filter are not
  requested by the source material and are treated as future
  enhancements, not required here.
- **Averaged (mean) vector, not raw sum**: per FR-006, a country's
  position divides the summed vector by its count of applicable axes.
  This is the documented choice for the normalization decision the
  source material flagged as needing to be made explicit, chosen so
  that save progression (more axes unlocked over time) does not by
  itself change how "extreme" a country's position reads.
- **Default size metric**: total development is the default dot-size
  metric, with population available as an alternate — the source
  material left the choice open ("analyst's choice, make
  configurable"); development is chosen as the default because it
  reflects state capacity more directly than raw population for an
  ideology-focused chart.
- **Latinization/Hellenization is a 14th conditional axis, gating
  unconfirmed**: the raw save data carries this axis (alongside the 16
  axes the source material accounted for) with no documented unlock
  condition anywhere in the game files or codebase. It is included in
  the vector-sum projection as a conditional axis analogous to
  Sinicized/Unsinicized and Mysticism/Jurisprudence — omitted per
  country wherever it reads as not applicable — with its actual gating
  condition (plausibly a Catholic/Orthodox or Latin/Greek cultural
  sphere) and exact band placement to be confirmed during planning
  rather than guessed here.
- **Provisional band placement for the two weakest-fit axes**:
  Belligerent/Conciliatory and Outward/Inward are placed in the
  bottom-left band as specified, on the source material's own caveat
  that this is provisional. This feature ships with that placement;
  revisiting it against archetype test cases (SC-005) is expected
  follow-up work, not a blocker to shipping.
