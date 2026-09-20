# Feature Specification: Game Encyclopedia

**Feature Branch**: `008-game-encyclopedia`

**Created**: 2026-09-20

**Status**: Draft

**Input**: User description: "so I want more insight into production, trade, markets and what not and this update will focus on that" (initial framing), then "in addition were also going to scrape enclopedia from the base game files and do a 1 to 1 recreation and put the recreated files in our own eclopedia that we can we use for reference going forward" and "okay lets do the game enclopedia first because well need that, it serves as good information onto game mechanics and how everything in general works" (reordered to run first; full-catalog scope confirmed over a trade/production-only slice), then "dlc content is included" (owned-DLC content is in scope alongside base game, not excluded).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Look up Economy & Production reference entries (Priority: P1)

A user wants to know what a good, building, or production method actually
does — its real name, what it costs, what it produces, what category it
belongs to — without alt-tabbing into the game. They open the app's
Encyclopedia section, land on its "Economy & Production" group, and browse
or look up an entry (e.g. the good "Horses", the building "Academy of
Sciences") to see its real display name, description (when the game
provides one), and its recorded mechanical values, sourced from the base
game's own files rather than guessed or invented.

**Why this priority**: This is the slice the app needs immediately — the
planned Production, Trade & Markets feature needs real names and mechanics
for goods, buildings, and production methods to be useful, and this group
alone proves the whole scrape → store → browse pipeline end to end on
real, verifiable data. Every later story reuses this same mechanism.

**Independent Test**: Open the Encyclopedia section, navigate to Economy &
Production, and confirm goods, building categories, building types,
production methods, prices, and pop types all list real entries with real
display names (not raw internal keys, except where the game itself has no
localized name for that entry).

**Acceptance Scenarios**:

1. **Given** the Encyclopedia has been generated from the base game's
   files, **When** the user opens Economy & Production, **Then** they see
   browsable lists for goods, building categories, building types,
   production methods, prices, and pop types.
2. **Given** an entry exists in one of those lists, **When** the user
   opens it, **Then** its real display name and description appear (when
   the base game provides one for that key), plus its recorded numeric/
   mechanical fields exactly as the game files state them.
3. **Given** an entry's internal key has no localized name in the base
   game's files, **When** the user opens it, **Then** the raw internal key
   is shown as-is instead of a fabricated or guessed display name.

---

### User Story 2 - Browse the rest of the game's reference catalog (Priority: P2)

Having proven the pipeline on Economy & Production, the same mechanism
extends to the game's remaining reference categories — grouped for
browsing into Government & Society (government types, reforms, laws,
estates, policies, institutions, parliament, and similar), Culture,
Religion & Characters (cultures, religions, traits, ethnicities,
languages, and similar), Military & Diplomacy (unit types, casus belli,
wargoals, subject types, and similar), and World & Events (missions,
disasters, diseases, situations, and similar) — so the Encyclopedia
becomes a genuinely complete, browsable recreation of the game's own
reference material, not just the economic slice. Content added by owned
DLC is included throughout every domain group alongside base-game
content (not confined to this story), each entry clearly labeled with
which of the two it comes from.

**Why this priority**: Delivers the "1:1 recreation... for reference
going forward" the user actually asked for, once the mechanism proven in
User Story 1 exists. It is additive coverage over the same pipeline, not
new mechanics, so it is safely sequenced after the higher-value economic
slice.

**Independent Test**: With the Encyclopedia already populated per User
Story 1, confirm each of the four remaining domain groups lists real
entries for its member categories, and that every reference category
present in the base game's files is accounted for somewhere — either
browsable in one of the five groups, or explicitly recorded as
deliberately excluded (never silently missing).

**Acceptance Scenarios**:

1. **Given** the Encyclopedia has been generated, **When** the user opens
   any of Government & Society, Culture/Religion/Characters, Military &
   Diplomacy, or World & Events, **Then** they see browsable lists for
   that group's member categories with real display names.
2. **Given** the full set of reference categories present in the game's
   files (base game and owned DLC alike), **When** the Encyclopedia is
   generated, **Then** every category is either browsable in one of the
   five domain groups or appears on a documented exclusion list — none
   are simply absent with no record of the decision.
3. **Given** a category is purely internal/technical (e.g. AI-scoring
   tables, script-only value tables) with no player-facing meaning,
   **When** it is evaluated for inclusion, **Then** it may be excluded,
   but that exclusion is recorded, not silent.

---

### User Story 3 - Cross-reference and search across the whole Encyclopedia (Priority: P3)

A user reading one entry wants to jump straight to another entry it
mentions — a building's category, a good referenced by a production
method's inputs — without leaving the Encyclopedia to search by hand.
Separately, a user who knows roughly what they're looking for (a good's
or building's name) wants to jump to it directly from anywhere in the
Encyclopedia via a single search box, rather than knowing which domain
group it lives in first.

