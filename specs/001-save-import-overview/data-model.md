# Phase 1 Data Model: Save Import & Overview

Storage engine: SQLite (via `wa-sqlite`/OPFS), one database per loaded save
(see `research.md` §2). Schema below is per-database — there is no
cross-save table, since v1 only ever has one active save plus at most one
kept save (each as its own database file/handle).

**Corrected against a real save file** (see
`research-save-format.md` for full detail and evidence) — the schema
below reflects the confirmed real structure, not the original guesses.
Notably: countries/provinces are indexed numerically (not by tag
directly), `development` lives on individual **locations**, not
provinces, and government type/treasury/stability are nested under real
per-country sub-objects. A `locations` table has been added that didn't
exist in the original version of this document.

## Entities

### `save_meta` (one row; from spec's **Save File**)

| Field | Type | Notes |
|---|---|---|
| `id` | text (uuid) | Generated on load; identifies this database instance. |
| `filename` | text | Original filename, for display only (not a trust boundary). |
| `detected_version` | text | Game version string detected during parsing (FR-004). |
| `supported` | integer (bool) | Whether `detected_version` matched a known adapter. If false, parsing halts and the UI shows the unsupported-version message — no further rows are populated. |
| `in_game_date` | text (ISO-ish game date) | The save's in-game date (User Story 1). |
| `loaded_at` | text (ISO datetime) | Wall-clock time this save was loaded, for UI/debug purposes only. |
| `kept` | integer (bool) | Whether the user chose to keep this save across sessions (FR-011). Default `0`. |

### `nations` (one row per country in the save; from spec's **Player Nation** + supporting context)

