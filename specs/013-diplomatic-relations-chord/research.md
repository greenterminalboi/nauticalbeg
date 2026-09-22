# Phase 0 Research: Diplomatic Relations Chord Diagram

All findings below were confirmed directly against the real local save
(`/Users/halda/Downloads/Russia (Melted).eu5`, 642MB, the project's standing
verification save — see project memory `eu5_save_format_gotchas`) with `grep`/
`sed`/`awk`, not against `tests/fixtures/rus-1628-minimal.eu5` (see project
memory `never_guess_map_mode_fields_from_fixture` — the same discipline applies
here even though this isn't a map mode).

## 1. `diplomacy_manager`: the save's diplomacy ledger

**Decision**: Add `"diplomacy_manager"` to `STRUCTURED_KEYS` in
`src/parser/version-adapters/1.3.11.ts` (currently absent — it falls into the
`raw_sections` catch-all today) and extract five things from it, mirroring
exactly how `war_manager` was promoted for the `wars`/`war_participants` tables
(specs/004-full-schema-mapping §8).

`diplomacy_manager` is a single top-level block (confirmed ~14.27M lines in the
real save, sibling to `war_manager`/`siege_manager`/`combat_manager`/
`rebel_manager`) containing:

- **Per-country entries, keyed by country idx** (`diplomacy_manager.<idx>={...}`,
  e.g. `205={ diplomats=1 threat=1 ... relations={...} rivals_2={...} }`).
  Two sub-fields matter here:
  - `rivals_2.list` — an array of `{ country=<idx> date=<date> }`. **This is
    where rivalry lives** — EU5 does not use the literal key `rivalry`
    anywhere (confirmed zero matches for that string in the whole save); a
    naive `grep -w rivalry` search would have missed it entirely. One-directional
    per the owning country's record — a pair with a mutual rivalry appears once
    under each side's own `rivals_2.list`, which the adapter should de-dupe to
    one row per unordered pair (spec Edge Cases: no duplicate chords for the
    same pair+type).
  - `relations.<target_idx>.trust` — a general bilateral opinion ledger
    (`trust`, plus `timed_biases`/`disposition`, not needed here) that exists
    for *any* pair with diplomatic history, not just pairs with an active
    alliance/rivalry/marriage/guarantee. This is the chord-thickness score
    source (spec FR-010) — looked up *after* a relationship is already
    confirmed via one of the four sources below, never used to infer that a
    relationship exists. It is directional: `relations.<idx>.trust` under
    country A's record need not equal the value under B's record for A. Per
    spec Assumptions: use whichever direction's value exists; average when
    both do.
- **Repeated top-level entries** (each occurring many times as a sibling key,
  which `jomini` already groups into an array once there is more than one —
  see §4 below for the single/zero-occurrence edge case):
  - `royal_marriage={ first=<idx> second=<idx> named_targets={...} }` — 271
    occurrences in the real save. This is the direct, current-state source for
    royal marriages (distinct from the *unrelated*, much rarer `royal_marriage`
    key that also appears inside historical peace-treaty terms deep in
    `war_manager`/CB resolution blocks — confirmed by inspecting both contexts;
    only the `diplomacy_manager`-level one represents current state, and only
    it should be read).
  - `scripted_mutual={ first=<idx> second=<idx> named_targets={ { flag=
    scripted_relation_type target={ type=relation_type object=<type> } } } }`
    and the structurally identical `scripted_oneway={...}` — this is where
    **alliance** and **guarantee** live, alongside other treaty-type relations
    out of scope for v1 (`military_access`, `trade_access`, `embargo_nation`,
    `fleet_basing_rights`, `deny_market_access`, `block_foreign_building`,
    `divert_trade`, `scutage`, `send_officers`, `sound_toll_exemption`,
    `knowledge_sharing`, `guarantee_vassal_independence`, `fondaco_rights`,
    `support_loyalists`, `food_access`, `support_military`). The adapter reads
    every `scripted_mutual`/`scripted_oneway` entry but only turns
    `object=alliance` and `object=guarantee` into rows — everything else is
    parsed-and-discarded at extraction time (not stored), matching spec
    Assumptions' explicit v1 scope boundary.
  - `dependency={ first=<idx> second=<idx> named_targets={ ... object=
    <subject_type> } }` (vassal/tributary/fiefdom/march/etc., 195 occurrences)
    — confirmed present but **out of scope for v1** per spec Assumptions; not
    extracted by this feature.

**Alternatives considered**: Treating `alliance` as a boolean flag directly on
a country pair (no `relation_type` indirection) — rejected once the real data
showed alliance is just one of many `object=` values sharing the same
`scripted_mutual`/`scripted_oneway` container with guarantee and a dozen other
treaty rights; filtering by `object` at extraction time is simpler and more
future-proof (adding e.g. `military_access` later is a one-line filter change,
not a new parse path) than trying to special-case alliance's own shape.

## 2. Chart rendering: echarts `graph` + `custom` dual series, no new dependency

**Decision**: Render the chord diagram with two layered echarts series inside
the existing `useEChartsInstance` hook (the one shared init/resize/dispose
lifecycle every chart in this app already uses — `renderer: "svg"`, jsdom-test
compatible, no canvas polyfill needed):

- A `custom` series (`renderItem`) draws the actual arc bands — one arc per
  visible country, angular width driven by FR-011's ordering (not by
  development/population — spec keeps v1 arc length uniform), filled with that
  country's existing `color_r/g/b` (FR-003).
