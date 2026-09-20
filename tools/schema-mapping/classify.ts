// Per-field classification: given every raw value observed for a field
// path across sampled entries, decide its type(s), presence, and (for
// nested objects) whether its key-set is a fixed, named vocabulary or a
// variable, data-driven set of keys. See
// specs/004-full-schema-mapping/research.md §3 for the rule this
// implements and why it needs a full scan (not a sample) to work.
import type { FieldInventoryEntry, FieldValueType } from "./types";

/**
 * How large the union of all keys ever seen may grow, relative to the
 * single largest instance's own key count, before a nested object is
 * classified as data-driven ("variable_object") rather than a fixed,
 * bounded vocabulary with some optional sub-keys ("fixed_object").
 *
 * Calibrated against real fixture data (research.md §3): `currency_data`
 * ranges from 5 keys (a placeholder entry) to 14 keys (a real country) —
 * a ratio near 1.0, comfortably fixed. `last_month_produced` draws each
 * instance's few keys from a much larger trade-good catalog — a ratio
 * well above this threshold. Revisit this constant if a real run against
 * the full save (quickstart.md Scenario 1) finds it misclassifying a
 * genuinely fixed field with unusually wide optional-key spread.
 */
const FIXED_VS_VARIABLE_KEY_RATIO_THRESHOLD = 2;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

type ScalarKind = Exclude<FieldValueType, "fixed_object" | "variable_object" | "empty_object">;

/** Classifies one raw value's own shape — objects are returned as
 * `"object"` and handled separately, since deciding fixed vs. variable
 * requires comparing across every sampled object instance, not just
 * looking at one. */
function classifyRawValueKind(value: unknown): ScalarKind | "object" {
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (value instanceof Date) return "date";
  if (Array.isArray(value)) {
    return value.some((el) => isPlainObject(el)) ? "list_of_objects" : "list";
  }
  if (isPlainObject(value)) return "object";
  throw new Error(`classify: unrecognized raw value: ${JSON.stringify(value)}`);
}

/** Cross-entry key-set comparison (research.md §3): decides whether a
 * nested object's keys form a fixed, recurring vocabulary or a
 * variable, data-driven set. */
function classifyObjectShape(
  objects: Record<string, unknown>[],
): { type: "empty_object" | "fixed_object" | "variable_object"; childKeys?: string[] } {
  const nonEmpty = objects.filter((obj) => Object.keys(obj).length > 0);
  if (nonEmpty.length === 0) {
    return { type: "empty_object" };
  }

  const allKeys = new Set<string>();
  let maxInstanceKeyCount = 0;
  for (const obj of nonEmpty) {
    const keys = Object.keys(obj);
    maxInstanceKeyCount = Math.max(maxInstanceKeyCount, keys.length);
    for (const key of keys) allKeys.add(key);
  }

  const ratio = allKeys.size / maxInstanceKeyCount;
  if (ratio <= FIXED_VS_VARIABLE_KEY_RATIO_THRESHOLD) {
    return { type: "fixed_object", childKeys: [...allKeys].sort() };
  }
  return { type: "variable_object" };
}

function toExampleValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return JSON.stringify(value);
}

/**
 * Builds one `FieldInventoryEntry` from every raw value actually
 * observed for `path` (one entry per sampled parent that *had* this
 * field present — a parent missing it contributes nothing to
 * `rawValues`, which is how `presence` gets computed against
 * `totalEntriesScanned`).
 *
 * Callers (`inventory.ts`) are responsible for jomini's repeated-key
 * normalization (research.md §2) before values reach here — this
 * function assumes `rawValues` already reflects each entry's real
 * cardinality, not an artifact of how many times a key happened to
 * repeat in the source text.
 */
export function classifyField(
  path: string,
  rawValues: unknown[],
  totalEntriesScanned: number,
): FieldInventoryEntry {
  if (rawValues.length === 0) {
    throw new Error(`classifyField: no observed values for path "${path}"`);
  }

  const observedTypes = new Set<FieldValueType>();
  const objectValues: Record<string, unknown>[] = [];
  for (const value of rawValues) {
    const kind = classifyRawValueKind(value);
    if (kind === "object") {
      objectValues.push(value as Record<string, unknown>);
    } else {
      observedTypes.add(kind);
    }
  }

  let childKeys: string[] | undefined;
  if (objectValues.length > 0) {
    const shape = classifyObjectShape(objectValues);
    observedTypes.add(shape.type);
    childKeys = shape.childKeys;
  }

  const entry: FieldInventoryEntry = {
    path,
    observedTypes: [...observedTypes],
    presence: rawValues.length === totalEntriesScanned ? "always" : "sometimes",
    exampleValue: toExampleValue(rawValues[0]),
    observedEntryCount: totalEntriesScanned,
  };
  if (childKeys) entry.childKeys = childKeys;
  return entry;
}
