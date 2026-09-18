# Phase 1 Data Model: Country Portfolio

Storage engine: SQLite (via `wa-sqlite`/OPFS), same per-save database 001
already creates — this feature adds tables to it, not a new database.
Column choices below come from real inspection of the same 642MB save
001's `research-save-format.md` was built from (see this feature's
`research.md` for exact byte-level findings); tables marked **TBD** are
deliberately left unschematized per constitution Principle II until each
one's own implementation task inspects it directly.

## Portfolio shell (User Story 1): no new schema

The shell added by `/speckit-clarify` (top bar, side navigation, centered
content area, "AI Agent"/"Map" placeholders) is pure UI restructuring —
it reads only data 001 already exposes (`getSaveMeta`, `listNations`,
`getNationOverview`) and introduces no new entity. `activeTab` (which
category is selected) is transient React component state, not persisted
data, so it has no column anywhere — same treatment as 001's own
in-memory `Status` state machine.

## Provinces tab: no new schema

Reuses 001's existing `provinces` and `locations` tables verbatim —
`SELECT ... FROM locations WHERE owner_idx = :idx` is already exactly
what the Provinces tab needs (the same query `getNationOverview`'s
total-development aggregate already runs, just returning rows instead of
a sum). No new table, no new adapter work for this tab.

## `estates` (Government tab)

One row per estate per country — every country has one row for each of
the 8 fixed estate types, from `estate_manager.database`.

| Column | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's own `estate_manager.database` numeric key. |
| `country_idx` | integer (FK → `nations.idx`) | From `estate_manager.database[idx].country`. |
| `estate_type` | text | e.g. `nobles_estate`, `clergy_estate`, `burghers_estate`, `peasants_estate`, `dhimmi_estate`, `tribes_estate`, `cossacks_estate`, `crown_estate`. |
| `satisfaction` | real | Raw value, 0-1 range observed. |
| `wealth_impact` | real | Raw value. |
| `exists_for_country` | integer (bool), nullable | From the optional `existence` field — only observed set (to `yes`) on `crown_estate` rows in the inspected save; **open question for that task**: confirm whether other estate types omit this field when genuinely inactive for a given culture/government, or whether it means something else entirely. |

## `policies` (Government tab)

One row per adopted law/policy per country, from
`countries.database[idx].implemented_laws` (a sibling field of the
`government` object 001 already reads `government_type` from — not a new
top-level manager).

| Column | Type | Notes |
|---|---|---|
| `id` | integer (primary key, autoincrement) | Synthetic — `implemented_laws` is a map keyed by law category, not a save-provided numeric index. |
| `country_idx` | integer (FK → `nations.idx`) | The owning country. |
| `law_category` | text | The map key, e.g. `colonial_policy`, `bureaucracy_law`, `censorship`, `administrative_system`. |
| `chosen_object` | text | From that entry's `object` field — the actual policy value in effect, e.g. `decentralized_bureaucracy_policy`. This is what FR-006 means by "active policies." |
| `adopted_date` | text, nullable | From that entry's `date`. |

**"National values"**: no `national_value*` key was found anywhere in
the real save (see research.md) — this entity has no confirmed backing
data yet. Deferred: this story's implementation task must either find
where (if anywhere) EU5 tracks something matching this concept, or the
spec's User Story 4 (Government tab) must be revisited to drop it / fold
it fully into the `policies` table above once a real save confirms
there's no separate mechanic.

## `military_units` (Military tab)

One row per deployed sub-unit, from `unit_manager.database`.

| Column | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's own `unit_manager.database` numeric key. |
| `owner_idx` | integer (FK → `nations.idx`) | From `owner`. |
| `controller_idx` | integer (FK → `nations.idx`), nullable | From `controller` — differs from `owner_idx` when captured/occupied; not itself a displayed stat, kept for a future "occupied units" view. |
| `unit_type` | text | e.g. `a_heavy_cavalrymen`, `n_genoese_galley`. The `a_`/`n_` prefix is the army/navy split the Military tab groups by. |
| `strength` | real | 0-1 fraction observed (fraction of full strength remaining). |
| `morale` | real | Raw value. |
| `number` | integer | Headcount in this sub-unit — what "total military strength" sums. |

### Derived Values

