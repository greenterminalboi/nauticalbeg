# Phase 0 Research: Societal Values Compass

## Decision: store raw axis readings as a long-format side table

**Decision**: Add `nation_societal_values(nation_idx INTEGER, axis TEXT, value DOUBLE)`
with an index on `(nation_idx, axis)`, mirroring the existing `nation_history`
and `province_good_production` tables.

**Rationale**: The raw save stores each country's 17 axes as a flat object of
named keys — the same shape `nation_history` (per-metric) and
`province_good_production` (per-good) already handle for other per-entity
flat-object fields. Reusing that shape keeps this feature consistent with the
codebase's one established convention for "many named values per entity"
instead of introducing a second pattern (wide columns, or a JSON column) for
the same kind of data.

**Alternatives considered**:
- Wide columns on `nations` (one column per axis): rejected — inconsistent
  with the existing convention, and a poor fit for a value set that may grow
  (17 axes today, more could be added by a future game update).
- A JSON column: rejected — none of the existing per-country query code reads
  JSON; every other multi-value field is queried via a normal join, and
  `queries.ts`'s existing `listLatestNationMetricArrow`-style joins are
  directly reusable against a long-format table but not against JSON.

## Decision: drop the `-999` sentinel at ingest time, not at query time

**Decision**: When parsing `government.societal_values`, skip inserting a row
for any axis whose raw value is exactly `-999`. A country/axis pair with no
row means "not applicable."

**Rationale**: This matches the existing `asNumberOrNull`-style filtering
already used elsewhere in the version adapter for optional fields, and it
means every downstream query (including a future one nobody has written yet)
gets "not applicable" for free by simply not finding a row, rather than every
consumer needing to remember to filter `-999` itself.

## Decision: the raw `-999` sentinel is sufficient for axis gating — no separate unlock-condition table needed

**Decision**: Do not model *why* an axis is inapplicable (Age not reached,
wrong cultural/religious sphere, etc.) anywhere in the schema. The presence or
absence of a row in `nation_societal_values` for a given country/axis is the
only signal the system needs.

**Rationale**: This resolves the spec's one remaining open question (the
Latinization/Hellenization axis's undocumented gating condition, `spec.md`
Assumptions) without needing to reverse-engineer it: the game's own save data
already tells us, per country, whether the axis is currently meaningful. We
never need to separately encode "gated by Age of Absolutism" as a rule the
app enforces — the raw sentinel already enforces it.

## Decision: normalize the raw -100..+100 range only at the point of use

**Decision**: Store the raw value as given by the save (roughly -100 to
+100). Normalize to the internal -1.0..+1.0 scale used by the vector-sum
projection (spec §5) in the query/service layer that computes compass
positions, not in storage.

**Rationale**: Per Constitution Principle IV (Accurate, Unembellished
Representation), stored values should stay close to what the save actually
contains. The ±1.0 normalization is a presentation/computation detail of one
feature (the compass), not a fact about the country.

## Decision: great-power status needs its own new small table

**Decision**: Add `great_powers(nation_idx INTEGER, is_current BOOLEAN)`,
populated from `great_power_manager.members` during the same per-country
parse pass.

**Rationale**: FR-012 requires distinguishing great powers by color, and no
existing table currently carries this (confirmed: `great_power_manager` is
parsed nowhere in the current codebase). A minimal membership table follows
the same lightweight side-table convention as the two decisions above rather
than introducing a new shape.

**Alternatives considered**: computing it client-side from a retained raw
save blob — rejected, no raw save JSON is retained after parsing for any
other feature; every other manager is reduced into schema.sql immediately.

## Decision: dot-size metric reuses the existing "latest value per metric" join

**Decision**: Population reads the existing `nation_history` population
metric via the same latest-value join pattern `listLatestNationMetricArrow`
already uses. Total development reuses whichever development-equivalent
metric already exists in `nation_history` from prior features (Leaderboard /
World Goods); if no such metric is already populated, add one following that
same existing ingestion path rather than inventing a new one.

**Rationale**: Confirmed precedent: `HISTORY_METRICS` already maps
`historical_population` (and similar) onto rows in `nation_history`. Reusing
this avoids a second, parallel "current value" code path.

## Decision: first scatter chart in the codebase, built on the existing ECharts hook

**Decision**: Build the compass as one new ECharts `scatter` series consumed
through the existing `useEChartsInstance` hook (`src/components/Overview/charts/useEChartsInstance.ts`),
following `LeaderboardChart.tsx`'s shape: typed props in, the chart `option`
built in a `useMemo`, tooltip driven by a custom `tooltipFormatter` closure
(the same pattern `RulerHistoryChart` uses) rather than ECharts' default
nearest-point tooltip, so the tooltip can show a per-axis breakdown instead
of just the nearest series value.

**Rationale**: No scatter series exists yet in this codebase, but
`symbolSize`/`itemStyle.color` as per-point functions are standard ECharts
capabilities; there is nothing about a scatter series that the existing hook
and option-building pattern can't already support.

**Alternatives considered**: a different charting library for this one
chart — rejected per Constitution Principle VII (no new dependency without a
concrete need the existing library can't meet).

## Decision: size/color toggles use the button-group pattern, not the search-popover pattern

**Decision**: The size-metric toggle (2 options) and color-mode toggle (2
options) use the existing sidenav button-group style
(`LeaderboardSideNav`/`MarketsSideNav`). The "color by axis" sub-picker
(choosing among ~16 axes) reuses `GoodSelect.tsx`'s filtered-popover pattern,
since that list is long enough to need search/filter.

**Rationale**: Matches existing precedent for picker size — `GoodSelect` was
built for a large enumerable list; a 2-3-way toggle already has an established,
lighter-weight pattern elsewhere in the same folder.

## Decision: quadrant reference overlay is a static ECharts graphic layer

**Decision**: The background gridlines and quadrant labels (User Story 3) are
static ECharts `graphic` elements (lines + text), layered under the scatter
series in the same chart option — never computed from the loaded save's data.

**Rationale**: Directly satisfies FR-014 (decorative, non-data-derived) with
no new rendering technique beyond what ECharts' `option.graphic` already
supports.

## Constitution Principle II compliance note

The existing parser fixture (`tests/fixtures/rus-1628-minimal.eu5`) does not
currently contain a `societal_values` block or `great_power_manager.members`
entry (both deliberately trimmed, like the rest of that minimal fixture).
Per Principle II (NON-NEGOTIABLE test-first fixtures), the fixture must be
extended with representative `societal_values` (including at least one `-999`
sentinel case) and `great_power_manager.members` data, with an accompanying
regression test in `tests/parser/adapter.test.ts`, before the new parsing
logic is merged. This is carried into `tasks.md` as an explicit early task,
not deferred to the end.