- A `graph` series, `layout: "none"` with each node's `x`/`y` pinned to the
  same angular position as its corresponding arc's midpoint, supplies the
  chords themselves as graph edges (one edge per relationship instance,
  `lineStyle.color` from the fixed relationship-type legend, `lineStyle.width`
  from the trust score when present) and, critically, native
  `emphasis: { focus: "adjacency" }` — the exact mechanism
  `MilitaryDoctrineChart.tsx` already validated and documented (see that
  file's own comment, ~line 65) for FR-005's hover-isolate-and-fade
  requirement, avoiding the hand-rolled opacity/state bookkeeping that
  comment explicitly calls out as the worse alternative already rejected once
  in this codebase.
  Hovering the *arc* (the `custom` series, which has no native
  adjacency-focus concept of its own) forwards to the same behavior via
  `chart.dispatchAction({ type: "focusNodeAdjacency", ... })` on `mouseover`
  and `{ type: "unfocusNodeAdjacency" }` on `mouseout` — both are documented
  built-in echarts actions for `graph` series, not custom event plumbing.

**Alternatives considered**:
- **Add `d3-chord`** (the standard `d3.chord()`/`d3.ribbon()` primitives most
  chord-diagram tutorials use): rejected — this app has zero d3 dependency
  today and uses echarts exclusively for every chart
  (`ShareTreemap`/`SocietalCompassChart`/`LeaderboardChart`/
  `MilitaryDoctrineChart`/`RulerHistoryChart`, confirmed by inspection), all
  through the one shared `useEChartsInstance` hook. Introducing a second
  charting library for one view breaks that convention and duplicates
  hover/resize/dispose lifecycle work the hook already solves, for no
  capability echarts' `custom` series can't provide.
- **Hand-rolled Canvas** (this app's other precedent for a fully custom
  visualization, `MapCanvas.tsx`): rejected for this feature specifically —
  `MapCanvas` is a full interactive game map with its own hit-testing needs
  that justify bypassing charting libraries entirely; a chord diagram's
  hover/tooltip/legend needs are exactly what echarts' declarative option
  model and native `graph` interactions already cover well, so building and
  testing hit-testing/tooltip positioning by hand here would be pure
  duplication.
- **echarts `graph` series alone, `layout: "circular"`, no `custom` overlay**:
  considered as a simpler v1 (skip drawing true arc "bands," just show country
  nodes on a circle with curved edges between them). Rejected because the
  spec (FR-001/FR-003) explicitly calls for an arc per country with the
  country's color, not a point/dot — the two-series approach is a small
  addition once the `graph` series for edges/hover exists anyway, and matches
  "chord diagram" as a recognizable visual form rather than a generic
  force/circular node-link graph.

## 3. Relationship-type legend: colorblind-safe by construction

**Decision**: The spec's own example legend (blue = alliance, red = rivalry,
gold = royal marriage, green = guarantee — spec Assumptions, explicitly left
as an implementation detail) pairs red and green, which constitution
Principle VI forbids as the *sole* distinguishing signal ("no red/green-only
encodings for map or chart categories"). Resolve by giving each relationship
type a **distinct line-dash pattern** in addition to its color (solid /
dashed / dotted / dash-dot), applied to both the chord's `lineStyle` and the
filter checkboxes/legend swatches, so relationship type is never
color-dependent alone — consistent with Principle VI's broader
non-color-dependent-identification requirement (written there for map views,
applied here on the same rationale) and with FR-006's tooltip already giving
a fully textual identification path on hover.

**Alternatives considered**: Picking a "safer" 4-color palette with no
red/green pair at all (e.g. blue/orange/purple/teal) — viable and worth using
for the actual hex values at implementation time, but doesn't fully satisfy
Principle VI on its own once a save has all four types rendered at once and
two chord colors end up visually close at small line-widths; the dash-pattern
layer is kept regardless of final color choice as the more robust guarantee.

## 4. `jomini` repeated-key normalization

**Decision**: Call `toArray(diplomacyManager, key)` (the same helper already
used for `played_country`, `implemented_reforms`, `implemented_privileges` —
`src/parser/version-adapters/1.3.11.ts`) on `royal_marriage`, `scripted_mutual`,
and `scripted_oneway` before iterating them. `jomini` already groups a
genuinely repeated key into an array automatically (confirmed by this
codebase's own existing comment on `toArray`'s call site) — the helper exists
only to normalize the single-occurrence case, where a save with e.g. exactly
one active alliance in total would otherwise hand back a bare object instead
of a one-element array, silently breaking a naive `.map()`/`.forEach()` over
it. Low-probability in a real save but a real fixture-testable edge case (spec
Edge Cases don't call this out explicitly, but Principle II's fixture
discipline requires covering it).

## 5. Country-index range: `INTEGER` suffices, no new `BIGINT` gotcha

**Decision**: `diplomatic_relations.first_nation_idx`/`second_nation_idx` and
`nation_relation_trust`'s two nation-idx columns use `INTEGER`, matching
`nations.idx`'s existing type — **not** `BIGINT` like `wars.idx`/population
entity indices needed.

Initially looked like it might repeat the `wars.idx` BIGINT finding: sampling
`diplomacy_manager`'s own per-country top-level keys and `first=`/`second=`
values turned up entries as large as `251658443`. But cross-checking against
`countries.tags` (the exact source `nations.idx` is already built from) shows
the *same* sparse, large-value key space there too (confirmed: `251658443` is
a real `countries.tags` key in the same save) — this is the already-established
`nations.idx` range (comfortably inside signed 32-bit `INTEGER`, unlike the
`wars.idx` case which hit a real value near `2.16` billion, over the `INT32`
ceiling). `diplomacy_manager`'s country references are simply the same
country-identity space every other table already joins against, not a new
larger one.

## 6. Major-powers ranking reuses the existing development aggregation

**Decision**: `SUM(development) ... FROM locations WHERE owner_idx = ?1`
(the exact aggregation `src/storage/queries.ts` already uses, confirmed by
inspection) generalizes to a single grouped query —
`SELECT owner_idx, SUM(development) FROM locations GROUP BY owner_idx` — for
ranking every visible country at once, rather than one query per country.
No new metric, no new table; `data-model.md` documents this as a query-time
aggregate, never a stored/derived column (constitution Principle IV — a
derived figure must stay visibly derived, not get persisted as if it were a
raw save field).

## 7. Hugbox Detection: clique core + threshold expansion, computed client-side

**Decision**: Implemented as a pure function over the already-fetched alliance
rows (no SQL, no new table — constitution Principle VII, and matches this
app's existing pattern of layout/derivation helpers like
`militaryDoctrineLayout.ts` and `compassPosition.ts` living as plain
`.ts` modules beside their chart component, not as a new "service" layer):

1. Build an undirected alliance-only adjacency structure from the visible
   (post-filter) `diplomatic_relations` rows where `relation_type = 'alliance'`.
2. Find maximal fully-mutual cliques of size ≥ 3 — each becomes one cluster's
   core (spec Assumptions: a mutually-allied pair alone, with no third
   member, is not a "hugbox").
3. For every other visible country not already a core member of a given
   cluster, count its alliance ties into that cluster's current member set:
   exactly 1 → affiliate (positioned near, rendered visually distinct, not
   enclosed in the boundary); 2 or more → promote to full member, enclosed in
   the cluster's boundary (spec FR-014, User Story 4 acceptance scenarios).
4. Resolve a country eligible for full membership in more than one cluster by
   assigning it to the cluster it holds the most alliance ties to, tie-broken
   by larger core size, then by lowest country tag alphabetically (spec
   Assumptions — a deterministic, stable, if arbitrary, final tie-break).

**Alternatives considered**: General graph community-detection algorithms
(e.g. Louvain modularity) — rejected as over-scoped for v1; the spec's own
worked example (A/B/C mutual clique, D joining at 1-then-2 ties) describes a
specific, simpler rule that a general community-detection pass would not
reproduce exactly (those algorithms optimize a global modularity score, not
this per-cluster tie-count threshold), and Principle VII disfavors building a
heavier general-purpose algorithm the spec never asked for.

## 8. Amendments made mid-implementation (explicit user requests, 2026-09-22)

Three real-time course corrections landed after the plan above was written,
each confirmed working against the real save before being called done:

- **Default country selection**: §6's "major powers by development" ranking
  (`listNationDevelopmentArrow`, a new `SUM(development)` query) was built,
  then removed. The user redirected: "you only need to show countries that
  are players, but the option to add more countries will be done similarly
  to how we do everything else" — reusing `computeDefaultSelection`/
  `AddCountryInput` unchanged (human-played countries by default, search-
  and-add to bring in more), the exact pattern Leaderboard/World Goods/
  Societal Compass already use. A follow-up correction tightened this
  further: a relationship is visible only when **both** countries are
  selected (not "at least one," an ego-network reading tried first and
  rejected — "youre including non player countries").
- **Arc labels**: countries were unlabeled at first; explicit request added
  each node's tag as radially-rotated text (flipped on the circle's left
  half so it reads left-to-right).