**Why this priority**: Turns a set of browsable lists into a genuinely
useful reference tool. Depends on User Stories 1 and 2 already having
real entries to link and search across, so it is correctly sequenced
last.

**Independent Test**: Open an entry known to reference another entry
(e.g. a building whose category is a Building Category entry), confirm
the reference renders as a working link to that entry, and confirm a
global search finds a known entry by name or key from anywhere in the
Encyclopedia.

**Acceptance Scenarios**:

1. **Given** an entry's recorded fields reference another entry by its
   internal key, **When** the user views that entry, **Then** the
   reference appears as a link that opens the referenced entry.
2. **Given** a referenced entry does not exist in the Encyclopedia (e.g.
   it was deliberately excluded, or belongs to a DLC not present in the
   local installation generation ran against), **When** the user views
   the referencing entry, **Then** the reference is shown plainly (not a
   broken/dead link) rather than erroring.
3. **Given** the Encyclopedia search box, **When** the user types part of
   a known entry's name or internal key, **Then** matching entries appear
   across all domain groups, not just the group currently being viewed.

### Edge Cases

- A definition file that fails to parse (malformed or unexpected
  structure) MUST NOT abort the entire generation run or corrupt other
  entries — it is skipped and the skip is recorded.
- Two entries in different categories that happen to share the same
  internal key MUST remain distinguishable (an entry is identified by
  category + key together, never key alone).
- A key that exists in the base game's definition files but has no
  matching localization entry anywhere MUST fall back to the raw key,
  never a guessed name (Constitution Principle IV).
- DLC content MUST NOT be shown as if it were base-game content — every
  entry sourced from a DLC MUST be clearly labeled with which DLC it came
  from, never blended into base-game entries unlabeled.
- A DLC installed at generation time but later uninstalled (or vice
  versa) MUST NOT silently corrupt existing entries — a re-generation
  reflects exactly what was present in the local installation at the
  time it ran, and that installation's DLC set MUST be recorded with the
  Generation Run.
- A future base-game update that renames, removes, or adds categories or
  entries MUST be handled by re-running generation, not by hand-patching
  stored data — a stale Encyclopedia must be identifiable as stale, not
  silently wrong.
- A category with very few or exactly one entry is still a valid,
  browsable category, not an error state.
- A generation run on a machine without the base game installed locally
  MUST fail clearly with an actionable message, not produce an empty or
  partially-populated Encyclopedia silently.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST provide a Game Encyclopedia section, reachable
  from the app's existing top-level "Encyclopedia" navigation item
  (currently a placeholder), as a real, working reference browser rather
  than a "coming soon" stand-in.
- **FR-002**: Encyclopedia content MUST be produced by an explicit,
  repeatable generation step run against a local installation of the base
  game's own files, consistent with the project's existing precedent for
  deriving committed reference data from the game install (e.g. the
  existing resolved goods-color table) — not scraped live during normal
  app use, since most users' machines will not have the game installed.
- **FR-003**: Every generated entry MUST carry its source category and
  internal key, and, when the base game's own localization files provide
  one for that key, its localized display name and description.
- **FR-004**: An entry whose key has no matching localization MUST show
  the raw internal key as-is rather than a fabricated or guessed name
  (Constitution Principle IV).
- **FR-005**: Every entry MUST carry its recorded numeric/mechanical
  fields exactly as stated in the base game's own definition files (e.g.
  a good's base price and transport cost; a building's construction
  requirements) — no invented or estimated values.
- **FR-006**: The Encyclopedia MUST organize entries into browsable
  domain groups covering the game's full reference catalog (base game
  plus any owned DLC present at generation time): Economy & Production,
  Government & Society, Culture/Religion/Characters, Military &
  Diplomacy, and World & Events.
- **FR-007**: Every reference category present in the game's files
  (base game and owned DLC alike) MUST be accounted for in generation —
  either included in one of the domain groups, or recorded on an explicit
  exclusion list with a reason; none may be silently dropped.
- **FR-008**: An entry's fields that reference another entry by its
  internal key MUST render as a link to that entry when the referenced
  entry exists in the Encyclopedia, and as plain (non-broken) text when it
  does not (e.g. the reference target was excluded or is DLC-only).
- **FR-009**: The Encyclopedia MUST provide a single search that matches
  entries by display name or internal key across every domain group, not
  scoped to whichever group is currently open.
- **FR-010**: Generation MUST source both the base game's own files and
  any owned DLC content present in the local installation generation runs
  against; every Encyclopedia Entry MUST record whether it came from the
  base game or a specific DLC, and DLC-sourced entries MUST be clearly
  labeled as such wherever they are shown.
- **FR-011**: The app MUST NOT commit, bundle, or otherwise ship the
  game's raw icon, texture, or other art/image files — base game or DLC
  alike — as part of the application. If an entry's icon is shown at all,
  it MUST be resolved only from the user's own local game installation at
  runtime, never from a file committed to or served by the app itself.
