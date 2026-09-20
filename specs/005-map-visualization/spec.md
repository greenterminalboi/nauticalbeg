# Feature Specification: Map Visualization

**Feature Branch**: `005-map-visualization`

**Created**: 2026-09-19

**Status**: Draft

**Input**: User description: "Integrate the generated province/location maps (from the 003-province-map-generation tooling) into the Map tab in the navbar. Add a collapsible sidebar on the map view listing map layers/overlays the user can toggle. For this feature, support two map modes: (1) Location Population mode, and (2) Political map mode (countries colored by their in-game color, likely sourced from the save file schema). The map should be tied to location/country data parsed from the save file, consistent with how country/location data is already modeled elsewhere in the app." Expanded: "I would like a RGO map layer, RGOs will have different colors, a control map layer that shows a country's control over a location."

## Clarifications

### Session 2026-09-19

- Q: Should every map layer read its coloring values from the same underlying per-location dataset already stored in the app's database (one upload → one stored dataset → every layer paints from it), rather than each layer computing or fetching its own separate data path? → A: Yes — all location data from the save is loaded into the database once, and every map layer paints locations by reading from that same stored per-location data.
- Q: When a user switches which map layer is active, should the app query the database again for that layer's values, or load every layer's values once and just recolor from data already in memory? → A: Load once (on save load / first map open) and recolor from already-loaded data; switching layers does not trigger a new database query.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View the Political Map (Priority: P1)

A user has loaded a save file and opens the Map tab (currently a "coming soon" placeholder). They see an interactive map of the game world where every location is colored according to which country currently owns it, using that country's own in-game color, so they can read the political situation at a glance the same way they would in the game itself.

**Why this priority**: This is the feature's headline capability and the reason the Map tab exists at all — without it, the tab is still just a placeholder. It also proves out the core plumbing (rendering the generated geometry, joining it to save data) that every other map mode depends on.

**Independent Test**: Load a save, open the Map tab, and confirm the map renders with each owned location/province shaded in its owner's in-game color, matching what a manual lookup of that country's color in the save data shows.

**Acceptance Scenarios**:

1. **Given** a loaded save with the Map tab open, **When** the Political layer is active (the default), **Then** every owned location on the map is filled with its owning country's in-game color.
2. **Given** the political map is displayed, **When** the user points at or selects a location, **Then** they see that location's name and owning country.
3. **Given** the political map is displayed, **When** a location has no current owner, **Then** it is rendered in a distinct neutral style rather than left blank or colored like an owned location.

---

### User Story 2 - Switch Map Layers via a Collapsible Sidebar (Priority: P2)

A user viewing the map wants to see different kinds of information without leaving the map. They open a sidebar listing the available map layers, pick a different one, and the map updates in place. When they want more screen space to look at the map itself, they collapse the sidebar.

**Why this priority**: This is the navigation mechanism that makes multiple map modes usable, and it's the piece the user specifically called out as a UI requirement. It depends on User Story 1 existing (there must be at least one layer to list and switch to) but is independent of any specific additional layer.

**Independent Test**: With the map open, expand the sidebar, confirm it lists the available layers with the active one indicated, select a different layer, confirm the map updates, then collapse the sidebar and confirm the map view remains usable and the sidebar can be reopened.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user expands the sidebar, **Then** they see a list of available map layers with the currently active layer indicated.
2. **Given** the sidebar is open, **When** the user selects a different layer, **Then** the map updates to that layer without losing the user's current pan/zoom position.
3. **Given** the sidebar is expanded, **When** the user collapses it, **Then** the map view expands to use the freed space and the sidebar can be re-expanded later.

---

### User Story 3 - View Location Population (Priority: P3)

A user wants to understand where population is concentrated in their save. They switch to the Location Population layer from the sidebar and see each location shaded by how populous it is, and can point at or select any location to see its population.

**Why this priority**: This is the second map mode the user asked for. It's valuable but secondary to having a working map with layer-switching at all (P1/P2), and it depends on the same location-level join used by the political layer's per-location detail.

**Independent Test**: With a save loaded, switch to the Location Population layer and confirm every location's shading corresponds to its relative population size, with a legend explaining the scale, and that pointing at a location surfaces its population value.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Location Population layer, **Then** each location is shaded according to its population using a visible legend/scale.
2. **Given** the population layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and population value.
3. **Given** the population layer is displayed, **When** a location has little or no population data, **Then** it is rendered in a distinct neutral/low style rather than looking identical to a populous location.

---

### User Story 4 - View the RGO (Raw Goods) Map (Priority: P4)

A user wants to see where different raw goods are produced across the map. They switch to the RGO layer from the sidebar and see each location colored by the raw good/resource it produces, with a legend mapping colors to goods, so they can spot production clusters (e.g. where the grain regions or the mining regions are).

