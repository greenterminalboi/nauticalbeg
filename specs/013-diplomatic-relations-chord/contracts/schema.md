# Contract: schema.sql additions

Two new tables, following this schema's existing long-format
(`nation_history`, `nation_societal_values`) convention — one row per fact,
not one column per relationship type — and its established `INTEGER`-for-
`nations.idx`-space convention (see `data-model.md`/research.md §5 for why
this does **not** need the `wars.idx`-style `BIGINT`). Full rationale in
`../data-model.md` — this is the literal DDL contract, kept in sync with
`src/storage/schema.sql` as-built (three columns — `amount`, `is_one_way`,
`opinion_score` — were added post-ship, 2026-09-22, explicit user requests;
see research.md §9).

```sql
-- specs/013-diplomatic-relations-chord: one row per active relationship
-- instance between two countries, from diplomacy_manager (research.md
-- §1). relation_type is a small fixed vocabulary derived at parse time,
-- not a raw save field copied verbatim — scripted_mutual/scripted_oneway
-- entries carry a dozen+ treaty-type object= values; eight are
-- extracted (widened post-ship from the original alliance/guarantee),
-- the rest are read and discarded (spec Assumptions' v1 scope). Rows
-- are dedup'd on the unordered pair so a mutual pair recorded under
-- both sides (rivalry) collapses to one row, never two; only symmetric
-- rows (is_one_way=0) get first_nation_idx < second_nation_idx
-- normalization — directional rows (is_one_way=1) preserve the save's
-- own first/second order, since it's now semantically meaningful.
CREATE TABLE IF NOT EXISTS diplomatic_relations (
  first_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  second_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  relation_type TEXT NOT NULL, -- 'alliance' | 'rivalry' | 'royal_marriage' | 'guarantee' | 'military_access' | 'food_access' | 'fleet_basing_rights' | 'economic_support'
  start_date TEXT, -- NULL when the source block carries no date
  -- economic_support's named_targets={{flag=amount target={type=value
  -- identity=<n>}}} — the ducat amount granted. NULL for every other
  -- relation_type (never a fabricated 0).
  amount DOUBLE,
  -- Which diplomacy_manager container this row came from — exhaustively
  -- confirmed against the real save: alliance is ALWAYS scripted_mutual
  -- (38/38); every other treaty type, guarantee included, is ALWAYS
  -- scripted_oneway. royal_marriage/rivalry (no such container) are 0;
  -- economic_support (a one-directional grant by nature) is 1.
  -- Direction, where 1, runs first_nation_idx -> second_nation_idx.
  -- INTEGER 0/1, not BOOLEAN — insertRows' bulk Arrow-insert path only
  -- accepts string/number/null per row (same as market_goods.is_importing).
  is_one_way INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_diplomatic_relations_first ON diplomatic_relations (first_nation_idx);
CREATE INDEX IF NOT EXISTS idx_diplomatic_relations_second ON diplomatic_relations (second_nation_idx);

-- specs/013-diplomatic-relations-chord: one row per directional
-- relations.<target_idx>.trust entry actually present in
-- diplomacy_manager.<idx>.relations (research.md §1) — a general
-- bilateral opinion ledger that exists independently of any active
-- relationship type. Kept directional (not pre-averaged) so the
-- "average when both directions exist, else use whichever does" rule
-- (spec FR-010/Assumptions) applies at query time, not parse time —
-- averaging here would lose which case applied (Constitution Principle
-- IV: a derived figure must stay distinguishable from what was actually
-- recorded). Applies identically to opinion_score.
CREATE TABLE IF NOT EXISTS nation_relation_trust (
  owner_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  target_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  trust DOUBLE NOT NULL,
  -- A derived sum of every relations.<target>.timed_biases.Opinion[]/
  -- Antagonism[] value for this pair — the save has no single stored
  -- "Opinion" scalar. NULL when the entry has no timed_biases at all
  -- (never fabricated as 0). See data-model.md for the full derivation.
  opinion_score DOUBLE
);
CREATE INDEX IF NOT EXISTS idx_nation_relation_trust_pair
  ON nation_relation_trust (owner_nation_idx, target_nation_idx);
```

No changes to `nations` or `locations` — both are reused unchanged
(`data-model.md`'s "Existing entities reused unchanged").