- **FR-012**: Generation against a machine with no local game
  installation found MUST fail with a clear, actionable error rather than
  producing an empty or partially-populated Encyclopedia.
- **FR-013**: A definition file that fails to parse during generation
  MUST be skipped and recorded (not silently dropped, and not allowed to
  abort the rest of the generation run).
- **FR-014**: An entry MUST be uniquely identified by its category and
  internal key together, so that two entries in different categories
  sharing the same internal key remain distinguishable everywhere they
  are shown or linked.

### Key Entities

- **Encyclopedia Category**: One of the base game's reference domains as
  the game itself organizes them (e.g. `goods`, `building_types`,
  `religions`, `unit_types`). Attributes: its internal folder name, which
  domain group it belongs to for browsing, and whether it is included or
  explicitly excluded from generation.
- **Domain Group**: One of the five top-level browsing groupings (Economy
  & Production, Government & Society, Culture/Religion/Characters,
  Military & Diplomacy, World & Events) that Encyclopedia Categories are
  organized under for navigation.
- **Encyclopedia Entry**: One scraped definition — identified by its
  category plus internal key. Attributes: localized display name
  (when available), localized description (when available), its recorded
  numeric/mechanical fields as the game's files state them, and its
  source (base game, or the specific DLC it came from).
- **Cross-Reference**: A link from one Encyclopedia Entry's field to
  another Encyclopedia Entry it names by internal key (e.g. a building's
  category, a production method's input good).
- **Generation Run**: One execution of the scrape-and-store pipeline
  against a local game installation — records which game version and
  which installed DLCs it ran against, which categories/files it
  successfully processed, and which it skipped (with a reason).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every reference category present in the game's files (base
  game and owned DLC alike) is accounted for after generation — visible
  in one of the five domain groups, or on a recorded exclusion list —
  with zero categories silently missing from both.
- **SC-002**: A user can find a known entry (e.g. a specific good or
  building) via search in 2 interactions or fewer from anywhere in the
  Encyclopedia.
- **SC-003**: Zero raw game icon, texture, or other art/image files exist
  in the application's committed source or shipped build output.
- **SC-004**: Re-running generation against an unchanged local game
  install reproduces the same entry set and field values (deterministic,
  not sampled or randomized).
- **SC-005**: Opening an Economy & Production entry (good, building, or
  production method) shows a real display name and its recorded
  mechanical values with zero fabricated or placeholder content, for
  every entry that has a matching base-game localization key.

## Assumptions

- This feature targets whatever the local game installation generation
  runs against actually contains: base game plus any owned/installed
  DLC — DLC content is in scope, not excluded. Content is labeled by its
  true source (base game vs. a named DLC) so nothing is misrepresented
  as base-game content.
- Encyclopedia content (structured data: keys, localized names/
  descriptions, numeric mechanics values) is generated offline from a
  local game installation and committed/shipped as part of the app,
  under the constitution's new Encyclopedia-data exception (v1.2.0) —
  this mirrors the existing precedent of committing a resolved,
  game-derived table (the goods-color table) rather than scraping live.
  The exception applies equally to base-game and DLC-sourced structured
  data; only art/icon assets stay local-install-only for both.
- Icon/art assets are explicitly excluded from this exception and stay
  local-install-only, per the constitution's unchanged general ban on
  redistributing Paradox's art assets — this feature's entries may render
  without icons, or with icons resolved only when the viewing user's own
  machine has the game installed.
- Purely internal/technical categories with no player-facing meaning
  (e.g. AI-scoring tables, script-only value tables) may be excluded from
  the browsable domain groups, but each such exclusion is an explicit,
  recorded decision made during planning/implementation, not silently
  decided by this spec category-by-category.
- The five domain groups (Economy & Production, Government & Society,
  Culture/Religion/Characters, Military & Diplomacy, World & Events) are
  this feature's grouping of the base game's ~120 reference categories
  for browsability; the exact category-to-group assignment is a planning-
  level detail, not enumerated exhaustively in this spec.
- The game's own in-game encyclopedia is genuinely called "Europedia"
  and ships its own curated page list plus a large hand-written
  `game_concepts` glossary explaining game mechanics in prose (research.md
  §8) — this feature treats that as an authoritative source for category
  labels/priority and includes the glossary itself, without limiting the
  catalog to only the game's own curated page list.
- For entry types whose real Europedia description is composed by the
  game engine at runtime rather than stored as static text (confirmed
  for Buildings, Unit Categories, Unit Types, Advances, Ages, and
  Artists — research.md §8), this feature's `description` is `null` for
  those entries rather than an invented or partial reconstruction; their
  informational value comes from their recorded `fields` instead.
- This feature does not connect Encyclopedia entries to save data (e.g.
  "which countries currently produce this good") — that kind of tie-in,
  and updating other features (Markets, Leaderboard) to show these real
  display names instead of raw save keys, is future work for a separate
  feature.
- Entries are read-only reference material; there is no in-app editing of
  Encyclopedia content.
