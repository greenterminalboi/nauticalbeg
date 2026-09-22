# Quickstart: Validating Diplomatic Relations Chord Diagram

Prerequisites: this repo's dependencies installed (`npm install`). No local
EU5 game install needed for this feature (unlike Firepower/Encyclopedia) —
everything here is parsed straight from the save, no static game-file
reference tables to generate.

## 1. Confirm parser fixture coverage (Constitution Principle II)

```bash
npm test -- tests/parser/adapter.test.ts
```

Expected: the extended `tests/fixtures/rus-1628-minimal.eu5` fixture (a new
`diplomacy_manager` block added against that fixture's existing nations —
RUS `2025`, PLC `33556892`, KIE `1961`, FRA `1141`, per research.md §1's
findings) round-trips into `diplomatic_relations`/`nation_relation_trust`
exactly: one row per `scripted_mutual`/`scripted_oneway` entry filtered to
`object=alliance`/`object=guarantee`, one per `royal_marriage` entry, one
per `rivals_2.list` entry (de-duped to a single row for a mutual pair, spec
Edge Cases), and directional `trust` rows from a `relations.<target>.trust`
block. Include a single-occurrence case for at least one repeated key
(research.md §4's `toArray` normalization) so a save with exactly one
alliance doesn't silently break.

## 2. Confirm the Hugbox clustering algorithm (spec User Story 4, research.md §7)

```bash
npm test -- tests/components/hugboxClustering.test.ts
```

Expected, against synthetic adjacency data (no save parsing involved — pure
graph computation over rows):

- Three mutually-allied countries (A-B, B-C, A-C all alliances) form one
  cluster with all three as core/full members.
- A fourth country allied to exactly one core member is an affiliate, not a
  full member.
- That same country, once allied to a second core member, promotes to a
  full member.
- A country eligible for full membership in two clusters at once is
  assigned to exactly one (tie-break rule, spec Assumptions) and never
  appears as a full member of both.
- Two countries mutually allied with no third member form no cluster at all
  (spec Assumptions' minimum-core-size-3 rule).

## 3. Confirm the UI end-to-end against the real save

```bash
npm run dev
```

- Load the real save (`Russia (Melted).eu5` or another local save).
- Open **Factbook → Diplomacy**.
- Confirm the default view shows only the save's human-played country/
  countries (and relationships strictly between two of them — course-
  corrected mid-implementation, explicit user request: no non-selected
  country ever appears), and no isolated chord-less arc appears (FR-008).
  Loading should be near-instant (post-ship amendment, explicit user
  request — "the diplomacy screen is a bit slow"): the default selection's
  relationships fetch via a *bounded* query (`WHERE ... IN (nationIdxs)`,
  not save-wide), and adding a country via search re-fetches only that
  expanded selection, never the whole save.
- Hover one country's node (circle): confirm only chords touching it stay
  full opacity and everything else fades (FR-005), and hover a chord:
  confirm the tooltip names both countries, the relationship type(s), and
  the score if one exists (FR-006) — confirmed working against the real
  save mid-session (a live tooltip: "YEM (YEM) ↔ IRA (IRA) / Royal
  Marriage / Since 1608.10.23 / Trust: 48.4").
- Toggle each relationship-type checkbox off/on: confirm all eight types
  (alliance, rivalry, royal_marriage, guarantee, military_access,
  food_access, fleet_basing_rights, economic_support — widened post-ship
  from the original four) render correctly and only that type's chords
  (and any arcs left with nothing else visible) disappear/reappear, with
  no full reload (FR-007, SC-003).
- Use the search box to add another country: confirm any relationship
  between it and an already-selected country becomes visible, and it
  appears as a new node — never a country that hasn't been added (FR-009).
- Confirm chords never render in front of a node circle, including while
  hovering (explicit user request) — each series uses its own `zlevel` so
  hover/emphasis state on a chord can't paint it above the node layer, and
  a chord's endpoint lands exactly at its node's center (not offset —
  post-ship bug fix for the "chord ends underneath the node" artifact in
  `specs/debug_images/fix this.png`; both series now share one `geometry`
  object instead of measuring independently).
- Hover a one-way relationship's chord (guarantee, military_access,
  food_access, fleet_basing_rights, or economic_support): confirm an
  arrowhead renders at the target end and the tooltip header shows a `→`;
  hover a symmetric relationship (alliance, royal_marriage, rivalry):
  confirm no arrowhead and the tooltip shows `↔` (post-ship, explicit user
  request — "the dependency arrow changing depending on if its a one way or
  two relationship").
- Hover a chord with recorded `timed_biases` data: confirm the tooltip
  shows an `Opinion: <score>` line (post-ship, explicit user request —
  "diplomatic score between two countries... 200 to -200"; the score is a
  derived sum, not independently confirmed to match the in-game UI's own
  scale/clamping, so treat it as directional signal, not an exact readout).
- Hover an `economic_support` chord: confirm the tooltip shows an
  `Economic support: <amount> ducats` line (post-ship, explicit user
  request — "on hover it should tell you how much economic support a
  country is giving to another country").
- Toggle Hugbox Detection: pick a real alliance bloc in the loaded save
  (spot-check against the raw save's `scripted_mutual`/`object=alliance`
  entries for a few countries known to be allied), confirm the mutual core
  is grouped with a visible boundary, a country allied to exactly one
  member of that bloc renders as an affiliate near it, and toggling the
  overlay back off reverts to the FR-011 relationship-count ordering with
  no boundaries drawn.

## 4. Confirm accessibility/clarity (Constitution Principle VI)

Manually verify: the relationship-type legend (filter checkboxes in
`DiplomacyFilters.tsx`) is distinguishable by line-dash pattern as well as
color — squint-test or a colorblind simulation filter should still show four
distinct chord styles, not just four similar-looking colored lines
(research.md §3).
