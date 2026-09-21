# Feature Specification: Production, Trade & Markets

**Feature Branch**: `007-production-trade-markets`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "so I want more insight into production, trade, markets and what not and this update will focus on that."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See world goods and markets at a glance (Priority: P1)

An analyst loads a save and opens the Markets page. Without selecting
anything, they immediately see two things: a world goods overview
listing every tradeable good with its total world production, and a
list of every market in the save. This proves the data pipeline works
end to end and gives the page value before any interaction, matching
how this app's other save-wide browsers (Wars, Leaderboard) already
behave.

**Why this priority**: Smallest fully independent slice that proves
real save data — not a mock — is flowing into a usable page. Every
later story (drilling into a market, charting a good's price) depends
on this list existing first.

**Independent Test**: Load a save, navigate to Factbook → Markets, and
confirm both the world goods overview and the market list render
non-empty, real data without touching any control.

**Acceptance Scenarios**:

1. **Given** a save is loaded, **When** the user opens the Markets
   page, **Then** a world goods overview appears listing every
   tradeable good with its total world production for the loaded save.
2. **Given** a save is loaded, **When** the user opens the Markets
   page, **Then** a list of every market in the save appears, each
   entry showing a display name and how many locations belong to it.
3. **Given** no save is loaded, **When** the user opens the Markets
   page, **Then** the page shows an empty/placeholder state directing
   them to load a save, instead of blank or broken content.

---

### User Story 2 - Drill into one market's goods (Priority: P2)

An analyst wants to understand why a particular region is short on a
good, or how well it's supplied. They select a market from the list
and see, for every good that market trades: its current price, total
supply, total demand, stockpile, and whether the market is a net
importer or exporter of it — plus what's driving supply (raw materials
vs. buildings vs. trade) and demand (population consumption, trade,
building upkeep, unit upkeep, construction).

**Why this priority**: This is the actual analytical payoff — moving
from "here are some markets" to "here's why this market's iron price
is high." Depends on User Story 1's list existing, but is independently
testable once a market can be selected.

**Independent Test**: With the Markets page open, select a market from
the list and confirm its full per-good table renders with price,
supply, demand, stockpile, and import/export status for every good it
actually trades.

**Acceptance Scenarios**:

1. **Given** the market list is visible, **When** the user selects a
   market, **Then** a per-good breakdown table for that market appears,
   one row per good the market actually trades.
2. **Given** a market's per-good table is open, **When** the user
   inspects a good's row, **Then** its supply is broken down by source
   (raw materials, buildings, trade) and its demand by consumer
   (population, trade, building upkeep, unit upkeep, construction).
3. **Given** a market's per-good table is open, **When** a good is not
   traded in that market at all, **Then** that good does not appear as
   a zero-value row implying participation — it is simply absent, or
   shown as clearly "not traded here."

---

### User Story 3 - See a good's price trend over time (Priority: P3)

An analyst wants to know whether a good's price in a market has been
rising or falling, not just its current snapshot. Selecting a good
within a selected market reveals its price history as a chart, with
the ability to inspect the exact price at any recorded point.

**Why this priority**: Adds trend context on top of the already-useful
per-good snapshot (User Story 2). Independently testable and safely
deferrable without blocking the core market-browsing experience.

**Independent Test**: With a market selected, pick a good from its
per-good table and confirm a price history chart renders using only
the price points actually recorded in the save, with hover/inspect
revealing the exact value at a point.

**Acceptance Scenarios**:

1. **Given** a market's per-good table is open, **When** the user
   selects a good, **Then** a chart of that good's recorded price
   history renders for that market.
2. **Given** a price history chart is open, **When** the user inspects
   a point on the line, **Then** the exact price and its position in
   the recorded history are revealed at/near that point.
3. **Given** a good has a short recorded price history (e.g. a good
   newly produced partway through the campaign), **When** its chart
   renders, **Then** it shows only the real recorded points, not
   fabricated or extrapolated ones filling out a longer range.

### Edge Cases

- A market with no resolvable center location (the save's own data is
  sparse here — several market fields are only sometimes present) must
  still appear in the list, using a neutral fallback label instead of a
  fabricated name.
- A good with zero total world production still appears in the world
  goods overview rather than being silently dropped.
- A good traded in only one or two markets must not skew a
  world-level price comparison presented as if it reflected broad
  availability — any world-level price figure shown MUST make clear
  how many markets it's drawn from.
- A market's per-good price history is shorter than another market's
  for the same good (the good started being tracked later in that
  market) — the chart reflects only the real range for that specific
  market/good pair.
- A very large number of markets (~180+) or goods (~80) in their
  respective lists must remain usable — sortable/searchable, not an
  unsorted wall of rows.
- A market whose member-location count is exactly one is still a valid
  market, not an error state.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide a Markets page, reachable from
  Factbook's existing "Markets" navigation item, as a real, working
  page rather than a "coming soon" stand-in.
- **FR-002**: On opening the Markets page with a save loaded, the page
  MUST show, without requiring any selection: (a) a world goods
  overview listing every tradeable good with its total world
  production, and (b) a list of every market recorded in the save.
