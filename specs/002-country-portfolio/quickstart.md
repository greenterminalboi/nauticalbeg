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

## Validation scenarios

Each scenario maps to an acceptance scenario in `spec.md`. Scenarios 1-6
(User Story 1, the shell) can be validated before any other user story
is implemented — they only need 001's existing app, restructured.

1. **Top bar present before any save (User Story 1)**: Open the app with
   no save loaded. Expect: a top bar with a usable file-selection
   control, and a visibly present but disabled/inactive nation selector
   — not a bare, unstyled page.
2. **Nation selector initializes on load (User Story 1)**: Load a save.
   Expect: the nation selector becomes enabled and populated with that
   save's nations, without the page reloading or the top bar changing
   shape.
3. **Shell layout (User Story 1)**: With a save loaded and a nation
   selected, look at the page. Expect: save/keep controls and the nation
   selector in the top bar as distinct controls, the category list in a
   side panel, and the active category's content in a horizontally
   centered, bounded-width main area — not a vertical stack of unstyled
   elements, and table content keeps normal per-column alignment (not
   every cell force-centered).
4. **Responsive layout (User Story 1)**: Narrow the browser window to a
   typical mobile width. Expect: the layout adapts (e.g., the side
   navigation collapses/relocates) rather than overflowing or clipping.
5. **Placeholder nav items visible (User Story 1)**: With a nation
   selected, look at the side navigation. Expect: an "AI Agent" item and
   a "Map" item are listed, visually marked as not yet available.
6. **Placeholder nav items are clickable (User Story 1)**: Select the "AI
   Agent" or "Map" item. Expect: the main content area shows a "coming
   soon" placeholder message — the item is not inert/unclickable, and no
   console error occurs.
7. **Navigate to Provinces (User Story 2)**: With a nation's overview
   displayed, open the side navigation and select "Provinces." Expect: a
   list of that nation's provinces/locations, each with at least a
   name/identifier and development, without leaving the loaded save.
8. **Nation change preserves active tab (User Story 2)**: With the
   Provinces tab open, pick a different nation from the nation selector.
   Expect: the Provinces tab stays open and its contents update to the
   new nation's provinces — the view does not reset to Overview.
9. **Tab switch, no reload (User Story 2)**: With any tab open, select a
   different navigation item. Expect: the new category's data for the
   current nation appears without a full-page reload or re-upload.
10. **Empty Provinces (User Story 2, Edge Case)**: Select a nation with
    no provinces (e.g., a landless released vassal, if the loaded save
    has one). Expect: a clear "nothing to show" message, not a blank
    area.
11. **Military tab (User Story 3)**: Select a nation with military units,
    open the Military tab. Expect: units summarized in a way that shows
    total strength at a glance (e.g., counts by unit type), matching the
    source save's `unit_manager` entries for that nation's `owner` index.
12. **Government tab (User Story 4)**: Select a nation, open the
    Government tab. Expect: government type, each estate with its
    satisfaction/standing, and the nation's currently adopted policies
    (from `implemented_laws`) all shown. If no policies are set, expect a
    "nothing to show" message for that section rather than a blank area.
13. **Economy tab — loans half (User Story 5)**: Select a nation with an
    outstanding loan, open the Economy tab. Expect: that loan listed with
    its amount and interest. (The income/expense breakdown half of this
    tab depends on schema not yet finalized as of this plan — validate
    only what's actually implemented.)
14. **Diplomacy tab — war half (User Story 6)**: Select a nation
    currently at war (per its Overview war-status stat), open the
    Diplomacy tab. Expect: that war listed with the nation's side in it.
    (The alliance half depends on schema not yet finalized as of this
    plan.)
15. **Building Registry (User Story 8)**: Select a nation with
    constructed buildings, open the tab. Expect: each building listed
    with its type and which province/location it's in.
16. **Characters tab (User Story 9)**: Select a nation, open the
    Characters tab. Expect: that nation's current ruler shown by name at
    minimum (resolved via `government.ruler`'s index into `character_db`).
17. **Cancel/supersede while a tab is loading (Edge Case)**: Change the
    selected nation rapidly, twice in a row, while a data-heavy tab
    (Provinces or Military) is still loading the first nation's data.
    Expect: only the second nation's data ever renders — never a mix of
    both, and no console error (mirrors 001's own supersede-cleanup
    verification pattern).
18. **Large nation stays responsive (SC-003)**: Select the largest nation
    in the loaded save (most provinces). Expect: the Provinces tab
    paginates rather than freezing or silently truncating without
    indication.

## Out of scope for this quickstart

Fixture-based parser regression tests (Vitest) remain the primary
correctness check for each new table's adapter logic, per constitution
Principle II — this quickstart is for end-to-end/manual confirmation of
the assembled feature, not a substitute for those tests.