The save references countries by a **numeric index** everywhere (province
`owner`, location `owner`, war `country`), not by tag directly — that
numeric index is this table's primary key. `tag` is kept as a separate
column (from the save's `countries.tags` lookup) for display/debugging,
not as the join key.

| Field | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's internal numeric country index (from `countries.tags`/`countries.database` keys — see research-save-format.md). This, not `tag`, is what `provinces.owner_idx`/`locations.owner_idx`/war participant `country` reference. |
| `tag` | text | The save's 3-letter country tag (e.g. `RUS`), from `countries.tags[idx]`. |
| `name` | text | Display name. For the player's own nation this comes from `metadata.player_country_name`; for other nations there is no confirmed plain-text name field in-save (`country_name.name` is a localization key, not a display string) — see research-save-format.md's open question. Nullable for non-player nations until a resolution is chosen. |
| `country_type` | text | Raw value (`Real`, `Pirates`, `Mercenaries`, ...) from the save. Used to filter out non-real placeholder entries (e.g. index `0` = `DUMMY`) when picking the player's nation — not itself a displayed stat. |
| `is_player` | integer (bool) | True for the human-controlled nation(s), per the save's `played_country` list. Assumption (spec, confirmed implementable — see research-save-format.md): if multiple `played_country` entries exist, v1 treats the first found as *the* Player Nation. |
| `treasury` | real | Raw value, from `countries.database[idx].currency_data.gold`. |
| `stability` | real | Raw value, from `countries.database[idx].currency_data.stability`. Scale/meaning beyond "a real save-provided number" is unconfirmed (not an EU4-style -3..+3 — observed real range in one save was roughly -25 to +55); display as-is, don't assume a fixed min/max. |
| `government_type` | text | Raw value, from `countries.database[idx].government.type` (nested, not top-level). |
| `at_war` | integer (bool) | **Derived**, not raw: true if `idx` appears in any `war_manager.database[*].all[*]` entry with matching `country` and `status="Active"`. Must be labeled as derived per FR-007, same as total development/province count. |

Total development and province count are **not** stored as columns on
`nations` — they are **derived** (FR-007) via the aggregate queries below,
computed from `locations` (not `provinces` — see below), so the UI can
label them distinctly from raw fields.

### `provinces` (one row per province group; supports display naming and future map features)

Provinces are a coarser grouping of locations (e.g. a named historical
province like "mazyr_province") and do **not** carry a development value
themselves — see `locations` below for that.

| Field | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's internal numeric province index (`provinces.database` key). |
| `name` | text | From `provinces.database[idx].province_definition` (a real, if internal, name string — e.g. `"mazyr_province"`; not yet confirmed to be player-facing display text or an internal/localization key — treat as a raw label for now). |
| `owner_idx` | integer (FK → `nations.idx`, nullable) | From `provinces.database[idx].owner`. Note: a province's `owner` can in principle diverge from its constituent locations' individual `owner` values during contested control — for aggregate stats, `locations.owner_idx` is the authoritative signal, not this field. |
| `capital_location_idx` | integer (FK → `locations.idx`, nullable) | From `provinces.database[idx].capital`. |

### `locations` (one row per map tile; this is where development actually lives)

New table — did not exist in the original version of this document. EU5
separates fine-grained map tiles ("locations") from the coarser
historical-province groupings above; **development is a per-location
value**, confirmed via real save inspection (see
research-save-format.md).

| Field | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's internal numeric location index (`locations.locations` key). |
| `owner_idx` | integer (FK → `nations.idx`, nullable) | From `locations.locations[idx].owner`. This is the authoritative "who currently holds this" signal for aggregate stats — more current than a province's own `owner` field during contested control. |
| `province_idx` | integer (FK → `provinces.idx`, nullable) | From `locations.locations[idx].province` — back-reference to the containing province. |
| `development` | real | Raw per-location development value, from `locations.locations[idx].development`. |

### `war_participants` (one row per country per war they're in; supports the derived "at war" stat)

| Field | Type | Notes |
|---|---|---|
| `nation_idx` | integer (FK → `nations.idx`) | From a `war_manager.database[*].all[*]` entry's `country`. |
| `status` | text | Raw value from the same entry (e.g. `"Active"`, `"Declined"`). Only `"Active"` counts as currently at war. |

Populated by the adapter from the save's `war_manager` structure during
parsing — see the "At war" entry under Derived Values below for why this
needs a table at all (unlike development/province count, which reuse data
already needed elsewhere).

### `raw_sections` (one row per unrecognized top-level save section)

| Field | Type | Notes |
|---|---|---|
| `id` | integer (primary key, autoincrement) | Not `key`, since a handful of real top-level keys repeat (e.g. `played_country`); those are handled specially and never reach this table, but nothing here assumes uniqueness. |
| `key` | text | The save's top-level section name (e.g. `"cheats"`, `"weather"`). |
| `data` | text | The section's full parsed value, JSON-serialized. |

A deliberate decision (not in the original plan): rather than only
parsing the 5 sections this feature needs and discarding the rest, the
adapter parses **every** top-level section and captures anything without
a real table here as opaque JSON, so no data is lost for future features
(map visualization, time-series, the AI copilot) even though their
structure hasn't been researched yet. Accepted tradeoff: more parse
time/storage now than strictly required for this feature's own scope, to
be revisited if it proves too slow (see `research-save-format.md`'s
top-level key list for what ends up here).

## Derived Values (Principle IV — must be visually distinguished in the UI)

- **Total development** (a nation's overview stat) = `SUM(locations.development) WHERE owner_idx = :idx`
- **Province count** (a nation's overview stat) = `COUNT(*) FROM locations WHERE owner_idx = :idx`. Naming note: what the spec calls "province count" is implemented as a **location** count, since that's the granularity at which EU5 actually tracks ownership/development — a `provinces`-table count of distinct owned provinces would undercount contested/partially-held provinces and double-count locations sharing one province. This is a naming nuance worth a quick confirmation with product during `/speckit-implement`, not a silent reinterpretation of the requirement's intent (which is "how much territory does this nation hold").
- **At war** (a nation's overview stat) = `EXISTS(SELECT 1 FROM war_participants WHERE nation_idx = :idx AND status = 'Active')`. Unlike total development/province count, this can't be computed purely at query time from data already needed for other stats — the raw `war_manager` structure has to be read once during parsing regardless, since it exists nowhere else. Rather than discarding that read (which would leave nothing to query if a kept save is reopened later with no live parse session), the adapter populates a minimal `war_participants` table (one row per country per war they're a participant in, per data-model.md's schema) so "at war" stays queryable the same way as every other overview stat — consistent with the queryable-store rationale in Principle VIII, rather than depending on parser-time-only state.

All are computed via `storage/queries.ts`, never stored as columns, so
there's no risk of a stale cached aggregate drifting from the underlying
per-location rows.

## State Transitions

```text
(no save loaded)
      │ user selects file (FR-001)
      ▼
validating format (FR-002) ──fails──▶ error: "not a recognized save"
      │ recognized
      ▼
detecting version (FR-004) ──unsupported──▶ error: "unsupported version"
      │ supported
      ▼
parsing (worker, streaming, FR-003/FR-008) ──fails partway──▶ error: "failed to parse"
      │ succeeds
      ▼
overview displayed (FR-006/FR-007)
      │
      ├─ user loads a different file (FR-010) ──▶ back to "validating format" with a fresh database
      └─ user chooses "keep" (FR-011) ──▶ save_meta.kept = 1, database persists in OPFS across sessions
             │ user clears it (FR-013) or keeps a different save (Assumptions: only one kept save)
             ▼
      previously kept database is deleted from OPFS
```

## Resolved Questions (previously open, now confirmed against a real save)

- **`at_war`**: confirmed derived, not raw — see `nations.at_war` above
  and `research-save-format.md`'s `war_manager` section for the exact
  query shape.
- **Where development lives**: confirmed to be per-location, not
  per-province — this is why the `locations` table was added.

## Remaining Open Question (non-blocking)

Identifying exactly which country is "the player's nation" when a save
has multiple `played_country` entries (multiplayer) has no fully
confirmed resolution — `metadata.player_country_name` is a display string
with no direct tag/index lookup in the save. See
`research-save-format.md`'s "Open question: identifying the player's
nation" section for the full analysis and recommended fallback (first
`played_country` entry, matching the spec's existing Assumption). This
does not block implementation of the primary single-player case, where
there is exactly one `played_country` entry and no ambiguity exists.
