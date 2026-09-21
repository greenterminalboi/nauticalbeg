# Feature Specification: Expanded Atlas Map Modes

**Feature Branch**: `011-atlas-map-modes`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Expand the atlas to include new map modes: location terrian, location wealth, tax base, development, primary culture, food productivity, sailors, soldiers, primary religon" — expanded mid-session with "oh and location market as well" and "add location rank though". Narrowed mid-session, after confirming against the real save file (not the trimmed test fixture) that Location Wealth, Food Productivity, and Sailors have no genuine per-location save data: those three were dropped, leaving eight confirmed map modes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View the Development Map (Priority: P1)

A user has loaded a save and wants to see how developed each part of the world is. They switch to the Development layer and see every location shaded by its development level, so they can spot the richest, most-built-up regions at a glance.

**Why this priority**: Development is already recorded per-location in the app's data (it backs existing per-country totals elsewhere in the app), so this layer is the lowest-risk, fastest slice to deliver, and development is one of the most fundamental "how strong is this region" readings a player looks for.

**Independent Test**: With a save loaded, switch to the Development layer and confirm every location's shading corresponds to its development value, with a legend explaining the scale, and that pointing at a location surfaces its exact value.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Development layer, **Then** each location is shaded according to its development value using a visible legend/scale.
2. **Given** the Development layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and development value.
3. **Given** the Development layer is displayed, **When** a location has no recorded development value, **Then** it is rendered in the same neutral "no data" style used by the existing layers, distinct from a location with a low-but-confirmed value.

---

### User Story 2 - View the Location Terrain Map (Priority: P1)

A user wants a "physical map" reading of the world, independent of who owns what. They switch to the Location Terrain layer and see every location colored by its terrain type (e.g. plains, mountains, ocean), with a legend mapping each color to a terrain type.

**Why this priority**: Terrain is static, foundational geography — one of the most immediately useful and lowest-risk additions, and a natural companion to the existing Political layer.

**Independent Test**: With a save loaded, switch to the Location Terrain layer and confirm every location is colored according to its terrain type, each distinct terrain type has a visibly distinct color shown in a legend, and pointing at a location surfaces its terrain type.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Location Terrain layer, **Then** each location is colored according to its terrain type, with a legend mapping each color to a terrain type.
2. **Given** the Location Terrain layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and terrain type.
3. **Given** the Location Terrain layer is displayed, **When** a location has no recorded terrain type, **Then** it is rendered in the neutral "no data" style rather than an arbitrary terrain's color.

---

### User Story 3 - View the Location Rank Map (Priority: P1)

A user wants to see the settlement tier of every location — which are sprawling cities versus small rural settlements. They switch to the Location Rank layer and see every location colored by its current rank, with a legend mapping each color to a rank.

**Why this priority**: A simple, well-bounded categorical reading (a handful of rank tiers) directly recorded per location — as low-risk as Development and Terrain, and a natural companion reading of settlement importance across the map.

**Independent Test**: With a save loaded, switch to the Location Rank layer and confirm every location is colored according to its current rank, each distinct rank has a visibly distinct color shown in a legend, and pointing at a location surfaces its rank.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Location Rank layer, **Then** each location is colored according to its current rank, with a legend mapping each color to a rank.
2. **Given** the Location Rank layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and current rank.
3. **Given** the Location Rank layer is displayed, **When** a location has no recorded rank, **Then** it is rendered in the neutral "no data" style rather than an arbitrary rank's color.

---

### User Story 4 - View the Primary Culture Map (Priority: P2)

A user wants to see the cultural makeup of the world. They switch to the Primary Culture layer and see every location colored by its primary culture, with a legend mapping colors to cultures, so they can spot cultural regions and minorities at a glance.

**Why this priority**: A valuable social/diplomatic reading of the map, but secondary to the foundational development/terrain/rank layers.

**Independent Test**: With a save loaded, switch to the Primary Culture layer and confirm every location is colored according to its primary culture, each distinct culture has a visibly distinct color shown in a legend, and pointing at a location surfaces its primary culture.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Primary Culture layer, **Then** each location is colored according to its primary culture, with a legend mapping each color to a culture.
2. **Given** the Primary Culture layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and primary culture.
3. **Given** the Primary Culture layer is displayed, **When** a location has no recorded primary culture, **Then** it is rendered in the neutral "no data" style rather than an arbitrary culture's color.
4. **Given** the Primary Culture layer is displayed, **When** the map contains dozens of distinct cultures, **Then** the legend remains scannable rather than becoming an unreadable wall of colors.

---

### User Story 5 - View the Primary Religion Map (Priority: P2)

A user wants to see the religious makeup of the world. They switch to the Primary Religion layer and see every location colored by its primary religion, with a legend mapping colors to religions.

**Why this priority**: Mirrors Primary Culture in value and risk — a secondary social reading of the map.

