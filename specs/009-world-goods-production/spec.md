# Feature Specification: World Goods Production Share

**Feature Branch**: `009-world-goods-production`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "World Goods becomes its own page under the
Markets tab. Add a production-share treemap: selecting a good shows one
box per country, sized by that country's share of world production for
that good. Scoped to the 52 of 71 tradeable goods with real per-province
production data; the remaining 19 manufactured goods are a planned
future feature, not silently dropped."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - World Goods as its own page (Priority: P1)

An analyst currently sees the world goods list buried at the top of the
combined Markets page. They want it as its own destination, matching how
this app's other multi-view sections (Leaderboard) already separate
their views instead of stacking everything on one screen.

**Why this priority**: A prerequisite for User Story 2, and independently
useful on its own — a dedicated page is easier to navigate to and gives
the list room to breathe.

**Independent Test**: From the Markets section, navigate to the World
Goods page and confirm the existing goods-and-world-totals list renders
there, sortable and searchable, with the Markets list living on its own
separate page.

**Acceptance Scenarios**:

1. **Given** a save is loaded, **When** the user opens the Markets
   section, **Then** World Goods and Markets are two separate,
   switchable pages, not one combined view.
2. **Given** the World Goods page is open, **When** the user inspects
   it, **Then** it shows the same good/world-total list this app
   already has, with sort and search intact.

---

### User Story 2 - See a good's production share by country (Priority: P2)

An analyst wants to know who actually produces a given good. Selecting
a good on the World Goods page reveals a treemap: one box per producing
country, sized by that country's share of the good's production.

**Why this priority**: This is the actual analytical payoff the request
is about — moving from "here's the world total" to "here's who makes
it." Depends on User Story 1's page existing, independently testable
once a good can be selected.

**Independent Test**: On the World Goods page, select a good that has
production-share coverage and confirm a treemap renders with one box
per country that produces it, each sized by real share and colored by
that country's real color where confirmed.

**Acceptance Scenarios**:

1. **Given** the World Goods page is open, **When** the user selects a
   good with production-share coverage, **Then** a treemap renders with
   one box per country that produces any of that good.
2. **Given** a production-share treemap is open, **When** the user
   inspects a country's box, **Then** its name, production amount, and
   exact percentage share are revealed — not just relative box size.
3. **Given** the World Goods list is visible, **When** the user looks at
   it without clicking into any single good, **Then** they can tell
   which goods have a production-share breakdown available and which
   don't, without trial-and-error clicking.
4. **Given** the user selects a good with no production-share coverage,
   **When** the treemap would normally render, **Then** the page shows
   a clear "not available for this good yet" message instead of a blank
   or fabricated treemap.

### Edge Cases

- A good has zero recorded production from any country (e.g. a niche
  good with no active RGOs this campaign) — the treemap shows a real
  "no production recorded" state, not a blank chart.
- A country that produces none of the selected good does not appear as
  a zero-value box.
- Some of a good's production comes from provinces with no real-country
  owner (unclaimed territory, or a non-"Real" owner like Pirates/rebels)
  — that share is represented honestly, grouped into a clearly labeled
  bucket distinct from any individual country's box, never silently
  dropped and never folded into a real country's own share.
- A commonly-produced good (e.g. grain, fish) can have dozens of
  producing countries — the treemap stays legible by grouping smaller
  producers into one combined bucket rather than rendering illegibly
  tiny individual boxes for each.
- A country with no confirmed in-game color still gets a box, using this
  app's existing neutral-color fallback, never a fabricated color.
- One of the 19 manufactured goods without coverage is selected — see
  Acceptance Scenario 4 above; this is the expected, permanent state for
  those goods until a future feature adds building-level attribution,
  not a bug to work around.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: World Goods MUST be reachable as its own page under the
  Markets section's navigation, separate from the Markets (market list
  and drill-down) page.
- **FR-002**: The World Goods page MUST show the existing good/world-total
  list — every tradeable good with its total world production — with
  sort and search, matching current behavior.
