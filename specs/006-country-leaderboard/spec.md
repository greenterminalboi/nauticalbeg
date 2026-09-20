# Feature Specification: Country Leaderboard

**Feature Branch**: `006-country-leaderboard`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "time for feature 06, this going to be the first leaderboard feature, the landing page basically two line graphs that both represent historical data for every country, a user can select which countries they want on the bar graphs through a search bar overlay. I believe wealth and population of a country are historically tracked within the save file so lets pull it and propagate it on both graphs" (plus follow-up: "oh and the color for each line is tied to the countries rgb")

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See history at a glance on load (Priority: P1)

A user loads a save and opens the new Leaderboard landing page. Without
doing anything else, they immediately see three line graphs — population,
economic base, and tax base — each plotting a meaningful default set of
countries across the full span of the campaign's history, so the page
delivers value before any interaction.

**Why this priority**: This is the entire point of a "landing page" —
if it needs setup before it shows anything useful, it isn't one. It's
also the smallest fully independent slice: a static default view proves
the data pipeline and all three charts work end-to-end.

**Independent Test**: Load a save, navigate to the Leaderboard section,
and confirm all three graphs render non-empty historical lines for more
than one country without touching the search overlay.

**Acceptance Scenarios**:

1. **Given** a save is loaded, **When** the user opens the Leaderboard
   section, **Then** the population graph, economic base graph, and tax
   base graph all render, each showing multiple countries' lines
   spanning from the campaign's start date to the save's current
   in-game date.
2. **Given** the Leaderboard section is open, **When** the user looks at
   either graph, **Then** each country's line uses that country's actual
   in-game map color, and a country with no confirmed in-game color uses
   the app's existing neutral fallback color rather than a fabricated one.
3. **Given** no save is loaded, **When** the user opens the Leaderboard
   section, **Then** the page shows an empty/placeholder state directing
   them to load a save, instead of blank or broken graphs.

---

### User Story 2 - Choose which countries to compare (Priority: P2)

A user wants to compare specific countries — e.g. their own nation
against a rival — rather than whatever the page shows by default. They
open a search bar overlay, find countries by name or tag, and toggle
them on or off all three graphs.

**Why this priority**: This is what makes the page a *comparison* tool
instead of a fixed report. It depends on User Story 1 (the graphs and
data must already exist) but is independently testable once that's in
place.

**Independent Test**: With the Leaderboard section open, use the search
overlay to add a country not currently shown, confirm its line appears
on all three graphs, then remove a shown country and confirm its line
disappears from all three.

**Acceptance Scenarios**:

1. **Given** the search bar overlay is open, **When** the user types
   part of a country's name or tag, **Then** matching countries appear
   in the results, limited to countries that actually exist in the save
   (no empty/placeholder country slots).
2. **Given** a country is not currently selected, **When** the user
   selects it in the search overlay, **Then** its line appears on the
   population, economic base, and tax base graphs, using its in-game
   color.
3. **Given** a country is currently selected, **When** the user
   deselects it in the search overlay, **Then** its line is removed from
   all three graphs.

---

### User Story 3 - Explore a stretch of history closely (Priority: P3)

A user wants to inspect a specific stretch of the centuries-long range
more closely — a particular war-torn decade, say — rather than reading
values off a fully-zoomed-out line spanning the whole campaign. They
zoom in on a graph and pan around within it, independently per graph.

**Why this priority**: Nice-to-have precision on top of an already
useful default (User Story 1 already shows full-history lines with
hover detail). Independently testable and safely deferrable without
blocking the core leaderboard experience.

**Independent Test**: With the Leaderboard section open and countries
selected, zoom in on one graph and confirm its visible range narrows;
drag to pan within the zoomed view; reset to return to the full range.

**Acceptance Scenarios**:

1. **Given** a graph showing its full historical range, **When** the
   user zooms in on a point on a line, **Then** the graph's visible
   year/value range narrows around that point.
2. **Given** a graph is zoomed in, **When** the user drags within it,
   **Then** the visible range pans to follow the drag, without
   affecting any other graph's zoom/pan state.
3. **Given** a graph is zoomed in, **When** the user activates a reset
   control, **Then** the graph returns to showing its full historical
   range.

---

**Revision note (2026-09-20, during implementation)**: this story
originally described a toggle for switching the wealth graph between
Economic Base and Tax Base. Per direction received during
implementation, that toggle was replaced with a simpler, more directly
useful design: **all three tracked metrics — population, economic
base, and tax base — are shown as three always-visible graphs**, never
requiring a switch (see FR-002/FR-004/FR-009 below, and data-model.md/
tasks.md for the corresponding implementation change). This story was
repurposed for the zoom/pan capability added in the same round of
direction, rather than left describing a control that no longer
exists.

