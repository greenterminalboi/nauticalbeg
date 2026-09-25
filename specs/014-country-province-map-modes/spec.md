# Feature Specification: Country & Province Map Modes

**Feature Branch**: `014-country-province-map-modes`

**Created**: 2026-09-23

**Status**: Draft

**Input**: User description: "country level map modes and province level map modes... derive both of these from the location map" — narrowed through a feasibility research pass (confirmed against the real save, not the trimmed test fixture) into eight country-level layers (Treasury, Stability, Government Type, Country Population, Economical Base, Literacy Average, Number of Tech Advances, Number of Works of Art) and four province-level layers (Development, Tax Base, Soldiers, Population totals), plus grouping the map sidebar by grain. Subject/overlord relations were explicitly and permanently excluded after research found no queryable save field for them; Firepower-doctrine country stats (Discipline, Tactics, Fort Defense, etc.) and pairwise diplomatic-relations layers were deferred to a later feature as bigger, separate lifts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Map Modes Grouped by Grain (Priority: P1)

A user opens the Map tab after this feature ships and sees the sidebar's now much longer list of layers organized into three sections — Location, Province, Country — instead of one long flat list, so they can quickly find the grain of map mode they're looking for.

**Why this priority**: Every other story in this feature adds a new sidebar entry; without this grouping, the sidebar would grow from 12 to roughly 24 flat entries and become hard to scan. This is the structural prerequisite the rest of the feature is layered on top of.

**Independent Test**: With a save loaded, open the Map tab's sidebar and confirm the existing 12 layers now appear under a "Location" section, with two more sections ("Province" and "Country") present alongside it, each independently collapsible/expandable, and switching layers still works exactly as before.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user looks at the sidebar, **Then** every layer is grouped under one of three section headings — Location, Province, Country — matching its grain.
2. **Given** the sidebar is showing all three sections, **When** the user collapses one section, **Then** only that section's layers are hidden; the other two sections and the currently active layer are unaffected.
3. **Given** a layer in any section is currently active, **When** the user switches to a layer in a different section, **Then** the map updates exactly as it does today when switching between existing layers (no reload, pan/zoom preserved).

---

### User Story 2 - View the Country Treasury Map (Priority: P1)

A user wants to see which countries are wealthiest. They switch to the Country Treasury layer and see every location shaded by its owning country's treasury, so entire countries read as one shade and the richest nations stand out immediately.

**Why this priority**: Treasury is a fundamental "how is this country doing" reading, already stored as a plain column on every country — the cheapest and most broadly useful of the new layers to ship first.

**Independent Test**: With a save loaded, switch to the Country Treasury layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true treasury value, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Country Treasury layer, **Then** every location is shaded according to its owning country's treasury value, with a visible legend/scale.
2. **Given** the Country Treasury layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's treasury value.
3. **Given** the Country Treasury layer is displayed, **When** a location has no confirmed owner, **Then** it renders in the neutral "no data" style, distinct from an owned country with a low-but-confirmed treasury.

---

### User Story 3 - View the Country Stability Map (Priority: P1)

A user wants to see which countries are politically stable versus in turmoil. They switch to the Country Stability layer and see every location shaded by its owning country's stability.

**Why this priority**: Stability is a core political reading, already a plain per-country column — as cheap and broadly useful as Treasury.

**Independent Test**: With a save loaded, switch to the Country Stability layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true stability value, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Country Stability layer, **Then** every location is shaded according to its owning country's stability value, with a visible legend/scale.
2. **Given** the Country Stability layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's stability value.
3. **Given** the Country Stability layer is displayed, **When** a location has no confirmed owner, **Then** it renders in the neutral "no data" style.

---

### User Story 4 - View the Government Type Map (Priority: P1)

A user wants to see the political systems of the world at a glance. They switch to the Government Type layer and see every location colored by its owning country's government type, with a legend mapping colors to government types.

**Why this priority**: A categorical political reading directly recorded per country — as cheap as Treasury/Stability and a natural companion to them.

**Independent Test**: With a save loaded, switch to the Government Type layer and confirm every location owned by the same country shows the identical color corresponding to that country's true government type, with a legend mapping colors to types.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Government Type layer, **Then** every location is colored according to its owning country's government type, with a legend mapping each color to a type.
2. **Given** the Government Type layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's government type.
3. **Given** the Government Type layer is displayed, **When** a location has no confirmed owner or its owner has no recorded government type, **Then** it renders in the neutral "no data" style.
4. **Given** the Government Type layer is displayed, **When** the map contains many distinct government types, **Then** the legend remains scannable, matching how the existing RGO layer already handles a large number of distinct values.

