# Tasks: Country Leaderboard

**Input**: Design documents from `/specs/006-country-leaderboard/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/leaderboard-data-contract.md, quickstart.md (all present)

**Tests**: Included. Every new/changed field in `src/parser/version-adapters/1.3.11.ts` and `src/storage/schema.sql` gets a fixture-backed regression test per constitution Principle II (NON-NEGOTIABLE — a parser change without one is rejected in review), and the leading-zero-suppression rule (research.md §8) and the search overlay's filtering get pure-function/component tests per plan.md's Constitution Check, following the same convention `specs/005-map-visualization/tasks.md` used.

**Organization**: Three user stories in priority order. Phase 3 (US1) is the MVP: opening the Leaderboard shows both graphs already populated with the save's human-played countries — this is the "landing page" the spec is named for. Phase 4 (US2) adds the search overlay on top of the selection state US1 already had to build to show a default set. Phase 5 (US3) adds the wealth-metric toggle on top of the state US1 already had to build to plot the wealth graph at all. Neither US2 nor US3 touches the parser/schema/query layer — Foundational already extracts and loads every metric and every real country up front (data-model.md's full `nation_history` table), so both later stories are UI-only increments over Foundational + US1's data.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unresolved dependency)
- **[US1]**-**[US3]**: Which user story a task belongs to
- Paths are repo-relative, per `plan.md`'s Project Structure section

---

## Phase 1: Setup

**Purpose**: Confirm the ground this feature builds on before touching any code.

- [X] T001 Verify `tests/fixtures/rus-1628-minimal.eu5` actually retains `historical_population`/`historical_tax_base`/`historical_economical_base` (with at least one non-all-zero sample) and at least two distinct `played_country` entries with different `country` values (research.md §1, §5) — inspect it the same way `npm run schema-map` inspects a real save, or grep it directly (`grep -o "historical_[a-z_]*=" tests/fixtures/rus-1628-minimal.eu5`). Confirmed absent as of this feature's research pass — extend the fixture now (re-derive from the same source save used to build it, keeping it minimal) before any task below depends on it being present.

**Checkpoint**: The fixture this feature's tests rely on is confirmed to carry every field research.md cites, or has been extended so it does.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Everything every user story needs — schema, parser extraction, the two new queries, the decoded in-memory shapes (including leading-zero suppression), and the generic chart-rendering component. No page content is wired up yet — that's User Story 1's job, matching feature 005's Foundational/US1 split.

**⚠️ CRITICAL**: No user story task below can start until this phase is complete.

### Tests for Foundational ⚠️ (write first; confirm each fails before its paired implementation task)

- [X] T002 [P] Write failing tests in `tests/parser/adapter.test.ts` asserting that, after parsing the fixture: every nation whose index appears as `played_country[*].country` (not just the first entry) has `is_human_played = 1`, every other nation has `is_human_played = 0`; and `nation_history` has one row per `(nation, year, metric)` for `population`/`tax_base`/`economical_base`, with `year` equal to `1337 + <array index>` and `value` matching the fixture's raw array entry, for at least one sampled country/metric/index (research.md §1, §3, §5, §6; constitution Principle II).
- [X] T003 [P] Write failing tests in `tests/storage/leaderboard.test.ts` (new file, mirrors `tests/storage/map-locations.test.ts`'s structure): (a) `listLeaderboardCountriesArrow` returns one row per `country_type = 'Real'` nation with `{ idx, tag, name, color_r, color_g, color_b, is_human_played }`, excluding `Pirates`/`Mercenaries`/`DUMMY` entries; (b) `listNationHistoryArrow(db, nationIdxs)` returns rows only for the requested `nationIdxs`, ordered by `nation_idx, metric, year`; (c) a database created *without* this feature's new column/table (simulate the pre-006 schema, matching `map-locations.test.ts`'s kept-save test pattern) still opens successfully after the additive schema step runs, with `nations.is_human_played` present (defaulting `0` — `INTEGER NOT NULL DEFAULT 0`) and `nation_history` present but empty, rather than a SQL error.
- [X] T004 [P] Write failing pure-function tests in `tests/components/leaderboardData.test.ts` for a `suppressLeadingZeros(points: {year, value}[])` function (research.md §8): removes a *leading* run of `value === 0` entries up to the first non-zero entry; leaves a real zero appearing after the line has already started untouched; is a no-op on a series that never starts at zero; returns an empty array for an all-zero series.

### Implementation for Foundational

- [X] T005 Add `ALTER TABLE nations ADD COLUMN IF NOT EXISTS is_human_played INTEGER DEFAULT 0;` (not `NOT NULL` — DuckDB rejects that constraint on `ALTER TABLE ... ADD COLUMN`, confirmed empirically), `CREATE TABLE IF NOT EXISTS nation_history (nation_idx INTEGER NOT NULL, year INTEGER NOT NULL, metric TEXT NOT NULL, value DOUBLE NOT NULL);`, and `CREATE INDEX IF NOT EXISTS idx_nation_history_nation_metric ON nation_history (nation_idx, metric, year);` to `src/storage/schema.sql`, applied on every database open (same additive-migration pattern as feature 005's `color_r/g/b` columns — data-model.md has the full rationale). Partially satisfies T003(c).
- [X] T006 In `src/parser/version-adapters/1.3.11.ts`, add an `asNumberArray` helper mirroring the existing `asStringArray` (`src/parser/version-adapters/1.3.11.ts:98-100`): returns `Array.isArray(value) ? value.filter((v): v is number => typeof v === "number") : []`. Depends on T005.
- [X] T007 In the same file's existing `nationRows` extraction loop (`src/parser/version-adapters/1.3.11.ts:186-213`): build `humanPlayedIdxs` as a `Set<number>` from **every** `playedCountryEntries[*].country` (not just entry `[0]`, which is all the existing `playerIdx`/`is_player` logic uses — leave that logic untouched), and set the new `is_human_played` column from `humanPlayedIdxs.has(Number(idxStr)) ? 1 : 0` in the `nations` insert. In the same loop, read `record.historical_population`/`historical_tax_base`/`historical_economical_base` via `asNumberArray` (T006) and, for each array, for each index `i` with a value, push `[Number(idxStr), 1337 + i, '<metric>', value]` (using `'population'`/`'tax_base'`/`'economical_base'` respectively) into a new `nationHistoryRows` accumulator; insert it via one batched `INSERT INTO nation_history (nation_idx, year, metric, value) VALUES (?1, ?2, ?3, ?4)` call (`insertRows`, same batching helper the existing `nationRows`/`provinceRows` inserts already use) after the existing `nations` insert. Depends on T005, T006. Makes T002 pass.
- [X] T008 Implement `listLeaderboardCountriesArrow(db: SaveDatabase): Promise<ArrayBuffer>` in `src/storage/queries.ts` per `contracts/leaderboard-data-contract.md`: `SELECT idx, tag, name, color_r, color_g, color_b, is_human_played FROM nations WHERE country_type = 'Real' ORDER BY COALESCE(name, tag)` (same `country_type = 'Real'` filter the existing nation selector query already uses, `src/storage/queries.ts:155`). Depends on T005, T007. Makes T003(a) pass.
- [X] T009 Implement `listNationHistoryArrow(db: SaveDatabase, nationIdxs: number[]): Promise<ArrayBuffer>` in `src/storage/queries.ts` per the contract: `SELECT nation_idx, year, metric, value FROM nation_history WHERE nation_idx IN (...) ORDER BY nation_idx, metric, year`, parameterized over `nationIdxs` (not a full-table load — contract explicitly calls out this must stay scoped to the caller's current selection). Depends on T005, T007. Makes T003(b) pass.
- [X] T010 [P] Implement `src/components/Overview/leaderboardData.ts`: the `LeaderboardCountry`/`LeaderboardSeriesPoint` types (data-model.md), a loader that calls `listLeaderboardCountriesArrow` and decodes the Arrow IPC buffer via `apache-arrow`'s `tableFromIPC` (same direct-decode approach `src/storage/db.ts` already uses) into `LeaderboardCountry[]`, a loader that calls `listNationHistoryArrow` and decodes into points grouped by `(nationIdx, metric)`, and the `suppressLeadingZeros` function (T004) applied to each group before it's returned to a caller. Makes T004 pass.
- [X] T011 [P] Implement `src/components/Overview/LeaderboardChart.tsx` + `LeaderboardChart.css`: a generic hand-rolled SVG line chart taking `{ nationIdx, label, color: [number, number, number] | null, points: { year: number; value: number }[] }[]` plus a linear x(year)/y(value) scale computed from the full data range, rendering one `<path>` per series (using the app's existing neutral fallback color — matching feature 005's rule — when `color` is `null`, never a fabricated color, spec FR-005), and pointer-hover handling that surfaces the nearest point's country/year/value via an `onHover` callback prop (spec FR-012). No knowledge of "population" vs "wealth" specifics — reused for both graphs.

**Checkpoint**: Schema, parser, both queries, the decoded data shapes (with leading-zero suppression), and the generic chart component are all in place and tested; nothing is wired into the UI yet — the Leaderboard tab is still `ComingSoonPlaceholder`. User Story 1 makes it show something.

---

## Phase 3: User Story 1 - See history at a glance on load (Priority: P1) 🎯 MVP

**Goal**: Opening Encyclopedia → Leaderboard immediately shows both graphs, pre-populated with every human-played country's line across the full campaign, using each country's real in-game color — no interaction required.

**Independent Test**: Load a save, open Encyclopedia → Leaderboard, confirm both graphs render non-empty historical lines for more than one country without touching the search overlay (spec's own Independent Test).

### Tests for User Story 1 ⚠️

- [X] T012 [P] [US1] Write component tests in `tests/components/LeaderboardTab.test.tsx`: given a country list and history data where two countries have `is_human_played = 1`, the default selection includes exactly those two and excludes every other loaded country; given a country list where *no* country has `is_human_played = 1`, the default selection is still non-empty (spec FR-008's fallback); switching the wealth metric re-plots the wealth graph. **Revised during implementation**: `LeaderboardTab` takes a required `db: SaveDatabase` prop, matching `WarsTab`'s exact convention, rather than a nullable prop with its own internal empty state — spec FR-011's "no save loaded" case is handled by `FileLoader.tsx`'s existing outer ternary (identical to Wars/Map), not inside this component, so no separate test for that case lives here.

### Implementation for User Story 1

- [X] T013 [US1] Implement `src/components/Overview/LeaderboardTab.tsx` + `LeaderboardTab.css`: given a required `db: SaveDatabase` prop, on mount calls `leaderboardData.ts`'s country loader (T010) once; computes the default `selectedIdxs` as every country with `is_human_played = 1`, falling back to the first `FALLBACK_SELECTION_SIZE` (5) countries in the already-loaded, alphabetically-sorted list when no country is human-played (spec FR-008 — deliberately not a "highest population" ranking, since that would need an extra save-wide history query contradicting `listNationHistoryArrow`'s scoped-by-design contract); holds `wealthMetric` state defaulting to `'economical_base'`; loads history (T010's history loader) for the current `selectedIdxs` whenever `selectedIdxs` or `wealthMetric` changes; renders two `LeaderboardChart` (T011) instances — population always keyed to `'population'`, wealth keyed to the current `wealthMetric`. Makes T012 pass.
- [X] T014 [US1] Wire `LeaderboardTab` into `src/components/Overview/FileLoader.tsx`: replace `{isEncyclopedia && encyclopediaTab === "leaderboard" && <ComingSoonPlaceholder feature="Leaderboard" />}` (`FileLoader.tsx:441-443`) with the same `isReady && readDbRef.current ? <LeaderboardTab db={readDbRef.current} /> : <p>Select a save file above to get started.</p>` ternary `WarsTab`/`MapTab` already use — this is what satisfies spec FR-011's empty state. Depends on T013.

**Checkpoint**: Encyclopedia → Leaderboard is a real page showing both graphs with a meaningful default selection (spec FR-001–FR-005, FR-008, FR-011, FR-012, SC-002) — independently demoable even though the search overlay and metric toggle don't exist yet.

---

## Phase 4: User Story 2 - Choose which countries to compare (Priority: P2)

**Goal**: A search bar overlay lets the user find any real country by name or tag and toggle it on/off both graphs at once.

**Independent Test**: With the Leaderboard open, use the search overlay to add a country not currently shown, confirm its line appears on both graphs, then remove a shown country and confirm its line disappears from both graphs (spec's own Independent Test).

### Tests for User Story 2 ⚠️

- [X] T015 [P] [US2] Write component tests in `tests/components/CountrySearchOverlay.test.tsx`: given a `LeaderboardCountry[]` list and a partial name, filters to matching countries by name; given a partial tag, filters by tag; clicking a result calls `onToggle` with that country's `idx`; a country already in the current selection renders as visibly selected within the results.

### Implementation for User Story 2

- [X] T016 [US2] Implement `src/components/Overview/CountrySearchOverlay.tsx` + `CountrySearchOverlay.css`: a text input filtering the `LeaderboardCountry[]` list (already loaded by `LeaderboardTab`, T013 — no query of its own) by case-insensitive name/tag substring match, a result list marking which entries are in the current selection, and an `onToggle(idx: number)` callback per row. Makes T015 pass.
- [X] T017 [US2] Wire `CountrySearchOverlay` into `LeaderboardTab.tsx`: an open/close trigger for the overlay, and `onToggle` adds the idx to `selectedIdxs` if absent or removes it if present (spec FR-004, FR-006 — both graphs re-render from the same shared `selectedIdxs`, not independently). Depends on T013, T016.

**Checkpoint**: The search overlay adds/removes countries from both graphs simultaneously (spec FR-004, FR-006, FR-007, SC-001, SC-003, SC-005) — User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Switch what "wealth" means (Priority: P3)

**Goal**: A metric control on the wealth graph switches between Economic Base and Tax Base, applied to every currently selected country.

**Independent Test**: With the Leaderboard open and countries selected, switch the wealth graph's metric control and confirm the graph's values change to reflect the newly chosen metric for every currently selected country (spec's own Independent Test).

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] Extend `tests/components/LeaderboardTab.test.tsx` (T012's file): switching the metric control from `'economical_base'` to `'tax_base'` re-renders the wealth graph with tax-base values for every currently selected country; a country added via `onToggle` *after* the switch plots using the currently active metric, not the default (spec FR-009, Acceptance Scenario 2).

### Implementation for User Story 3

- [X] T019 [US3] Add a metric toggle control to `LeaderboardTab.tsx` (e.g. two buttons or a small `<select>` — "Economic Base" / "Tax Base") wired to the `wealthMetric` state already introduced in T013. **Simpler than originally planned**: `listNationHistoryArrow`/`loadNationHistory` already return all three metrics per selected country in one call (data-model.md — `nation_history` has no per-metric query scoping, only per-nation), so switching the metric needs no new history load at all — it purely re-derives `seriesFor(wealthMetric)` from state already held, and the population graph was never touched by this either way. Makes T018 pass. Depends on T013.

**Superseded (2026-09-20, during implementation)** — direction received after T019 landed replaced the toggle entirely: `WEALTH_METRICS`/`wealthMetric` state and the toggle buttons were removed from `LeaderboardTab.tsx`; all three metrics (population, economic base, tax base) now render as three always-visible `LeaderboardChart` instances (`GRAPHS` constant) with no switch between them. T018's obsolete test cases were replaced with one confirming all three graphs render simultaneously and no toggle control exists. Same round of direction added, beyond the original scope of this phase:
- **Zoom/pan** on each `LeaderboardChart` independently (mouse wheel to zoom centered on the cursor, click-drag to pan once zoomed, a "Reset zoom" control) — `tests/components/LeaderboardChart.test.tsx`.
- **Expanded axis tick labels** — 6 evenly-spaced ticks per axis (`ticksFor`) instead of just the two range endpoints.
- **On-chart hover tooltip** — inspecting a point now shows a floating tooltip positioned at/near that point on the chart itself (spec FR-012, revised), replacing an earlier fixed status line below the search button (per direct user feedback: "display data on mouse hover over graph line not below the search countries button"). The native SVG `<title>` per point was kept alongside it for accessibility.
- **Clip-path fix** — a user-reported bug ("the graph data will bleed outside the graph") during zoom testing: without clipping, a zoomed/panned view could draw line/point segments past the axes' inner rectangle, overlapping tick labels and the chart border. Fixed with an SVG `clipPath` (`useId()`-scoped per chart instance, since three charts render on one page) wrapping the series `<g>`; regression-tested in `tests/components/LeaderboardChart.test.tsx`.

spec.md, plan.md, and quickstart.md were updated to match (spec.md's User Story 3 carries a revision note; FR-002/004/008/009/012 updated; FR-013/FR-014 added for zoom and tick labels).

**Checkpoint**: All three user stories work independently — the feature matches spec User Stories 1–3 (as revised) in full.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification beyond the trimmed fixture, and the accessibility check plan.md's Constitution Check flagged.

- [X] T020 [P] Run `quickstart.md` steps 1-3 (fixture-backed adapter/storage tests, kept-save compatibility, and the year-mapping empirical check) and confirm all pass. **Result**: all pass (`npm test` — 200 tests; individual-file runs are consistently green, full-suite parallel runs show pre-existing, unrelated cross-file flakiness in vitest's per-file worker isolation under parallel DuckDB/OPFS load — a different random subset of files, none of them this feature's, fails each full run; confirmed pre-existing and out of this feature's scope).
- [X] T021 Run `quickstart.md` step 4 (manual verification in the running app) against the real full save (`/Users/halda/Downloads/Russia (Melted).eu5`) to confirm the default selection and both graphs render correctly at real multiplayer scale, not just the trimmed fixture's smaller scale — plan.md's Constitution Check (Principle V) flagged this as required before treating performance at scale as verified. **Result**: ran the full parser → schema → query pipeline end-to-end against the real 642MB save (no browser available to the implementing agent, matching feature 005's T029 precedent — data-layer verified directly instead): parse+store took ~29s; 2,467 `country_type='Real'` countries; **21 human-played countries** (exact match to the user's own recollection of the game — `BOH`, `BRL`, `BYZ`, `FRA`, `GBR`, ...); 793,869 total `nation_history` rows; `listNationHistoryArrow` scoped to the 21 human-played countries returned 17,526 rows in 55ms; year range 1337–1628 exactly, confirming research.md §3's derived start year against real data. A human should still do a final visual/interaction pass in a real browser (zoom/pan feel, tooltip readability) before calling this fully done.
- [X] T022 [P] Run `quickstart.md` step 5 (accessibility spot-check, constitution Principle VI): confirm hovering a line/point reveals the country's name as text, independent of being able to visually distinguish two similarly-colored countries' lines by eye. **Result**: structurally confirmed — each point carries a native SVG `<title>` (accessible name via assistive tech) plus an on-chart visual tooltip, both showing country/year/value as text; verified via component tests (`tests/components/LeaderboardChart.test.tsx`). Visual/AT-tool confirmation in a real browser not performed (no browser available to the implementing agent, same caveat as T021).

---

## Post-implementation addendum (2026-09-20): per-metric pages + ranking table

Direction received after the feature above was fully implemented and
tested (200/204 suite passing, only the pre-existing unrelated
`keep-save.test.ts` flakiness): "separate all three pages... part of
the leaderboard's side nav... each of these pages now gets a two
column simple leaderboard table that ranks the nations accordingly...
just a UI enhancement." Implemented as a page-local restructure — no
schema/parser/query changes, `nation_history`'s three-metrics-per-call
shape (T009) already supported this without a new query:

- **`LeaderboardSideNav.tsx`/`.css`** (new): a vertical nav mirroring
  `SideNav.tsx`'s pattern (Country Viewer's own side nav) but
  self-contained within `LeaderboardTab` rather than wired into the app
  shell's `sidenav` grid area (`Shell.css`) — that area belongs to
  Country Viewer; duplicating its shell-level plumbing wasn't
  proportionate for what's otherwise a page-local UI change. Lists the
  three metrics; selecting one sets `LeaderboardTab`'s new
  `activeMetric` state.
- **`LeaderboardTab.tsx`** (restructured): now renders exactly one
  `LeaderboardChart` at a time (the active metric's), not all three
  stacked — `GRAPHS` renamed `PAGES`, reused by the side nav. Layout
  becomes a two-column flex (side nav + content column); search overlay
  and selection state are unchanged (shared across all three pages, per
  original FR-004).
- **`LeaderboardRankingTable.tsx`/`.css`** (new): a two-column table
  (Country, the active metric's value) per page, sorted descending by
  each selected country's latest available value — rank conveyed by row
  order, no separate rank-number column (explicit "two column"
  direction). A country with no data at all for the metric (`value:
  null`) sorts last and renders `—`, never a fabricated `0`
  (constitution Principle IV, same posture as the chart's leading-zero
  suppression). Reuses the same country color/label the chart plots
  with, so a row's swatch matches its line.
- Tests: `tests/components/LeaderboardSideNav.test.tsx`,
  `tests/components/LeaderboardRankingTable.test.tsx` (new), and
  `LeaderboardTab.test.tsx`'s multi-graph test rewritten to verify
  one-page-at-a-time + side-nav switching instead.

spec.md/plan.md/quickstart.md were **not** re-revised for this pass —
the user explicitly framed it as "just a UI enhancement" on top of the
already-complete, already-reconciled spec; FR-002/FR-004's substance
(all three metrics available, shared selection) still holds, just
presented as separate pages instead of three stacked graphs.

---

## Post-implementation addendum (2026-09-20): perf pass + Treemap stretch goal

### Perf pass (direct request: "make the graphs faster")

`LeaderboardChart.tsx` previously rendered one `<circle>` per
`(selected country, year)` point — at the reference save's real scale
(~21 human-played countries × ~293 years) that's thousands of elements,
each carrying its own freshly-allocated `onMouseEnter`/`onMouseLeave`
closures and a `<title>` child, recreated on every render. Replaced
with:
- **`xTickCountFor(yearSpan)`**: the user's own proposed fix — every
  100 years of visible range halves the x-axis tick count (floor to
  min 2). Cheap, does what was asked, though it's a minor contributor
  next to the point below.
- **Shared hover hit-test**: `handleMouseMove` now does one SVG-wide
  nearest-point lookup (via `nearestPointIndex`'s binary search per
  series, since points are sorted by year) instead of a per-circle
  listener; circles lost their individual handlers/titles entirely
  (`pointer-events: none` in CSS) and are now purely decorative — the
  existing on-chart floating tooltip is the only hover UI, still
  satisfying constitution Principle VI (text identification independent
  of color). Tested in `tests/components/LeaderboardChart.test.tsx`.
- User-reported bug found while testing this: zoomed/panned data could
  draw past the axes' inner rectangle, overlapping tick labels and the
  border. Fixed with an SVG `clipPath` (`useId()`-scoped per chart
  instance, since the page can render multiple charts) wrapping the
  series `<g>`; regression-tested alongside the above.

### Treemap stretch goal

Direction: split each metric page across **three views** (Ranking
Table / Graph / Treemap, switched via buttons next to "Search
countries", default Graph) — the Treemap being "share of the world
[metric]": one box per currently-selected country with a recorded
latest-year value, plus one grey "Other" box summing every other real
country's latest-year value, box area exactly proportional to that
combined total.

**Perspective investigated and rejected, empirically this time, not
just from source-reading** (the user explicitly asked for this to be
chased down further after the initial "probably not viable" read):
- Confirmed via `tree-data.ts` source that Treemap's categorical
  ("series") color mode resolves via `palette[dictIdx % paletteSize]`,
  where `dictIdx` is a category's position in the *view's own computed*
  Arrow dictionary — deterministic in theory, and genuinely backed by a
  real, documented config surface (`ViewerConfig.columns_config`,
  `sort` — not the undocumented hack it first looked like;
  `column_config_schema()` on the live plugin instance confirmed the
  real field key is `palette`).
- Built an actual throwaway spike (`src/PerspectivePalettePoc.tsx`,
  gated behind a temporary `?poc` URL flag in `main.tsx`, both reverted
  after) and drove it through a real running browser via `claude-in-
  chrome`: created a 3-row table, configured `group_by`/`sort` on the
  color column, and attempted `columns_config[col].palette` both
  declaratively and imperatively (`viewer.restore(...)`).
- **Result: it does not work in practice.** The Style editor's actual
  UI persists a `gradient` key with percentage-offset stops, not the
  `palette` key `column_config_schema()` itself declares for a
  string/Hierarchical-category column — a real inconsistency in the
  library, not a misconfiguration on this feature's part. Even after
  getting a `gradient` value to round-trip through `columns_config`
  (confirmed via `viewer.save()`), the rendered treemap boxes never
  changed color. Forcing a repaint via `restyleElement()`/`restore()`
  threw a WASM-level `"View not found"` error.
- Conclusion: hand-roll the treemap the same way as the line chart, for
  the same underlying reason (no literal per-row RGB binding anywhere
  in this library), now with direct empirical confirmation rather than
  just the fragility argument.

**New backend**: `listLatestNationMetricArrow(db, metric)` in
`queries.ts` — one row per `country_type = 'Real'` country with its
value at `arg_max(value, year)` (DuckDB aggregate; avoids a self-join)
for the given metric. Deliberately separate from
`listNationHistoryArrow` (which would need every real country's full
history just to find one value each, contradicting that function's own
scoped-by-design contract per the original contract doc). Decoded by
`loadLatestNationMetric` in `leaderboardData.ts`. Tested in
`tests/storage/leaderboard.test.ts`.

**New pure module**: `treemapLayout.ts`'s `squarify()` — a standard
squarified-treemap layout (Bruls/Huizing/van Wijk), flat (one level,
no nesting), framework-agnostic, unit-tested in isolation
(`tests/components/treemapLayout.test.ts`: area conservation, exact
proportionality to value, no overlaps, zero/negative values excluded
rather than producing degenerate boxes) — mirrors `mapHitTest.ts`'s
precedent for pure geometry helpers in this codebase.

**New component**: `LeaderboardTreemap.tsx`/`.css` — renders
`squarify()`'s output as SVG `rect`s, each country's real in-game
color (or the shared neutral fallback), the "Other" bucket in that same
neutral grey, a label when a box is large enough to hold one, and a
per-box hover highlight + native `<title>` (small N here — one box per
selected country plus one, not thousands of points — so per-box
listeners are fine, unlike the chart's perf fix above). Tested in
`tests/components/LeaderboardTreemap.test.tsx`.

**`LeaderboardTab.tsx`**: gained an `activeView` state (`"graph" |
"table" | "treemap"`, default `"graph"`) and the three-button switcher;
computes the Treemap's entries from the already-loaded selection plus a
new always-kept-current `latestMetric` map (loaded whenever
`db`/`activeMetric` change, cheap enough not to gate behind actually
opening the Treemap view). Tests extended in
`tests/components/LeaderboardTab.test.tsx` for view-switching and the
Other-bucket computation.

**Manual browser verification**: attempted via `claude-in-chrome` with
the trimmed fixture, but that fixture's deliberately-dangling
`played_country` reference (existing, pre-006 characteristic — see
`adapter.test.ts`'s "returns the save's in-game date" test) trips a
save-wide error before any section (not just Leaderboard) reaches
"ready," and the real full save exceeds the upload tool's 10MB limit.
Not achievable in this environment — a human should do a final visual
pass with a real save before calling the Treemap fully verified,
same caveat already on record for T021.

**Manual verification DID happen partially**: the user loaded the real
save themselves (`claude-in-chrome`'s upload tool worked for the small
trimmed fixture, just not the 642MB real one) and shared a screenshot.
It surfaced a real bug: `country_type = 'Real'` (research.md §4) covers
~2,467 of ~2,470 country slots — the overwhelming majority long-defunct
historical tags, not currently-alive nations — so "Other" was summing
centuries-stale population figures from countries that no longer exist,
making it dwarf every selected country (~99%+ of the treemap). Fixed:
`listLatestNationMetricArrow` now also requires `EXISTS (SELECT 1 FROM
locations WHERE locations.owner_idx = nations.idx)` — currently owns at
least one location, the same territory-ownership signal feature 005's
map already treats as authoritative for "is this country alive," per
direct correction ("actually exist" = "own locations and have not
ceased to exist"). Verified against the real save: countries
contributing to Other dropped from 2,467 to 265; Other's share of world
population dropped from ~99%+ to 60.6%; one of the 21 human-played
countries currently owns no territory and correctly stopped getting its
own box. New regression test in `tests/storage/leaderboard.test.ts`
(hand-seeded: a landless `country_type='Real'` country is excluded even
though it has a `nation_history` row). A "group treemap boxes by
continent" follow-up idea was investigated (no location carries a
continent field directly; found a real but incomplete region→area→
province→location hierarchy in the game's `definitions.txt`, currently
parsed and discarded by `tools/map-generation/read-definitions.ts`, and
a separate coarser `sub_continent` naming only in sparse exploration-log
entries — no ready-to-use location→continent table) — explicitly
dropped in favor of the ownership fix once its impact was confirmed.

**Ranking table**: gained a numeric `#` rank column (direct follow-up
request) — a country with no data ranks last and shows `—` for rank too,
not a fabricated number.

