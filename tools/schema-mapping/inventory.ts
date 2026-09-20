// The core tree-walker: given a parsed jomini save tree, builds a
// SaveInventory covering every top-level section (FR-001), scanning
// every entry of every repeated collection rather than sampling
// (research.md §1/§3 — both optionality detection and fixed-vs-variable
// classification require seeing every entry, not a sample).
import { classifyField } from "./classify";
import type { FieldInventoryEntry, SaveInventory, SectionInventory } from "./types";

// Matches both integer keys ("100") and decimal keys ("0.03388") — a
// real save's `ai_memory.ai_conquer_desires.loc` map was confirmed to
// mix both within the same object (a genuinely numeric/data-driven
// bookkeeping map, not a fixed record) — an integer-only pattern missed
// it entirely, causing 150+ individual desire-score values to each be
// treated as their own named field.
const NUMERIC_KEY_RE = /^-?\d+(\.\d+)?$/;
/** A save section can genuinely have just one entry (one war, one
 * played_country block) — the signal that distinguishes a collection
 * from a fixed record isn't member *count*, it's that every key is
 * purely numeric (a real field name is never just digits), so a single
 * all-numeric-keyed member is still treated as a collection. */
const MIN_COLLECTION_SIZE = 1;
/** Synthetic field name for a collection whose members are themselves
 * the leaf value (e.g. `countries.tags={ 0=DUMMY 1=PIR ... }`, a map of
 * index to plain string, not a map of index to record). */
const VALUE_KEY = "(value)";

/**
 * How many nested-record/collection levels the walker will descend into
 * from a section's root before stopping — confirmed necessary by a real
 * `RangeError: Maximum call stack size exceeded` crash walking the real
 * ~642MB save (the committed fixture never exercised nesting this deep;
 * likely a real save's character/cabinet/genealogy detail, per
 * research-save-format.md's note that real per-record content runs
 * "5-190KB each, mostly deeply-nested history/character/economy
 * detail"). Matches spec's own Edge Cases requirement: a field this
 * deep still gets its own classification entry (so its existence and
 * outer shape are recorded) — the walker simply stops recursing into
 * its children rather than being required to flatten infinitely.
 */
const MAX_WALK_DEPTH = 20;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date);
}

/** At or above this fraction of numeric keys, an object is treated as a
 * collection even if a handful of named keys are mixed in alongside it
 * — confirmed necessary by a real save's `diplomacy_manager`, which is
 * `{ 0={...} 1={...} ... 2469={...} dependency={...} casus_belli={...}
 * ... }`: 2,470 per-country numeric entries plus 12 named diplomatic
 * action-type definitions, all at the same object level. Requiring
 * *every* key to be numeric missed this entirely, treating each of the
 * 2,470 country indices as its own named field. */
const NUMERIC_KEY_RATIO_THRESHOLD = 0.8;

/** Detects a `database`/`locations`-shaped map: predominantly
 * numeric-string keys, meaning the keys themselves are entity indices,
 * not a fixed named vocabulary of fields. Tolerates a minority of named
 * keys mixed in (research.md-style real-data finding — see
 * `NUMERIC_KEY_RATIO_THRESHOLD`'s doc comment). */
function looksLikeNumericKeyedCollection(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj);
  if (keys.length < MIN_COLLECTION_SIZE) return false;
  const numericCount = keys.filter((key) => NUMERIC_KEY_RE.test(key)).length;
  return numericCount / keys.length >= NUMERIC_KEY_RATIO_THRESHOLD;
}

/** Splits a numeric-keyed-collection object into its collection members
 * (the numeric-keyed entries) and any minority of named keys mixed in
 * alongside them (which still deserve their own field-path entries,
 * not silent loss). */
function splitCollectionMembersFromNamedKeys(
  obj: Record<string, unknown>,
): { members: unknown[]; namedEntries: Record<string, unknown> } {
  const members: unknown[] = [];
  const namedEntries: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (NUMERIC_KEY_RE.test(key)) {
      members.push(value);
    } else {
      namedEntries[key] = value;
    }
  }
  return { members, namedEntries };
}

/**
 * Walks one "scope" — a set of sibling entries sharing the same field
 * vocabulary (every country record, every war's participant list,
 * every `currency_data` instance across countries, ...) — records every
 * field's raw values (appending a `FieldInventoryEntry` per field to
 * `out`), then recurses into any nested collection or fixed-record
 * field found among those values.
 *
 * jomini's repeated-key quirk (research.md §2 — a key occurring exactly
 * once comes back as a bare object, not a 1-element array) is handled
 * correctly here without special-casing any key name: within one
 * inventory run, a given top-level or nested key is consistently either
 * a bare object or an array (a single save can't have "sometimes 1,
 * sometimes many" occurrences of the same key at the same position), so
 * the `isPlainObject` and `Array.isArray` branches below each cover one
 * real, self-consistent case rather than needing to reconcile mixed
 * evidence.
 */