- **Layout**: the diagram originally capped its circle to the canvas's
  shorter dimension and drew each country as a contiguous arc band.
  Explicit request — "spread the nodes farther apart, we have a huge
  canvas... completely fine if it becomes elliptical... make the nodes
  circles" — replaced this with an ellipse sized from the canvas's actual
  width/height independently, and circle nodes in place of arc bands (see
  contracts/ui.md's "Layout" section for the resulting shape).

**A real bug found live, fixed the same session**: echarts' `custom` series
defaults to `coordinateSystem: "cartesian2d"` and throws `xAxis "0" not
found` without an explicit `coordinateSystem: "none"` — this chart has no
axes at all, `renderItem` computes raw pixel/ellipse positions itself. Caught
by the user reporting "diplomacy tab is completely blank" against the real
save; the fixture-based automated tests didn't catch it because the fixture
never exercises the full live-app render path the same way (see also
`never_guess_map_mode_fields_from_fixture`-style lesson: this class of
rendering bug only ever surfaces against a real, fully-loaded app instance).

**Verification note**: hovering (spec FR-005/FR-006) could not be reliably
exercised through this session's browser-automation tooling — a control test
against the pre-existing, already-shipped `MilitaryDoctrineChart` (which
uses the identical `emphasis.focus: "adjacency"` mechanism) also showed no
visible effect under the same synthetic-hover tooling, indicating an
environment/automation limitation rather than a defect in either chart. The
user was asked to verify hover-isolate and the chord tooltip manually with a
real mouse.

## 9. Further post-ship amendments (explicit user requests, 2026-09-22)

Continued from §8, after live verification against a real save surfaced two
genuine bugs and three feature requests:

**Bug: stale kept-save cache masked the widened relation-type extraction.**
The "Resume this save" flow reopens an already-parsed DuckDB database without
re-running the parser. Testing against a kept save from before the relation-
type widening (§8) showed Spain missing all four new types even though the
adapter code was correct — confirmed by hand-tracing the real save's raw
`diplomacy_manager` data for Spain against what the client actually received
(a direct data-layer trace, not a guess): the stale database simply predated
the code that would have extracted them. A fresh parse (forget + re-upload)
produced all 12 of Spain's real relationships correctly. Not a code defect —
a reminder that this workflow's own kept-save caching needs a fresh save
whenever the parser itself changes.

**Bug: `custom`/`graph` series geometry computed from two independent
sources.** The arc/node `custom` series recomputed pixel geometry via
`api.getWidth()/getHeight()` inside its own `renderItem`, while the `graph`
series' node `x`/`y` were computed once from React's tracked `size` state —
two genuinely independent measurements (each its own `ResizeObserver`) that
can disagree by a pixel or more, visibly offsetting a chord's endpoint from
the node circle it should terminate at exactly (caught from a user-provided
screenshot, `specs/debug_images/"fix this.png"`). Fixed by computing one
`geometry` object per option build and having every `renderItem` close over
it, never re-measuring independently.

**Bug: directional arrowheads hidden behind their own node circles.** Once
arrows were added (below) via each edge's per-item `symbol`, they rendered
correctly per echarts' own edge-visual source (confirmed by reading
`node_modules/echarts/lib/chart/graph/edgeVisual.js` directly rather than
guessing) but were completely invisible — a `graph` series edge terminates at
its target node's own `symbolSize` boundary, and the invisible anchor node
graph edges actually connect to had a tiny fixed `symbolSize: 4`, so the
arrow landed deep inside the much larger visible circle drawn on top of it
(the node z-layering fix from §8, still correct on its own). Fixed by sizing
the invisible anchor node's `symbolSize` to match the visible circle's own
diameter (`nodeRadiusFor(count) * 2`), so edges/arrows now terminate right at
the circle's visible edge.

