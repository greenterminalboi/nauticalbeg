# Phase 1 Data Model: Full Save-File Schema Mapping (Tooling)

Every entity here is produced/consumed by `tools/schema-mapping/`
directly (User Stories 1 and 3); none of it is a database table — see
research.md §4 for why the canonical form is JSON, not a DuckDB schema.
Where User Story 2 turns a finding into a real column, that's an
ordinary extension of the existing `src/storage/schema.sql`, not a new
entity of its own.

## FieldValueType

The set of value-type "shapes" the walker can observe for a given field
path. A field path's inventory entry may list more than one of these if
real inconsistency was observed (spec's Edge Cases).

```ts
type FieldValueType =
  | "string"
  | "number"
  | "boolean"
  | "date"        // jomini's typeNarrowing: "unquoted" result for an unquoted date-like token
  | "fixed_object"    // a nested object whose key-set recurred consistently across sampled entries (research.md §3)
  | "variable_object" // a nested object whose key-set varied entry to entry — the keys themselves are data
  | "list"        // a jomini array (after toArray normalization — research.md §2) of scalars
  | "list_of_objects" // a jomini array of nested objects
  | "empty_object";   // observed only as `{}` in every sampled entry — shape not yet confirmed (spec's Edge Cases)
```

## FieldInventoryEntry

One discovered field path within one Section Inventory.

| Field | Type | Notes |
|---|---|---|
| `path` | `string` | Dot-notation path relative to its section, e.g. `database.*.currency_data.gold` (a `*` segment denotes "any key of a `database`-shaped map," per research.md §3's per-path, not per-instance, classification). |
| `observedTypes` | `FieldValueType[]` | Every type actually observed for this path, per constitution Principle IV — never collapsed to "the most common one." |
| `presence` | `"always" \| "sometimes"` | Whether the path was found on every sampled entry of its parent collection, or only some (spec's Acceptance Scenario 4). |
| `exampleValue` | `string \| number \| boolean` | One real value copied verbatim from the source save (research.md's memory-footprint note: exactly one, not one per entry). |
| `observedEntryCount` | `number` | How many parent entries were scanned when building this entry — supports SC-001/SC-002's "is this really confirmed" trust, and distinguishes "confirmed absent sometimes across 2,470 entries" from "only ever saw 1 entry" (spec's Edge Cases: an entirely-empty-in-sample section). |
| `childKeys` | `string[] \| undefined` | For `fixed_object` entries only: the recurring, named key-set (e.g., `currency_data`'s `["gold", "stability", ...]`). Omitted for `variable_object` (the keys are data, not a fixed vocabulary) and for scalar types. |

## SectionInventory

The complete set of `FieldInventoryEntry` values for one top-level save
section.

| Field | Type | Notes |
|---|---|---|
| `sectionKey` | `string` | The top-level save key, e.g. `population`, `countries`, `war_manager`. |
| `entries` | `FieldInventoryEntry[]` | Every distinct field path discovered under this section. |
| `sampleSize` | `number` | How many top-level occurrences of this section's own repeatable structure were scanned (e.g., `countries.database`'s 2,470 entries) — `0` or `1` for a section that isn't itself a repeated collection (e.g., `metadata`). |
| `shapeConfirmed` | `boolean` | `false` when the section was present but empty in the sampled save (spec's Edge Cases) — signals "exists, but re-run against a save where this section is populated before trusting `entries` as complete." |

## SaveInventory

The full output of one `tools/schema-mapping` inventory run.

| Field | Type | Notes |
|---|---|---|
| `sourceFile` | `string` | Filename of the save that was scanned (not a full local path — avoids committing a maintainer-specific filesystem path into a version-controlled artifact). |
| `gameVersion` | `string \| null` | From the save's own `metadata.version`, when present. |
| `generatedAt` | `string` | ISO timestamp of the inventory run. |
| `sections` | `SectionInventory[]` | One entry per top-level save key found — per FR-001, this covers every key, not only the ones the app currently interprets. |

## DriftReport

The output of comparing two `SaveInventory` values (User Story 3).

| Field | Type | Notes |
|---|---|---|
| `baseline` | `{ sourceFile: string; gameVersion: string \| null }` | Identifies which inventory is the "before". |
| `candidate` | `{ sourceFile: string; gameVersion: string \| null }` | Identifies which inventory is the "after". |
| `added` | `string[]` | Field paths present in `candidate` but not `baseline`. |
| `removed` | `string[]` | Field paths present in `baseline` but not `candidate`. |
| `typeChanged` | `{ path: string; before: FieldValueType[]; after: FieldValueType[] }[]` | Field paths present in both, with a different `observedTypes` set. |
| `hasDrift` | `boolean` | `false` only when `added`/`removed`/`typeChanged` are all empty — spec's Acceptance Scenario 3 requires this be stated explicitly, not left as an empty/ambiguous result. |

## Validation Rules

- A `FieldInventoryEntry.path` MUST be unique within its
  `SectionInventory.entries` — the walker de-duplicates by path,
  merging repeated observations of the same path into one entry's
  `observedTypes`/`presence` rather than emitting duplicates.
- `SaveInventory.sections` MUST include an entry for every top-level key
  jomini's parse returns, even one this tool has never seen before
  (spec's Edge Cases) — a section is never silently skipped for being
  unrecognized.
- `DriftReport.hasDrift` MUST be computed, never hand-set — it is exactly
  `added.length > 0 || removed.length > 0 || typeChanged.length > 0`.