**Independent Test**: With a save loaded, switch to the Primary Religion layer and confirm every location is colored according to its primary religion, each distinct religion has a visibly distinct color shown in a legend, and pointing at a location surfaces its primary religion.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Primary Religion layer, **Then** each location is colored according to its primary religion, with a legend mapping each color to a religion.
2. **Given** the Primary Religion layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and primary religion.
3. **Given** the Primary Religion layer is displayed, **When** a location has no recorded primary religion, **Then** it is rendered in the neutral "no data" style rather than an arbitrary religion's color.
4. **Given** the Primary Religion layer is displayed, **When** the map contains dozens of distinct religions, **Then** the legend remains scannable rather than becoming an unreadable wall of colors.

---

### User Story 6 - View the Location Market Map (Priority: P2)

A user wants to see how the world is carved up into trade markets. They switch to the Location Market layer and see every location colored by the market it currently belongs to, with a legend mapping colors to markets, so they can see each market's territory at a glance.

**Why this priority**: Builds on the existing Markets data already in the app, giving a new spatial reading of an existing dataset; valuable but secondary to the foundational layers.

**Independent Test**: With a save loaded, switch to the Location Market layer and confirm every location is colored according to the market it belongs to, each distinct market has a visibly distinct color shown in a legend, and pointing at a location surfaces its market.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Location Market layer, **Then** each location is colored according to the market it belongs to, with a legend mapping each color to a market.
2. **Given** the Location Market layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and the market it belongs to.
3. **Given** the Location Market layer is displayed, **When** a location belongs to no market, **Then** it is rendered in the neutral "no data" style rather than an arbitrary market's color.
4. **Given** the Location Market layer is displayed, **When** the map contains many distinct markets, **Then** the legend remains scannable rather than becoming an unreadable wall of colors.

---

### User Story 7 - View the Tax Base Map (Priority: P2)

A user wants to see where tax revenue potential is concentrated. They switch to the Tax Base layer and see every location shaded by its tax base value, with a legend explaining the scale.

**Why this priority**: A distinct economic reading of the map, useful for fiscal analysis; secondary to the foundational layers.

**Independent Test**: With a save loaded, switch to the Tax Base layer and confirm every location's shading corresponds to its tax base value, with a legend explaining the scale, and that pointing at a location surfaces its exact value.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Tax Base layer, **Then** each location is shaded according to its tax base value using a visible legend/scale.
2. **Given** the Tax Base layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and tax base value.
3. **Given** the Tax Base layer is displayed, **When** a location has no recorded tax base value, **Then** it is rendered in the neutral "no data" style, distinct from a location with a low-but-confirmed value.

---

### User Story 8 - View the Soldiers Map (Priority: P2)

A user wants to see where land-army manpower is concentrated. They switch to the Soldiers layer and see every location shaded by its soldier population, with a legend explaining the scale.

**Why this priority**: A specialized military-manpower layer, useful mainly for land-focused analysis; secondary to the foundational layers.

**Independent Test**: With a save loaded, switch to the Soldiers layer and confirm every location's shading corresponds to its soldier population, with a legend explaining the scale, and that pointing at a location surfaces its exact value.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Soldiers layer, **Then** each location is shaded according to its soldier population using a visible legend/scale.
2. **Given** the Soldiers layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and soldier population.
3. **Given** the Soldiers layer is displayed, **When** a location has no recorded soldier population, **Then** it is rendered in the neutral "no data" style, distinct from a location with a low-but-confirmed value.

---

### Edge Cases

