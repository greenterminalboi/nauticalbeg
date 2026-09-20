// Shared types for the schema-mapping tool. See
// specs/004-full-schema-mapping/data-model.md for the full field-level
// rationale behind each shape here.

/**
 * The set of value-type "shapes" the walker can observe for a given
 * field path. A field path's inventory entry may list more than one of
 * these if real inconsistency was observed (constitution Principle IV:
 * never collapse to "the most common one").
 */
export type FieldValueType =
  | "string"
  | "number"
  | "boolean"
  | "date" // jomini's typeNarrowing: "unquoted" result for an unquoted date-like token
  | "fixed_object" // a nested object whose key-set recurred consistently across sampled entries (research.md §3)
  | "variable_object" // a nested object whose key-set varied entry to entry — the keys themselves are data
  | "list" // a jomini array (after toArray normalization — research.md §2) of scalars
  | "list_of_objects" // a jomini array of nested objects
  | "empty_object"; // observed only as `{}` in every sampled entry — shape not yet confirmed

/** One discovered field path within one Section Inventory. */
export interface FieldInventoryEntry {
  /** Dot-notation path relative to its section, e.g.
   * `database.*.currency_data.gold` (a `*` segment denotes "any key of
   * a `database`-shaped map," per research.md §3's per-path, not
   * per-instance, classification). */
  path: string;
  /** Every type actually observed for this path — never collapsed to
   * "the most common one" (constitution Principle IV). */
  observedTypes: FieldValueType[];
  /** Whether the path was found on every sampled entry of its parent
   * collection, or only some. */
  presence: "always" | "sometimes";
  /** One real value copied verbatim from the source save. */
  exampleValue: string | number | boolean;
  /** How many parent entries were scanned when building this entry —
   * distinguishes "confirmed absent sometimes across 2,470 entries"
   * from "only ever saw 1 entry." */
  observedEntryCount: number;
  /** For `fixed_object` entries only: the recurring, named key-set.
   * Omitted for `variable_object` (the keys are data, not a fixed
   * vocabulary) and for scalar types. */
  childKeys?: string[];
}

/** The complete set of Field Inventory Entries for one top-level save
 * section. */
export interface SectionInventory {
  /** The top-level save key, e.g. `population`, `countries`,
   * `war_manager`. */
  sectionKey: string;
  /** Every distinct field path discovered under this section. */
  entries: FieldInventoryEntry[];
  /** How many top-level occurrences of this section's own repeatable
   * structure were scanned (e.g., `countries.database`'s 2,470
   * entries) — `0` or `1` for a section that isn't itself a repeated
   * collection (e.g., `metadata`). */
  sampleSize: number;
  /** `false` when the section was present but empty in the sampled
   * save — signals "exists, but re-run against a save where this
   * section is populated before trusting `entries` as complete." */
  shapeConfirmed: boolean;
}

/** The full output of one schema-mapping inventory run. */
export interface SaveInventory {
  /** Filename of the save that was scanned (not a full local path —
   * avoids committing a maintainer-specific filesystem path into a
   * version-controlled artifact). */
  sourceFile: string;
  /** From the save's own `metadata.version`, when present. */
  gameVersion: string | null;
  /** ISO timestamp of the inventory run. */
  generatedAt: string;
  /** One entry per top-level save key found — covers every key, not
   * only the ones the app currently interprets. */
  sections: SectionInventory[];
}

/** The output of comparing two `SaveInventory` values. */
export interface DriftReport {
  /** Identifies which inventory is the "before". */
  baseline: { sourceFile: string; gameVersion: string | null };
  /** Identifies which inventory is the "after". */
  candidate: { sourceFile: string; gameVersion: string | null };
  /** Field paths present in `candidate` but not `baseline`. */
  added: string[];
  /** Field paths present in `baseline` but not `candidate`. */
  removed: string[];
  /** Field paths present in both, with a different `observedTypes` set. */
  typeChanged: { path: string; before: FieldValueType[]; after: FieldValueType[] }[];
  /** `false` only when `added`/`removed`/`typeChanged` are all empty —
   * always computed, never hand-set. */
  hasDrift: boolean;
}
