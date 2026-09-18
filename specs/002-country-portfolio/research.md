# Phase 0 Research: Country Portfolio

## 1. Tab navigation architecture

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

## 2. Large-list rendering (Provinces/Military/Buildings)

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

## 3. Save-format research: what each new tab's data actually looks like

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

- **"National value"** (spec's User Story 3, as literally named): no
  occurrence of any `national_value*` key anywhere in the real save.
  EU5 does not appear to have a distinct "national values" mechanic
  under that name. The `implemented_laws`/policy system above is the
  closest real mechanic to what was likely meant. This is carried
  forward as an open item for that story's task rather than resolved
  here — see data-model.md's note on this entity and the spec's
  Assumptions.