- **FR-003**: Selecting a good with production-share coverage MUST show
  a treemap: one box per country that produces any of that good, sized
  by that country's share of the good's production the app can
  attribute to countries.
- **FR-004**: Selecting a good with no production-share coverage MUST
  show an explicit "not available for this good yet" message, never a
  blank or fabricated treemap.
- **FR-005**: The World Goods list MUST visually distinguish, without
  requiring a click into each good, which goods have a production-share
  breakdown available and which don't.
- **FR-006**: Each country's box MUST use that country's real in-game
  color where confirmed, falling back to this app's existing neutral
  color convention otherwise — never a fabricated color.
- **FR-007**: A country with zero production of the selected good MUST
  NOT appear as a box.
- **FR-008**: Production attributable to no real country (unclaimed
  territory, or owned by a non-"Real" country type) MUST be represented
  as a distinct, clearly labeled bucket — never dropped, and never
  merged into a real country's own share.
- **FR-009**: At typical scale (dozens of producing countries for a
  common good), the treemap MUST remain legible by grouping smaller
  producers into one combined bucket rather than one box per country
  regardless of size.
- **FR-010**: Inspecting a country's box MUST reveal its name,
  production amount, and exact percentage share.

### Key Entities

- **Country Good Production Share**: One country's standing for one
  good — its summed production (from every province it owns) and its
  share of that good's total attributable production. Only exists for
  goods with production-share coverage (see Assumptions) and only for
  countries with nonzero production of that good.
- **Unattributed Production**: The portion of a good's summed production
  coming from provinces with no real-country owner — a single bucket,
  not broken down further, kept visually distinct from any country's
  own share.
- **Good** (extends the definition from `007-production-trade-markets`):
  gains a derived attribute, whether it has production-share coverage
  (see Assumptions) — true for 52 of the save's 71 tradeable goods.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From the World Goods page, a user can see any covered
  good's country-production-share treemap in one click (selecting the
  good).
- **SC-002**: A user can tell which goods have a production-share
  breakdown, and which don't, from the World Goods list alone — zero
  clicks required to find out.
- **SC-003**: No treemap ever shows a country with zero recorded
  production of the selected good as a box.
- **SC-004**: Every good's actual page behavior (breakdown renders vs.
  "not available") matches its real save-data coverage — zero
  mismatches between what the list indicates and what selecting the
  good actually shows.

## Assumptions

- Scope is exactly the 52 of the save's 71 tradeable goods covered by
  `provinces.database.*.last_month_produced.<good>` — confirmed present
  in the real save's inventory, keyed by the same good vocabulary as
  the world-totals figure `007-production-trade-markets` already
  surfaces. These are the raw-material/RGO outputs (e.g. clay, iron,
  wool, fish, wheat).
- **The remaining 19 goods (cannons, cloth, firearms, tools, furniture,
  paper, weaponry, masonry, tar, leather, glass, jewelry, pottery,
  liquor, beer, books, naval_supplies, slaves_goods, fine_cloth) are
  manufactured/building outputs, not raw-province production, and are
  explicitly a planned future feature, not abandoned** — attributing
  them per-country would require ingesting `building_manager`
  (138,516 rows in the reference save), which `007-production-trade-markets`
  already excluded on size/scope grounds. This feature's job is to make
  that gap visible and honest (FR-004/FR-005), not to silently pretend
  those 19 goods don't exist.
- A country's production share is computed by summing
  `last_month_produced.<good>` across every province that country
  currently owns — the same "current owner" signal this app's map and
  leaderboard features already treat as authoritative for "who holds
  this territory now."
- World Goods and Markets become two switchable pages under one Markets
  section, mirroring the multi-page pattern Leaderboard (006) already
  established, rather than one page with everything stacked.
- Visualization reuses this app's existing ECharts treemap approach
  (established in `007-production-trade-markets`'s Leaderboard
  retrofit) — literal per-country RGB per box, no new charting
  dependency.
