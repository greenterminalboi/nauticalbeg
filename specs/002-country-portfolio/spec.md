# Feature Specification: Country Portfolio

**Feature Branch**: `002-country-portfolio`

**Created**: 2026-09-18

**Status**: Draft

**Input**: User description: "tabulating the managers in some way or form, for a country, enhanced ui handling. Like a country portfolio page that shows the major information of the country, an expansion of what we have right now, but it also includes side navigation bar, which controls which tabulated data for the country you want to see, like for example provinces, another example is characters, an economy tab, a building registry for the country, a military tab, a trade tab, a diplomacy tab. selecting a country from the dropdown changes what the underlying data will be."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse a nation's data by category (Priority: P1) 🎯 MVP

A player has loaded a save and is viewing a nation's overview (001's
existing feature). They want to go beyond the single summary card and dig
into one specific area of that nation's state — starting with its
territory — via a persistent side navigation, without losing their place
or re-selecting the nation.

**Why this priority**: This is the structural foundation every other tab
depends on (the side navigation itself, and the pattern of "select a
category, see that nation's data for it"). Provinces is included in this
story specifically because the underlying data is already fully parsed by
001 (the `provinces`/`locations` tables) — it requires no new
save-format research, making it the lowest-risk, fastest path to a real,
usable second tab and a fully working navigation shell.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation, opening the side navigation, and switching between an "Overview"
item (today's existing card) and a "Provinces" item, confirming the
displayed data changes accordingly and the nation selection is preserved
throughout.

**Acceptance Scenarios**:

1. **Given** a nation's overview is displayed, **When** the user opens the
   side navigation and selects "Provinces," **Then** the page shows a list
   of every province/territory the selected nation controls, including at
   least each one's name and development, without navigating away from the
   loaded save.
2. **Given** the Provinces tab is active, **When** the user picks a
   different nation from the existing nation selector, **Then** the
   Provinces tab stays active and its contents update to the newly
   selected nation's provinces (the active tab is not reset to Overview).
3. **Given** any tab is active, **When** the user selects a different
   navigation item, **Then** the page shows that category's data for the
   currently selected nation without a full page reload or re-upload of
   the save.
4. **Given** the selected nation controls zero provinces (e.g., a
   released, landless vassal), **When** the user opens the Provinces tab,
   **Then** the tab shows a clear "nothing to show" message rather than a
   blank or broken area.

---

### User Story 2 - Military tab (Priority: P2)

A player wants to see the selected nation's standing military strength —
how many units it has and what kind — without leaving the portfolio view.

**Why this priority**: Military strength is one of the most commonly
checked stats in a grand-strategy save, but the underlying save sections
(`unit_manager`, `subunit_manager`, `mercenary_manager`) are currently
unresearched raw data (see research-save-format.md) — real work is needed
before this can be built, so it follows the zero-research-cost Provinces
tab.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation with at least one military unit, opening the Military tab, and
confirming unit counts/types shown match what's in the source save file.

**Acceptance Scenarios**:

1. **Given** a nation with military units, **When** the user opens the
   Military tab, **Then** the tab shows that nation's units grouped in a
   way that lets the user see total strength at a glance (e.g., counts by
   unit type).
2. **Given** a nation with no military units, **When** the user opens the
   Military tab, **Then** the tab shows a clear "nothing to show" message.

---

### User Story 3 - Government tab (Priority: P3)

A player wants to see how the selected nation is internally organized:
its estates and their standing, its government type/reforms, active
policies, and its national values — the "internal politics" side of the
nation, distinct from its military or foreign relations.

**Why this priority**: Ranked alongside Military as a core strategic-layer
concern (many grand-strategy players check government/estate standing as
often as army strength), and partially builds on data already parsed by
001 (`nations.government_type`) rather than starting from zero — but full
estate standing, policies, and national values are unresearched sections
(`estate_manager`, and policies/national values, which don't yet have a
confirmed top-level key at all — see Assumptions), so it follows Military
rather than leading.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation, opening the Government tab, and confirming the government type,
estate standing, active policies, and national values shown match the
source save.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** the user opens the Government
   tab, **Then** the tab shows that nation's government type and its
   estates with each estate's standing/influence.
2. **Given** a nation with active policies and/or national values set,
   **When** the user opens the Government tab, **Then** those policies
   and national values are listed.
3. **Given** a nation with no distinguishable policies or national values
   (e.g., the save format has nothing set, or research finds this
   government type doesn't use them), **When** the user opens the
   Government tab, **Then** that section shows a clear "nothing to show"
   message rather than a blank area, consistent with FR-012.

---

### User Story 4 - Economy tab (Priority: P4)

A player wants a deeper economic breakdown of the selected nation than the
single treasury figure already on the Overview tab — where income comes
from, what it's being spent on, and any outstanding loans.

**Why this priority**: Valuable but depends on researching several
unexplored manager sections (`loan_manager`, `bureaucracy_manager`,
`market_manager`); ranked after the tabs whose data sources are either
already parsed or more self-contained.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation, opening the Economy tab, and confirming the income/expense/loan
figures shown match the source save.

**Acceptance Scenarios**:

1. **Given** a nation with at least one outstanding loan, **When** the
   user opens the Economy tab, **Then** the tab shows that loan alongside
   a breakdown of income and expenses.
2. **Given** a nation with no outstanding loans, **When** the user opens
   the Economy tab, **Then** the tab shows the income/expense breakdown
   without a loans section implying debt that doesn't exist.

---

### User Story 5 - Diplomacy tab (Priority: P5)

A player wants to see the selected nation's current relations with other
nations — active wars, alliances, and membership in any international
organizations — in one place.

**Why this priority**: Builds on the `war_manager`/`war_participants` data
001 already parses (for the "at war" stat), extended with the
unresearched `diplomacy_manager`/`international_organization_manager`
sections for alliances and broader standing.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation known to be at war (per its Overview war-status stat), opening the
Diplomacy tab, and confirming that war and any alliances shown match the
source save.

**Acceptance Scenarios**:

1. **Given** a nation currently at war, **When** the user opens the
   Diplomacy tab, **Then** the tab lists that war and the nation's side in
   it.
2. **Given** a nation with one or more allies, **When** the user opens the
   Diplomacy tab, **Then** the tab lists those allied nations.

---

### User Story 6 - Trade tab (Priority: P6)

A player wants to see what trade goods the selected nation produces and
its participation in trade routes.

**Why this priority**: Narrower value than the tabs above, and depends on
researching `trade_manager`/`trade_path_manager`, sections not yet
inspected in a real save.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation, opening the Trade tab, and confirming the goods/routes shown
match the source save.

**Acceptance Scenarios**:

1. **Given** a nation participating in trade, **When** the user opens the
   Trade tab, **Then** the tab shows the goods it produces and/or the
   trade routes it participates in.

---

### User Story 7 - Building registry tab (Priority: P7)

A player wants a list of buildings constructed across the selected
nation's territory, rather than having to check province-by-province.

**Why this priority**: A convenience roll-up rather than new information
(building data would otherwise be inspected per-province); depends on
researching `building_manager`/`construction_manager`.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation with at least one constructed building, opening the Building
registry tab, and confirming the buildings listed (and which province
each is in) match the source save.

**Acceptance Scenarios**:

1. **Given** a nation with constructed buildings, **When** the user opens
   the Building registry tab, **Then** the tab lists each building and
   which of the nation's provinces it's in.

---

### User Story 8 - Characters tab (Priority: P8)

A player wants to see the selected nation's ruler and other notable
characters (heirs, generals, admirals) tied to it.

**Why this priority**: Lowest priority — depends on researching the most
unfamiliar group of sections (`character_db`, `dynasty_manager`,
`cabinet_manager`, `rulerterm_manager`), and character data is typically
more detail-rich (and thus more implementation-costly) than the other
tabs' tabular data.

**Independent Test**: Can be fully tested by loading a save, selecting a
nation, opening the Characters tab, and confirming the ruler and any
other listed characters match the source save.

**Acceptance Scenarios**:

1. **Given** a nation with a identifiable ruler, **When** the user opens
   the Characters tab, **Then** the tab shows that ruler's name.
2. **Given** a nation with other notable characters (e.g., a general),
   **When** the user opens the Characters tab, **Then** those characters
   are listed alongside the ruler.

---

### Edge Cases

- What happens when the selected nation is switched while a tab's data is
  still loading? The in-progress query is superseded; only the newly
  selected nation's data for the active tab is ever displayed (never a mix
  of old and new nation data, and never both arriving out of order).
- What happens when a save's format version doesn't have parseable data
  for a given tab's category at all (e.g., an unresearched or
  structurally different section in a future game version)? That tab
  shows a clear "not available for this save" state rather than a blank
  screen, an error, or fabricated data.
- What happens for a nation that controls an unusually large number of
  provinces, units, or buildings? The tab remains responsive and usable
  (see SC-003) rather than freezing the page or silently truncating data
  without indicating that it did so.
- What happens if the user reloads the page or resumes a kept save while
  a non-Overview tab was active? The portfolio reopens to the Overview
  tab by default (session-only UI state, not persisted) — see Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a persistent side navigation, visible
  whenever a nation is selected, listing every available data category for
  that nation (at minimum: Overview, Provinces, Military, Government,
  Economy, Diplomacy, Trade, Building Registry, Characters).
- **FR-002**: Selecting a side navigation item MUST display that
  category's data for the currently selected nation without requiring the
  save to be reloaded or the nation to be re-selected.
- **FR-003**: Changing the selected nation via the existing nation
  selector MUST update the currently active tab's contents to the newly
  selected nation's data, and MUST NOT reset which tab is active.
- **FR-004**: The Provinces tab MUST list every province/territory the
  selected nation controls, showing at minimum each one's name/identifier
  and development.
- **FR-005**: The Military tab MUST show the selected nation's standing
  military units, summarized in a way that conveys total strength (e.g.,
  counts by unit type).
- **FR-006**: The Government tab MUST show the selected nation's
  government type, its estates and each estate's standing/influence, its
  active policies, and its national values.
- **FR-007**: The Economy tab MUST show the selected nation's income and
  expense breakdown and any outstanding loans, beyond the single treasury
  figure already shown on Overview.
- **FR-008**: The Diplomacy tab MUST show the selected nation's current
  wars and its alliances/relations with other nations.
- **FR-009**: The Trade tab MUST show the selected nation's trade good
  production and/or trade route participation.
- **FR-010**: The Building Registry tab MUST list buildings constructed
  within the selected nation's territory, including which province each
  building is in.
- **FR-011**: The Characters tab MUST show the selected nation's ruler and
  any other notable characters (e.g., heirs, generals, admirals)
  associated with it.
- **FR-012**: System MUST NOT allow any tab to edit or otherwise mutate
  the loaded save's data — every tab is read-only, consistent with the
  existing non-destructive save handling principle.
- **FR-013**: If a tab's underlying data is empty for the selected nation
  (e.g., no military units, no loans, no set policies), that tab MUST
  show a clear "nothing to show" message rather than a blank area.
- **FR-014**: If a tab's underlying save section is entirely unavailable
  or unparseable for the loaded save (as opposed to merely empty for this
  nation), that tab MUST show a clear "not available for this save"
  message distinct from the "nothing to show" case in FR-013.
- **FR-015**: The side navigation and its items MUST be operable via
  keyboard, consistent with the existing accessibility principle applied
  to the nation selector and overview controls.

### Key Entities

- **Military Unit**: A single deployed force belonging to a nation.
  Relevant attributes: type/category, and whatever strength/count measure
  the save actually tracks (to be confirmed against a real save).
- **Estate**: A privileged group within a nation (e.g., nobles, clergy —
  the `nations`/`government` data 001 already parses shows estate-related
  fields exist, e.g. `estates` land-share percentages seen in
  research-save-format.md's DUMMY entry). Relevant attributes: which
  estate, and its standing/influence with the nation.
- **Policy**: An active governance choice a nation has adopted. Relevant
  attributes: which policy, and whatever effect/description the save
  records for it (to be confirmed against a real save — no top-level
  save key for this has been confirmed yet, unlike the other entities
  here; see Assumptions).
- **National Value**: A nation-level trait or identity marker distinct
  from a policy (to be confirmed against a real save — same unconfirmed
  status as Policy above).
- **Loan**: An outstanding debt owed by a nation. Relevant attributes:
  amount, and lender if the save records one.
- **Diplomatic Relation**: A standing connection between two nations —
  either an active war side or an alliance/similar tie.
- **Trade Good / Trade Route**: A commodity a nation produces, or a trade
  path it participates in.
- **Building**: A constructed improvement within a specific province,
  owned by whichever nation owns that province.
- **Character**: A named individual associated with a nation — its ruler
  at minimum, and other roles (heir, general, admiral) where the save
  distinguishes them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch between any two tabs for the currently
  selected nation in under 1 second, with no full-page reload.
- **SC-002**: A user can change the selected nation and see the currently
  active tab's contents update to match, without re-uploading or
  reloading the save.
- **SC-003**: For a nation controlling 100+ provinces (a realistic size
  for a major power in a long game), the Provinces tab remains usable —
  it renders and remains scrollable/responsive rather than freezing the
  page.
- **SC-004**: A user can identify a selected nation's ruler, total
  military unit count, government type, and current wars without
  consulting any source outside the tool.

## Assumptions

- **Scope is intentionally staged across the eight user stories above.**
  Shipping User Story 1 alone (side navigation + Provinces) already
  delivers real value and is a complete, usable increment; later stories
  (Military through Characters) may be implemented in any subsequent
  order or deferred, without blocking release of the earlier ones —
  mirroring how 001's four user stories were each independently valuable.
- Every tab beyond Provinces and Diplomacy's war status depends on
  save-format sections this project has only ever seen as unresearched raw
  top-level keys (e.g., `unit_manager`, `building_manager`,
  `character_db`, `estate_manager` — see `research-save-format.md`). Per
  constitution Principle II, the actual field structure for each one must
  be confirmed against a real save and captured in a fixture before that
  tab's parser logic is built — this is expected, planned research work
  for each user story beyond US1, not a blocker to writing this spec.
- **Policies and national values (User Story 3) are a step further out
  than the other tabs**: every other tab's save section at least has a
  confirmed top-level key name from prior research (e.g., `estate_manager`
  for estates); "policies" and "national values" do not yet — they may
  live inside `government`'s existing (partially parsed) structure,
  inside `estate_manager`, or under an entirely different key not yet
  seen. `/speckit-plan`'s research phase MUST confirm where this data
  actually lives (or that it doesn't exist in the researched save version
  at all) before User Story 3's tasks are written.
- All tabs are read-only displays of already-parsed save data, consistent
  with constitution Principle I — this feature does not let a user modify
  a nation's military, economy, buildings, or any other state.
- The Overview tab is today's existing overview card, kept as-is; this
  feature does not require changing what it shows, only adding sibling
  tabs alongside it.
- "Nothing to show" (a category genuinely has zero items for this nation)
  and "not available for this save" (the category's save section couldn't
  be parsed at all) are distinct, per FR-012/FR-013, so a user is never
  left wondering whether an empty tab means the nation truly has none of
  something or the tool simply couldn't read it.
- Which specific fields/columns each tab displays beyond the minimums
  stated in the Functional Requirements (e.g., exactly which unit-type
  categories, exactly which loan fields) is left to be finalized once the
  corresponding save section has actually been researched, the same way
  001 finalized several field choices only after inspecting a real save.
- Active-tab selection is UI-only session state, not persisted with a
  kept save (Edge Cases) — reopening a save always starts on Overview.
- This feature builds directly on 001's nation selector and read-only
  query-connection pattern (`storage/queries.ts`'s `list*`/`get*ByIdx`
  shape) rather than introducing a new data-access approach.
