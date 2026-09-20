// Shared types for the encyclopedia-scraping pipeline and its output.
// Mirrors specs/008-game-encyclopedia/data-model.md exactly — that file
// is the source of truth; keep this in sync with it, not the reverse.

export type DomainGroupId =
  | "economy-production"
  | "government-society"
  | "culture-religion-characters"
  | "military-diplomacy"
  | "world-events";

export interface CategoryMeta {
  id: string; // the game's own folder name, e.g. "goods"
  label: string; // human label — the game's own ENCYCLOPEDIA_PAGE_* text when available
  entryCount: number;
  excluded: false;
}

export interface ExcludedCategory {
  id: string;
  reason: string;
  excluded: true;
}

export interface DomainGroup {
  id: DomainGroupId;
  label: string;
  categories: CategoryMeta[];
}

export interface Manifest {
  generatedAt: string; // ISO 8601
  gameVersion: string;
  dlcs: string[]; // installed DLC folder names generation ran against
  domainGroups: DomainGroup[];
  excludedCategories: ExcludedCategory[];
}

export type EntrySource = { kind: "base" } | { kind: "dlc"; dlcId: string };

export type EntryFieldValue =
  | string
  | number
  | boolean
  | EntryFieldValue[]
  | { [key: string]: EntryFieldValue };

export interface CrossReference {
  field: string;
  targetCategory: string;
  targetKey: string;
  resolved: boolean;
}

export interface EncyclopediaEntry {
  category: string;
  key: string;
  name: string | null;
  description: string | null;
  source: EntrySource;
  fields: Record<string, EntryFieldValue>;
  crossRefs: CrossReference[];
}

export interface SearchIndexRow {
  category: string;
  key: string;
  name: string | null;
}

// Internal pipeline shapes (not part of the shipped JSON contract).

/** One category's assignment, as categories.ts records it. */
export type CategoryAssignment =
  | { id: string; excluded: false; domainGroup: DomainGroupId; label: string }
  | { id: string; excluded: true; reason: string };

/** A raw parsed entry before localization/cross-ref resolution. */
export interface RawEntry {
  category: string;
  key: string;
  fields: Record<string, EntryFieldValue>;
  source: EntrySource;
}

/** One localization file's key -> text merge result. */
export interface LocalizationEntry {
  name: string | null;
  description: string | null;
}

export type LocalizationMap = Map<string, LocalizationEntry>;

export interface ParseSkip {
  file: string;
  reason: string;
}
