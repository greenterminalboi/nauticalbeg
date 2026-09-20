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
2. Open **Encyclopedia → Leaderboard** — confirm it's reachable (spec
   FR-001) and no longer the `ComingSoonPlaceholder`.
3. Confirm all three graphs (Population, Economic Base, Tax Base) render
   immediately with more than one country's line, without touching the
   search overlay (spec User Story 1, FR-008) — cross-check the
   pre-selected countries against the save's actual human players (the
   in-game player list, or `played_country` entries) to confirm the
   default selection is correct, not arbitrary. There is no toggle
   between Economic Base and Tax Base — both are always visible as
   their own graphs (spec FR-002, revised from an earlier toggle-based
   design — see spec.md's User Story 3 revision note).
4. Confirm each line's color visually matches that country's real
   in-game map color (spot-check 2-3 known countries; cross-reference
   against the Map tab's Political layer for the same countries, which
   already renders these same colors per feature 005 — the colors
   should match exactly since both features source from the same
   `nations.color_r/g/b`).
5. Open the search bar overlay (spec User Story 2, FR-006). Confirm:
   - Typing part of a name or tag filters results.
   - No placeholder/unformed country slots appear in results (spot-check
     against a known-DUMMY or Pirates/Mercenaries tag — confirm it's
     absent, spec FR-007/SC-003).
   - Selecting a country not currently shown adds its line to **all
     three** graphs; deselecting removes it from all three (FR-004 —
     selection is shared, not per-graph).
6. On any graph, scroll to zoom in/out and confirm the visible year/value
   range narrows/widens around the cursor; click-drag to pan once zoomed
   in; use the "Reset zoom" control to return to the full range (spec
   User Story 3, FR-013) — confirm zoom/pan on one graph doesn't affect
   the other two.
7. Hover a point on any graph — confirm a tooltip appears at/near the
   point itself (not in a separate status line elsewhere on the page)
   showing the country, year, and value (FR-012).
8. Confirm each axis shows several intermediate tick labels, not just
   the two endpoint values (FR-014).
9. Find (or construct, via the search overlay) a country that formed
   partway through the campaign. Confirm its line starts at its
   founding year, not flat-zero from the campaign start (spec FR-010,
   edge cases, research.md §8).
10. With no save loaded, open the Leaderboard section — confirm the
    empty/placeholder state (FR-011), not blank/broken graphs.

## 5. Accessibility spot-check (constitution Principle VI)

Confirm color is never the only way to distinguish two countries'
lines — hovering a line/point must surface the country's name as text
(FR-012), independent of being able to distinguish similar line colors
by eye (edge case: two countries with visually similar in-game colors).
