// Resolves cross-references between entries once, at generation time
// (research.md §7), so the shipped per-category JSON is self-describing
// and the UI never has to re-derive links at render time.
//
// Matching runs against every category jomini parsed, *including*
// excluded ones (categories.ts) — not just the categories this run
// writes to output — because a field referencing an excluded category's
// key is a real, known reference the UI should render as plain text
// (FR-008's `resolved: false` case), not silence. A field whose value
// matches nothing at all (e.g. it names a DLC entry absent from this
// install) produces no CrossReference: there is no way to distinguish
// "this was meant to reference something now missing" from "this string
// never was a reference," so it is left alone rather than guessed at.
import type { CrossReference, EntryFieldValue, RawEntry } from "./types";

// simplified: a field's string value is treated as a cross-reference
// only when it exactly matches exactly one (category, key) pair across
// the whole catalog — an ambiguous match (the same key existing in two
// categories) or a coincidental string match with no real relationship
// produces no CrossReference rather than a wrong one. If this proves too
// conservative (real references missed because keys collide across
// categories), narrow by known reference field names per category
// instead of loosening the global match.
export function resolveCrossReferences(
  allParsedEntries: RawEntry[],
  excludedCategoryIds: ReadonlySet<string>,
): Map<string, CrossReference[]> {
  const keyToCategories = new Map<string, Set<string>>();
  for (const entry of allParsedEntries) {
    if (!keyToCategories.has(entry.key)) keyToCategories.set(entry.key, new Set());
    keyToCategories.get(entry.key)!.add(entry.category);
  }

  const result = new Map<string, CrossReference[]>();

  for (const entry of allParsedEntries) {
    const refs: CrossReference[] = [];
    for (const [field, value] of Object.entries(entry.fields)) {
      for (const candidate of collectStringLeaves(field, value)) {
        const categories = keyToCategories.get(candidate.value);
        if (!categories || categories.size !== 1) continue; // no match, or ambiguous
        const targetCategory = [...categories][0];
        if (targetCategory === entry.category && candidate.value === entry.key) continue; // trivial self-ref
        refs.push({
          field: candidate.path,
          targetCategory,
          targetKey: candidate.value,
          resolved: !excludedCategoryIds.has(targetCategory),
        });
      }
    }
    if (refs.length > 0) {
      result.set(entryId(entry.category, entry.key), refs);
    }
  }

  return result;
}

export function entryId(category: string, key: string): string {
  return `${category}::${key}`;
}

/** Walks a field's value (which may nest) collecting every string leaf,
 * each tagged with a dotted path from the field's own name. Only
 * shallow-nested string leaves are considered candidates — the same
 * conservative-match philosophy as the module comment above. */
function collectStringLeaves(
  path: string,
  value: EntryFieldValue,
  depth = 0,
): { path: string; value: string }[] {
  if (typeof value === "string") return [{ path, value }];
  if (depth >= 2) return [];
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => collectStringLeaves(`${path}.${i}`, v, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => collectStringLeaves(`${path}.${k}`, v, depth + 1));
  }
  return [];
}