---

### User Story 5 - View the Province Development Map (Priority: P1)

A user wants to see how developed each province is as a whole, rather than location-by-location. They switch to the Province Development layer and see every location shaded by the total development of the province it belongs to.

**Why this priority**: Development is the location-level layer this project already shipped first (spec 011) and users already understand — its province-grain counterpart is the most natural, lowest-risk province layer to ship first.

**Independent Test**: With a save loaded, switch to the Province Development layer and confirm every location within the same province shows the identical shade, corresponding to the true sum of that province's locations' development values, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Province Development layer, **Then** every location is shaded according to the total development of the province it belongs to, with a visible legend/scale.
2. **Given** the Province Development layer is displayed, **When** the user points at or selects a location, **Then** they see that location's province and that province's total development.
3. **Given** the Province Development layer is displayed, **When** every location in a province has no recorded development value, **Then** that province renders in the neutral "no data" style, distinct from a province with a low-but-confirmed total.

---

### User Story 6 - View the Province Tax Base Map (Priority: P1)

A user wants to see where fiscal potential is concentrated by province. They switch to the Province Tax Base layer and see every location shaded by the total tax base of the province it belongs to.

**Why this priority**: Mirrors Province Development in value and risk — the province-grain counterpart of the already-shipped location-level Tax Base layer.

**Independent Test**: With a save loaded, switch to the Province Tax Base layer and confirm every location within the same province shows the identical shade, corresponding to the true sum of that province's locations' tax base values, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Province Tax Base layer, **Then** every location is shaded according to the total tax base of the province it belongs to, with a visible legend/scale.
2. **Given** the Province Tax Base layer is displayed, **When** the user points at or selects a location, **Then** they see that location's province and that province's total tax base.
3. **Given** the Province Tax Base layer is displayed, **When** every location in a province has no recorded tax base value, **Then** that province renders in the neutral "no data" style.

---

### User Story 7 - View the Country Population Map (Priority: P2)

A user wants to compare countries by their total population. They switch to the Country Population layer and see every location shaded by its owning country's total recorded population.

**Why this priority**: A valuable demographic reading, but it requires pulling a country's latest historical figure rather than a plain column, so it's a step up in cost from Treasury/Stability/Government Type.

**Independent Test**: With a save loaded, switch to the Country Population layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true, most-recently-recorded population figure, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Country Population layer, **Then** every location is shaded according to its owning country's most-recently-recorded total population, with a visible legend/scale.
2. **Given** the Country Population layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's total population figure.
3. **Given** the Country Population layer is displayed, **When** a location's owner has no recorded population history, **Then** it renders in the neutral "no data" style.

---

### User Story 8 - View the Economical Base Map (Priority: P2)

A user wants to see each country's overall economic strength, a figure with no location-level equivalent anywhere else in the app. They switch to the Economical Base layer and see every location shaded by its owning country's economical base.

**Why this priority**: A distinct, previously-unsurfaced country-wide economic figure — valuable, but the same "latest historical figure" cost as Country Population.

**Independent Test**: With a save loaded, switch to the Economical Base layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true, most-recently-recorded economical base figure, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Economical Base layer, **Then** every location is shaded according to its owning country's most-recently-recorded economical base, with a visible legend/scale.
2. **Given** the Economical Base layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's economical base figure.
3. **Given** the Economical Base layer is displayed, **When** a location's owner has no recorded economical base history, **Then** it renders in the neutral "no data" style.

---

### User Story 9 - View the Country Literacy Map (Priority: P2)

A user wants to see how literate each country's population is. They switch to the Country Literacy layer and see every location shaded by its owning country's population-weighted average literacy.

**Why this priority**: A genuinely new social reading not surfaced anywhere else in the app, though it requires averaging across every individual population group in a country rather than reading a single stored figure.

**Independent Test**: With a save loaded, switch to the Country Literacy layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true population-weighted average literacy, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Country Literacy layer, **Then** every location is shaded according to its owning country's population-weighted average literacy, with a visible legend/scale.
2. **Given** the Country Literacy layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's average literacy value.
3. **Given** the Country Literacy layer is displayed, **When** a location's owner has no recorded population groups, **Then** it renders in the neutral "no data" style.