- What happens when a location has no recorded value for one of these eight attributes? It renders in the same neutral "no data" style the existing layers already use for missing data — and only on that specific layer; the location's data on every other layer is unaffected.
- What happens when a location belongs to no trade market at all? It renders in the neutral "no data" style on the Location Market layer, the same as a location with no raw good renders on the existing RGO layer.
- What happens when a categorical layer (Terrain, Location Rank, Primary Culture, Primary Religion, Location Market) has dozens or more distinct values across the map? The legend must stay usable (scannable, not an unreadable wall of colors), matching how the existing RGO layer already handles a large number of distinct raw goods.
- What happens when two unrelated categorical values on the same layer end up with similar-looking assigned colors? Colors are assigned to maximize distinguishability between adjacent/common values, not left to chance, matching the existing RGO layer's approach.
- What happens when a numeric layer (Development, Tax Base, Soldiers) has extremely uneven values across locations (e.g. one capital dwarfing every other location)? The shading scale must remain useful — differences among the many smaller locations must still be visible, not washed out by one outlier, matching the existing Location Population layer's approach.
- What happens when a location's numeric value is genuinely zero (e.g. a wasteland with zero development)? It renders distinctly from a location with no recorded value at all — zero is a confirmed low value, not missing data.
- What happens when the user switches between these new layers and the four existing layers repeatedly? The map does not reload or re-query, and the user's pan/zoom position is preserved, matching the existing layer-switching behavior.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a "Development" map layer that shades each location according to its development value, with a legend explaining the scale.
- **FR-002**: System MUST provide a "Location Terrain" map layer that colors each location by its terrain type, with each terrain type shown as a distinct color in the legend.
- **FR-003**: System MUST provide a "Location Rank" map layer that colors each location by its current settlement rank, with each distinct rank shown as a distinct color in the legend.
- **FR-004**: System MUST provide a "Primary Culture" map layer that colors each location by its primary culture, with each distinct culture shown as a distinct color in the legend.
- **FR-005**: System MUST provide a "Primary Religion" map layer that colors each location by its primary religion, with each distinct religion shown as a distinct color in the legend.
- **FR-006**: System MUST provide a "Location Market" map layer that colors each location by the trade market it currently belongs to, with each distinct market shown as a distinct color in the legend.
- **FR-007**: System MUST provide a "Tax Base" map layer that shades each location according to its tax base value, with a legend explaining the scale.
- **FR-008**: System MUST provide a "Soldiers" map layer that shades each location according to its soldier population, with a legend explaining the scale.
- **FR-009**: Every layer added by this feature MUST visually distinguish a location with no recorded value for that layer's attribute from a location with a confirmed value, using the same neutral "no data" style the existing four layers already use.
- **FR-010**: Every layer added by this feature MUST let the user point at or select any location and see that layer's attribute value alongside the location's name.
- **FR-011**: Every layer added by this feature MUST appear as its own selectable entry in the existing map layer sidebar, alongside the four existing layers, and only one layer (new or existing) is active at a time.
- **FR-012**: Every numeric (gradient-shaded) layer added by this feature (Development, Tax Base, Soldiers) MUST normalize its shading scale so that one extreme outlier location does not visually wash out the variation among the rest, consistent with the existing Location Population layer.
- **FR-013**: Every categorical layer added by this feature (Location Terrain, Location Rank, Primary Culture, Primary Religion, Location Market) whose distinct values could number in the dozens or more MUST keep its legend usable, consistent with the existing RGO layer.
- **FR-014**: Switching to or away from any layer added by this feature MUST NOT trigger a new data query or map reload, and MUST preserve the user's current pan/zoom position, consistent with the existing layer-switching behavior.

### Key Entities

- **Location** *(extended)*: in addition to the attributes already tracked (owner, controller, control, population, raw good), each location now also carries a terrain type, a current settlement rank, a tax base value, a development value, a primary culture, a primary religion, a soldier population, and the trade market it belongs to.
- **Map Layer** *(extended)*: the existing named-visualization-mode entity gains eight new members (Development, Location Terrain, Location Rank, Primary Culture, Primary Religion, Location Market, Tax Base, Soldiers), each with its own coloring rule and legend, alongside the four layers already delivered.
- **Market**: the trade market a location currently belongs to, used to color and group locations on the Location Market layer; markets already exist as an entity elsewhere in the app.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can switch to any of the eight new map layers from the same sidebar used for the existing layers, with no additional data loading and no change to their pan/zoom position.
- **SC-002**: Every location on a new numeric layer (Development, Tax Base, Soldiers) shows its true recorded value in the tooltip when pointed at or selected, verified against the save's own data.
- **SC-003**: Every location on a new categorical layer (Location Terrain, Location Rank, Primary Culture, Primary Religion, Location Market) shows its true recorded category in the tooltip, with visibly distinguishable colors between different categories, verified against the save's own data.
- **SC-004**: A user can tell, at a glance, which single layer is currently active among all twelve available layers (the four existing plus the eight added here).
- **SC-005**: Panning and zooming stays smooth and responsive on every new layer across a save's complete location set, matching the existing layers' performance.

## Assumptions

- Each new layer reuses the existing map-layer infrastructure delivered by feature 005 (sidebar registration, tooltip, legend, pan/zoom preservation, single active layer at a time); this feature introduces no new UI mechanism, only new layers.
- "Primary Culture" and "Primary Religion" refer to each location's own recorded primary culture/religion, not its owning country's culture or religion.
- "Soldiers" refers to the soldier-profession population recorded directly on each location (part of that location's population breakdown), confirmed present in a real save.
- "Location Market" colors each location by the trade market it is currently a member of (the same market entity already surfaced elsewhere in the app), not by its raw good or a trade-good's price.
- "Location Rank" refers to a location's current settlement tier (e.g. rural settlement, town, city, and above), a small, bounded set of categories confirmed present on every location in a real save.
- "Location Terrain" is sourced from the game's own static per-location-name reference data (the same kind of local-install-only game-definition data the Encyclopedia feature already reads), not from the save file itself, since terrain is not recorded per-save.
- Location Wealth, Food Productivity, and Sailors — all present in the original request — were investigated against a real, non-minimized save and dropped from this feature's scope: no genuine per-location save field backs any of the three (wealth and food productivity are not recorded per-location at all in the save; sailors exist only as a country-wide pool, not per-location), and no informed default was acceptable for data the tool would otherwise have to fabricate, per this project's accuracy principle. Either could return as a future feature if a genuine per-location source is later identified.
- The exact per-location save fields backing each new attribute were confirmed by inspecting a real save file during specification, not assumed or inferred from a test fixture; this spec defines the required user-facing behavior, and the plan records the confirmed field names.
- All eight new layers are strictly additive to the four layers already delivered; none of the four existing layers (Political, Location Population, RGO, Control) change behavior.