- **FR-003**: Each entry in the market list MUST show a display name
  and how many locations belong to that market. A market with no
  resolvable name MUST use a neutral fallback label, never a
  fabricated one.
- **FR-004**: Selecting a market MUST show a per-good breakdown table
  for that market, listing only goods that market actually trades —
  each row showing current price, total supply, total demand,
  stockpile, and whether the market is currently importing or
  exporting that good.
- **FR-005**: Inspecting a good's row within a selected market's
  breakdown MUST reveal the components behind its supply (raw
  materials, buildings, trade) and its demand (population consumption,
  trade, building upkeep, unit upkeep, construction).
- **FR-006**: A good not traded in a given market MUST NOT appear as a
  zero-value row in that market's breakdown; it is either omitted or
  clearly marked as not traded there.
- **FR-007**: Selecting a good within a selected market MUST reveal
  that good's recorded price history as a chart, covering only the
  range of data actually present in the save for that market/good
  pair.
- **FR-008**: Inspecting a point on a price history chart MUST reveal
  the exact price and its position in the recorded history at/near
  that point.
- **FR-009**: The world goods overview and the market list MUST both
  support sorting and text search/filtering, given their expected
  scale (dozens of goods, well over a hundred markets in a typical
  save).
- **FR-010**: If no save is loaded, the Markets page MUST show an
  empty/placeholder state directing the user to load a save, rather
  than blank or errored content.
- **FR-011**: Any value the app cannot confirm from the save (a field
  genuinely absent for that market/good, as opposed to a confirmed
  zero) MUST be presented as missing/unavailable, never as a
  fabricated number.

### Key Entities

- **Market**: One of the save's trade regions — a group of locations
  sharing a common goods pool. Attributes: a display name (derived from
  its representative location, since the save itself carries no market
  display name), its member locations, and overall capacity.
- **Market Good**: One good's standing within one market — current
  price, total supply, total demand, stockpile, surplus/deficit, and
  whether the market currently imports or exports it. Supply
  decomposes into raw materials / buildings / trade; demand decomposes
  into population consumption / trade / building upkeep / unit upkeep
  / construction. A market only has a Market Good entry for a good it
  actually trades.
- **Good**: One of the save's fixed catalog of tradeable goods (e.g.
  iron, horses, silk). The save exposes goods only by their internal
  key, not a display name — surfaced as-is, consistent with how this
  app already surfaces other un-localized save keys elsewhere.
- **Price History Point**: One recorded price for one Market Good at
  one point in the save's tracked history. A full price history is
  this entity across every recorded point for one market/good pair.
- **World Production Total**: One good's total production summed
  across the entire save (not per-country, not per-market) — the
  figure the world goods overview lists per good.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can go from opening the Markets page to viewing a
  specific market's full per-good breakdown in 3 clicks or fewer.
- **SC-002**: On first opening the Markets page with a save loaded, the
  world goods overview and market list both display real data with no
  additional user action.
- **SC-003**: Every price history chart renders using only price
  points actually present in the save for that market/good pair — zero
  interpolated or extrapolated points.
- **SC-004**: Sorting or searching the market list or the world goods
  overview returns results with no perceptible delay (under 1 second),
  even at full scale (~180+ markets, ~80 goods).
- **SC-005**: A market's per-good breakdown never lists a good that
  market doesn't actually trade, and never shows a fabricated value for
  data the save doesn't confirm.

## Assumptions

- Scope is the save-wide **Markets** page already reserved in this
  app's navigation (Factbook → Markets, currently a placeholder) —
  this feature fills that page in, consistent with the app's existing
  documented intent that Markets is a save-wide reference browser like
  Wars and Leaderboard, not nested under a single selected country.
- A market's display name is derived from its representative location
  (the same location-naming approach the app's Map feature already
  uses), since the save itself never gives a market its own display
  name.
- Goods are shown under their raw internal save key (e.g. `iron`,
  `fiber_crops`), not a prettified display name — this app has no
  access to the game's localization strings, matching the existing
  precedent set by Wars' raw war-name keys.
- **Cross-border trade routes/trade companies** (separate save
  sections from markets, tracking a country's own established trade
  paths) are **out of scope** for this feature. That data exists in
  the save but is far sparser and less consistently populated than
  market/goods data, and its exact real-world meaning isn't yet
  confirmed to the same confidence — a candidate for a future,
  separately-researched feature rather than guessed at here.
- "Trade" insight for this feature comes from the trade component
  already broken out within each Market Good's supply/demand figures
  (FR-005), not from separate trade-route lines on a map.
- Per-country production/trade detail (the still-unbuilt "Economy" and
  "Trade" categories under Factbook → Countries) is a separate,
  future slice — this feature's Markets page is save-wide, not
  nation-scoped, matching FR-001's placeholder page exactly.
- Price history charting uses Apache ECharts (updated 2026-09-20, during
  planning, per explicit direction: this feature is also the vehicle for
  switching the app's charting/visualizations to ECharts, while
  `@perspective-dev/*` remains the data-grid/table library). This
  supersedes the original hand-rolled-SVG assumption below and also covers
  retrofitting the existing Leaderboard feature's chart and treemap onto
  ECharts as part of this feature — see plan.md's Complexity Tracking and
  research.md §3 for the justified-dependency rationale.