### Edge Cases

- A country that didn't exist yet at the start of the historical range
  (formed partway through the campaign, e.g. via a revolution or a
  colonial nation founding) has leading zero-valued history entries for
  the years before it existed — these must not be plotted as a flat
  zero-population/zero-wealth line stretching back centuries, since that
  misrepresents a country as existing when it didn't.
- A country that ceased to exist partway through the campaign (annexed,
  released and reconquered, etc.) should not have its line silently
  continue flat to the present; the line's end is a signal, not a gap
  to be filled in.
- The search overlay must exclude the save's placeholder/unformed
  country slots (the sparse "none"/dummy tag slots already known from
  other Encyclopedia work) — only countries with a real tag and name
  are selectable.
- Selecting a very large number of countries at once (in principle, all
  real countries in the save) produces a graph with many overlapping
  lines; the page must remain usable (interactions still work, browser
  doesn't hang) even if readability degrades.
- Two selected countries whose in-game colors are visually identical or
  near-identical are still both shown with their real colors — no
  attempt is made to auto-differentiate colors that happen to collide.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide a Leaderboard page, reachable from
  the app's existing navigation as a real, working page rather than a
  "coming soon" stand-in.
- **FR-002**: The Leaderboard MUST provide three pages, one per metric
  the save tracks over time — Population, Economic Base, and Tax Base —
  reachable via the Leaderboard's own side navigation, all sourced from
  the currently loaded save's per-country historical data. *(Revised
  twice during implementation: first from a single page's worth of
  metric-toggle into three always-visible stacked graphs — see User
  Story 3's revision note — then, once each page also gained Ranking
  Table and Treemap views (FR-015), from three stacked graphs into
  three separate pages, one per metric.)*
- **FR-003**: Each page's Graph view MUST cover the full historical
  range available in the loaded save — from the campaign's start
  through the save's current in-game date — not just a recent window,
  unless the user has zoomed in (User Story 3), in which case the
  zoomed range applies to that page's graph only.
- **FR-004**: Each page's active view (FR-015) MUST reflect the same
  set of currently selected countries; selection is shared across all
  three metric pages and all three views within a page — never
  independent per page or per view.
