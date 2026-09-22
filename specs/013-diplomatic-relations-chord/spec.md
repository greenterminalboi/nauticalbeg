# Feature Specification: Diplomatic Relations Chord Diagram

**Feature Branch**: `013-diplomatic-relations-chord`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Diplomatic Relations Chord Diagram — render all countries as arcs around a circle, with chords drawn between pairs that have an active diplomatic relationship (alliance, rivalry, royal marriage, guarantee), so the full web of diplomatic ties in the current save is visible in one image. Snapshot-based, current save state only."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the whole diplomatic web at a glance (Priority: P1)

A player loads their save and opens a new "Diplomacy" chord diagram view. Every country with at least one active alliance, rivalry, royal marriage, or guarantee appears as an arc around a circle; a colored chord connects each related pair. Hovering a country's arc highlights only the chords touching that country and fades everything else, so the player can trace exactly who one country is tied to without the rest of the diagram becoming visual noise.

**Why this priority**: This is the entire feature — without the render and the hover-isolation interaction, the diagram is unreadable past a handful of countries and delivers no value. Everything else (filters, tooltips, power-tier defaults) refines this core view.

**Independent Test**: Load a real save, open the Diplomacy view, and confirm arcs and chords render for related countries, isolated countries (zero active relationships) are absent, and hovering one arc visibly isolates its chords from the rest.

**Acceptance Scenarios**:

1. **Given** a loaded save with active alliances, rivalries, royal marriages, and guarantees, **When** the player opens the Diplomacy chord diagram, **Then** every country party to at least one such relationship appears as an arc, and a chord is drawn for every active relationship between two rendered arcs.
2. **Given** a country with no active alliance, rivalry, royal marriage, or guarantee, **When** the diagram renders with the default filters, **Then** that country's arc does not appear.
3. **Given** the diagram is rendered, **When** the player hovers over one country's arc, **Then** only chords touching that country stay at full opacity and every other chord fades to low opacity, reverting when the hover ends.
4. **Given** a pair of countries with more than one simultaneous relationship (e.g. allied and married), **When** the diagram renders, **Then** a separate thin chord is drawn for each relationship type between that pair, each in its own type color.

---

### User Story 2 - Filter down to the relationships that matter (Priority: P2)

A player wants to see only alliances (to judge the current balance of power) without rivalry and marriage chords cluttering the view. They toggle relationship-type checkboxes to show or hide alliance, rivalry, royal marriage, and guarantee chords independently, and the diagram — including which arcs are visible, since arcs with no remaining visible relationship drop out — updates immediately.

**Why this priority**: Necessary for the diagram to stay usable on saves with many active relationships; without it the default view is too dense to read. Depends on User Story 1's render existing first.

**Independent Test**: With the diagram open, toggle each relationship-type checkbox off and on independently and confirm only chords of that type appear/disappear, and arcs with zero remaining visible relationships drop out (reappearing if a toggle brings a relationship back).

**Acceptance Scenarios**:

1. **Given** the diagram shows all eight relationship types by default, **When** the player unchecks "Rivalry," **Then** all rivalry chords disappear while every other visible type's chords remain, and any arc left with zero visible relationships also disappears.
2. **Given** a relationship-type filter is off, **When** the player re-enables it, **Then** the corresponding chords (and any arcs they reintroduce) reappear without a full page reload.

---

### User Story 3 - Start from a readable default on a large save (Priority: P3)

A player on a 100+ tag save opens the Diplomacy view and, instead of being confronted with dozens of small arcs and crossing chords, sees only their own human-played country/countries by default — the same starting point Leaderboard, World Goods, and the Societal Compass already use — with the same search-and-add control to bring in more countries on demand. A relationship is visible only once *both* countries in it are selected, so the diagram never shows a country the player didn't ask for.

**Why this priority**: Improves first-impression usability on large saves but the diagram is already functional and correct without it — User Stories 1 and 2 cover the core value.

**Independent Test**: On a save with more real countries than are currently selected, open the diagram and confirm it defaults to the human-played country/countries only (falling back to a small fixed default set if none are human-played, matching the existing `computeDefaultSelection` behavior), then confirm adding another country via the search control reveals any relationship between it and an already-selected country, and only that.

