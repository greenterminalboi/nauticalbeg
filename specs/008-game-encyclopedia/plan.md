# Implementation Plan: Game Encyclopedia

**Branch**: `008-game-encyclopedia` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-game-encyclopedia/spec.md`

**Scale note**: This is an oversized change. It spans a new offline
generation tool (`tools/encyclopedia-scraping/`, ~124 source reference
categories across base game + owned DLC), a new static data-delivery
layer independent of any loaded save, and a new browsable UI section
with five domain groups, cross-references, and global search. Expect
work across generation tooling, a new data-loading layer, and UI —
distinct from every prior feature, which extended the existing per-save
DuckDB pipeline; this one deliberately does not touch it.

## Summary

Fill in the app's existing top-level "Encyclopedia" placeholder
(`AppSection`'s `"encyclopedia"` value, currently rendering
`ComingSoonPlaceholder` in `FileLoader.tsx`) with a browsable, searchable
reference of the game's own definitions — goods, buildings, production
methods, religions, cultures, units, and the rest of the ~124 categories
under `game/in_game/common/`, plus their localized names/descriptions —
scraped from a local game installation (base game and owned DLC alike)
by a new offline tool and shipped as static JSON data, independent of
any loaded save (this section renders with or without one). The scraper
reuses this project's existing `jomini` dependency (already used for
save parsing, `src/parser/`) against the game's definition `.txt` files,
which use the same Clausewitz script syntax; localization text is
merged from the game's `.yml` loc files by internal key. Entries are
grouped into five browsable domain groups and organized into per-
category JSON files fetched on demand (mirroring `public/map/`'s
existing static-asset delivery), plus a small eagerly-loaded search
index. Icon/texture assets are never scraped or shipped, per the
constitution's Encyclopedia-data exception (v1.2.0): only structured
data crosses into the repository.

## Technical Context

**Language/Version**: TypeScript (existing stack) — no change.

**Primary Dependencies**: No new runtime dependency. Reuses `jomini`
(existing `package.json` dependency, already used by `src/parser/` for
save parsing) to parse the game's `.txt` definition files — Clausewitz
script, the same syntax family as saves' text mode. `react`/`react-dom`
(existing UI) for the new Encyclopedia browsing components. Node's
built-in `fs`/`path` for the generation tool (matching
`tools/map-generation/generate.ts`'s existing pattern).

**Storage**: Not the per-save DuckDB pipeline (`src/storage/`) — this
feature's data is save-independent, so it deliberately does not touch
`schema.sql` or add tables there. Generated output is static JSON,
served as static assets and fetched client-side, following the existing
precedent of `public/map/*.topojson` (generated once, fetched on
demand, never recomputed in-browser).

**Testing**: `vitest` (existing). Generation-tool logic (localization
merge, cross-reference resolution, exclusion recording) gets unit tests
against small fixture definition/localization files committed under
`tests/fixtures/` (mirroring `tools/schema-mapping`'s test precedent),
not the full local game install, since CI has no game install available.
UI component tests use a small fixture Encyclopedia JSON payload.

**Target Platform**: Evergreen browsers (existing — no native install)
for the app itself. The generation tool is a local Node CLI (existing
precedent: `tools/map-generation/generate.ts --install <path>`), run by
a developer with the game installed, not by end users or CI.

**Project Type**: Single web application (existing `src/` tree) — no
new top-level project, no backend/service split. Adds one new `tools/`
subdirectory for generation.

**Performance Goals**: Opening any domain group loads that group's
categories with no perceptible delay (spec SC-002 references 2
interactions or fewer for search) — achieved by per-category JSON files
fetched on demand rather than one bundle covering all ~124 categories.
Global search must feel instant; the eagerly-loaded search index carries
only name/key/category per entry (not full entry bodies) to stay small
across an estimated several-thousand-entry catalog.

**Constraints**: Constitution Principle V (no main-thread blocking, no
un-virtualized huge lists) applies directly given category sizes as
large as several hundred entries (e.g. `buildings`, `missions`) — lists
within a category use the existing app's list/virtualization precedent
where one is established, else paginate. Constitution's Encyclopedia-
data exception (v1.2.0) is the only reason committing this data is
permitted at all; icon/art assets stay categorically excluded (FR-011) —
generation MUST NOT copy any `.dds`/image file into the repository, and
this is treated as a hard gate, not a style preference.

**Scale/Scope**: ~124 reference categories, ~1,827 source definition
files in the base game alone (owned DLC adds more), estimated several
thousand individual entries once parsed. Five domain groups for
browsing (Economy & Production, Government & Society, Culture/Religion/
Characters, Military & Diplomacy, World & Events).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see below.*

| Principle | Assessment |
|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS — this feature does not touch save files at all; it reads the local game installation (read-only) and the user's own uploaded save is untouched. |
| II. Parser Correctness & Test-First Fixtures | PASS — the generation tool's own parsing logic (localization merge, entry extraction, cross-reference resolution) gets fixture-based tests per the Testing section above, mirroring the existing parser-change discipline even though this isn't the save parser itself. |
| III. Explicit Format-Version Compatibility | PASS — Generation Run records the game version (and installed DLCs) it ran against (data-model.md); a version mismatch between generated data and a later game update is surfaced via that record, not silently assumed current. |
| IV. Accurate, Unembellished Representation | PASS — this is the spec's central constraint (FR-004): no localization match falls back to the raw key, never a guessed name; every numeric field is copied verbatim from the game's own files (FR-005), never estimated. |
| V. Performance & Scalability for Large Saves | PASS (adapted) — this feature has no save-scale data, but the same discipline applies to its own scale (thousands of entries): per-category lazy loading, a lean search index, and list virtualization for the largest categories (Performance Goals above). |
| VI. Visualization Clarity & Accessibility | PASS — plain reference lists/detail pages; DLC-sourced entries get a non-color-only label (text badge), not a color-only indicator (spec edge case: DLC content must be clearly labeled). |
| VII. Simplicity & Incremental Scope | PASS — reuses the existing `jomini` dependency and the existing `public/*` static-asset delivery pattern rather than introducing a new parsing library or a new storage engine; no plugin system or generic format-agnostic framework is introduced despite the category count, per research.md §1. |
| VIII. Grounded AI Query Agent | N/A — this feature doesn't touch the copilot agent; a future feature could expose Encyclopedia lookups as an agent tool, but that's out of scope here (spec Assumptions). |
| Technical Constraints — asset redistribution | PASS, under the new Encyclopedia-data exception (v1.2.0): structured data (names/descriptions/values) may be shipped; icons/art remain excluded and unshipped (FR-011). |

No violations; Complexity Tracking is omitted.

## Project Structure

### Documentation (this feature)

```text
specs/008-game-encyclopedia/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
│   └── encyclopedia-data-contract.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

```text
tools/
└── encyclopedia-scraping/
    ├── generate.ts          # CLI entrypoint: --install <path> [--out <dir>]
    │                         # (mirrors tools/map-generation/generate.ts)
    ├── categories.ts         # The category → domain-group map + the
    │                         # explicit inclusion/exclusion list (FR-007)
    ├── parse-definitions.ts  # Walks game/in_game/common/<category>/*.txt
    │                         # via `jomini`, extracts entries + fields
    ├── parse-localization.ts # Merges every english loc .yml into one
    │                         # key -> {name, description} map
    ├── resolve-cross-refs.ts # Links entry fields that name another
    │                         # entry's internal key (FR-008)
    ├── write-output.ts       # Emits per-category JSON + search index +
    │                         # manifest (data-model.md / contracts/)
    └── types.ts

public/
└── encyclopedia/
    ├── manifest.json         # category -> domain group, entry counts,
    │                         # generation-run metadata (version, DLCs)
    ├── search-index.json     # lean {category, key, name} rows, all
    │                         # categories, eagerly loaded for FR-009
    └── <category>.json       # full entries for one category, fetched
                              # on demand when its domain group opens

src/components/Overview/
├── EncyclopediaSection.tsx    # New: replaces the ComingSoonPlaceholder
│                              # for activeSection === "encyclopedia"
├── EncyclopediaDomainNav.tsx  # The five domain-group tabs
├── EncyclopediaCategoryList.tsx
├── EncyclopediaEntryView.tsx  # Single entry, renders Cross-References
│                              # as links
├── EncyclopediaSearch.tsx     # Global search over search-index.json
└── encyclopediaData.ts        # fetch/cache helpers for the static
                                # JSON assets above

tests/
├── encyclopedia-scraping/     # Unit tests for the tools/ pipeline,
│                              # against small committed fixture .txt/
│                              # .yml files (not the real game install)
└── components/
    └── Encyclopedia*.test.tsx # UI tests against a small fixture
                                # Encyclopedia JSON payload
```

**Structure Decision**: Single web application, existing `src/` tree.
The generation tool is a new `tools/` subdirectory (mirroring
`tools/map-generation`, `tools/schema-mapping`); its output is static
data under `public/`, mirroring `public/map/`. No change to
`src/storage/` — this feature is deliberately outside the per-save
DuckDB pipeline.
