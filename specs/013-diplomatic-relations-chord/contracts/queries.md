# Contract: src/storage/queries.ts additions

Two new query functions (down from an originally-planned three — see
amendment below).

**Amendment (post-ship, 2026-09-22, explicit user request — the diagram was
slow)**: both queries were originally save-wide (fetch every relationship in
the save once, filter client-side). Replaced with **bounded, on-demand**
queries scoped to the current country selection — player countries load
automatically (the default selection), everyone else loads on demand as
they're added, and a re-fetch happens only when the selection itself changes
(add/remove a country), never on a relationship-type filter toggle (that
still filters client-side, no re-query, keeping SC-003's under-1-second
budget).

```ts
/** Only relationships where BOTH sides are in `nationIdxs` — bounded,
 * not save-wide. Filtering by relation_type still happens client-side
 * in diplomacyData.ts, so toggling a filter checkbox never re-queries;
 * only a selection change (add/remove a country) re-fetches. `amount`
 * is only ever non-NULL for relation_type = 'economic_support' rows. */
export async function listDiplomaticRelationsArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer>; // columns: first_nation_idx, second_nation_idx, relation_type, start_date, amount, is_one_way

/** Same bounding as listDiplomaticRelationsArrow, on both
 * owner_nation_idx and target_nation_idx. Directional (FR-010's
 * "average when both directions exist" rule applied in diplomacyData.ts,
 * per data-model.md's note on why trust/opinion_score stay directional
 * in storage). */
export async function listRelationTrustArrow(
  db: SaveDatabase,
  nationIdxs: readonly number[],
): Promise<ArrayBuffer>; // columns: owner_nation_idx, target_nation_idx, trust, opinion_score
```

**Earlier amendment (course-corrected mid-implementation, explicit user
request)**: a third query, `listNationDevelopmentArrow` (a
`SUM(development)`-per-country aggregate for a "major powers" ranking), was
built and then removed — default country selection reuses
`computeDefaultSelection`/`AddCountryInput` (human-played countries) instead,
needing no new aggregate query.

Country identity/color/name for arcs (spec FR-003) reuses the existing
per-nation query already returning `color_r/g/b` (`LeaderboardCountry`'s
source, `listLeaderboardCountriesArrow` — no new query needed, per
`leaderboardData.ts`'s existing shape); the same query also backs the
default-selection/`AddCountryInput` control (FR-009) and is fetched once,
unbounded (it's the searchable country list itself, not per-relationship
data).