---

### User Story 10 - View the Province Soldiers Map (Priority: P2)

A user wants to see where land-army manpower is concentrated by province rather than by individual location. They switch to the Province Soldiers layer and see every location shaded by the total soldier population of the province it belongs to.

**Why this priority**: Mirrors the already-shipped location-level Soldiers layer at province grain; useful for land-focused analysis, secondary to the foundational province layers.

**Independent Test**: With a save loaded, switch to the Province Soldiers layer and confirm every location within the same province shows the identical shade, corresponding to the true sum of that province's locations' soldier populations, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Province Soldiers layer, **Then** every location is shaded according to the total soldier population of the province it belongs to, with a visible legend/scale.
2. **Given** the Province Soldiers layer is displayed, **When** the user points at or selects a location, **Then** they see that location's province and that province's total soldier population.
3. **Given** the Province Soldiers layer is displayed, **When** every location in a province has no recorded soldier population, **Then** that province renders in the neutral "no data" style.

---

### User Story 11 - View the Province Population Map (Priority: P2)

A user wants to compare provinces by total population rather than by individual location. They switch to the Province Population layer and see every location shaded by the total population of the province it belongs to.

**Why this priority**: Mirrors the already-shipped location-level Population layer at province grain; a natural demographic reading, secondary to the foundational province layers.

**Independent Test**: With a save loaded, switch to the Province Population layer and confirm every location within the same province shows the identical shade, corresponding to the true sum of that province's locations' populations, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Province Population layer, **Then** every location is shaded according to the total population of the province it belongs to, with a visible legend/scale.
2. **Given** the Province Population layer is displayed, **When** the user points at or selects a location, **Then** they see that location's province and that province's total population.
3. **Given** the Province Population layer is displayed, **When** every location in a province has no recorded population, **Then** that province renders in the neutral "no data" style.

---

### User Story 12 - View the Number of Tech Advances Map (Priority: P3)

A user wants to compare countries by how technologically advanced they are. They switch to the Number of Tech Advances layer and see every location shaded by how many advances its owning country has researched.

**Why this priority**: A useful comparative reading, but a more niche one than the foundational economic/political layers — a nice-to-have rounding out the country tier.

**Independent Test**: With a save loaded, switch to the Number of Tech Advances layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true count of researched advances, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Number of Tech Advances layer, **Then** every location is shaded according to its owning country's count of researched advances, with a visible legend/scale.
2. **Given** the Number of Tech Advances layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's advance count.
3. **Given** the Number of Tech Advances layer is displayed, **When** a location has no confirmed owner, **Then** it renders in the neutral "no data" style; an owned country with zero researched advances instead renders as a confirmed zero, visually distinct from "no data".

---

### User Story 13 - View the Number of Works of Art Map (Priority: P3)

A user wants to see which countries have amassed the most works of art. They switch to the Number of Works of Art layer and see every location shaded by how many works of art its owning country currently holds.

**Why this priority**: A distinctive, previously-unsurfaced reading of the world (no other tab in the app touches works of art at all), but a niche one — the last of the new layers to ship.

**Independent Test**: With a save loaded, switch to the Number of Works of Art layer and confirm every location owned by the same country shows the identical shade, corresponding to that country's true count of currently-held (not destroyed) works of art, with a legend explaining the scale.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Number of Works of Art layer, **Then** every location is shaded according to its owning country's count of currently-held works of art, with a visible legend/scale.
2. **Given** the Number of Works of Art layer is displayed, **When** the user points at or selects a location, **Then** they see that location's owning country and that country's works-of-art count.
3. **Given** the Number of Works of Art layer is displayed, **When** a location has no confirmed owner, **Then** it renders in the neutral "no data" style; an owned country with zero currently-held works of art instead renders as a confirmed zero, visually distinct from "no data".
4. **Given** the Number of Works of Art layer is displayed, **When** a work of art has been destroyed, **Then** it is excluded from every country's count.

---

### Edge Cases

