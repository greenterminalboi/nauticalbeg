# Contract: Encyclopedia data — generation output + client loading interface

Two sides, connected only by the static JSON files under
`public/encyclopedia/` (shapes in `data-model.md`): the generation tool
(`tools/encyclopedia-scraping/`), run offline by a developer, and the
client loading layer (`src/components/Overview/encyclopediaData.ts`),
which every Encyclopedia UI component codes against. Neither side talks
to the other directly — the JSON files are the entire interface.

## Generation CLI contract (`tools/encyclopedia-scraping/generate.ts`)

Mirrors `tools/map-generation/generate.ts`'s existing `--install`
convention:

```text
tsx tools/encyclopedia-scraping/generate.ts --install <path-to-game-root> [--out <dir>]
```

- `--install <path>` (required): the game's root install directory (the
  same directory `EU5 save format gotchas` documents locally, containing
  `in_game/`, `main_menu/`, `dlc/`).
- `--out <dir>` (optional, default `public/encyclopedia`): where
  `manifest.json`, `search-index.json`, and every `<category>.json` are
  written.
- Exit code non-zero with a clear stderr message when `--install` isn't
  a valid game root (spec FR-012) — never a silent empty/partial write.
- Every run **overwrites** the output directory's contents from scratch
  (no incremental/merge mode) — deterministic given the same install
  (spec SC-004).

## Client loading interface (`src/components/Overview/encyclopediaData.ts`)

The one module every Encyclopedia UI component imports from — no
component fetches `public/encyclopedia/*.json` directly, so the on-disk
layout in `data-model.md` can change without touching every consumer.

```ts
export async function loadManifest(): Promise<Manifest>;

export async function loadSearchIndex(): Promise<SearchIndexRow[]>;

// Fetches and caches `<category>.json`; repeated calls for the same
// category resolve from an in-memory cache, never re-fetch.
export async function loadCategory(categoryId: string): Promise<EncyclopediaEntry[]>;

// Convenience for a Cross-Reference link: resolves (targetCategory,
// targetKey) to the entry it points at, or null when unresolved
// (crossRef.resolved === false) — a component never has to fetch a
// category just to render a plain-text fallback for an unresolved ref.
export function findEntry(
  entries: EncyclopediaEntry[],
  key: string,
): EncyclopediaEntry | undefined;
```

`Manifest`, `SearchIndexRow`, `EncyclopediaEntry` types match
`data-model.md` exactly — this module owns no type definitions of its
own beyond re-exporting/importing those.

## Consumer contract

- `EncyclopediaDomainNav` reads `loadManifest()` once (small, eager) to
  render the five domain-group tabs with their category lists.
- `EncyclopediaSearch` reads `loadSearchIndex()` once, eagerly, on the
  Encyclopedia section mounting (not per-keystroke) — filtering is
  in-memory client-side (spec SC-002: 2 interactions or fewer).
- `EncyclopediaCategoryList` calls `loadCategory(categoryId)` only when
  a user opens that specific category (lazy, per research.md §4).
- `EncyclopediaEntryView` renders `entry.crossRefs`; for each
  `resolved: true` reference it links to that entry (fetching its
  category via `loadCategory` if not already cached); for
  `resolved: false` it renders the field's raw value as plain text
  (spec FR-008 / User Story 3, Acceptance Scenario 2).
- No consumer ever renders an icon in this feature (research.md §5) —
  no icon field appears in this contract at all.