**Why this priority**: A third distinct way to read the map, valuable for economic/production analysis, but additive to the core political/population/sidebar capability already delivered by P1-P3.

**Independent Test**: With a save loaded, switch to the RGO layer and confirm every location is colored according to its assigned raw good, each distinct good has a visibly distinct color shown in a legend, and pointing at a location surfaces its raw good name.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the RGO layer, **Then** each location is colored according to its assigned raw good/resource, with a legend mapping each color to a good.
2. **Given** the RGO layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name and its raw good.
3. **Given** the RGO layer is displayed, **When** a location has no raw good assigned (e.g. open sea, wasteland), **Then** it is rendered in a distinct neutral style rather than an arbitrary good's color.

---

### User Story 5 - View Country Control (Priority: P5)

A user wants to distinguish a country's legal ownership of a location from how firmly it actually holds that location right now (e.g. during a war, occupation, or unrest). They switch to the Control layer and see each location colored by its current controller, with the strength of that color/shading reflecting how much control the controller actually has — a solidly held location looks different from a contested or barely-held one.

**Why this priority**: A more nuanced companion to the Political layer, useful mainly in dynamic/wartime situations; lower priority than the core three layers since it depends on the same plumbing and adds a secondary, more specialized reading of the map.

**Independent Test**: With a save loaded, switch to the Control layer and confirm locations under full control render solidly in their controller's color, locations under partial/contested control are visually faded or muted relative to full control, and pointing at a location surfaces its controller and control level.

**Acceptance Scenarios**:

1. **Given** the Map tab is open, **When** the user switches to the Control layer, **Then** each location is colored by its current controller (which may differ from its legal owner) and visually reflects how much control that controller has over it.
2. **Given** the Control layer is displayed, **When** the user points at or selects a location, **Then** they see that location's name, controller, and control level.
3. **Given** the Control layer is displayed, **When** a location is fully controlled by its controller, **Then** it renders distinctly more solid/saturated than a location with only partial control.
4. **Given** the Control layer is displayed, **When** a location has no controller, **Then** it is rendered in the same neutral style used for unowned locations on other layers.

---

### Edge Cases

- What happens when no save file is loaded and the user opens the Map tab? The tab should show the same "load a save first" empty state used by other data-driven sections of the app, not a broken or empty map.
- What happens when the generated map geometry doesn't fully match the loaded save (e.g. a different game version, or a location/province with no corresponding save data)? Those shapes render in a neutral "no data" style rather than causing an error or blank gap in the map.
- What happens when a country's in-game color is missing or malformed in the save data? The affected country's locations fall back to the same neutral "no data" style used for unowned locations.
- What happens when population is extremely uneven across locations (e.g. one capital location dwarfing everything else)? The shading scale must remain useful — differences among the many smaller locations should still be visible, not washed out by one outlier.
- What happens when the user switches layers while the map is mid-pan or mid-zoom? The switch should not reset the user's current view position.
- What happens on a narrow/small viewport? The collapsible sidebar must not permanently block the map; it can be collapsed to see the full map.
- What happens when many distinct raw goods exist across the map (potentially dozens)? The RGO legend must stay usable (e.g. scannable/searchable) rather than becoming an unreadable wall of colors.
- What happens when two unrelated raw goods end up with similar-looking assigned colors? Adjacent same-good regions must still read as clearly connected; colors are assigned to maximize distinguishability, not left to chance.
- What happens when a location's controller and legal owner differ (e.g. wartime occupation)? The Control layer must make this visible (showing the controller, not the owner), while the Political layer continues to show the legal owner.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST replace the current Map tab placeholder with a functioning map view, reachable from the top-level navigation the same way it is today.
- **FR-002**: System MUST render the generated map geometry (provinces and locations) for the world of the currently loaded save.
- **FR-003**: System MUST provide a sidebar, collapsible/expandable by the user, listing the map layers available in this feature.
- **FR-004**: Collapsing or expanding the sidebar MUST NOT reload the map or reset the user's current view.
- **FR-005**: System MUST provide a "Political" map layer that colors each location by its owning country's in-game color, sourced from the save file's country color data.
- **FR-006**: System MUST provide a "Location Population" map layer that shades each location according to its population, with a legend explaining the scale.
- **FR-007**: Users MUST be able to select a layer from the sidebar and have the map update to reflect it; only one of these layers is active at a time.
- **FR-008**: System MUST be able to match individual locations (not just provinces) to their save-derived data (ownership, population, raw good, controller/control level), closing a known gap so all layers can render at full per-location detail.
- **FR-009**: System MUST visually distinguish locations with no current owner or no matching save data from normally-colored/shaded locations, on every layer.
- **FR-010**: Users MUST be able to point at or select any location/province on the map and see identifying details for the active layer (at minimum: name, plus owner for Political, population for Location Population, raw good for RGO, or controller and control level for Control).
- **FR-011**: System MUST preserve the user's current pan/zoom position when switching between map layers.
- **FR-012**: System MUST display a legend for the currently active layer explaining what its colors/shading represent.
- **FR-013**: System MUST remain responsive to panning, zooming, and layer switching when rendering a save's full set of locations.
- **FR-014**: System MUST provide an "RGO" map layer that colors each location by its assigned raw good/resource, using a distinct, legend-mapped color per good.
- **FR-015**: System MUST provide a "Control" map layer that colors each location by its current controller and visually reflects the controller's degree of control over it (e.g. a solidly-held location looks distinctly different from a barely/contested-held one).
- **FR-016**: The Control layer's controller MUST be sourced from the save's current controller data, which may differ from the Political layer's legal owner (e.g. during occupation).
- **FR-017**: System MUST load each active save's per-location data (ownership, population, raw good, controller, control level) once into the app's existing data store; every map layer MUST render from that same loaded dataset, and switching the active layer MUST NOT trigger a new data query or reload.