function walkScope(scopePath: string, members: unknown[], out: FieldInventoryEntry[], depth = 0): void {
  if (members.length === 0) return; // caller records shapeConfirmed: false separately

  const perFieldValues = new Map<string, unknown[]>();
  for (const member of members) {
    if (isPlainObject(member) && !looksLikeNumericKeyedCollection(member)) {
      for (const [key, value] of Object.entries(member)) {
        if (!perFieldValues.has(key)) perFieldValues.set(key, []);
        perFieldValues.get(key)!.push(value);
      }
    } else {
      if (!perFieldValues.has(VALUE_KEY)) perFieldValues.set(VALUE_KEY, []);
      perFieldValues.get(VALUE_KEY)!.push(member);
    }
  }

  for (const [key, values] of perFieldValues) {
    const fieldPath = key === VALUE_KEY ? scopePath : `${scopePath}.${key}`;

    const nestedCollectionMembers: unknown[] = [];
    const nestedRecordMembers: unknown[] = [];
    // Whether every observed value for this field is purely an
    // index -> record/entity map (e.g. `countries.database`,
    // `countries.tags`) — its "keys" are arbitrary entity indices, not
    // a meaningful named vocabulary, so classifying the container
    // itself would produce a misleading `fixed_object` with numeric
    // IDs as `childKeys`. An array of objects (e.g. a war's `all`
    // participant list) doesn't have this problem — its own
    // `list_of_objects` classification is real, useful information —
    // so only numeric-keyed-map containers are skipped here.
    const namedEntriesFromMixedCollections: Record<string, unknown>[] = [];
    let everyValueIsIndexMap = values.length > 0;
    for (const value of values) {
      if (isPlainObject(value) && looksLikeNumericKeyedCollection(value)) {
        // Not `nestedCollectionMembers.push(...Object.values(value))` —
        // a real save's `locations.locations` has 28,573+ entries, and
        // spreading tens of thousands of arguments into `push()` blows
        // V8's call-stack-based argument limit (confirmed via a real
        // `RangeError: Maximum call stack size exceeded` against the
        // real ~642MB save; the small fixture never had a collection
        // large enough to hit it). A loop has no such limit.
        const { members: collectionMembers, namedEntries } = splitCollectionMembersFromNamedKeys(value);
        for (const member of collectionMembers) nestedCollectionMembers.push(member);
        if (Object.keys(namedEntries).length > 0) namedEntriesFromMixedCollections.push(namedEntries);
      } else if (Array.isArray(value) && value.length > 0 && value.some(isPlainObject)) {
        for (const member of value) nestedCollectionMembers.push(member);
        everyValueIsIndexMap = false;
      } else if (isPlainObject(value) && !looksLikeNumericKeyedCollection(value) && Object.keys(value).length > 0) {
        nestedRecordMembers.push(value);
        everyValueIsIndexMap = false;
      } else {
        everyValueIsIndexMap = false;
      }
    }

    if (!everyValueIsIndexMap) {
      out.push(classifyField(fieldPath, values, members.length));
    }

    if (depth >= MAX_WALK_DEPTH) {
      continue; // field's own shape is recorded above; stop descending further (see MAX_WALK_DEPTH's doc comment)
    }
    if (nestedCollectionMembers.length > 0) {
      walkScope(`${fieldPath}.*`, nestedCollectionMembers, out, depth + 1);
    }
    const allNestedRecordMembers = nestedRecordMembers.concat(namedEntriesFromMixedCollections);
    if (allNestedRecordMembers.length > 0) {
      // Same field, same scope name — every sampled instance of this
      // fixed-shape nested record (e.g. every country's currency_data)
      // is one "sibling" for its own sub-fields' presence/type detection.
      // A mixed collection's leftover named keys (e.g.
      // `diplomacy_manager`'s dozen action-type definitions alongside
      // its 2,470 per-country entries) join this same record scope
      // rather than being dropped.
      walkScope(fieldPath, allNestedRecordMembers, out, depth + 1);
    }
  }
}

function buildSectionInventory(sectionKey: string, sectionValue: unknown): SectionInventory {
  const entries: FieldInventoryEntry[] = [];
  let sampleSize = 0;
  let shapeConfirmed = true;

  if (isPlainObject(sectionValue)) {
    if (Object.keys(sectionValue).length === 0) {
      shapeConfirmed = false;
    } else if (looksLikeNumericKeyedCollection(sectionValue)) {
      // Some sections wrap their repeated entries in a named sub-key
      // (`countries.database`, `provinces.database`); others put the
      // numeric-keyed collection directly at the section's own top
      // level, sometimes with a minority of named keys mixed in
      // (confirmed against the real save: `diplomacy_manager` is
      // `{ 0={...} 1={...} ... 2469={...} dependency={...}
      // casus_belli={...} ... }`, 2,470 per-country entries plus 12
      // named action-type definitions) — apply the same
      // collection/split check here, not only inside walkScope's
      // recursion for nested fields.
      const { members, namedEntries } = splitCollectionMembersFromNamedKeys(sectionValue);
      walkScope(`${sectionKey}.*`, members, entries);
      sampleSize = members.length;
      if (Object.keys(namedEntries).length > 0) {
        walkScope(sectionKey, [namedEntries], entries);
      }
    } else {
      walkScope(sectionKey, [sectionValue], entries);
      sampleSize = 1;
    }
  } else if (Array.isArray(sectionValue)) {
    if (sectionValue.length === 0) {
      shapeConfirmed = false;
    } else {
      walkScope(`${sectionKey}.*`, sectionValue, entries);
      sampleSize = sectionValue.length;
    }
  } else {
    entries.push(classifyField(sectionKey, [sectionValue], 1));
    sampleSize = 1;
  }

  return { sectionKey, entries, sampleSize, shapeConfirmed };
}

/**
 * Builds a full `SaveInventory` from a parsed jomini save tree (FR-001:
 * every top-level key, not a hardcoded allowlist of ones the app
 * currently interprets).
 */
export function buildSaveInventory(root: Record<string, unknown>, sourceFile: string): SaveInventory {
  const metadata = root.metadata;
  const gameVersion =
    isPlainObject(metadata) && typeof metadata.version === "string" ? metadata.version : null;

  const sections = Object.entries(root).map(([sectionKey, sectionValue]) =>
    buildSectionInventory(sectionKey, sectionValue),
  );

  return {
    sourceFile,
    gameVersion,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
