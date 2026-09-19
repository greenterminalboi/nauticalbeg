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