- What happens when a location has no confirmed owner (e.g. an unowned sea zone or wasteland)? Every country-level layer renders it in the neutral "no data" style, the same as the existing Political layer already does for an unowned location.
- What happens when a province's locations are, in reality, split between two countries mid-game? Confirmed against a real save that this does not currently occur (every location in a given province shares the same owner) — but if it were ever encountered, the province-level total would still be computed purely from that province's own locations, without regard to ownership, and the location-level owner coloring on other layers is unaffected.
- What happens when a numeric country layer (Treasury, Country Population, Economical Base, Literacy, Number of Tech Advances, Number of Works of Art) has one country as an extreme outlier? The shading scale must remain useful across the rest of the countries, not washed out by one outlier, matching the existing Location Population layer's approach.
- What happens when a numeric province layer (Development, Tax Base, Soldiers, Population totals) has one province as an extreme outlier? Same requirement as the country layers above.
- What happens when a country has a genuinely confirmed zero for a count-based layer (Number of Tech Advances, Number of Works of Art)? It renders as a distinct "zero" shade, not the same neutral style used for "no data at all" — the same distinction the existing Development layer already draws between a confirmed zero and missing data.
- What happens when every location in a province has no recorded value for a given province aggregate (e.g. an all-water province with no development anywhere)? The province renders in the neutral "no data" style, not as a fabricated zero.
- What happens when the Government Type legend or a future large-cardinality categorical layer has many distinct values? The legend remains scannable, consistent with the existing RGO layer's approach.
- What happens when the user switches between these new layers and any of the twelve existing layers repeatedly? The map does not reload or re-query, and the user's pan/zoom position is preserved, matching existing layer-switching behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Country Treasury" map layer that shades each location according to its owning country's treasury, with a legend explaining the scale.
- **FR-002**: System MUST provide a "Country Stability" map layer that shades each location according to its owning country's stability, with a legend explaining the scale.
- **FR-003**: System MUST provide a "Government Type" map layer that colors each location by its owning country's government type, with each distinct type shown as a distinct color in the legend.
- **FR-004**: System MUST provide a "Country Population" map layer that shades each location according to its owning country's most-recently-recorded total population, with a legend explaining the scale.
- **FR-005**: System MUST provide an "Economical Base" map layer that shades each location according to its owning country's most-recently-recorded economical base, with a legend explaining the scale.
- **FR-006**: System MUST provide a "Country Literacy" map layer that shades each location according to its owning country's population-weighted average literacy, with a legend explaining the scale.
- **FR-007**: System MUST provide a "Number of Tech Advances" map layer that shades each location according to its owning country's count of researched advances, with a legend explaining the scale.
- **FR-008**: System MUST provide a "Number of Works of Art" map layer that shades each location according to its owning country's count of currently-held (non-destroyed) works of art, with a legend explaining the scale.
- **FR-009**: System MUST provide a "Province Development" map layer that shades each location according to the total development of the province it belongs to, with a legend explaining the scale.
- **FR-010**: System MUST provide a "Province Tax Base" map layer that shades each location according to the total tax base of the province it belongs to, with a legend explaining the scale.
- **FR-011**: System MUST provide a "Province Soldiers" map layer that shades each location according to the total soldier population of the province it belongs to, with a legend explaining the scale.
- **FR-012**: System MUST provide a "Province Population" map layer that shades each location according to the total population of the province it belongs to, with a legend explaining the scale.
- **FR-013**: Every country-level layer added by this feature MUST render a location with no confirmed owner in the same neutral "no data" style the existing layers already use.
- **FR-014**: Every province-level layer added by this feature MUST render a location whose province has no locations with a recorded value for that layer's attribute in the same neutral "no data" style.
- **FR-015**: Every count-based layer added by this feature (Number of Tech Advances, Number of Works of Art) MUST visually distinguish a country with a confirmed zero count from a location with no confirmed owner at all.
- **FR-016**: Every layer added by this feature MUST let the user point at or select any location and see that layer's attribute value, alongside the location's owning country (for country-level layers) or province (for province-level layers) and the location's own name.
- **FR-017**: Every layer added by this feature MUST appear as its own selectable entry in the existing map layer sidebar, and only one layer (new or existing) is active at a time.
- **FR-018**: The map layer sidebar MUST group every layer — the twelve existing layers and the twelve added by this feature — into three sections by grain (Location, Province, Country), each independently collapsible/expandable.
- **FR-019**: Every numeric (gradient-shaded) layer added by this feature MUST normalize its shading scale so that one extreme outlier does not visually wash out the variation among the rest, consistent with the existing Location Population layer.
- **FR-020**: The "Government Type" layer's legend MUST remain scannable if the map contains many distinct government types, consistent with the existing RGO layer.
- **FR-021**: Switching to or away from any layer added by this feature MUST NOT trigger a new data query or map reload, and MUST preserve the user's current pan/zoom position, consistent with existing layer-switching behavior.
- **FR-022**: This feature MUST NOT provide any map layer, filter, or other user-facing feature based on subject/overlord (vassal, tributary) relationships.