**Acceptance Scenarios**:

1. **Given** a save with one or more human-played countries, **When** the player opens the diagram, **Then** only those countries (and relationships strictly between two of them) are shown by default — no other country appears as an arc.
2. **Given** the default view is active, **When** the player adds another country via the search control, **Then** any relationship between the newly-added country and an already-selected one becomes visible, and that country appears as a new arc; a country the player has not added never appears, even if it has an active relationship with a selected country.

---

### User Story 4 - Spot alliance blocs at a glance with Hugbox Detection (Priority: P2)

A player wants to see which countries form a tight-knit alliance bloc without mentally tracing every individual alliance chord. They enable a "Hugbox Detection" overlay that finds clusters of countries which are all directly and mutually allied with one another, groups those clusters visually, and pulls in countries with weaker ties: a country allied to just one cluster member is drawn near the cluster but visually marked as not-yet-a-member, while a country allied to two or more cluster members is promoted to a full member of the cluster.

**Why this priority**: Turns a wall of individual alliance chords into readable "blocs," directly serving the diagram's core goal of seeing the diplomatic web at a glance once a save has more than a couple of overlapping alliances. Builds on User Story 1's render; the diagram is already useful without it.

**Independent Test**: On a save with at least one group of 3+ countries all mutually allied with each other, plus at least one additional country allied to two of that group's members and another allied to only one, enable Hugbox Detection and confirm the mutual core is grouped with a shared visual boundary, the two-tie country is included as a full member, and the one-tie country is positioned near the cluster but visually distinguished as not a full member.

**Acceptance Scenarios**:

1. **Given** three countries A, B, and C each allied with the other two, **When** Hugbox Detection is enabled, **Then** A, B, and C are grouped as one cluster with a shared visual boundary and positioned adjacent to each other on the circle.
2. **Given** a fourth country D allied with exactly one of A, B, or C, **When** Hugbox Detection is enabled, **Then** D is positioned near the A-B-C cluster but rendered as an affiliate, visually distinct from full membership and not enclosed in the cluster's boundary.
3. **Given** country D later becomes allied with a second member of the A-B-C cluster, **When** Hugbox Detection is enabled, **Then** D is promoted to a full cluster member and enclosed in the same visual boundary as A, B, and C.
4. **Given** Hugbox Detection is toggled off, **When** the player views the diagram, **Then** arcs revert to the default relationship-count ordering (FR-011) and no cluster boundaries are drawn.

---

### Edge Cases

