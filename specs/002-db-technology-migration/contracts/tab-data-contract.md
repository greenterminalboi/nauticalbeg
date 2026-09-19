# Contract: `storage/queries.ts` additions (per-tab read interface)

**User Story 1 (the portfolio shell) adds no functions to this contract
at all** — it's pure UI restructuring around 001's existing
`getSaveMeta`/`listNations`/`getNationOverview`, with no new query, no
new table, no new worker message. Everything below is User Story 2
onward (the actual data tabs).

Extends 001's existing contract (`specs/001-save-import-overview/contracts/data-access-contract.md`)
rather than replacing it — `getSaveMeta`/`getNationOverview`/`listNations`
etc. are unchanged. Every function below follows the same `list*(db,
nationIdx)` shape `listNations`/`getNationOverview` already established,
for the same reason documented there: this is the candidate tool surface
for the future AI agent (constitution Principle VIII), so new query
functions should keep looking like well-defined, parameterized,
read-only tools rather than drifting into ad-hoc shapes per tab.

**No new worker-protocol messages**: every function here only ever reads
from the already-open, main-thread, read-only connection `FileLoader.tsx`
keeps open per 001's `readDbRef` pattern — nothing in this feature writes
to the save's database, so none of it needs the `keep`-style
worker-round-trip 001 required for writes.

**Pagination**: per research.md's decision, list-shaped functions for
tabs that can have many rows (Provinces, Military, Buildings) take a
`page`/`pageSize` (or cursor) parameter and return a bounded page, not
the full result set — kept consistent across all three rather than
inventing a different shape per tab.

| Function | Returns | Backing query (see `data-model.md`) |
|---|---|---|
| `listProvinces(db, nationIdx, page)` | `{ rows: {idx, name, development}[], hasMore: boolean }` | `SELECT locations.idx, provinces.name, locations.development FROM locations LEFT JOIN provinces ON provinces.idx = locations.province_idx WHERE locations.owner_idx = :idx LIMIT/OFFSET` — reuses 001's existing tables, no new one. **Corrected during US2 implementation**: `locations` itself has no `name` column (only `idx`/`owner_idx`/`province_idx`/`development` — see 001's `schema.sql`); the display name comes from `provinces.name` (the adapter's `province_definition` string, e.g. `"mazyr_province"`) via a join on `province_idx`, falling back to `"Location {idx}"` if a location has no matching province row. |
| `listEstates(db, nationIdx)` | `{ idx, estateType, satisfaction, wealthImpact }[]` | `SELECT ... FROM estates WHERE country_idx = :idx` — always ≤8 rows, no pagination needed |
| `listPolicies(db, nationIdx)` | `{ id, lawCategory, chosenObject, adoptedDate }[]` | `SELECT ... FROM policies WHERE country_idx = :idx` |
| `listMilitaryUnits(db, nationIdx, page)` | `{ rows: {idx, unitType, strength, morale, number}[], hasMore: boolean }` | `SELECT ... FROM military_units WHERE owner_idx = :idx LIMIT/OFFSET` |
| `listBuildings(db, nationIdx, page)` | `{ rows: {idx, buildingType, level, locationIdx}[], hasMore: boolean }` | `SELECT ... FROM buildings WHERE owner_idx = :idx LIMIT/OFFSET` |
| `listLoans(db, nationIdx)` | `{ idx, amount, interest, lenderIdx, isBond }[]` | `SELECT ... FROM loans WHERE borrower_idx = :idx` |
| `listCharacters(db, nationIdx)` | `{ idx, firstName, adm, dip, mil, isAlive, isRuler, isHeir }[]` | `SELECT ... FROM characters WHERE country_idx = :idx`, joined against `nations.idx`'s `government.ruler`/`.heir` for the `isRuler`/`isHeir` flags |

**Diplomacy, Trade, and Economy's income/expense breakdown are not in
this table** — per data-model.md, their backing schema is still TBD, so
their query functions can't be specified yet either. Add them to this
contract (or a follow-up revision of it) once each one's implementation
task has confirmed a real schema, rather than specifying a function
signature against a table that doesn't exist yet.

## Rules

- Every function here is read-only — same rule as 001's contract.
- `listMilitaryUnits`/`listBuildings` MUST tag `unitType`/`buildingType`
  aggregates (e.g., a future "total strength by type" summary) as
  derived per FR-007's convention if any function ever returns a
  computed rollup alongside raw rows — none of the functions above do
  yet (they return raw rows only), so this is a constraint on future
  additions to this contract, not a currently-unmet requirement.
- No function accepts arbitrary SQL from its caller — unchanged from
  001's contract, for the same Principle VIII reason.