### Key Entities

- **Map Layer**: A named visualization mode (Political, Location Population, RGO, Control) with its own coloring rule and legend; exactly one is active at a time in this feature.
- **Location**: The finest-grained geographic unit on the map; has an owning country, a controller, population data, and an assigned raw good, and currently cannot be matched to its map shape (this feature closes that gap).
- **Province**: A geographic grouping of locations; has an owning country and is already joinable to the generated map geometry by name.
- **Country**: A political entity with an in-game color (used by the Political layer) and locations/provinces it owns or controls.
- **Population**: Per-location population data used to compute the Location Population layer's shading and per-location detail.
- **Raw Good (RGO)**: The raw good/resource assigned to a location, used to color the RGO layer and shown in its legend.
- **Control**: The degree to which a location's current controller actually holds it, distinct from legal ownership; used to modulate the Control layer's shading.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user opening the Map tab on a loaded save sees a fully colored political map within 3 seconds.
- **SC-002**: A user can switch between any of the map layers in under 1 second with no additional data loading, and their pan/zoom position is unchanged after switching.
- **SC-003**: Every owned location on the Political layer shows its true owning country's in-game color, verified against the save's own country color data.
- **SC-004**: A user can find the population of any individual location by pointing at or selecting it, without leaving the map view.
- **SC-005**: The sidebar can be collapsed and re-expanded any number of times without the map reloading or the view resetting.
- **SC-006**: Panning and zooming stays smooth and responsive across a save's complete location set (tens of thousands of locations).
- **SC-007**: Every location on the RGO layer shows its true assigned raw good, with visibly distinguishable colors between different goods, verified against the save's own data.
- **SC-008**: A user can tell, at a glance, which locations are fully controlled versus contested/partially controlled on the Control layer, and can confirm the exact control level for any location by pointing at or selecting it.

## Assumptions

- The map geometry produced by feature 003 (`public/map/provinces.topojson`, `public/map/locations.topojson`) is accurate enough to serve as this feature's base layer; no new geometry generation is required.
- Making individual locations matchable to their save-derived data (not just provinces) is in scope for this feature, per the chosen approach for delivering true per-location detail on all four layers.
- "In-game color" for the Political layer is the country's primary color field in the save data; secondary/tertiary color fields exist for flag rendering and are out of scope unless the primary color proves insufficient to distinguish neighboring countries.
- Only one base map layer is active at a time in this feature; simultaneously layering multiple overlays (e.g. population shading on top of political color) is out of scope for v1 and is a natural follow-up.
- Location Population shading is computed from the population data already recorded per-location in the save, not from the separate per-population-group records, since those aren't keyed by location.
- This feature targets the same desktop-first layout the rest of the app already assumes; it should not be broken on a narrow viewport, but a dedicated mobile map layout is not a goal.
- The RGO layer's raw good is the raw good/resource already recorded directly on each location in the save; it does not depend on any additional data beyond the per-location join this feature already adds.
- The Control layer's controller and control level are read from the save's existing per-location controller and control fields, which are already present alongside ownership and require no new save-parsing beyond the per-location join this feature already adds.
- Political and Control are treated as two distinct layers rather than one combined layer: Political always shows legal ownership at full strength; Control shows current controller and may visually differ from Political when a location is occupied or contested.
- This feature reuses the app's existing database-backed storage as the single source of truth for location data (consistent with how the rest of the app already stores parsed save data); it does not introduce a separate parsing or storage path just for the map. Per-location values for all four layers are loaded once per save and held in memory for the session, so layer switches are pure client-side recoloring with no repeat queries.