**Feature: relationship direction, surfaced as an arrow and in the tooltip.**
"the dependency arrow changing depending on if its a one way or two
relationship" — confirmed empirically, exhaustively (every occurrence, not a
sample) which `diplomacy_manager` container each relation type always comes
from: `alliance` is 100% `scripted_mutual` (38/38); every other treaty type
(guarantee included) is 100% `scripted_oneway`. `royal_marriage`/`rivalry`
have no such container (inherently symmetric); `economic_support` is a one-
directional grant by nature. Stored as `diplomatic_relations.is_one_way`
(derived from container type at parse time, not guessed), with direction
running `first_nation_idx -> second_nation_idx` for one-way rows — matching
the save's own field order, though which side is semantically the "grantor"
for `scripted_oneway`'s `first`/`second` was not independently confirmed
against outside documentation (a reasonable, disclosed limit, not a guess
presented as fact). Rendered as a per-edge `symbol: ["none", "arrow"]` on the
`graph` series (only one-way edges get an arrowhead) and stated in words in
the tooltip (`→` vs `↔`).

**Feature: a "diplomatic score" (-200..200-ish), fetched per pair.** The save
has no single stored "Opinion" scalar — confirmed by exhaustively listing
every field name a real `relations.<target>` entry carries (`trust`,
`disposition`, `timed_biases`, `last_war`, `war_score`,
`diplomat_return_date`, `last_spy_discovery` — no `opinion=`). Derived
instead as the sum of every `timed_biases.Opinion[].value` and
`.Antagonism[].value` entry for that directional pair — the save's own named
modifier-stack (e.g. `opinion_improve_relation`, `opinion_dynasties_marrying`,
`broke_alliance_with_nobles`; `Antagonism` entries are already negative, so a
plain sum needs no extra sign flip). Stored as
`nation_relation_trust.opinion_score`, `NULL` when a pair has no timed biases
at all (never a fabricated 0). This is disclosed as a derived figure, not
guaranteed identical to whatever number the game's own UI might display
(which could incorporate static/base modifiers this save format doesn't
expose) — Constitution Principle IV.

**Feature: economic support amount, shown on hover.** `economic_support`'s
`named_targets={{flag=amount target={type=value identity=<n>}}}` — the ducat
amount, under `target.identity` (not `target.value` despite `type=value`,
confirmed against the real save). Stored as
`diplomatic_relations.amount` (`NULL` for every other relation type),
surfaced in the chord tooltip as "Economic support: N ducats" when present.

**Feature: Hugbox Detection treats `economic_support` the same as
`alliance`.** A country propping up another's economy is treated as bloc-
forming for cluster core/expansion purposes, same as a formal pact — a one-
line filter widening in `DiplomacyTab.tsx`'s Hugbox pair selection, no
change to `hugboxClustering.ts` itself (it already took an arbitrary pair
list, agnostic to relationship type).
