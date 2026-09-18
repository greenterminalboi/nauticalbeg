# Phase 0 Research: Country Portfolio

Sections 1-3 below cover User Story 1 (the portfolio shell), added to
this document when `/speckit-plan` was re-run after a `/speckit-clarify`
session introduced that story. Sections 4-6 are unchanged from the
original planning pass and cover User Stories 2-9 (the data tabs).

## 1. Shell layout technique

**Decision**: Plain CSS Grid for the 3-region shell (top bar spanning
full width; side navigation and main content area as two columns below
it), styled with `src/styles/tokens.css`'s existing custom properties.
No CSS framework, no layout library.

**Rationale**: A fixed top bar plus a two-column body is exactly what
CSS Grid's `grid-template-areas` is for, natively, in every evergreen
browser this project already targets — no polyfill or library needed.
Matches 001's established pattern of plain CSS files co-located with
each component (`OverviewCard.css`, `ErrorMessage.css`, etc.) rather
than introducing a CSS-in-JS or utility-class framework partway through
the project, which constitution Principle VII would flag as unjustified
new complexity for a problem three `grid-template-areas` rules solve.

**Alternatives considered**: Flexbox nesting (a flex column containing
the top bar, then a flex row for nav+content) — workable, but Grid's
named areas make the shell's structure self-documenting in the CSS
itself and handle the "top bar always full-width, body splits below it"
shape more directly than nested flex containers. A component library
(e.g., a dashboard/admin-shell UI kit) — rejected outright: this project
has never taken a UI component dependency, and one off-the-shelf shell
is unlikely to match the "Imperial Illuminator" design system already
established in `design.md`/`tokens.css`.

## 2. Responsive behavior (FR-017)

**Decision**: Below a single breakpoint (matching `tokens.css`'s
existing mobile treatment, if any is already implied by the design
system — otherwise a conventional ~768px), the side navigation collapses
from an always-visible column into a control that reveals it on demand
(e.g., a toggle), and the grid drops from two columns to one (main
content full-width). The top bar stays a single row at every width — it
already holds a small, bounded set of controls.

