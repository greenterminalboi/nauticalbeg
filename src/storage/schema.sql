-- Schema for a single save's DuckDB database (one database per save; see
-- data-model.md, corrected against a real save file — see
-- specs/001-save-import-overview/research-save-format.md). Applied once,
-- right after a database is created.
--
-- DuckDB dialect notes (migrated from SQLite 2026-09-18 — see
-- ARCHITECTURE.md's storage-engine decision log):
-- - No `AUTOINCREMENT` keyword; `raw_sections.id` uses an explicit
--   SEQUENCE instead (DuckDB's idiom for an auto-generated integer key).
-- - `REFERENCES` foreign-key clauses were dropped, not translated: the
--   original SQLite schema never ran `PRAGMA foreign_keys=ON`, so they
--   were already documentation-only, never enforced. The relationships
--   are unchanged and still documented in each column's comment below.
-- - `REAL` means 32-bit float in DuckDB (unlike SQLite, where `REAL` is
--   always a 64-bit double) — confirmed via a real failing test
--   (27.27 round-tripped as 27.270000457763672). Every column that held
--   a game stat under `REAL` now uses `DOUBLE` instead.

CREATE TABLE IF NOT EXISTS save_meta (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  detected_version TEXT,
  supported INTEGER NOT NULL DEFAULT 0,
  in_game_date TEXT,
  loaded_at TEXT NOT NULL,
  kept INTEGER NOT NULL DEFAULT 0
);

-- Countries are referenced everywhere in the save by a numeric index
-- (countries.tags / countries.database keys), not by tag directly — idx
-- is the real join key; tag is kept for display only.
CREATE TABLE IF NOT EXISTS nations (
  idx INTEGER PRIMARY KEY,
  tag TEXT NOT NULL,
  name TEXT,
  country_type TEXT,
  is_player INTEGER NOT NULL DEFAULT 0,
  treasury DOUBLE,
  stability DOUBLE,
  government_type TEXT
  -- at_war is derived at query time from war data, not stored as a column
  -- (see research-save-format.md's war_manager section) — no dedicated
  -- war table exists yet since this feature only needs the current
  -- boolean, not war history.
);

-- specs/005-map-visualization: the country's in-game map color, for the
-- Political/Control layers — from countries.database[idx].color.rgb.
-- Same additive-ALTER reasoning as locations' new columns above. All
-- three stay NULL together (never a fabricated color) for a country
-- with no confirmed color in the save (some rebel/dead/unplayed tag
-- slots).
ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_r INTEGER;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_g INTEGER;
ALTER TABLE nations ADD COLUMN IF NOT EXISTS color_b INTEGER;

-- specs/006-country-leaderboard: true for every country index appearing
-- as some played_country[*].country (research.md §5/§6) — deliberately
-- separate from is_player, which only ever tracks the single country
-- metadata.player_country_name resolves to and also drives that one
-- country's `name` assignment elsewhere; overloading it here would risk
-- changing that unrelated behavior.
ALTER TABLE nations ADD COLUMN IF NOT EXISTS is_human_played INTEGER DEFAULT 0;

-- specs/006-country-leaderboard: one row per (nation, year, metric),
-- from countries.database[idx].historical_population/historical_tax_base/
-- historical_economical_base — each a flat per-year array in the save,
-- year = 1337 + array index (research.md §1/§3). One row per metric
-- rather than three value columns so a future metric doesn't need a
-- schema change (data-model.md).
CREATE TABLE IF NOT EXISTS nation_history (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  year INTEGER NOT NULL,
  metric TEXT NOT NULL, -- 'population' | 'tax_base' | 'economical_base'
  value DOUBLE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_nation_history_nation_metric
  ON nation_history (nation_idx, metric, year);

-- specs/010-societal-values-compass: one row per (nation, axis) for
-- every Societal Value axis currently applicable to that country, from
-- countries.database[idx].government.societal_values (a flat object of
-- named axes). A missing row for a given (nation_idx, axis) pair IS
-- "not applicable" — the raw save's -999 sentinel is dropped at parse
-- time and never stored (research.md).
CREATE TABLE IF NOT EXISTS nation_societal_values (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  axis TEXT NOT NULL, -- e.g. 'centralization_vs_decentralization'
  value DOUBLE NOT NULL -- raw reading, roughly -100..+100
);
CREATE INDEX IF NOT EXISTS idx_nation_societal_values_nation_axis
  ON nation_societal_values (nation_idx, axis);

-- Coarse historical-province groupings. Ownership/development are NOT
-- authoritative here for aggregate stats — see `locations` below.
CREATE TABLE IF NOT EXISTS provinces (
  idx INTEGER PRIMARY KEY,
  name TEXT,
  owner_idx INTEGER, -- logically REFERENCES nations(idx); see dialect note above
  capital_location_idx INTEGER
);

-- Individual map tiles. This is where development actually lives and
-- where "how much territory does a nation hold" is authoritatively
-- computed from (see data-model.md's Derived Values section).
CREATE TABLE IF NOT EXISTS locations (
  idx INTEGER PRIMARY KEY,
  owner_idx INTEGER, -- logically REFERENCES nations(idx)
  province_idx INTEGER, -- logically REFERENCES provinces(idx)
  development DOUBLE
);

-- specs/005-map-visualization: four fields already sitting on the raw
-- location record but never extracted before this feature needed them.
-- The location-to-map-geometry join (specs/003-province-map-generation
-- originally left open) turned out NOT to need a new column at all —
-- `idx` (this table's existing primary key) is the join key against the
-- generated map geometry's `properties.idx` (research.md §1's revision:
-- an earlier plan to join via `name` was tested against a real save and
-- found wrong — that field is a rare rename-override, present on well
-- under 1% of real locations, not a general identifier). `name` below is
-- kept only as that rare secondary display hint, never for joining.
-- Added via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` rather than
-- folded into the `CREATE TABLE` above (research.md §6): `CREATE TABLE
-- IF NOT EXISTS` is a no-op against a database whose `locations` table
-- already exists (true for any save kept before this feature shipped —
-- see `resumeSave`'s existing rerun-on-open comment in
-- src/parser/load-save.ts), so without an explicit `ALTER`, a kept
-- save's `locations` table would silently keep lacking these columns
-- forever, not just until its next re-parse.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS name TEXT; -- from metadata.compatibility.locations[idx-1] (save-embedded, per-save-stable) — join key against public/map/*.topojson's properties.name
ALTER TABLE locations ADD COLUMN IF NOT EXISTS raw_material TEXT; -- from locations.locations[idx].raw_material — drives the RGO map layer
ALTER TABLE locations ADD COLUMN IF NOT EXISTS controller_idx INTEGER; -- from locations.locations[idx].controller; logically REFERENCES nations(idx) — may differ from owner_idx during occupation
ALTER TABLE locations ADD COLUMN IF NOT EXISTS control DOUBLE; -- from locations.locations[idx].control — drives the Control map layer's shading strength

-- specs/011-atlas-map-modes: six more fields already sitting on the raw
-- location record, confirmed against a real save (research.md), never
-- the trimmed test fixture (see the feature's own recorded lesson on
-- why). `culture_idx`/`religion_idx` are bare ids — resolved to a name
-- and the save's own in-game color via the `cultures`/`religions`
-- tables below, not stored as text here.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS rank TEXT; -- from locations.locations[idx].rank — current settlement tier, drives the Location Rank map layer
ALTER TABLE locations ADD COLUMN IF NOT EXISTS culture_idx INTEGER; -- from locations.locations[idx].culture; logically REFERENCES cultures(idx) — drives the Primary Culture map layer
ALTER TABLE locations ADD COLUMN IF NOT EXISTS religion_idx INTEGER; -- from locations.locations[idx].religion; logically REFERENCES religions(idx) — drives the Primary Religion map layer
ALTER TABLE locations ADD COLUMN IF NOT EXISTS market_idx INTEGER; -- from locations.locations[idx].market; logically REFERENCES markets(idx) — drives the Location Market map layer
ALTER TABLE locations ADD COLUMN IF NOT EXISTS possible_tax DOUBLE; -- from locations.locations[idx].possible_tax — the fiscal-base value (not `tax`, the current collected revenue), drives the Tax Base map layer
ALTER TABLE locations ADD COLUMN IF NOT EXISTS soldiers DOUBLE; -- from locations.locations[idx].population.pop_stats.soldiers.produced — drives the Soldiers map layer

-- specs/011-atlas-map-modes: per-save reference tables resolving the
-- bare `culture`/`religion` ids on `locations` (and `population`, which
-- has carried the same opaque ids unresolved since feature 002/004) to
-- a real name and the save's own in-game color. Sourced from the save's
-- own `culture_manager.database`/`religion_manager.database` sections
-- (research.md §4) — not previously parsed at all before this feature.
CREATE TABLE IF NOT EXISTS cultures (
  idx INTEGER PRIMARY KEY,
  name TEXT,
  color_r INTEGER,
  color_g INTEGER,
  color_b INTEGER
);
CREATE TABLE IF NOT EXISTS religions (
  idx INTEGER PRIMARY KEY,
  name TEXT,
  color_r INTEGER,
  color_g INTEGER,
  color_b INTEGER
);

-- Minimal war participation data: only enough to answer "is this nation
-- currently at war" (FR-006's war-status stat). One row per country per
-- war they participate in; full war history/detail is out of scope for
-- this feature. Populated by the adapter from the save's war_manager
-- structure during parsing (see research-save-format.md) so "at war" can
-- be queried like any other stat, rather than relying on parser-time
-- state that no longer exists once a kept save is reopened later.
CREATE TABLE IF NOT EXISTS war_participants (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  status TEXT NOT NULL
);

-- One row per war (`war_manager.database` entry — Encyclopedia's Wars
-- tab). `war_name_key` is the save's own raw localization key (e.g.
-- "AGRESSION_WAR_NAME") — NOT a display name; this project has no
-- access to the game's localization strings, so it's surfaced as-is
-- rather than fabricating a prettified name (constitution Principle
-- IV). `defender_idx` is only the FIRST of `original_defenders` (a war
-- can have more than one) — good enough for a demo's "who's fighting
-- whom" at a glance; a future pass could normalize the full defender
-- list into its own table. `duration_days` is DERIVED (computed by the
-- adapter from `start_date` to `end_date`, or to the save's own current
-- in-game date for a still-ongoing war) — not a raw save field.
-- `attacker_casualties`/`defender_casualties` are also derived: the sum
-- of every unit type's Battle+Attrition+Capture losses. Both stay NULL
-- when the corresponding `*_losses` field never appeared for that war
-- (unknown), never fabricated as 0 — a war whose `*_losses.losses` map
-- was present but empty gets a real 0 instead, which is a different,
-- confirmed fact. `start_date`/`end_date` are EU5 "Y.M.D" display-format
-- TEXT, matching `save_meta.in_game_date`'s existing convention (not a
-- native DATE column — this project has never needed one before).
--
-- `idx` is BIGINT, not INTEGER — same real finding as `population.idx`
-- (schema.sql's comment there has the full story): confirmed via a real
-- insert failure against the real ~642MB save ("value 2164260865.0...
-- out of range for... INT32"). War entity indices, like population
-- ones, use a larger index space than nations'/locations'.
CREATE TABLE IF NOT EXISTS wars (
  idx BIGINT PRIMARY KEY,
  war_name_key TEXT,
  attacker_idx INTEGER, -- logically REFERENCES nations(idx)
  defender_idx INTEGER, -- logically REFERENCES nations(idx)
  start_date TEXT,
  end_date TEXT, -- NULL while the war is still ongoing
  duration_days INTEGER,
  attacker_score DOUBLE,
  defender_score DOUBLE,
  attacker_casualties INTEGER,
  defender_casualties INTEGER
);

-- One row per population group (a `population.database` entry — see
-- specs/004-full-schema-mapping). Fixed-shape scalar fields (per
-- research.md §3's cross-entry key-set comparison, confirmed against a
-- real save) get real columns; `missing` (a variable-keyed, per-good
-- trade-deficit map — its keys are trade-good names, not a fixed
-- vocabulary of this table's own fields) is captured losslessly as JSON
-- text rather than one column per possible good (FR-006). `owner`,
-- `status`, `satisfaction`, and `missing` are all optional in the real
-- save (confirmed: not every population group has them) and stay NULL
-- rather than a fabricated default when absent.
--
-- `idx` is BIGINT, not INTEGER — confirmed necessary by a real insert
-- failure against the real ~642MB save ("value 2147484004.0 can't be
-- cast... out of range for... INT32"): population entity indices use a
-- much larger index space than nations'/locations' (which comfortably
-- fit INT32), unlike every other `idx` column in this schema so far.
CREATE TABLE IF NOT EXISTS population (
  idx BIGINT PRIMARY KEY,
  pop_type TEXT,
  estate TEXT,
  culture INTEGER,
  religion INTEGER,
  status TEXT,
  size DOUBLE,
  literacy DOUBLE,
  satisfaction DOUBLE,
  owner_idx INTEGER, -- logically REFERENCES nations(idx); see dialect note above
  missing_goods TEXT -- JSON-encoded { <good>: <amount>, ... }, or NULL
);

-- Catch-all for every top-level save section this feature doesn't yet
-- understand structurally (~45 of ~50 sections — see
-- research-save-format.md's top-level key list). Captured as opaque JSON
-- rather than guessed-at real columns (constitution Principle II: don't
-- invent schema for data that hasn't been inspected), so nothing is lost
-- and a future feature can add a real table for a given key once it
-- actually needs and researches that section. `id` (not `key`) is the
-- primary key because a handful of real top-level keys repeat (e.g.
-- `played_country`, once per human player) — those are handled specially
-- by the adapter and never reach this table, but nothing here assumes a
-- key is unique in case a future save version has other repeats.
-- specs/005-map-visualization: materializes each location's
-- `population.pops` list (research.md §2) — one row per (location, pop
-- group) pair. A real new table (`CREATE TABLE IF NOT EXISTS` is
-- sufficient here, unlike the ALTERs above), since no prior feature had
-- a locations<->population link at all.
CREATE TABLE IF NOT EXISTS location_pops (
  location_idx INTEGER NOT NULL, -- logically REFERENCES locations(idx)
  pop_idx BIGINT NOT NULL -- logically REFERENCES population(idx); BIGINT for the same reason population.idx is (see that table's comment)
);

-- specs/007-production-trade-markets: one row per market
-- (`market_manager.database` entry, 184 in the reference save). No name
-- field exists in the save at all — display name is derived at query
-- time from `center_location_idx` (the same location-naming pattern
-- `provinces`/`locations` already establish), with a further fallback
-- for the confirmed edge case where a market has no resolvable center.
-- `idx` is INTEGER, not BIGINT: unlike `population`/`wars`, market ids
-- are a small (184-entry) index space with no observed large values
-- (research.md's resolved BIGINT-vs-INTEGER question) — no evidence of
-- the INT32-overflow pattern that forced those two tables wider.
-- `member_count` is the save's member-location list length, computed at
-- extraction; no FR reads the individual member locations, so the list
-- itself isn't normalized into its own table (research.md's scope
-- decision).
CREATE TABLE IF NOT EXISTS markets (
  idx INTEGER PRIMARY KEY,
  center_location_idx INTEGER, -- logically REFERENCES locations(idx); NULL when the save has no resolvable center (spec's own edge case)
  member_count INTEGER,
  capacity DOUBLE
);

-- One row per (market, good) pair a market actually trades — a market
-- with no `goods` sub-object in the save (2 of 184 in the reference
-- save) contributes zero rows here, never zero-value ones (FR-006).
-- `supply`/`demand` are the save's own authoritative totals, not derived
-- by summing the *_raw_materials/*_buildings/etc. components below
-- (data-model.md). Every numeric/flag column stays NULL, never a
-- fabricated 0, when the save doesn't populate it for that market/good
-- (FR-011) — same convention as `wars`/`population` above. `is_importing`/
-- `is_exporting` are INTEGER 0/1, not a native BOOLEAN column — this
-- schema has no BOOLEAN column anywhere (`nations.is_player`/
-- `is_human_played` use the same 0/1 convention), and `insertRows`' bulk
-- Arrow-insert path only accepts string/number/null per row.
CREATE TABLE IF NOT EXISTS market_goods (
  market_idx INTEGER NOT NULL, -- logically REFERENCES markets(idx)
  good TEXT NOT NULL, -- the save's raw good key (e.g. "iron"), surfaced as-is
  price DOUBLE,
  supply DOUBLE,
  demand DOUBLE,
  stockpile DOUBLE,
  is_importing INTEGER, -- 0/1, NULL when the save doesn't confirm either way
  is_exporting INTEGER,
  supply_raw_materials DOUBLE, -- goods.<good>.production_supplied.RawMaterials
  supply_buildings DOUBLE, -- goods.<good>.production_supplied.Buildings
  supply_trade DOUBLE, -- goods.<good>.supplied.Trade
  demand_population DOUBLE, -- goods.<good>.demanded.Pops
  demand_trade DOUBLE, -- goods.<good>.demanded.Trade + demanded.BurgherTrades (merged: spec has one "trade" bucket, save has two)
  demand_building_upkeep DOUBLE, -- goods.<good>.demanded.Building
  demand_unit_upkeep DOUBLE, -- goods.<good>.demanded.Units
  demand_construction DOUBLE -- goods.<good>.demanded.Construction
);
CREATE INDEX IF NOT EXISTS idx_market_goods_market ON market_goods (market_idx, good);

-- market_good_price_history (one row per recorded price point per
-- market/good) was removed: pulling `goods.<good>.history` for every
-- good in every market was the single largest cost in parsing a real
-- save, for a price-history chart that wasn't worth that cost (real
-- user report; see ARCHITECTURE.md's decision log). A save kept before
-- this change may still have the old table sitting in its OPFS
-- database — harmless, inert leftover data; nothing here creates or
-- reads it anymore, matching this schema's existing additive-only
-- convention (no table is ever actively dropped on resume).

-- One row per good: the save's own world-total production snapshot,
-- from `market_manager.produced_goods.<good>` — read directly, never
-- summed client-side from `market_goods` (that's a distinct
-- save-provided figure, not necessarily equal to a naive per-market
-- sum). Always present per the save.
CREATE TABLE IF NOT EXISTS world_good_production (
  good TEXT PRIMARY KEY,
  total DOUBLE NOT NULL
);

-- specs/009-world-goods-production: one row per (province, good) the
-- save's own `provinces.database.*.last_month_produced` records —
-- sparse, only for provinces/goods actually producing something.
-- Confirmed real and populated (3295 of 4071 provinces in the reference
-- save) for 52 of the save's 71 tradeable goods — the raw-material/RGO
-- outputs; the remaining 19 (manufactured/building outputs) have no
-- per-province figure here (research.md §1) and are out of scope.
-- `province_idx` is INTEGER, matching `provinces.idx`'s existing type —
-- no evidence of a larger index space, same reasoning as `markets.idx`.
-- A good's production-share "coverage" (whether this feature can show
-- a country breakdown for it) is derived from this table's contents at
-- query time (`listWorldGoodsArrow`'s `has_production_coverage`
-- column), never a hardcoded list — self-describing from what the save
-- actually contains.
CREATE TABLE IF NOT EXISTS province_good_production (
  province_idx INTEGER NOT NULL, -- logically REFERENCES provinces(idx)
  good TEXT NOT NULL,
  amount DOUBLE NOT NULL -- the save always populates a real number once this entry exists
);
CREATE INDEX IF NOT EXISTS idx_province_good_production_good
  ON province_good_production (good, province_idx);

-- specs/006-country-leaderboard, post-ship 2026-09-21 (Ruler History
-- stretch goal): one row per ruler term from `rulerterm_manager.database`
-- — real, dated reigns, not fabricated ones. Scoped at extraction time
-- (1.3.11.ts) to `ruled_type=Country` (excludes International
-- Organization ruler terms, e.g. HRE-style elected titles) and
-- `ruler_type=Character` with a resolvable `ruler.characters[0].character`
-- (excludes interregnum/regency terms, which have no character to
-- score). `adm`/`dip`/`mil` are that ruler's `character_db` entry's own
-- stats at save time (a character's stats can change over their life —
-- these are whatever the save currently records, not a point-in-time
-- snapshot from the start of the reign). No `end_date` column: the
-- chart derives each ruler's segment end from the *next* row's
-- `start_date` (or the save's current date for the last one), which
-- also means a real but unmodeled interregnum gap simply carries the
-- previous ruler's value forward rather than showing a gap — a
-- deliberate simplification, not a fabrication (see ARCHITECTURE.md).
-- first_name_key: the character's raw `first_name` field, e.g.
-- "name_birger" — a localization key, not display text (the save
-- carries no localized strings). Resolved client-side against
-- src/components/Overview/rulerNames.json (generated from the game's
-- own install by tools/ruler-names-scraping/generate.ts, the same
-- key-lookup-from-game-files pattern 008's Encyclopedia already uses)
-- — never guessed. nickname, in contrast, is real display text
-- already in the save when present (e.g. "Ladulas"), not a key; stored
-- and shown as-is, no lookup needed.
-- Column order here matters beyond readability: insertRows' bulk-insert
-- path (db.ts) inserts into this table positionally (DuckDB-Wasm's
-- insertArrowTable matches the Arrow table's field order against this
-- table's own physical column order, not by name) — it must exactly
-- match the tuple order 1.3.11.ts builds `rulerHistoryRows` in.
CREATE TABLE IF NOT EXISTS ruler_history (
  nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  start_date TEXT NOT NULL, -- 'YYYY.M.D', this ruler's reign start
  regnal_number INTEGER,
  first_name_key TEXT,
  nickname TEXT,
  adm DOUBLE,
  dip DOUBLE,
  mil DOUBLE
);
CREATE INDEX IF NOT EXISTS idx_ruler_history_nation
  ON ruler_history (nation_idx, start_date);

CREATE SEQUENCE IF NOT EXISTS raw_sections_id_seq;
CREATE TABLE IF NOT EXISTS raw_sections (
  id INTEGER PRIMARY KEY DEFAULT nextval('raw_sections_id_seq'),
  key TEXT NOT NULL,
  data TEXT NOT NULL
);

-- specs/012-firepower-tab: one row per subunit_manager.database entry (a
-- regiment or ship). idx is BIGINT — sibling unit_manager stack ids
-- already exceed INT32 (e.g. 2818572288, confirmed against the real
-- save), same index space. strength is army-only; stays NULL for navy
-- rows (the field is genuinely absent there in the save, never
-- fabricated as 0 or 1).
CREATE TABLE IF NOT EXISTS regiments (
  idx BIGINT PRIMARY KEY,
  owner_idx INTEGER, -- logically REFERENCES nations(idx)
  unit_type TEXT, -- e.g. 'a_heavy_cavalrymen', 'n_carrack'
  morale DOUBLE,
  number DOUBLE,
  strength DOUBLE
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
-- reform / estate privilege) — government.implemented_reforms /
-- .implemented_privileges, each a flat list of {date, days, object}
-- entries; all entries are currently-active (reforms/privileges
-- accumulate over time, they don't replace each other).
CREATE TABLE IF NOT EXISTS nation_reforms (
  nation_idx INTEGER NOT NULL,
  object TEXT NOT NULL,
  date TEXT
);
CREATE INDEX IF NOT EXISTS idx_nation_reforms_nation ON nation_reforms (nation_idx, object);

CREATE TABLE IF NOT EXISTS nation_privileges (
  nation_idx INTEGER NOT NULL,
  object TEXT NOT NULL,
  date TEXT
);
CREATE INDEX IF NOT EXISTS idx_nation_privileges_nation ON nation_privileges (nation_idx, object);

-- specs/012-firepower-tab: one row per (nation, active law choice) —
-- government.implemented_laws, grouped by law_category; exactly one
-- active object per category at a time (a new choice replaces the row,
-- no history to preserve here unlike reforms/privileges above).
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
-- (manpower, sailors, army_tradition, navy_tradition, monthly_manpower,
-- monthly_sailors) and the country record directly
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
-- culture-group gate check on a minority of unique unit unlocks
-- (data-model.md's "known accepted simplification").
ALTER TABLE nations ADD COLUMN IF NOT EXISTS primary_culture_idx INTEGER;

-- specs/012-firepower-tab: same purpose, resolved culture-group name.
ALTER TABLE cultures ADD COLUMN IF NOT EXISTS culture_group TEXT;

-- specs/013-diplomatic-relations-chord: one row per active relationship
-- instance between two countries, from diplomacy_manager (research.md
-- §1). relation_type is a small fixed vocabulary derived at parse time,
-- not a raw save field copied verbatim — scripted_mutual/scripted_oneway
-- entries carry a dozen+ treaty-type object= values; only 'alliance' and
-- 'guarantee' are extracted, the rest are read and discarded (spec
-- Assumptions' v1 scope). first_nation_idx < second_nation_idx is
-- enforced at insert time (adapter-side) so a mutual pair recorded under
-- both sides (rivalry) collapses to one row, never two. INTEGER, not
-- BIGINT: confirmed the same already-established nations.idx range
-- (research.md §5), not the larger wars.idx-style space.
CREATE TABLE IF NOT EXISTS diplomatic_relations (
  first_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  second_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  relation_type TEXT NOT NULL, -- 'alliance' | 'rivalry' | 'royal_marriage' | 'guarantee' | 'military_access' | 'food_access' | 'fleet_basing_rights' | 'economic_support'
  start_date TEXT, -- NULL when the source block carries no date
  -- Post-ship, 2026-09-22 (explicit user request): economic_support's
  -- named_targets={{flag=amount target={type=value identity=<n>}}} —
  -- the ducat amount granted. NULL for every other relation_type (never
  -- a fabricated 0 — a real economic_support entry with no readable
  -- amount stays NULL too, distinct from a genuine zero-amount grant).
  amount DOUBLE,
  -- Post-ship, 2026-09-22 (explicit user request, "arrow changing
  -- depending on if its a one way or two relationship"): which
  -- diplomacy_manager container this row came from — exhaustively
  -- confirmed against the real save (every occurrence, not a sample):
  -- alliance is ALWAYS scripted_mutual (38/38); every other treaty type,
  -- guarantee included, is ALWAYS scripted_oneway. royal_marriage and
  -- rivalry (no scripted_mutual/scripted_oneway container at all) are
  -- inherently symmetric, stored as FALSE; economic_support (its own
  -- entry type, a one-directional grant by nature) stored as TRUE.
  -- Direction, where 1, runs first_nation_idx -> second_nation_idx,
  -- matching the save's own field order (not independently confirmed
  -- against which side is semantically the "grantor" — see research.md).
  -- INTEGER 0/1, not a native BOOLEAN column, same reasoning as
  -- market_goods.is_importing/is_exporting above — insertRows' bulk
  -- Arrow-insert path only accepts string/number/null per row.
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
-- recorded).
CREATE TABLE IF NOT EXISTS nation_relation_trust (
  owner_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  target_nation_idx INTEGER NOT NULL, -- logically REFERENCES nations(idx)
  trust DOUBLE NOT NULL,
  -- Post-ship, 2026-09-22 (explicit user request, "diplomatic score...
  -- 200 to -200"): a derived sum of every
  -- relations.<target>.timed_biases.Opinion[].value and
  -- .Antagonism[].value entry present for this directional pair — the
  -- save has no single stored "Opinion" scalar (confirmed by field-name
  -- exhaustive inspection of a real relations.<target> entry: only
  -- trust/disposition/timed_biases/last_war/war_score/
  -- diplomat_return_date/last_spy_discovery exist), so this is computed
  -- at parse time from the same named modifier-stack entries the save's
  -- own "Opinion"/"Antagonism" timed-bias lists carry (e.g.
  -- opinion_improve_relation, opinion_dynasties_marrying,
  -- broke_alliance_with_nobles). NULL when a relations.<target> entry
  -- exists but has no timed_biases at all (never fabricated as 0,
  -- constitution Principle IV) — distinct from a real computed zero.
  opinion_score DOUBLE
);
CREATE INDEX IF NOT EXISTS idx_nation_relation_trust_pair
  ON nation_relation_trust (owner_nation_idx, target_nation_idx);

CREATE INDEX IF NOT EXISTS idx_provinces_owner ON provinces(owner_idx);
CREATE INDEX IF NOT EXISTS idx_locations_owner ON locations(owner_idx);
CREATE INDEX IF NOT EXISTS idx_locations_province ON locations(province_idx);
CREATE INDEX IF NOT EXISTS idx_war_participants_nation ON war_participants(nation_idx);
CREATE INDEX IF NOT EXISTS idx_raw_sections_key ON raw_sections(key);
CREATE INDEX IF NOT EXISTS idx_population_owner ON population(owner_idx);
CREATE INDEX IF NOT EXISTS idx_wars_attacker ON wars(attacker_idx);
CREATE INDEX IF NOT EXISTS idx_wars_defender ON wars(defender_idx);
CREATE INDEX IF NOT EXISTS idx_locations_controller ON locations(controller_idx);
CREATE INDEX IF NOT EXISTS idx_location_pops_location ON location_pops(location_idx);
