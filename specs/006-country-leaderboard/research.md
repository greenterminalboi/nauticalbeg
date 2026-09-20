# Research: Country Leaderboard

All findings below were confirmed directly against a real save file
(`/Users/halda/Downloads/Russia (Melted).eu5`, 642MB, game version
1.3.11 — the same reference save used by features 004/005), not assumed
from external EU5/Project Caesar knowledge, per constitution Principle
II's fixture-first discipline.

## 1. Decision: The three historical time series, and their exact location

**Decision**: Each country record at `countries.database[idx]` (the same
per-country record `nations.treasury`/`color`/etc. are already read
from — `src/parser/version-adapters/1.3.11.ts`) carries three sibling
fields, each a flat array of numbers, one entry per campaign year:

- `historical_population` — the metric backing the population graph.
- `historical_tax_base` and `historical_economical_base` — the two
  metrics backing the wealth graph's switchable metric (spec FR-009).

**Rationale**: Confirmed by direct grep against the real save
(`grep -aoi "historical_[a-z0-9_]*="`), which found exactly five
`historical_*` fields total. Two of the five —`historical_enemies`,
`historical_rivals`— are short lists of rival-country indices (not
time series; irrelevant here). The other three are real per-year
numeric arrays: sampled at 292–293 entries long across multiple
countries in the save, with the most-populated example showing 293 of
293 entries non-zero (real values like `41.55103`, `40.55382`, ...),
confirming genuine per-year tracking rather than a sparse/mostly-empty
structure.

**Alternatives considered**: A country's current treasury
(`currency_data.gold`, already read into `nations.treasury`) as the
wealth source — rejected outright: it's a single current-value scalar
with no history, confirmed by the same exhaustive `historical_*` field
search finding no `historical_treasury`/`historical_gold` field
anywhere in the save. There is no way to plot treasury over time from
a single save; economic base and tax base are the only two per-country
economic series the save actually tracks over time (user-confirmed
choice: expose both, switchable, rather than picking one — spec
FR-009).

## 2. Decision: No cross-save accumulation needed — one save is enough

**Decision**: This feature reads its historical series entirely from
the currently loaded save. It does not need to accumulate snapshots
across multiple save uploads over time.

**Rationale**: The arrays above already span the campaign's full
history up to the save's current date within a single save file (see
§1) — EU5 evidently writes each year's population/economic-base/
tax-base value into these arrays as the campaign progresses, rather
than only keeping a rolling recent window. This was the single most
important open question before scoping this feature (a leaderboard
built by accumulating repeated save uploads over months would have
been a much larger, differently-shaped feature); resolved by direct
inspection rather than assumption.

**Alternatives considered**: Building a new `save_meta`-keyed history
table that appends one row per save upload — rejected as unnecessary
scope once the save's own arrays were confirmed to already cover the
full range; would have added a persistence/accumulation concern (and a
"what if the user re-uploads the same save" edge case) this feature
doesn't need.

## 3. Decision: Year-index-to-calendar-year mapping

**Decision**: Array index `0` corresponds to campaign year **1337**
(month/day `04.01`, i.e. `1337.4.1`), index `N` to calendar year
`1337 + N`. The array's last index corresponds to the save's current
year (`metadata.date`'s year component).

**Rationale**: No save field explicitly labels "campaign start year" —
searched for `bookmark`/`campaign`/`scenario`-named keys near the
save's metadata section and found none. Two independent, convergent
pieces of evidence instead: (a) `ironman_manager.date` (a session-level
field, unrelated to any specific country) reads `1337-04-01` in this
save's own generated schema-mapping inventory
(`tools/schema-mapping/inventories/Russia (Melted).json`); (b) the
historical arrays are 292–293 entries long in a save whose current date
is `1628.8.14` — `1628 - 1337 = 291`, matching a 292/293-length array
to within the expected off-by-one/partial-year rounding. **Residual
risk**: only one save was available to test this against; if a second
save with a different current date becomes available before/during
implementation, re-derive `start_year = current_year - (array_length -
1)` per-save from the array length itself (self-describing, no
hardcoded constant needed) rather than trusting the hardcoded `1337`
in the face of contrary evidence — implementation should prefer the
self-describing derivation over the hardcoded constant for exactly
this reason.

## 4. Decision: "Real country" filter reuses the existing `country_type = 'Real'` convention

**Decision**: The search overlay's country list (spec FR-007) filters
on `nations.country_type = 'Real'`, identical to the existing nation
selector's query (`src/storage/queries.ts:155`:
`SELECT idx, tag, name FROM nations WHERE country_type = 'Real' ...`).

**Rationale**: This discriminator already exists, is already populated
by the parser, and is already the app's established convention for
"a real, selectable nation" (feature 001 research:
`country_type="Real"` for 2,467 of 2,470 entries in the sample save;
the remainder are `Pirates`/`Mercenaries`/the reserved `DUMMY` index-0
slot). No new field or logic needed — this feature's search overlay
reuses the same filter the nation selector elsewhere in the app already
applies, for consistency.