### Key Entities

- **Nation** *(extended)*: in addition to the attributes already tracked (owner color, treasury, stability, government type, ...), a nation's treasury, stability, government type, most-recent recorded population and economical base, population-weighted average literacy, count of researched advances, and count of currently-held works of art now also drive map coloring for every location that nation owns.
- **Province**: a coarser grouping of locations (already tracked, but not previously surfaced on the map); its locations' development, tax base, soldier population, and total population can now each be summed and used to color every location within it.
- **Work of Art**: a named, individually-tracked cultural artifact (e.g. a painting, statue, or manuscript), each currently held by at most one country (or by none, if unowned or destroyed) — a new entity this feature introduces to the app.
- **Map Layer** *(extended)*: the existing named-visualization-mode entity gains twelve new members (eight country-level, four province-level) and a grouping by grain (Location, Province, Country) for sidebar display, alongside the twelve layers already delivered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch to any of the twelve new map layers from the same sidebar used for the existing layers, with no additional data loading and no change to their pan/zoom position.
- **SC-002**: Every location on a new country-level layer shows its owning country's true recorded (or derived) value in the tooltip when pointed at or selected, verified against the save's own data.
- **SC-003**: Every location on a new province-level layer shows its province's true summed value in the tooltip when pointed at or selected, verified against the save's own data.
- **SC-004**: A user can tell, at a glance, which single layer is currently active among all twenty-four available layers, and can find any layer's section (Location, Province, Country) without scrolling through an unorganized flat list.
- **SC-005**: Panning and zooming stays smooth and responsive on every new layer across a save's complete location set, matching the existing layers' performance.
- **SC-006**: Every location within the same country reads as one visually uniform shade/color on every country-level layer, and every location within the same province reads as one visually uniform shade/color on every province-level layer.

## Assumptions

- Each new layer reuses the existing map-layer infrastructure delivered by feature 005/011 (tooltip, legend, pan/zoom preservation, single active layer at a time); this feature's only new UI mechanism is the sidebar's grouping into Location/Province/Country sections.
- "Country Population" and "Economical Base" use each country's most-recently-recorded historical figure (the same underlying data the Leaderboard already reads), not a live recomputation from each location's own data.
- "Country Literacy" is a population-size-weighted average across every population group belonging to that country, not a simple unweighted average across locations.
- "Number of Tech Advances" counts distinct researched advances currently recorded for a country; it does not distinguish advance categories or dates.
- "Number of Works of Art" counts only works of art with a currently-recorded owner and no recorded destruction date; a work of art with no recorded owner (never held, or its holder unconfirmed) is excluded from every country's count rather than attributed to anyone.
- Every province-level aggregate (Development, Tax Base, Soldiers, Population) is computed purely by summing that province's own locations' already-recorded values; it does not depend on or re-derive each location's owner.
- Confirmed against a real save that no province currently contains locations with different owners; province-level layers assume this holds and do not attempt to render a "mixed ownership" state.
- Subject/overlord (vassal, tributary) relationships are permanently out of scope for this feature and are not planned for any future map layer, per explicit decision — no queryable save field for the current live relationship was found during research.
- Firepower-style computed doctrine stats (Discipline, Tactics, Fort Defense, Siege Ability, Fort Limit, army composition) as country-level map layers, and any diplomatic-relations/trust map layer (which would require a "viewpoint country" selection, since relations are pairwise), are deferred to a future feature, not part of this one.
- The exact save fields and tables backing every new layer (nations columns, nation_history, population.literacy, nation_advances, and the new works-of-art table sourced from the save's own work-of-art records) were confirmed by inspecting a real save file during specification, not assumed or inferred from the trimmed test fixture; this spec defines the required user-facing behavior, and the plan records the confirmed field/table names.
