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