**Alternatives considered**: A stricter filter (e.g. "has at least one
non-zero historical value" or "currently owns territory") to exclude
long-defunct or purely-flavor tags from the several-thousand
`country_type = 'Real'` entries — deferred. The existing convention is
already what every other part of this app treats as "a real country";
diverging from it here would be a new, unreviewed judgment call rather
than a reuse of an established one, and isn't required by the spec.

## 5. Decision: Default-selected countries are the save's human-played countries

**Decision**: On first load (spec FR-008), pre-select every country the
save records as human-played — not "most populous" or similar computed
heuristics.

**Rationale**: User-directed. The save already marks this: `is_player`
is currently populated on `nations` for exactly one country (the
`played_country` list's first entry, in the adapter's existing
`playerIdx = playedCountryEntries[0].country` logic,
`src/parser/version-adapters/1.3.11.ts:163-167`). But the raw
`played_country` top-level key repeats **274 times** in the sample
save, each occurrence a full human-player record (`name`, `country`,
`player_proficiency`, UI state like `pins`/`control_groups`) — this
sample save is a multiplayer game, and the existing adapter only
captures the *first* entry's country as `is_player`, discarding the
rest. This feature needs all of them, not just one — see §6.

**Alternatives considered**: Defaulting to the most populous/wealthiest
countries — considered before the user weighed in, rejected once they
confirmed player-marked countries are what they want the default to be
(more meaningful for a "your game" landing page than an arbitrary
top-N).

## 6. Decision: New `is_human_played` column, not overloading `is_player`

**Decision**: Add a new `nations.is_human_played INTEGER NOT NULL
DEFAULT 0` column, set for **every** `played_country[*].country` index,
extending the existing extraction loop rather than replacing
`is_player`.

**Rationale**: `is_player` is already load-bearing elsewhere (it also
drives which single country gets its `name` set from
`metadata.player_country_name`, per the adapter's existing `UPDATE
nations SET is_player = 1, name = ?2 WHERE idx = ?1`). Overloading it
to mean "any of potentially many human players" instead of "the one
tracked player" risks changing behavior other features already depend
on. A new, additive column (same `ALTER TABLE ... ADD COLUMN IF NOT
EXISTS` pattern features 003/005 already use for schema growth) keeps
existing behavior untouched.

## 7. Decision: Hand-rolled SVG line chart, not Perspective's chart plugin

**Decision**: Render both graphs as a hand-rolled SVG line chart (one
`<path>` per selected country per graph), not via the app's existing
`@perspective-dev/viewer-charts` plugin.

**Rationale**: This feature's core visual requirement — each line's
stroke color bound to a specific data value (that country's
`color_r/g/b`, an arbitrary per-row RGB triple) rather than an
auto-assigned palette color — is exactly the kind of requirement
feature 005's map research.md (§8) already hit and rejected an
off-the-shelf option for, for the same reason: general-purpose
chart/rendering tools are built around palette-assigned series
colors or grouped pivots, not "bind this literal RGB value from the
data to this series." Perspective's charting layer, like the rejected
map libraries in 005, isn't designed for that. Scale favors SVG over
005's canvas choice here, unlike the map: this feature renders at most
a few dozen lines (default: however many human-played countries exist,
typically 1–274 in edge-case multiplayer, and this app's own multi-
select search interactions all similarly assume dozens not thousands)
× ~293 points each × 2 graphs — a few hundred to low-thousand SVG path
commands total, nowhere near the ~28,573-shape scale that pushed 005 to
canvas specifically to avoid per-element DOM/reconciliation cost. SVG
also gives hover/tooltip hit-testing (spec FR-012) for near-free
(native `<path>` pointer events), which 005's research explicitly
flagged as canvas's weak point (needing a hand-rolled hit-testing
index).

**Alternatives considered**:
- *Perspective's `Y Line` chart plugin*: rejected — no per-row arbitrary
  RGB binding; would require either a workaround (many single-series
  charts, one per country, each forced to a solid-color palette) or
  accepting auto-assigned colors, both of which fail FR-005.
- *Canvas 2D* (matching 005's choice): viable but unnecessary at this
  feature's scale; SVG's native hit-testing avoids re-solving the
  hit-testing problem 005 had to hand-roll for canvas, and this
  feature's point/line count doesn't approach the threshold that made
  canvas the right tradeoff there.
- *A new charting dependency* (e.g. a D3-based line-chart library):
  rejected per constitution Principle VII — the app doesn't have one
  today, and precise per-series RGB + a few hundred points is well
  within what a ~150-line hand-rolled SVG scale/line-path component
  does without pulling in a new dependency.

## 8. Decision: Distinguishing "didn't exist yet" from a real zero

**Decision**: For a given country and metric, treat a **leading** run of
zero-valued entries (from index 0 up to the first non-zero entry) as
"no data yet" and don't plot that portion of the line (spec FR-010,
edge cases). Zero values appearing *after* the country's line has
already started (a genuine famine-level population crash, a bankrupt
treasury-adjacent metric, etc.) are plotted as real zeros, not
suppressed.

**Rationale**: Every sampled all-zero `historical_population` array
observed belonged to what the schema summary and feature 004's own
sparse-slot findings describe as an unformed/placeholder tag slot (see
§4's `country_type` filter, which already excludes these from the
search overlay in the common case) — i.e., in practice, most
"country never existed for early years" cases are already filtered out
before this distinction matters. This rule is the fallback for the
remaining case: a *real* (`country_type = 'Real'`) country formed
partway through the campaign (a revolution-formed nation, a released
vassal, a colonial nation), whose array legitimately starts with zeros
before its founding year.

**Alternatives considered**: Treating every zero as real data (rejected
— constitution Principle IV forbids presenting "existed with 0
population for three centuries" as if it were the save's real claim
about a country that didn't exist yet); trying to detect the country's
actual founding date from another field and using that as the cutoff
instead of a leading-zero heuristic — deferred as unnecessary
complexity unless the leading-zero heuristic is shown to misfire during
implementation (no evidence of that in the sampled data so far).