**Treemap hover**: the per-box tooltip was native-`<title>`-only (a
browser tooltip, not this app's own UI) — added a visible on-chart
floating tooltip matching `LeaderboardChart.tsx`'s pattern, showing
country, value, and share of the total (`formatShare`) on hover; the
native `<title>` stays too, for the same accessibility reason as the
chart. Tested in `tests/components/LeaderboardTreemap.test.tsx`.

**App-wide nav rename** (out of this feature's own scope, but touches
`FileLoader.tsx`/`TopBar.tsx`/`tabs.ts` which this feature already
extends): "Map" → **Atlas** (label only, internal id `"map"`
unchanged — no new section collides with it); "Encyclopedia" (the
Countries/Wars/Leaderboard/Characters/Markets section) → **Factbook**
(internal id renamed `"encyclopedia"` → `"factbook"`, `isEncyclopedia`
→ `isFactbook` throughout `FileLoader.tsx`, since a genuinely *new*,
separate **Encyclopedia** section was added at the same top-level —
currently a `ComingSoonPlaceholder`, no sub-content yet). `EncyclopediaTab`/
`EncyclopediaNav.tsx`/`encyclopediaTab` were deliberately left
unrenamed — they describe Factbook's own five sub-tabs, a still-accurate
name for a still-accurate concept; only the section-level id/label that
had become ambiguous was touched. `tests/components/TopBar.test.tsx`
updated for five sections instead of four.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup (T001's fixture-coverage check). Blocks every user story.
- **User Stories (Phase 3+)**: All depend on Foundational (Phase 2) completion.
  - US1 (P1) has no dependency on US2/US3.
  - US2 (P2) depends on `LeaderboardTab.tsx` existing (T013, US1) — it adds a UI control over state US1 already built; not independently buildable before US1's tab shell exists, but independently *testable/demoable* once both are in place, per spec's own priority note.
  - US3 (P3) likewise depends on `LeaderboardTab.tsx`'s `wealthMetric` state (T013, US1) existing.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2). No dependency on US2/US3.
- **User Story 2 (P2)**: Can start after US1's `LeaderboardTab.tsx` (T013) exists — extends its selection state rather than duplicating it.
- **User Story 3 (P3)**: Can start after US1's `LeaderboardTab.tsx` (T013) exists — extends its metric state rather than duplicating it. Independent of US2 (different piece of `LeaderboardTab`'s state); could be built in parallel with US2 by a second developer once T013 lands.

### Within Each Phase

- Tests are written first and confirmed failing before their paired implementation task.
- Schema before parser extraction; parser extraction before queries; queries before decode/UI layers.
- Story complete (checkpoint) before moving to the next priority, unless staffed in parallel per above.

### Parallel Opportunities

- T002, T003, T004 (Foundational tests) can run in parallel — different files, no shared dependency.
- T010, T011 (Foundational implementation) can run in parallel once T005–T009 land — different files.
- Once T013 (US1's tab shell) lands, US2 (T015-T017) and US3 (T018-T019) can proceed in parallel by different developers — they touch different parts of the same file (`LeaderboardTab.tsx`) for their final wiring step (T017/T019), so that specific pair of tasks should not literally run concurrently against the same file, but everything else in both stories can.
- T020 and T022 (Polish) can run in parallel; T021 should run after both since it's the most expensive/manual step.

---

## Parallel Example: Foundational

```bash
# Launch all Foundational tests together:
Task: "Write failing tests in tests/parser/adapter.test.ts for is_human_played and nation_history"
Task: "Write failing tests in tests/storage/leaderboard.test.ts for both new query functions + kept-save compatibility"
Task: "Write failing pure-function tests in tests/components/leaderboardData.test.ts for suppressLeadingZeros"

# Launch the two independent Foundational implementation files together (after T005-T009 land):
Task: "Implement src/components/Overview/leaderboardData.ts"
Task: "Implement src/components/Overview/LeaderboardChart.tsx + .css"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (fixture check).
2. Complete Phase 2: Foundational (schema, parser, queries, decode layer, chart component — CRITICAL, blocks all stories).
3. Complete Phase 3: User Story 1.
4. **STOP and VALIDATE**: Load a save, open Encyclopedia → Leaderboard, confirm both graphs render the human-played countries' full history with correct colors.
5. Deploy/demo if ready — this alone replaces the "coming soon" placeholder with real value.

### Incremental Delivery

1. Setup + Foundational → data pipeline and chart engine ready, nothing visible yet.
2. Add User Story 1 → test independently → deploy/demo (MVP: a working default leaderboard).
3. Add User Story 2 → test independently → deploy/demo (comparison tool via search).
4. Add User Story 3 → test independently → deploy/demo (wealth-metric precision).
5. Each story adds value without breaking the previous ones.

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together.
2. Team completes User Story 1 together (small enough that splitting it further isn't worth the coordination cost).
3. Once US1's `LeaderboardTab.tsx` shell (T013) exists:
   - Developer A: User Story 2 (search overlay)
   - Developer B: User Story 3 (metric toggle)
4. Both integrate into `LeaderboardTab.tsx` independently (different state, different render regions) and are each independently testable.
