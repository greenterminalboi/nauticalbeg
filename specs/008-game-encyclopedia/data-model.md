# Data Model: Game Encyclopedia

Not DuckDB tables — see research.md §4 for why this feature's data is
static JSON, delivered outside the per-save storage pipeline. Every
shape below is generated once by `tools/encyclopedia-scraping/` and
fetched read-only by the app.

## `manifest.json`

One object, describing the whole generated catalog:

```ts
interface Manifest {
  generatedAt: string;       // ISO 8601, when this generation run happened
  gameVersion: string;       // as reported by the local install (research.md §6)
  dlcs: string[];            // installed DLC folder names generation ran against
                              // (e.g. ["D000_shared", "D008_fate_of_the_phoenix"])
  domainGroups: DomainGroup[];
}

interface DomainGroup {
  id: string;                 // "economy-production" | "government-society" |
                               // "culture-religion-characters" |
                               // "military-diplomacy" | "world-events"
  label: string;               // display label, e.g. "Economy & Production"
  categories: CategoryMeta[];
}

interface CategoryMeta {
  id: string;                  // the game's own folder name, e.g. "goods"
  label: string;                // a human label for the category itself
  entryCount: number;
  excluded: false;
}

interface ExcludedCategory {
  id: string;
  reason: string;               // why this category was left out (FR-007)
  excluded: true;
}
```

`manifest.json` also carries an `excludedCategories: ExcludedCategory[]`
array alongside `domainGroups`, so every category present in the game's
files is accounted for in exactly one of the two lists (spec FR-007 /
SC-001) — never absent from both.

## `<category>.json`

One file per included category (e.g. `public/encyclopedia/goods.json`),
an array of that category's entries:

```ts
interface EncyclopediaEntry {
  category: string;           // e.g. "goods" — matches CategoryMeta.id
  key: string;                 // the game's internal key, e.g. "horses"
  name: string | null;         // localized display name, or null when the
                                // game provides none for this key (FR-004:
                                // the UI falls back to `key` verbatim, this
                                // field is never a guessed value)
  description: string | null;  // localized description, or null
  source: EntrySource;
  fields: Record<string, EntryFieldValue>;   // every recorded numeric/
                                              // mechanical field, verbatim
                                              // from the game's definition
                                              // (FR-005) — no invented keys
  crossRefs: CrossReference[];  // resolved at generation time (research.md §7)
}

type EntrySource =
  | { kind: "base" }
  | { kind: "dlc"; dlcId: string };  // e.g. "D008_fate_of_the_phoenix"

type EntryFieldValue =
  | string
  | number
  | boolean
  | EntryFieldValue[]
  | { [key: string]: EntryFieldValue };  // nested blocks (e.g. a
                                          // building's `modifier = {...}`)
                                          // are common in real definition
                                          // files and preserved verbatim,
                                          // not flattened or dropped
                                          // (confirmed during implementation
                                          // against a real nested building
                                          // definition)

interface CrossReference {
  field: string;               // which field on this entry holds the reference
  targetCategory: string;
  targetKey: string;
  resolved: boolean;           // false when the target doesn't exist in the
                                // generated catalog (excluded category, or a
                                // DLC not present at generation time) — the
                                // UI renders `field`'s raw value as plain
                                // text rather than a broken link (FR-008)
}
```

An entry is uniquely identified by `(category, key)` together (spec
FR-014, Key Entities) — never by `key` alone, since two categories can
share a key.

## `search-index.json`

A flat array, eagerly loaded for FR-009's cross-group search:

```ts
type SearchIndexRow = {
  category: string;
  key: string;
  name: string | null;   // same fallback-to-key rule as EncyclopediaEntry.name
};
```

Deliberately excludes `description`, `fields`, and `crossRefs` — those
only load when a specific category's full JSON is fetched (research.md
§4's "keep the eager payload small" rationale).

## Entity summary (spec Key Entities → concrete shape)

| Spec entity | Concrete shape |
|---|---|
| Encyclopedia Category | `CategoryMeta` / `ExcludedCategory` in `manifest.json` |
| Domain Group | `DomainGroup` in `manifest.json` |
| Encyclopedia Entry | one element of `<category>.json`'s array |
| Cross-Reference | `CrossReference` on an `EncyclopediaEntry` |
| Generation Run | `manifest.json`'s top-level `generatedAt`/`gameVersion`/`dlcs` fields |

No state transitions: every shape here is write-once-per-generation-run,
read-only to the running app (spec Assumptions: "no in-app editing of
Encyclopedia content").
