# Quickstart: Validating Country Leaderboard

Prerequisites: this repo's dependencies installed (`npm install` — no
new dependencies this feature adds, per research.md §7: hand-rolled SVG,
no new charting library), and either the real full save
(`/Users/halda/Downloads/Russia (Melted).eu5`, used for this feature's
own research) or the trimmed fixture at
`tests/fixtures/rus-1628-minimal.eu5` — **extend the fixture first** if
it doesn't yet carry `historical_population`/`historical_tax_base`/
`historical_economical_base`/multiple `played_country` entries (it did
not, as of this feature's research pass — confirm with `grep -o
"historical_[a-z_]*=" tests/fixtures/rus-1628-minimal.eu5` before
trusting fixture-based steps below).

## 1. Confirm the schema/parser additions land (spec FR-002, FR-008, FR-009)

```bash
npm test -- tests/parser/adapter.test.ts
```

Expected: existing adapter tests still pass, plus new assertions (added
by this feature's tasks) that: a real nation row now has
`is_human_played = 1` for every country referenced by the fixture's
`played_country` entries; `nation_history` has rows for that same
nation across all three metrics; and the year values are `1337 + array
index` (research.md §3) for a known-good sample index.

## 2. Confirm kept-save compatibility (data-model.md, contract's "kept save" note)

```bash
npm test -- tests/storage
```

Expected: a database created before this feature's `ALTER TABLE`/`CREATE
TABLE` additions still opens successfully afterward, with
`is_human_played` present (defaulting `0`) and `nation_history` present
but empty, rather than a SQL error — and the app's Leaderboard page
falls back to its empty/placeholder state for such a save (spec
FR-011), not an error.

## 3. Confirm the year mapping empirically (research.md §3's residual risk)

```bash
node -e '
  // Re-derive start year from array length + current date, rather than
  // trusting the hardcoded 1337 blindly — confirms research.md §3 is
  // still holding for whatever save this check runs against.
  // (Fill in with the actual listNationHistoryArrow result for one
  // nation/metric once the query function exists.)
'
```

Confirm: `max(year)` returned for any `(nation, metric)` equals the
loaded save's current in-game year (`save_meta.in_game_date`'s year
component); `min(year)` is `1337` or later (never earlier — a value
below 1337 would mean the hardcoded start year is wrong for this save
and the self-describing derivation from array length should be used
instead, per research.md §3).

## 4. Manual verification in the running app (spec User Stories 1-3)

```bash
npm run dev
```

1. Load a save.
2. Open **Factbook → Leaderboard** (Factbook is the section formerly
   labeled "Encyclopedia," renamed 2026-09-20 — the section now called
   "Encyclopedia" is a different, unrelated placeholder; don't confuse
   the two) — confirm it's reachable (spec FR-001) and no longer the
   `ComingSoonPlaceholder`.
3. Confirm the Leaderboard's own side navigation lists three pages —
   Population, Economic Base, Tax Base (spec FR-002) — and that the
   default (Population) page's default Graph view renders immediately
   with more than one country's line, without touching the search
   overlay (spec User Story 1, FR-008) — cross-check the pre-selected
   countries against the save's actual human players (the in-game
   player list, or `played_country` entries) to confirm the default
   selection is correct, not arbitrary.
4. Confirm each line's color visually matches that country's real
   in-game map color (spot-check 2-3 known countries; cross-reference
   against the Atlas' Political layer for the same countries, which
   already renders these same colors per feature 005 — the colors
   should match exactly since both features source from the same
   `nations.color_r/g/b`).
5. Open the search bar overlay (spec User Story 2, FR-006). Confirm:
   - Typing part of a name or tag filters results.
   - No placeholder/unformed country slots appear in results (spot-check
     against a known-DUMMY or Pirates/Mercenaries tag — confirm it's
     absent, spec FR-007/SC-003).
   - Selecting a country not currently shown adds it to whichever view
     is active; switching pages or views (step 6 below) keeps it
     selected everywhere (FR-004 — selection is shared, not per-page or
     per-view). Deselecting removes it everywhere the same way.
6. Confirm the three view-switcher buttons (Graph / Ranking / Treemap,
   spec FR-015) each show exactly one view at a time, defaulting to
   Graph, for every metric page — switching metric pages via the side
   nav keeps the currently active view selected (e.g. staying on
   Treemap while moving from Population to Tax Base).
7. On the Graph view, scroll to zoom in/out and confirm the visible
   year/value range narrows/widens around the cursor; click-drag to pan
   once zoomed in; use the "Reset zoom" control to return to the full
   range (spec User Story 3, FR-013) — confirm zoom/pan on one page's
   graph doesn't affect another page's. Hover a point — confirm a
   tooltip appears at/near the point itself showing the country, year,
   and value (FR-012). Confirm each axis shows several intermediate
   tick labels, not just the two endpoint values (FR-014).
8. On the Ranking view, confirm rows are sorted descending by value and
   each carries a numeric rank (`#` column, 1/2/3/...) matching that
   order (spec FR-016); a country with no recorded value (if any is
   selected) sorts last with a `—` for both rank and value, not a
   fabricated `0`.
9. On the Treemap view, confirm one box per selected country that
   currently owns territory, plus a visually distinct grey "Other" box
   (spec FR-017) — confirm a selected country that's been fully
   annexed/destroyed does **not** get its own box (own-territory check,
   not just `country_type`). Hover a box — confirm a tooltip shows the
   country (or "Other"), its value, and its percentage share of the
   combined total (spec FR-018) — this should feel immediate, not rely
   on the browser's own native tooltip delay.
10. Find (or construct, via the search overlay) a country that formed
    partway through the campaign. Confirm its Graph line starts at its
    founding year, not flat-zero from the campaign start (spec FR-010,
    edge cases, research.md §8).
11. With no save loaded, open the Leaderboard section — confirm the
    empty/placeholder state (FR-011), not blank/broken graphs.

## 5. Accessibility spot-check (constitution Principle VI)

Confirm color is never the only way to distinguish two countries —
hovering a line/point (Graph) or a box (Treemap) must surface the
country's name as text (FR-012/FR-018), independent of being able to
distinguish similar colors by eye (edge case: two countries with
visually similar in-game colors).