- A country has an active relationship with a tag that no longer exists in `nations` (e.g. released/annexed since the relationship was recorded) — treat as data noise and skip that chord rather than rendering a broken arc endpoint.
- A save has zero active relationships of any tracked type — show an empty-state message rather than a blank circle.
- A relationship score/trust value used for chord thickness is missing for one direction of a pair but present for the other — fall back to the value that exists rather than treating the pair as scoreless.
- Two countries have the *same* relationship type recorded twice in the underlying data (e.g. a duplicate or stale entry) — de-duplicate to one chord per (pair, type).
- Only one relationship type checkbox is left checked and it has zero active instances in the save — show the empty state, not an error.
- A country qualifies as a full member (2+ alliance ties) of two different detected clusters at once — assign it to exactly one (see Assumptions for the tie-break rule); it must never render as a full member of more than one cluster simultaneously.
- A save has only mutually-allied pairs (no group of 3+ all mutually allied with each other) — Hugbox Detection finds no clusters, and the overlay shows the same view as it being disabled rather than an error.
- The Alliance relationship-type filter (User Story 2) is toggled off while Hugbox Detection is enabled — since hugbox clustering is alliance-based, no clusters can be detected while alliance chords are hidden; the overlay has nothing to show until alliance is re-enabled.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render every country that is party to at least one currently-active alliance, rivalry, royal marriage, or guarantee as an arc positioned around a circle.
- **FR-002**: System MUST draw one chord per active relationship instance between two rendered arcs, color-coded by a fixed, documented relationship-type legend (not reusing per-country arc colors).
- **FR-003**: System MUST render country arcs using each country's existing in-game color (the same per-country color source used elsewhere in the app) and display its name/tag on or near the arc.
- **FR-004**: System MUST draw a separate chord per relationship type when a country pair has more than one simultaneous active relationship (e.g. allied and married renders two chords, not one merged chord).
- **FR-005**: System MUST support hovering a country's arc to bring only chords touching that country to full opacity while fading all other chords to low opacity, reverting when the hover ends.
- **FR-006**: System MUST support hovering a chord to show a tooltip naming both countries and the relationship type(s) represented by that chord, including the relationship score if one exists for it.
- **FR-007**: System MUST provide independent show/hide toggles for each tracked relationship type (alliance, rivalry, royal marriage, guarantee, military access, food access, fleet basing rights, economic support — widened post-ship, 2026-09-22, explicit user request, see Assumptions); disabling a type removes its chords immediately without a full reload.
- **FR-008**: System MUST NOT render an arc for a country that has zero currently-visible relationships under the active type filters.
- **FR-009**: System MUST default the visible country selection to the save's human-played country/countries (falling back to a small fixed set when none are human-played), with a search-and-add control to bring in any other real country on demand — the same default-selection/`AddCountryInput` pattern already used by Leaderboard, World Goods, and the Societal Compass — and MUST NOT render a relationship unless both of its countries are currently selected.
- **FR-010**: System MUST size chord thickness by relationship score/trust when that data exists for a relationship, and fall back to uniform thickness for relationship types that carry no score.
- **FR-011**: System MUST order arcs around the circle by each country's total active-relationship count under the current filters, most-connected first, since no geographic region/continent grouping exists anywhere in this codebase or its parsed save schema to reuse (confirmed by inspection — building one would be new scope, not a reuse). Relationship-adjacency clustering and/or geographic ordering are deferred to a later iteration.
- **FR-012**: System MUST show an empty-state message, not a blank canvas, when zero relationships are visible under the current filters (whether because the save has none of the tracked types active, or the user's filter selection excludes all existing ones).
- **FR-013**: System MUST provide a "Hugbox Detection" toggle, off by default, that detects clusters of countries directly and mutually allied with every other member of that cluster (a fully-connected alliance core of 3 or more countries).
- **FR-014**: System MUST, for each detected cluster while Hugbox Detection is enabled, evaluate every other visible country not already a core member: a country allied to exactly one cluster member is positioned near that cluster and rendered as an affiliate, visually distinct from full membership; a country allied to two or more members of that cluster is promoted to a full member.
- **FR-015**: System MUST draw a visual boundary/grouping around each detected cluster's full members (core plus promoted) distinguishing them from the rest of the diagram, and MUST visually distinguish affiliate countries from full members.
- **FR-016**: System MUST reposition arcs while Hugbox Detection is enabled so each detected cluster's full members are adjacent to one another on the circle, with affiliate countries positioned near their nearest cluster.
- **FR-017**: System MUST revert to the default relationship-count arc ordering (FR-011) and remove all cluster boundaries when Hugbox Detection is disabled.
- **FR-018**: System MUST assign a country that qualifies for full membership in more than one detected cluster to exactly one cluster (the tie-break rule is defined in Assumptions), and MUST NOT render it as a full member of more than one cluster at once.

### Key Entities *(include if feature involves data)*

- **Diplomatic Relationship**: An active tie between exactly two countries, with a type (alliance, rivalry, royal marriage, or guarantee), the two countries involved, and an optional score/trust value used for chord thickness. Sourced from the save's diplomacy state, not derived or historical — only ties active as of the loaded save's current date are included.
- **Country (diplomacy view)**: A save's country/tag, reusing the same identity, display name, and in-game arc color already established by other features (real, currently-existing countries only — the same "owns territory" filter Leaderboard's country list already applies, so a dead/defunct tag is never offered).
- **Relationship-Type Legend**: The fixed, documented color assigned to each of the eight tracked relationship types, independent of any country's own color.
- **Hugbox Cluster**: A detected group of countries anchored by a fully-mutual alliance core (3+ countries each allied with every other core member), plus any additional countries promoted to full membership by holding alliances with 2 or more cluster members. Recomputed live from the current save's active alliances whenever Hugbox Detection is enabled.
- **Cluster Affiliate**: A country allied with exactly one member of a detected cluster; positioned near that cluster but not enclosed in its visual boundary and not counted as a cluster member for arc-grouping purposes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A player can identify every country allied to a given country within 5 seconds of hovering its arc, without needing to consult any other screen.
- **SC-002**: The diagram remains legible (no fully-overlapping unreadable arc labels, no indistinguishable chord tangle at default settings) on a save with 100+ countries when only the default human-played selection is shown.
- **SC-003**: Toggling any relationship-type filter updates the visible chords and arcs in under 1 second, with no full-page reload.
- **SC-004**: Countries with zero active tracked relationships never appear as isolated, chord-less arcs in the default view.
- **SC-005**: A player can identify which countries form a mutual alliance bloc, and which countries are only loosely (single-tie) connected to it, within 5 seconds of enabling Hugbox Detection, without manually cross-referencing individual chords.