**Rationale**: Satisfies FR-017 ("adapt... without overflowing or
clipping content... e.g., the side navigation collapsing or relocating")
using the same no-new-dependency posture as the rest of this plan — a
CSS media query plus a small amount of component state (is the nav
panel open, on narrow viewports), not a responsive-design library.

**Alternatives considered**: Always-visible side nav at every width,
shrunk instead of collapsed — rejected, a permanently-narrow nav with
9-11 items (8 data tabs + Overview + 2 placeholders) becomes illegible
before it becomes narrow enough to coexist with a usable content area on
a phone-width screen.

## 3. Where pre-load and loading-state content renders

**Decision**: The main content area is a permanent layout region (part
of the shell from first render), not something that only mounts once a
save is loaded. What's *inside* it varies by state: before a save is
loaded, it holds the file-picker prompt and, if one exists, the kept-save
resume offer (001's `KeptSaveOffer`); while parsing, it holds progress
feedback; once ready, it holds the side navigation's active tab content.
The **side navigation itself**, specifically, only renders once a nation
is active — its items are meaningless before then.

**Rationale**: FR-018 states the top bar is "the one piece of the shell
present in every state," which could be misread as implying the main
content area is not present pre-load — but User Story 1's own Acceptance
Scenario 1 requires the file-selection control to be visible and usable
before any save exists, and that control has to render somewhere. Making
the content area a permanent region (holding different things depending
on state) rather than conditionally mounting it is simpler and avoids a
layout reflow the moment a save finishes loading (the region doesn't
appear/disappear, only its contents swap) — consistent with FR-002/FR-003
already requiring content swaps without layout disruption for the
post-load case.

## 4. Tab navigation architecture

**Decision**: Tabs are plain React component state (which category is
"active" for the currently loaded save), not client-side routing.

**Rationale**: Nothing in spec.md requires a tab to be independently
URL-addressable (no deep-linking acceptance scenario), and there's no
other page in the app to route between — the whole app is one file-loader
view. Adding a router (or even hash-based faux-routing) for a single
page's internal tab state would be unjustified complexity per
constitution Principle VII. This also matches 001's own precedent:
`FileLoader.tsx`'s `Status` union already models "what's currently shown"
as component state, not routes.

**Alternatives considered**: `react-router` (or similar) with one route
per tab — rejected, no requirement it would serve beyond what state
already does, and it would need to somehow interact with the existing
non-routed `Status` state machine (idle/loading/error/ready) for no
functional gain.

## 5. Large-list rendering (Provinces/Military/Buildings)

**Decision**: Client-side pagination (a fixed page size, e.g. 50 rows,
with next/previous controls), implemented in plain React state — no new
dependency.

**Rationale**: Constitution Principle V requires large datasets in
visualizations to use "virtualization, pagination, or level-of-detail
techniques" rather than rendering every row unconditionally, and SC-003
specifically calls out a 100+-province nation staying responsive.
Pagination is the simplest technique that satisfies this without adding a
virtualization library (react-window, react-virtual, etc.) — Principle
VII again: don't add a dependency for a problem plain state solves. This
also composes cleanly with the existing SQL-backed query layer: a page
change is just a `LIMIT`/`OFFSET` (or `WHERE idx > :cursor`) added to the
existing `listX(db, nationIdx)`-shaped queries, not a client-side slice of
an already-fully-loaded array — keeping memory use bounded even for a
save with thousands of buildings.

**Alternatives considered**: A virtualized/windowed list component —
rejected for now as more complexity than the problem needs at this scale
(hundreds, not tens of thousands, of rows per nation); revisit if a real
save is found where pagination itself proves insufficient. Rendering
everything unconditionally — rejected outright, violates Principle V
directly for a large empire.

## 6. Save-format research: what each new tab's data actually looks like

Per constitution Principle II, schema must be confirmed against a real
save before being invented. The findings below come from direct
inspection of the same real 642MB save (`Russia (Melted).eu5`, version
1.3.11) 001's `research-save-format.md` was built from — this is Phase 0
architectural research (confirming these sections exist and have a
plausible, extractable shape so the plan/data-model below isn't
speculative), not the exhaustive field-by-field documentation each tab's
own implementation task will still need to produce and commit as fixture
evidence (per Principle II, that happens per-task, same as 001's
T014-T018).

### Confirmed structurally (high confidence — a real, flat, numeric-indexed `database={}` table, straightforward to adapt)

- **`estate_manager.database`** (Government tab — estates): one row per
  estate *per country* (8 estate types × every country, e.g. `nobles_estate`,
  `clergy_estate`, `burghers_estate`...), fields `estate_type`, `country`
  (idx FK), `wealth_impact`, `satisfaction`, optional `existence`.
- **`unit_manager.database`** (Military tab): one row per deployed
  sub-unit, fields `owner`/`controller` (idx FK), `type` (e.g.
  `a_heavy_cavalrymen`, `n_genoese_galley` — `a_`/`n_` prefix distinguishes
  army/navy), `morale`, `experience`, `strength` (0-1 fraction), `number`
  (headcount). Grouping by `owner` + `type` gives exactly the "counts by
  unit type" FR-005 asks for.
- **`building_manager.database`** (Building Registry tab): one row per
  constructed building, fields `type`, `level`, `location` (idx FK to
  `locations`, not `provinces` — consistent with 001's existing
  "locations, not provinces, are authoritative for ownership" rule),
  `owner` (idx FK to nations, present directly alongside `location`),
  `employed`, `last_months_profit`.
- **`loan_manager.database`** (Economy tab — loans): one row per loan,
  fields `amount`, `interest`, `borrower` (idx FK), optional `lender` (idx
  FK — absent for bond/market loans), `key` (e.g. `"government_bond"`),
  `bond` (bool).
- **`character_db.database`** (Characters tab): one row per character
  (alive or historical), fields `country` (idx FK — origin/home nation),
  `first_name`, `adm`/`dip`/`mil` (skill stats), `religion`, `culture`,
  `dynasty` (idx FK), `birth_date`, optional `death_data.death_date`,
  `traits` (list), `children` (list of character indices), and a large
  `dna` field (portrait genetics — binary/base64 noise, irrelevant to any
  stated requirement; MUST be excluded from parsing entirely, not stored,
  per Principle VII and to avoid meaningfully bloating the per-save
  database for no feature value). A nation's ruler/heir resolve via
  `countries.database[idx].government.ruler`/`.heir`, an index into this
  same table — same resolution pattern 001 already uses for
  `played_country`.
- **Policies** (part of the Government tab, alongside estates):
  confirmed to live in `countries.database[idx].implemented_laws` — a map
  of law-category keys (e.g. `colonial_policy`, `bureaucracy_law`,
  `censorship`) each holding `{ date, days, object }`, where `object` is
  the actually-chosen policy value (e.g. `decentralized_bureaucracy_policy`).
  This is a **sibling field of `government`** on the same country record
  001 already parses `government_type`/`treasury`/etc. from — no new
  top-level manager needed for this one, just reading more of a structure
  already being touched.

### Confirmed to exist, structure not yet fully inspected (each is its own implementation-task's research, same as 001's per-adapter-field approach)

- **`diplomacy_manager`**: confirmed to exist, but keyed directly by
  country index at the top level (not a `database={}` wrapper like the
  others) — each entry holds `rivals_2`, `relations` (per-other-country
  trust/opinion/war_score), `last_war`/`last_peace`. An explicit
  "currently allied" flag was not located in the portion inspected;
  Diplomacy tab's implementation task must confirm exactly where
  alliance status lives (possibly deeper in `relations.N`, possibly in
  `international_organization_manager`) before that table's schema is
  finalized.
- **`bureaucracy_manager`**, **`market_manager`** (Economy tab, beyond
  loans): confirmed present as top-level keys; income/expense breakdown
  fields not yet inspected.
- **`trade_manager`**, **`trade_path_manager`** (Trade tab): confirmed
  present as top-level keys; not yet inspected.
- **`cabinet_manager`**, **`rulerterm_manager`**, **`dynasty_manager`**
  (Characters tab, beyond the core `character_db` row): confirmed
  present; a country's `government.cabinet_entries`/`ruler_terms` are
  lists of indices into these, mirroring the `ruler`/`heir` pattern, but
  each manager's own record shape isn't yet inspected.

### Not found at all

- **"National value"** (spec's User Story 4, Government tab, as literally named): no
  occurrence of any `national_value*` key anywhere in the real save.
  EU5 does not appear to have a distinct "national values" mechanic
  under that name. The `implemented_laws`/policy system above is the
  closest real mechanic to what was likely meant. This is carried
  forward as an open item for that story's task rather than resolved
  here — see data-model.md's note on this entity and the spec's
  Assumptions.
