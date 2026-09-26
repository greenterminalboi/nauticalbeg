# Feature Specification: Country Factbook Tabs

**Feature Branch**: `018-country-factbook-tabs`
**Created**: 2026-09-26
**Status**: Draft
**Input**: Rebuild Factbook → Countries so each side tab shows real information about the nation picked in the Countries nation selector. Built and verified one tab at a time with the owner, starting with Overview.

## User Scenarios & Testing *(mandatory)*

The Countries sub-tab of Factbook already has a nation selector and a side nav. Today only Overview (six basic stats) and Provinces (name and development) show anything. This feature turns the side nav into a full country dossier.

The side nav after this feature, in order: Overview, History, Provinces, Locations, Military, Government, Estates, Values, Subjects, then Economy, Building Registry and Characters, which show a Coming Soon page. Trade is removed. Diplomacy is replaced by Subjects.

Each story below is one tab. They are built in nav order, and each one is checked against a real save before the next starts.

### User Story 1 - Overview country card (Priority: P1)

A player picks a nation and immediately sees its headline numbers on one card: government type, treasury, economic base, stability, legitimacy, prestige, works of art, literacy rate, number of locations, total debt and monthly income. Below the card, four pie charts show who lives in the country: by religion, by culture, by estate and by social class.

**Why this priority**: Overview is the landing tab for every nation. It is what a player sees first and what the Subjects tab sends them to.

**Independent Test**: Load a real save, pick Russia, open Overview. Every stat shows a value that matches the game for that date, and all four pies add up to the country's population.

**Acceptance Scenarios**:

1. **Given** a loaded save and a selected nation, **When** the player opens Overview, **Then** the card shows government type, treasury, economic base, stability, legitimacy, prestige, works of art, literacy rate, number of locations, total debt and monthly income.
2. **Given** a nation whose government type calls its government power something other than legitimacy (a republic, a theocracy), **When** Overview opens, **Then** that stat carries the name the game uses for that government type.
3. **Given** a selected nation, **When** Overview opens, **Then** four pie charts show the population split by religion, by culture, by estate and by social class, each slice sized by population.
4. **Given** a nation with no loans, **When** Overview opens, **Then** total debt shows 0, not a blank.
5. **Given** the player switches to a different nation, **When** Overview is open, **Then** every stat and pie updates to the new nation with no values left over from the previous one.

---

### User Story 2 - History (Priority: P2)

A new History tab shows, on one page, the historical charts the Leaderboard already uses: population, economic base, tax base and ruler history. It opens with only the selected nation plotted. The player can add other nations to compare, the same way the Leaderboard allows.

**Why this priority**: The data and charts exist already. This puts a country's whole story in one place.

**Independent Test**: Pick a nation, open History. Four charts appear, each plotting only that nation. Add a second nation and it appears on all four.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** History opens, **Then** population, economic base, tax base and ruler history charts appear on one page, each showing only the selected nation.
2. **Given** History is open, **When** the player adds another nation for comparison, **Then** it appears alongside the selected nation.
3. **Given** the player picks a different nation in the nation selector, **When** History is open, **Then** the charts reset to show only the newly selected nation.

---

### User Story 3 - Provinces table (Priority: P2)

The existing Provinces table gains a column for every piece of province-level information the map modes already show, so a player can sort and compare the nation's provinces without switching to the map.

**Why this priority**: It extends a working tab with data already loaded.

**Independent Test**: Pick a nation, open Provinces. Each map-mode value the map shows for a province appears as a sortable column, and spot-checked values match the map.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** Provinces opens, **Then** each of the nation's provinces is a row with every province-level map-mode value as a column.
2. **Given** the table, **When** the player sorts by any column, **Then** rows reorder by that column.

---

### User Story 4 - Locations table (Priority: P2)

A new Locations tab lists every location the nation owns, one row each, with the location-level information the map modes show (for example rank, terrain, culture, religion, market, development, tax base, soldiers).

**Why this priority**: Locations are the game's real unit of land. Provinces group them, but most map data lives at the location level.

**Independent Test**: Pick a nation, open Locations. The row count equals the nation's location count on Overview, and spot-checked values match the map.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** Locations opens, **Then** every location the nation owns appears once, with the location-level map-mode values as columns.
2. **Given** the table, **When** the player sorts by any column, **Then** rows reorder by that column.

---

### User Story 5 - Military (Priority: P2)

The Military tab shows the nation's army composition (the view the Firepower tab already has), a matching naval composition for its ships, and the military doctrine chart for this nation only.

**Why this priority**: The pieces exist in Firepower. Here they are scoped to one nation and completed with the navy.

**Independent Test**: Pick a nation with both an army and a navy. Army composition matches Firepower's for that nation, naval composition lists its ships by type, and the doctrine chart shows only this nation.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** Military opens, **Then** the army composition view shows the nation's regiments and their stat breakdown.
2. **Given** a nation with ships, **When** Military opens, **Then** a naval composition view shows its ships grouped by type.
3. **Given** a selected nation, **When** Military opens, **Then** the military doctrine chart plots only that nation.
4. **Given** a nation with no navy, **When** Military opens, **Then** the naval section says the nation has no ships.

