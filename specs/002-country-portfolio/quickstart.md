# Quickstart: Validating Country Portfolio

Manual validation guide for this feature — how to confirm it works
end-to-end once implemented. See `tasks.md` (from `/speckit-tasks`) for
implementation steps; this doesn't contain implementation code.

## Prerequisites

- Everything 001 requires (Node.js LTS, `npm install`, a supported
  browser) — this feature has no new setup of its own.
- A loaded save with a nation that has: at least one province, at least
  one military unit, at least one adopted policy, at least one
  constructed building, and (ideally) at least one outstanding loan —
  the real save used throughout 001 and this feature's research
  (`Russia (Melted).eu5`) satisfies all of these for most of its real
  countries.

## Running it locally

```bash
npm run dev
```

Load a save, select a nation (per 001's existing nation selector), then
validate each scenario below.

## Validation scenarios

Each scenario maps to an acceptance scenario in `spec.md`.

1. **Navigate to Provinces (User Story 1)**: With a nation's overview
   displayed, open the side navigation and select "Provinces." Expect: a
   list of that nation's provinces/locations, each with at least a
   name/identifier and development, without leaving the loaded save.
2. **Nation change preserves active tab (User Story 1)**: With the
   Provinces tab open, pick a different nation from the existing nation
   selector. Expect: the Provinces tab stays open and its contents update
   to the new nation's provinces — the view does not reset to Overview.
3. **Tab switch, no reload (User Story 1)**: With any tab open, select a
   different navigation item. Expect: the new category's data for the
   current nation appears without a full-page reload or re-upload.
4. **Empty Provinces (User Story 1, Edge Case)**: Select a nation with no
   provinces (e.g., a landless released vassal, if the loaded save has
   one). Expect: a clear "nothing to show" message, not a blank area.
5. **Military tab (User Story 2)**: Select a nation with military units,
   open the Military tab. Expect: units summarized in a way that shows
   total strength at a glance (e.g., counts by unit type), matching the
   source save's `unit_manager` entries for that nation's `owner` index.
6. **Government tab (User Story 3)**: Select a nation, open the
   Government tab. Expect: government type, each estate with its
   satisfaction/standing, and the nation's currently adopted policies
   (from `implemented_laws`) all shown. If no policies are set, expect a
   "nothing to show" message for that section rather than a blank area.
7. **Economy tab — loans half (User Story 4)**: Select a nation with an
   outstanding loan, open the Economy tab. Expect: that loan listed with
   its amount and interest. (The income/expense breakdown half of this
   tab depends on schema not yet finalized as of this plan — validate
   only what's actually implemented.)
8. **Diplomacy tab — war half (User Story 5)**: Select a nation currently
   at war (per its Overview war-status stat), open the Diplomacy tab.
   Expect: that war listed with the nation's side in it. (The alliance
   half depends on schema not yet finalized as of this plan.)
9. **Building Registry (User Story 7)**: Select a nation with constructed
   buildings, open the tab. Expect: each building listed with its type
   and which province/location it's in.
10. **Characters tab (User Story 8)**: Select a nation, open the
    Characters tab. Expect: that nation's current ruler shown by name at
    minimum (resolved via `government.ruler`'s index into `character_db`).
11. **Cancel/supersede while a tab is loading (Edge Case)**: Change the
    selected nation rapidly, twice in a row, while a data-heavy tab
    (Provinces or Military) is still loading the first nation's data.
    Expect: only the second nation's data ever renders — never a mix of
    both, and no console error (mirrors 001's own supersede-cleanup
    verification pattern).
12. **Large nation stays responsive (SC-003)**: Select the largest nation
    in the loaded save (most provinces). Expect: the Provinces tab
    paginates rather than freezing or silently truncating without
    indication.

## Out of scope for this quickstart

Fixture-based parser regression tests (Vitest) remain the primary
correctness check for each new table's adapter logic, per constitution
Principle II — this quickstart is for end-to-end/manual confirmation of
the assembled feature, not a substitute for those tests.
