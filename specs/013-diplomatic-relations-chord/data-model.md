# Phase 1 Data Model: Diplomatic Relations Chord Diagram

## Design note: relationship-type scope is a filter at extraction time

`scripted_mutual`/`scripted_oneway` entries carry a dozen-plus treaty-type
`object=` values (research.md §1); only eight are stored (widened post-ship,
2026-09-22, explicit user request — originally just `alliance`/`guarantee` —
see amendment below) — everything else is read and discarded during parsing,
never written to a table. This keeps `diplomatic_relations.relation_type` a
small, fixed vocabulary rather than growing a column that needs a schema
change every time a new treaty type becomes relevant to a future feature.

## New database entities

### `diplomatic_relations` (new table)

One row per active relationship instance between two countries — the
per-relationship-type chord data source (spec Key Entity "Diplomatic
Relationship"). A pair with two simultaneous relationship types (e.g. allied
and married) produces two rows, not one (spec FR-004).

| Column           | Type    | Source                                                                                      |
|------------------|---------|-----------------------------------------------------------------------------------------------|
| first_nation_idx  | INTEGER | `scripted_mutual`/`scripted_oneway`/`royal_marriage`/`economic_support`'s `.first`, or the owning country's idx for a `rivals_2.list` row — logically REFERENCES nations(idx). `INTEGER`, not `BIGINT`: confirmed the same already-established `nations.idx` range (research.md §5), not the larger `wars.idx`-style space. |
| second_nation_idx | INTEGER | `.second`, or `rivals_2.list[].country` for a rivalry row — logically REFERENCES nations(idx) |
| relation_type     | TEXT    | `'alliance' \| 'rivalry' \| 'royal_marriage' \| 'guarantee' \| 'military_access' \| 'food_access' \| 'fleet_basing_rights' \| 'economic_support'` (widened post-ship, 2026-09-22) — derived from `named_targets.target.object` (the `scripted_mutual`/`scripted_oneway` types) or from which source block the row came from (rivalry, royal_marriage, economic_support), never a raw save field verbatim |
| start_date        | TEXT    | `.start_date` when present; `rivals_2.list[].date` for rivalry. NULL when the source block has no date field. |
| amount            | DOUBLE  | Post-ship, 2026-09-22 (explicit user request): `economic_support`'s `named_targets={{flag=amount target={type=value identity=<n>}}}` — the ducat amount, read from `target.identity` (not `target.value` despite `type=value`). NULL for every other `relation_type`. |
| is_one_way        | INTEGER (0/1) | Post-ship, 2026-09-22 (explicit user request, "arrow changing depending on if its a one way or two relationship"): 1 when this relation is directional (`first_nation_idx -> second_nation_idx`), 0 when symmetric. Derived from which container the row came from, exhaustively confirmed against the real save (every occurrence): `alliance` is always `scripted_mutual` (0); every other treaty type, `guarantee` included, is always `scripted_oneway` (1). `royal_marriage`/`rivalry` are inherently symmetric (0); `economic_support` is a one-directional grant by nature (1). |

No surrogate primary key — a row is uniquely identified by
`(first_nation_idx, second_nation_idx, relation_type)` after normalization,
which is dedup'd on the *unordered* pair (so a mutual pair's two source
records — one filed under each side, for rivalry — collapse to one row
instead of two, spec Edge Cases). **Amendment, post-ship 2026-09-22**: only
*symmetric* rows (`is_one_way = 0`) are normalized to
`first_nation_idx < second_nation_idx`; directional rows (`is_one_way = 1`)
preserve the save's own original `first`/`second` order instead, since that
order is now semantically meaningful (direction) and must not be
arbitrarily swapped for sorting convenience.

Indexed on `(first_nation_idx)` and `(second_nation_idx)` for the
per-country relationship-count aggregate FR-011's default ordering needs.

### `nation_relation_trust` (new table)

One row per directional `relations.<target_idx>.trust` entry actually present
in the save — the chord-thickness score source (spec FR-010), kept separate
from `diplomatic_relations` because it exists independently of any active
relationship type (a general opinion ledger, research.md §1) and is looked up
only after a relationship is already confirmed, never used to infer one.

| Column          | Type    | Source                                                          |
|-----------------|---------|-------------------------------------------------------------------|
| owner_nation_idx | INTEGER | the `diplomacy_manager.<idx>` record this `relations` block belongs to |
| target_nation_idx | INTEGER | the `relations.<target_idx>` key                                |
| trust            | DOUBLE  | `.trust`                                                          |
| opinion_score    | DOUBLE  | Post-ship, 2026-09-22 (explicit user request, "diplomatic score... 200 to -200"): the save has no single stored "Opinion" scalar (confirmed by exhaustively listing every field name a real `relations.<target>` entry carries — `trust`/`disposition`/`timed_biases`/`last_war`/`war_score`/`diplomat_return_date`/`last_spy_discovery`, no `opinion=`). Derived as the sum of every `timed_biases.Opinion[].value` and `.Antagonism[].value` entry for that pair (`Antagonism` entries are already negative — a plain sum, no extra sign flip). NULL when a `relations.<target>` entry has no `timed_biases` at all (never a fabricated 0). |

Kept directional (not pre-averaged) so the FR-010 "average when both
directions exist, else use whichever exists" rule can be applied at query
time — averaging here would silently lose the "only one direction had data"
case Principle IV requires staying distinguishable-if-derived about. Applies
identically to `opinion_score` (display-only, no fallback constant since
nothing visual is scaled by it). Indexed on
`(owner_nation_idx, target_nation_idx)`.

## Not modeled as a table: Hugbox Cluster / Cluster Affiliate

Per research.md §7, Hugbox clusters are computed client-side from
`diplomatic_relations` rows already in memory (alliance-only clique-plus-
expansion), never persisted. `data-model.md`'s job here is only to name the
in-memory shape the computation produces, consumed by
`DiplomacyChordChart.tsx`/`hugboxClustering.ts`:

```ts
interface HugboxCluster {
  clusterId: number;           // stable per render, not persisted across reloads
  coreNationIdxs: number[];    // the mutual-clique core (>= 3)
  fullMemberNationIdxs: number[]; // core + promoted (2+ tie) members
  affiliateNationIdxs: number[];  // 1-tie countries, not enclosed
}
```

## Query-time aggregates (no new columns)

**Amendment (course-corrected mid-implementation, explicit user request)**:
the original plan here was a `SUM(development)`-based "major powers" ranking
query, generalizing `getNationOverview`'s per-country development aggregate to
rank every country at once. That query (`listNationDevelopmentArrow`) was
built, then removed — the user redirected default country selection to reuse
`computeDefaultSelection`/`AddCountryInput` (human-played countries, same
pattern as Leaderboard/World Goods/Societal Compass) instead, so this feature
needs no new aggregate query at all for FR-009. `locations.development` is not
read by this feature.

- **Per-country active-relationship count (spec FR-011 default ordering)**:
  `COUNT(*)` over `diplomatic_relations` grouped by nation idx (counting a
  nation appearing in either `first_nation_idx` or `second_nation_idx`),
  filtered to the currently-visible relationship types — computed in
  `diplomacyData.ts` from the already-fetched relationship rows, not a
  separate SQL round-trip (the full relationship set for the visible
  countries is already in memory for chord rendering itself).

## Existing entities reused unchanged

- `nations` (`idx`, `tag`, `name`, `color_r/g/b`) — country identity and arc
  color (spec FR-003), no new columns needed.
