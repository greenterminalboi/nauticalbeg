// Builds the shipped output shapes (data-model.md) from parsed entries,
// localization, and resolved cross-references, then writes them to disk.
// (category, key) uniqueness (FR-014) falls out of using a Map keyed by
// that pair while building each category's entry list — a later
// same-key definition overwrites an earlier one (matches Paradox's own
// override convention for repeated definitions), never producing a
// duplicate.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_ASSIGNMENTS, DOMAIN_GROUP_LABELS, GAME_CONCEPTS_CATEGORY_ID } from "./categories";
import { entryId, resolveCrossReferences } from "./resolve-cross-refs";
import type {
  CategoryAssignment,
  CategoryMeta,
  DomainGroup,
  DomainGroupId,
  EncyclopediaEntry,
  ExcludedCategory,
  LocalizationMap,
  Manifest,
  RawEntry,
  SearchIndexRow,
} from "./types";

export interface GenerationMeta {
  generatedAt: string;
  gameVersion: string;
  dlcs: string[];
}

export interface BuildResult {
  manifest: Manifest;
  searchIndex: SearchIndexRow[];
  categoryFiles: Map<string, EncyclopediaEntry[]>;
}

/** game_concepts is the one category whose entries are localized under
 * a `game_concept_<key>` prefix rather than the bare key (confirmed
 * during implementation: only 90/696 entries resolved a name before
 * this fix, because the bare key coincidentally matches an unrelated
 * loc string for some entries and matches nothing for most) — the
 * prefixed key is the real pairing and takes priority; the bare key is
 * still tried as a fallback in case a future concept lacks the prefix. */
function lookupLocalization(
  category: string,
  key: string,
  localization: LocalizationMap,
): { name: string | null; description: string | null } {
  if (category === GAME_CONCEPTS_CATEGORY_ID) {
    const prefixed = localization.get(`game_concept_${key}`);
    if (prefixed) return prefixed;
  }
  return localization.get(key) ?? { name: null, description: null };
}

export function buildOutput(
  allParsedEntries: RawEntry[],
  localization: LocalizationMap,
  meta: GenerationMeta,
  // Injectable for tests against fixture categories; production callers
  // (generate.ts) rely on the defaults, the real 124-category table.
  categoryAssignments: CategoryAssignment[] = CATEGORY_ASSIGNMENTS,
  domainGroupLabels: Record<string, string> = DOMAIN_GROUP_LABELS,
): BuildResult {
  const excludedIds = new Set(
    categoryAssignments.filter((a) => a.excluded).map((a) => a.id),
  );
  const crossRefs = resolveCrossReferences(allParsedEntries, excludedIds);

  // (category, key) -> entry, de-duplicating same-key redefinitions.
  const byId = new Map<string, RawEntry>();
  for (const entry of allParsedEntries) {
    if (excludedIds.has(entry.category)) continue;
    byId.set(entryId(entry.category, entry.key), entry);
  }

  const categoryFiles = new Map<string, EncyclopediaEntry[]>();
  // Every included category gets a file, even with zero entries found —
  // a category present in the manifest with no corresponding JSON would
  // 404 when a client opens it (spec edge case: a sparse category is
  // still valid, not an error state).
  for (const assignment of categoryAssignments) {
    if (!assignment.excluded) categoryFiles.set(assignment.id, []);
  }
  const searchIndex: SearchIndexRow[] = [];

  for (const raw of byId.values()) {
    const loc = lookupLocalization(raw.category, raw.key, localization);
    const entry: EncyclopediaEntry = {
      category: raw.category,
      key: raw.key,
      name: loc.name,
      description: loc.description,
      source: raw.source,
      fields: raw.fields,
      crossRefs: crossRefs.get(entryId(raw.category, raw.key)) ?? [],
    };
    if (!categoryFiles.has(raw.category)) categoryFiles.set(raw.category, []);
    categoryFiles.get(raw.category)!.push(entry);
    searchIndex.push({ category: entry.category, key: entry.key, name: entry.name });
  }

  const domainGroups = buildDomainGroups(categoryFiles, categoryAssignments, domainGroupLabels);
  const excludedCategories: ExcludedCategory[] = categoryAssignments.filter(
    (a): a is Extract<typeof a, { excluded: true }> => a.excluded,
  ).map((a) => ({ id: a.id, reason: a.reason, excluded: true }));

  const manifest: Manifest = {
    generatedAt: meta.generatedAt,
    gameVersion: meta.gameVersion,
    dlcs: meta.dlcs,
    domainGroups,
    excludedCategories,
  };

  return { manifest, searchIndex, categoryFiles };
}

function buildDomainGroups(
  categoryFiles: Map<string, EncyclopediaEntry[]>,
  categoryAssignments: CategoryAssignment[],
  domainGroupLabels: Record<string, string>,
): DomainGroup[] {
  const groups = new Map<DomainGroupId, CategoryMeta[]>();
  for (const assignment of categoryAssignments) {
    if (assignment.excluded) continue;
    const entries = categoryFiles.get(assignment.id) ?? [];
    const meta: CategoryMeta = {
      id: assignment.id,
      label: assignment.label,
      entryCount: entries.length,
      excluded: false,
    };
    if (!groups.has(assignment.domainGroup)) groups.set(assignment.domainGroup, []);
    groups.get(assignment.domainGroup)!.push(meta);
  }
  return [...groups.entries()].map(([id, categories]) => ({
    id,
    label: domainGroupLabels[id],
    categories,
  }));
}

export function writeOutput(result: BuildResult, outDir: string): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(result.manifest, null, 2));
  writeFileSync(join(outDir, "search-index.json"), JSON.stringify(result.searchIndex));
  for (const [categoryId, entries] of result.categoryFiles) {
    writeFileSync(join(outDir, `${categoryId}.json`), JSON.stringify(entries));
  }
}
