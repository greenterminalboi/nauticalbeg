# Contract: schema.sql additions

Six new tables plus two nullable-column extensions, following this
schema's existing long-format (`nation_history`, `nation_societal_values`)
and BIGINT-for-large-index-space (`population`, `wars`) conventions
exactly (see `src/storage/schema.sql`). Full rationale for each is in
`../data-model.md` — this is the literal DDL contract.

```sql
-- specs/012-firepower-tab: one row per subunit_manager.database entry
-- (a regiment or ship). idx is BIGINT — sibling unit_manager stack ids
-- already exceed INT32 (e.g. 2818572288), same index space. strength is
-- army-only (NULL for navy rows, never fabricated).
CREATE TABLE IF NOT EXISTS regiments (
  idx BIGINT PRIMARY KEY,
  owner_idx INTEGER, -- logically REFERENCES nations(idx)
  unit_type TEXT, -- e.g. 'a_heavy_cavalrymen', 'n_carrack'
  morale DOUBLE,
  number DOUBLE,
  strength DOUBLE -- army only
);
CREATE INDEX IF NOT EXISTS idx_regiments_owner_type ON regiments (owner_idx, unit_type);

-- specs/012-firepower-tab: one row per (nation, researched advance) —
-- countries.database[idx].researched_advances, a flat boolean-flag
-- object; only `=yes` entries produce a row (same "no row = not
-- applicable" convention as nation_societal_values' -999 handling).
CREATE TABLE IF NOT EXISTS nation_advances (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  advance TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nation_advances_nation ON nation_advances (nation_idx, advance);

-- specs/012-firepower-tab: one row per (nation, implemented government
-- reform) — government.implemented_reforms, a flat list; all entries
-- are currently-active (reforms accumulate, they don't replace).
CREATE TABLE IF NOT EXISTS nation_reforms (
  nation_idx INTEGER NOT NULL,
  object TEXT NOT NULL,
  date TEXT
);
CREATE INDEX IF NOT EXISTS idx_nation_reforms_nation ON nation_reforms (nation_idx, object);

-- specs/012-firepower-tab: one row per (nation, implemented estate
-- privilege) — government.implemented_privileges, same shape/semantics
-- as nation_reforms above.
CREATE TABLE IF NOT EXISTS nation_privileges (
  nation_idx INTEGER NOT NULL,
  object TEXT NOT NULL,
  date TEXT
);
CREATE INDEX IF NOT EXISTS idx_nation_privileges_nation ON nation_privileges (nation_idx, object);

-- specs/012-firepower-tab: one row per (nation, active law choice) —
-- government.implemented_laws, grouped by law_category; exactly one
-- active object per category (a new choice replaces the row, no history
-- to preserve, unlike reforms/privileges above).
CREATE TABLE IF NOT EXISTS nation_laws (
  nation_idx INTEGER NOT NULL,
  law_category TEXT NOT NULL, -- e.g. 'recruitment_law'
  object TEXT NOT NULL, -- e.g. 'expanded_levies_policy'
  date TEXT
);
CREATE INDEX IF NOT EXISTS idx_nation_laws_nation ON nation_laws (nation_idx, law_category);

-- specs/012-firepower-tab: one row per (war, side, unit category) —
-- widens the existing sumLosses() derivation (1.3.11.ts) that currently
-- collapses war_manager's attacker_losses/defender_losses into a single
-- wars.attacker_casualties/defender_casualties total. Additive: those
-- two columns are still derived the same way (sum across every category
-- for that side); this table exists so Navy Stats can filter to
-- navy_%-prefixed categories specifically. war_idx is BIGINT to match
-- wars.idx.
CREATE TABLE IF NOT EXISTS war_unit_losses (
  war_idx BIGINT NOT NULL, -- logically REFERENCES wars(idx)
  side TEXT NOT NULL, -- 'attacker' | 'defender'
  category TEXT NOT NULL, -- e.g. 'army_heavy_infantry', 'navy_transport'
  battle DOUBLE,
  attrition DOUBLE,
  capture DOUBLE
);
CREATE INDEX IF NOT EXISTS idx_war_unit_losses_war ON war_unit_losses (war_idx, side);

-- specs/012-firepower-tab: per-country military scalars, one-per-country
-- like treasury/stability already are — same ALTER pattern as
-- color_r/g/b. Sourced from countries.database[idx].currency_data
-- (manpower, sailors, army_tradition, navy_tradition,
-- monthly_manpower, monthly_sailors) and the country record directly
-- (last_months_army_maintenance, last_months_navy_maintenance).
ALTER TABLE nations ADD COLUMN IF NOT EXISTS manpower DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS sailors DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS monthly_manpower DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS monthly_sailors DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS army_tradition DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS navy_tradition DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS last_months_army_maintenance DOUBLE;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS last_months_navy_maintenance DOUBLE;

-- specs/012-firepower-tab: primary culture, needed only for the
-- culture-group gate check on a minority of unique unit unlocks (see
-- data-model.md's "known accepted simplification").
ALTER TABLE nations ADD COLUMN IF NOT EXISTS primary_culture_idx INTEGER;

-- specs/012-firepower-tab: same purpose, resolved culture-group name.
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS culture_group TEXT;
```

**Consumer contract**: every Army/Navy Stat Summary query MUST apply the
same `nations.country_type = 'Real'` + locations-liveness filter every
other per-country query in this codebase already applies (see
`listLatestNationMetricArrow`, `src/storage/queries.ts`), and MUST only
include a country with at least one matching `regiments` row (spec FR-012
— no country appears with fabricated zero/default stats).
