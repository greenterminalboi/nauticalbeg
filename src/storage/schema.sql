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

-- One row per recorded price point for one (market, good) pair. Source:
-- `goods.<good>.history`, a bare number list with NO embedded dates in
-- the save — `date` is computed once at extraction time (research.md's
-- resolved decision), counting back from the save's current date at a
-- monthly cadence, so every consumer works with real dates instead of
-- re-deriving the anchor/cadence convention independently.
CREATE TABLE IF NOT EXISTS market_good_price_history (
  market_idx INTEGER NOT NULL, -- logically REFERENCES markets(idx)
  good TEXT NOT NULL,
  date TEXT NOT NULL, -- ISO "YYYY-MM"
  price DOUBLE NOT NULL -- the save always populates every history entry
);
CREATE INDEX IF NOT EXISTS idx_market_good_price_history
  ON market_good_price_history (market_idx, good, date);

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

CREATE SEQUENCE IF NOT EXISTS raw_sections_id_seq;
CREATE TABLE IF NOT EXISTS raw_sections (
  id INTEGER PRIMARY KEY DEFAULT nextval('raw_sections_id_seq'),
  key TEXT NOT NULL,
  data TEXT NOT NULL
);

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