- **Total unit count per type** (Military tab stat) =
  `SUM(number) FROM military_units WHERE owner_idx = :idx GROUP BY unit_type`
  — derived per FR-007's convention, same as 001's total-development
  aggregate.

## `buildings` (Building Registry tab)

One row per constructed building, from `building_manager.database`.

| Column | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's own `building_manager.database` numeric key. |
| `location_idx` | integer (FK → `locations.idx`) | From `location` — **not** `provinces`, consistent with 001's existing "locations are authoritative for ownership" rule (see 001's data-model.md). |
| `owner_idx` | integer (FK → `nations.idx`) | From `owner`, present directly on the building row (redundant with `locations.owner_idx` but avoids a join for the common case). |
| `building_type` | text | From `type`, e.g. `brewery`, `temple`, `tools_guild`. |
| `level` | integer | Raw value. |
| `employed` | real | Raw value, fraction. |

## `loans` (Economy tab)

One row per outstanding loan, from `loan_manager.database`.

| Column | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's own `loan_manager.database` numeric key. |
| `borrower_idx` | integer (FK → `nations.idx`) | From `borrower`. |
| `lender_idx` | integer (FK → `nations.idx`), nullable | From `lender` — absent for bond/market loans (most observed rows). |
| `amount` | real | Raw value. |
| `interest` | real | Raw value. |
| `is_bond` | integer (bool) | From `bond`. |

**Economy tab's income/expense breakdown** (the other half of FR-007,
beyond loans) is **TBD** — `bureaucracy_manager`/`market_manager` are
confirmed to exist but their field structure wasn't inspected this pass;
that story's task must do so before this table is finalized.

## `characters` (Characters tab)

One row per character (alive or historical), from `character_db.database`.
Deliberately excludes the save's `dna` field (portrait-genetics binary
blob) — no requirement needs it, and storing it would meaningfully bloat
the per-save database for zero feature value (constitution Principle VII).

| Column | Type | Notes |
|---|---|---|
| `idx` | integer (primary key) | The save's own `character_db.database` numeric key — this is what `nations`/`government.ruler`/`.heir` (and, per research.md, `cabinet_entries`/`ruler_terms`) reference. |
| `country_idx` | integer (FK → `nations.idx`), nullable | From `country` — origin/home nation; may not equal whichever nation currently employs them (e.g. a foreign-born general) — good enough for FR-011's "characters associated with a nation" at MVP depth, per spec's Assumptions on field depth. |
| `first_name` | text | From `first_name` (a display-name key, not necessarily human-readable as-is — same open question 001 had for non-player `nations.name`; may need a lookup or fallback to the raw key). |
| `adm` / `dip` / `mil` | real each | Raw skill values. |
| `dynasty_idx` | integer (FK), nullable | From `dynasty` — `dynasty_manager`'s own shape is still TBD, so this stays a bare index for now, not a resolved dynasty name. |
| `birth_date` | text | Raw value. |
| `death_date` | text, nullable | From `death_data.death_date`, absent for living characters. |

### Derived Values

- **Is alive** (a Characters tab display flag) = `death_date IS NULL`.
  Not itself a save field — derived per FR-007's convention.
- **Is ruler / is heir** (a Characters tab display flag, for whichever
  character a nation's `government.ruler`/`.heir` index points at) —
  derived at query time by joining `nations.idx` through to this table,
  not a stored column here.

## Deferred entirely (confirmed present, zero schema decided yet)

Per constitution Principle II, no columns are guessed for these — each
becomes real schema only once its own user story's implementation task
inspects a real save:

- **Diplomatic relations / alliances** (Diplomacy tab, FR-008's alliance
  half — the war half already has 001's `war_participants`):
  `diplomacy_manager` is keyed unusually (by country index directly, not
  a `database={}` wrapper) and the exact alliance-flag field wasn't
  located this pass — see research.md.
- **Trade goods / trade routes** (Trade tab, FR-009): `trade_manager`,
  `trade_path_manager` confirmed present, not inspected.
- **Cabinet members / ruler terms** (a richer Characters tab, beyond the
  base ruler/heir MVP): `cabinet_manager`, `rulerterm_manager`,
  `dynasty_manager` confirmed present, not inspected.