---

### User Story 6 - Government (Priority: P3)

The Government tab has two parts: Policies, listing the laws the nation has in force, and Estate Privileges, listing the privileges it has granted.

**Why this priority**: Useful reference, lower traffic than the stats tabs.

**Independent Test**: Pick a nation, open Government. The policies and privileges listed match what the game shows for that nation.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** Government opens, **Then** a Policies section lists every law in force, with its readable name.
2. **Given** a selected nation, **When** Government opens, **Then** an Estate Privileges section lists every granted privilege, with its readable name and the estate it belongs to.
3. **Given** a policy or privilege row, **When** Government opens, **Then** its Modifiers column lists its effects as the game words them (e.g. "+5% Peasants Levy Size").

A Cabinet sub-tab (time spent per cabinet action) was requested and dropped on 2026-09-26: the save only records each country's current cabinet actions, not their history.

---

### User Story 7 - Estates (Priority: P3)

A new Estates tab gives an overview of the nation's estates. For each estate the nation has, it shows satisfaction, the estate's tax rate, its share of the population, its gold and monthly balance, its wealth impact and last month's income and expenses.

**Why this priority**: New view, and it builds on the estate pie from Overview.

**Independent Test**: Pick a nation, open Estates. One entry per estate the nation has, with values that match the game.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** Estates opens, **Then** each estate the nation has appears once, with satisfaction, tax rate, population share, gold, monthly balance and wealth impact.
2. **Given** an estate, **When** the player looks at it, **Then** last month's income and expenses for that estate are visible.
3. **Given** an estate that has no economic record (such as the crown estate), **When** Estates opens, **Then** the missing values are labeled as not tracked, not shown as zero.

---

### User Story 8 - Values (Priority: P3)

A new Values tab shows the societal values view for the selected nation only.

**Why this priority**: The view exists already in Factbook's Societal Compass; this scopes it to one nation.

**Independent Test**: Pick a nation, open Values. Only that nation's values appear, and they match the Societal Compass for the same nation.

**Acceptance Scenarios**:

1. **Given** a selected nation, **When** Values opens, **Then** only that nation's societal values are shown.
2. **Given** a value axis that does not apply to the nation, **When** Values opens, **Then** that axis is shown as not applicable, not as a neutral reading.

---

### User Story 9 - Subjects (Priority: P2)

The Subjects tab replaces Diplomacy. It shows a tree rooted at the selected nation: its direct subjects, their subjects, and so on down. Each node shows the subject's name and subject type (vassal, tributary, colonial nation, fiefdom and so on). Clicking a subject selects that nation and opens its Overview.

**Why this priority**: New data that was never shown before, and it links nations together so a player can walk an empire.

**Independent Test**: Pick a nation known to have subjects (for example Portugal and its colonial nations). The tree shows each subject once with its type. Clicking one switches the Countries view to that subject's Overview.

**Acceptance Scenarios**:

1. **Given** a nation with subjects, **When** Subjects opens, **Then** a tree shows the nation at the root and each direct subject beneath it with its subject type.
2. **Given** a subject that has its own subjects, **When** the tree shows, **Then** those appear nested under it.
3. **Given** the tree, **When** the player clicks a subject, **Then** the nation selector changes to that subject and the Overview tab opens.
4. **Given** a nation with no subjects, **When** Subjects opens, **Then** it says the nation has no subjects.

---

### Edge Cases

- A nation that exists in the save but owns no land and has no pops: stats that depend on land or pops show as not available, pies show an empty state, and nothing crashes.
- A nation whose government type is unknown to the app: the government power stat still shows, with a generic label.
- Many tiny cultures or religions: pie slices below a small share are grouped into one "Other" slice so the chart stays readable.
- A subject relation that loops back to an ancestor (bad data): the tree stops at the repeat and never recurses forever.
- A subject that is no longer a live nation: it is shown but is not clickable.
- A kept save stored before this feature: data it lacks (loans, estate records, subject relations) is labeled as not available until the save is re-imported, never shown as zero.
- A shared game state opened from a link: every tab works the same as with a local save.
- Switching nations quickly while a tab is loading: only the last selected nation's data is ever shown.

## Requirements *(mandatory)*

### Functional Requirements

**Navigation**

- **FR-001**: The Countries side nav MUST list, in order: Overview, History, Provinces, Locations, Military, Government, Estates, Values, Subjects, Economy, Building Registry, Characters.
- **FR-002**: The Countries side nav MUST NOT show Trade or Diplomacy.
- **FR-003**: Economy, Building Registry and Characters MUST show the app's Coming Soon page.
- **FR-004**: Every tab MUST show data for the nation picked in the Countries nation selector and update when that selection changes.

**Overview**