## Assumptions

- The four relationship types explicitly named in the original brief (alliance, rivalry, royal marriage, guarantee) were the initial v1 scope. **Superseded post-ship, 2026-09-22 (explicit user request)**: widened to eight — military access, food access, fleet basing rights, and economic support were added, each confirmed to carry the same `first`/`second`/`start_date` shape as the original four (research.md §8, data-model.md). Subject/dependency relationships (vassal/tributary/colonial_nation/fiefdom/tributary/trade_company/pronoia/state_bank/dominion/secessionists — the full enumerated set, research.md §8) remain out of scope: structurally different (a `subject_type`, not a bilateral treaty) and a bigger design question than a filter-set widening. "War" (attacker/defender from the separate `wars` table) was raised and explicitly deferred, not added — a directed relationship from a different data source entirely, needing its own follow-up decision.
- Relationship score/trust in the underlying save data is directional (a country's view of another need not match the reverse), so where a score exists for only one direction, that value is used; where both directions have a value, chord thickness uses their average. This is an implementation-level default, not user-facing behavior that needs to be configurable in v1.
- The default country selection and its search-and-add control reuse `computeDefaultSelection`/`AddCountryInput` unchanged (the exact same functions Leaderboard/World Goods/Societal Compass already use) — no new "major powers by development" ranking or separate show-all toggle exists in this feature (course-corrected mid-implementation, explicit user request: "you only need to show countries that are players, but the option to add more countries will be done similarly to how we do everything else").
- A visible relationship requires **both** countries to be currently selected (not "at least one," which was considered and rejected mid-implementation as pulling in countries the player never asked to see) — the diagram only ever shows the diplomatic web among the countries the player has explicitly selected/added.
- This is a read-only, snapshot view of the currently loaded save's diplomatic state — no historical/time-series playback of how relationships changed over the game is in scope.
- The relationship-type legend's specific colors are a v1 implementation/design decision (e.g. blue = alliance, red = rivalry, gold = royal marriage, green = guarantee), not a product requirement pinned by this spec, as long as they are fixed, documented, and distinct from any country arc color.
- Arc order is decided v1: most-connected-first by active-relationship count (see FR-011), not by geography. Adjacency-clustering and/or a real geographic ordering are explicitly out of scope for this iteration and left for later.
- Hugbox Detection clustering considers alliance ties only (matching the brief's own example), not rivalry, royal marriage, or guarantee ties; a country's full-membership or affiliate status is judged purely by its alliance count into that cluster.
- A detected cluster requires a fully-mutual alliance core of at least 3 countries; a single mutually-allied pair with no further affiliates is not treated as a "hugbox" and remains an ordinary chord.
- When a country would qualify as a full member of two or more clusters simultaneously, it is assigned to the cluster it holds the most alliance ties to; ties in tie-count are broken by assigning to the cluster with the larger core (most existing full members), and if still tied, by lowest country tag alphabetically — an arbitrary but deterministic and stable choice.
- Hugbox Detection is an optional overlay/toggle, off by default, layered on top of the diagram established in User Stories 1-3; enabling it overrides the FR-011 relationship-count arc ordering for as long as it stays enabled.