- **FR-005**: Each country's line (Graph view) or box (Treemap view)
  MUST be rendered in that country's actual in-game map color. A
  country with no confirmed in-game color MUST use the app's existing
  neutral fallback color, never a fabricated one (consistent with the
  Map Visualization feature's existing rule).
- **FR-006**: The Leaderboard page MUST provide a search bar overlay
  that lets the user find countries by name or tag and toggle each one
  on or off both graphs.
- **FR-007**: The search overlay MUST list only countries that actually
  exist in the loaded save (real tag and name), excluding the save's
  placeholder/unformed country slots.
- **FR-008**: On first opening the Leaderboard page (before the user has
  used the search overlay), the page MUST show all three graphs
  pre-populated with every country currently marked as human-played in
  the loaded save, rather than empty charts. If the save has no
  human-played country recorded, the page MUST fall back to some other
  non-empty, meaningful default set of countries rather than showing
  empty graphs.
- **FR-009**: *(superseded during implementation — see User Story 3's
  revision note)* Originally: a switchable wealth-metric control.
  Replaced by FR-002: economic base and tax base are both always shown
  as their own graphs instead.
- **FR-010**: For any country/year where the underlying historical value
  represents "the country did not yet exist" rather than a real zero
  value, the line MUST NOT be drawn for that portion of the range.
- **FR-011**: If no save is loaded, the Leaderboard page MUST show an
  empty/placeholder state directing the user to load a save, rather than
  blank or errored graphs.
- **FR-012**: Inspecting a point on any graph MUST reveal the country,
  the year, and the value at that point, displayed at/near the point
  itself rather than in a separate fixed status area (revised during
  implementation for discoverability).
- **FR-013**: Each graph MUST support zooming in/out and panning
  independently of the other graphs, and MUST provide a way to reset
  back to the full historical range (User Story 3).
- **FR-014**: Each graph's axes MUST show multiple intermediate tick
  labels (not just the range's two endpoints), so intermediate
  years/values can be read directly off the graph.
- **FR-015**: *(Added during implementation, stretch goal.)* Each
  metric page MUST offer three interchangeable views — Graph, Ranking
  Table, and Treemap — switchable via controls on the page; exactly one
  is shown at a time, defaulting to Graph.
- **FR-016**: The Ranking Table view MUST list each currently selected
  country's latest available value for the page's metric, sorted
  descending, alongside its numeric rank (1, 2, 3, ...). A country with
  no recorded value ranks last and shows no fabricated rank or value.
- **FR-017**: The Treemap view MUST show one box per currently selected
  country that **currently exists** — defined as: has a recorded value
  for the page's metric as of the save's latest year, AND currently
  owns at least one location (a country that has been annexed/destroyed
  no longer counts, even if `country_type` still marks it "Real" —
  research.md §4/tasks.md's post-implementation addendum found this
  distinction necessary: most of a save's country records are
  long-defunct historical tags, not currently-alive nations) — plus one
  additional box, visually distinct (the app's neutral grey), labeled
  "Other," summing every other currently-existing real country's latest
  value. Each box's area MUST be exactly proportional to its value's
  share of the combined total across every box.
- **FR-018**: Inspecting a Treemap box MUST reveal that box's country
  (or "Other"), its value, and its percentage share of the combined
  total.

### Key Entities

- **Country**: A nation as it exists in the loaded save — tag, display
  name, and in-game map color (RGB). Already tracked by the app from
  prior features; the Leaderboard reuses this identity, not a new one.
- **Yearly Country Metric**: One country's value for one tracked metric
  (population, economic base, or tax base) in one campaign year, derived
  from that country's historical time series in the save. This is the
  data point each graph plots; a full line is this entity across every
  year in the historical range for one country and one metric.
- **World Metric Total** *(added during implementation, Treemap
  stretch goal)*: for one metric, the sum of the latest recorded value
  across every currently-existing real country (FR-017's definition) —
  the denominator the Treemap's box areas are shares of. Not stored;
  computed from the same per-country latest values the Treemap already
  needs for its individual boxes plus the "Other" bucket.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can locate a specific country and have it appear
  across every metric page and view, starting from the search overlay,
  in under 15 seconds.
- **SC-002**: On first opening the Leaderboard page after a save is
  loaded, its default Graph view displays historical data spanning the
  full campaign history without any additional user action.
- **SC-003**: Every country listed in the search overlay is a real,
  formed nation in the loaded save — zero placeholder/unformed entries
  appear in search results.
- **SC-004**: Zooming in on a graph narrows its visible range with no
  perceptible delay (under 1 second), and resetting returns it to the
  full range just as fast.
- **SC-005**: Adding or removing a country via the search overlay is
  reflected across every metric page and view simultaneously, with no
  manual refresh step.
- **SC-006** *(added during implementation, Treemap stretch goal)*: A
  Treemap's box areas sum to exactly the page's World Metric Total —
  no country's share is over- or under-represented, and a country that
  has ceased to exist (no longer owns territory) never contributes to
  "Other," even if it still has old recorded values in the save.

## Assumptions

- The loaded save file's own historical data is sufficient on its own:
  each country's population, economic base, and tax base are already
  tracked as one value per campaign year, from the campaign's start
  through the save's current date, within a single save file. This
  feature does not require accumulating data across multiple save
  uploads over time — confirmed against a real save file, whose
  per-country historical arrays run ~293 entries, consistent with one
  entry per year across the game's centuries-long span.
- The save file has no historical treasury/gold time series (only a
  current-value snapshot). "Wealth" is therefore represented by the two
  economic time series the save does track — economic base and tax
  base — each shown as its own always-visible graph (FR-002) rather
  than a single hard-coded "wealth" field or a switch between them
  (revised during implementation from an earlier toggle-based design —
  see User Story 3's revision note).
- "Landing page" refers to the app's existing "Leaderboard" navigation
  item (under its Encyclopedia section, since renamed to "Factbook" on
  2026-09-20 — the section now literally called "Encyclopedia" is a
  different, separate one, added at the same time), which today renders
  only a "coming soon" placeholder — this feature is what fills that
  reserved slot in with a real page, not a new top-level navigation
  section.
- Line color reuses each country's in-game map color as already
  resolved and stored by the app's existing Map Visualization feature,
  including its neutral-fallback rule for countries with no confirmed
  color — this feature does not introduce a new color source.
- The default country selection shown before any search interaction
  (FR-008) is every country marked as human-played in the save — the
  save already records this (a single "current player" flag, and,
  for saves with more than one human player across the campaign, a
  per-human-player record naming which country each one controls).
  The exact fallback for a save with no recorded human player at all is
  an implementation choice, so long as it remains non-empty.
- Distinguishing "country didn't exist yet" from "a real zero value" for
  a given historical entry (FR-010, edge cases) is a data-interpretation
  detail to be worked out against the save's actual field semantics
  during planning/implementation, not a business rule the user needs to
  approve.