- **FR-005**: Overview MUST show government type, treasury, economic base, stability, government power, prestige, works of art, literacy rate, number of locations, total debt and monthly income for the selected nation.
- **FR-006**: The government power stat MUST be labeled with the name the game uses for the nation's government type (for example Legitimacy for a monarchy).
- **FR-007**: Economic base MUST be the nation's most recent recorded economic base value.
- **FR-008**: Literacy rate MUST be the average literacy of the nation's population, weighted by population size.
- **FR-009**: Total debt MUST be the sum of every outstanding loan the nation has borrowed.
- **FR-010**: Works of art MUST count the works the nation owns that are not destroyed.
- **FR-011**: Overview MUST show four pie charts of the nation's population, by religion, by culture, by estate and by social class, each slice sized by population.
- **FR-012**: Stats that are computed from several save values, not read from one, MUST be marked as computed, in text and not by color alone.

**History**

- **FR-013**: History MUST show population, economic base, tax base and ruler history charts on one page.
- **FR-014**: History MUST open with only the selected nation shown and MUST let the player add other nations to compare.

**Provinces and Locations**

- **FR-015**: Provinces MUST add a column for each province-level value the map modes show.
- **FR-016**: Locations MUST list every location the selected nation owns, one row each, with a column for each location-level value the map modes show.
- **FR-017**: Every column in Provinces and Locations MUST be sortable.

**Military**

- **FR-018**: Military MUST show the selected nation's army composition with the same content as the Firepower army composition view.
- **FR-019**: Military MUST show the selected nation's naval composition, grouping its ships by type.
- **FR-020**: Military MUST show the military doctrine chart for the selected nation only.

**Government, Estates, Values**

- **FR-021**: Government MUST show the selected nation's laws in force (Policies) and granted estate privileges (Estate Privileges) as two sub-tabs, by readable name. *(Sub-tabs added 2026-09-26 at the owner's request.)*
- **FR-022**: Estates MUST show, for each estate the nation has: satisfaction, tax rate, population share, gold, monthly balance, wealth impact, and last month's income and expenses.
- **FR-030**: Each policy and estate privilege row MUST list its in-game effects (modifiers) in a Modifiers column between the name and the date, colored green when an effect helps the country and red when it hurts, as the game does. *(Added 2026-09-26 at the owner's request; the earlier hover tooltip and Effects panel are kept but turned off.)*
- **FR-023**: Values MUST show the societal values of the selected nation only.

**Subjects**

- **FR-024**: Subjects MUST show a tree rooted at the selected nation, with each subject nested under its overlord, down every level.
- **FR-025**: Each subject node MUST show the subject's name and subject type.
- **FR-026**: Clicking a live subject MUST select that nation in the nation selector and open its Overview tab.

**Robustness**

- **FR-027**: Any value the save does not have for a nation MUST be labeled as not available, never shown as zero.
- **FR-028**: Every table, chart and tree in this feature MUST be keyboard-operable and must not rely on color alone to carry meaning.
- **FR-029**: Hover details MUST use the app's styled hover tooltip, not the browser's native tooltip.

### Key Entities

- **Nation**: a country in the save. Already stored. Gains government power, prestige, monthly income and the other headline numbers on the Overview card.
- **Pop**: a group of people living in a location, with a size, culture, religion, estate, social class and literacy. Already stored.
- **Loan**: money a nation has borrowed, with an amount and a borrower. New.
- **Estate record**: one estate of one nation, with satisfaction, gold, balance, wealth impact and last month's income and expenses. New.
- **Subject relation**: a link from an overlord nation to a subject nation, with a subject type. New.
- **Law, privilege, work of art, regiment or ship, societal value, historical series, ruler term**: already stored by earlier features and reused here.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For the reference Russia save, every Overview stat for Russia matches the value the game shows on the same date, or differs only by rounding.
- **SC-002**: Each of the four Overview pies sums to within 1% of the nation's total population.
- **SC-003**: The Locations row count for a nation equals the number of locations shown on its Overview card.
- **SC-004**: The Subjects tree for the reference save contains every subject relation in the save exactly once when the trees of all overlords are taken together.
- **SC-005**: Switching nations updates the visible tab in under 1 second on the reference save.
- **SC-006**: Every tab renders for every live nation in the reference save without an error.

## Assumptions

- "Wealth" in the owner's request means monthly income. The save has no wealth field.
- The government power stat is the same save value for every government type. Only its label changes.
- Pie slices under 2% of the population are grouped into "Other".
- The History comparison works the way the Leaderboard's already does. Nations added for comparison are not remembered when the selected nation changes.
- The Subjects tree goes down from the selected nation. It does not show the selected nation's own overlord.
- Estates lists only the estates the nation actually has (estates the save marks as existing).
- Economy, Building Registry and Characters are out of scope beyond showing the Coming Soon page.
- Tabs are built in nav order, one at a time, and each is checked with the owner against a real save before the next begins. The owner may adjust a tab's contents when it is reached.
