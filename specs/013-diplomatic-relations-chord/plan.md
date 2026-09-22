# Implementation Plan: Diplomatic Relations Chord Diagram

**Branch**: `013-diplomatic-relations-chord` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/013-diplomatic-relations-chord/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

Add a new "Diplomacy" chord diagram view rendering every country with at least
one active alliance, rivalry, royal marriage, or guarantee as an arc around a
circle, with a colored chord per relationship. Requires genuinely new parsing:
`diplomacy_manager` — the save's alliance/guarantee ledger (`scripted_mutual`/
`scripted_oneway` entries tagged `relation_type=alliance`/`guarantee`), its
dedicated `royal_marriage` entries, its per-country `rivals_2.list` (rivalries),
and its per-country `relations.<target>.trust` ledger (bilateral opinion score
for chord thickness) — is parsed by no existing feature. Rendering reuses this
app's exclusive-echarts charting convention: an echarts `graph` series (native
`emphasis.focus: "adjacency"` state model, the same mechanism `MilitaryDoctrineChart`
already validated for hover-isolate-and-fade instead of hand-rolled opacity
bookkeeping) drives edges/hover/tooltip, layered with a `custom` series drawing
the actual arc bands. A client-side clustering pass ("Hugbox Detection")
computes alliance-clique cores plus 1-tie-affiliate/2-tie-full-member expansion
live from already-fetched rows — no new storage, no new dependency.

## Technical Context

**Language/Version**: TypeScript (React 19), matching the rest of the app

**Primary Dependencies**: `jomini` (WASM save parser, already in use), `echarts`
^6.1.0 (already in use for every other chart in this app — `graph` + `custom`
series types cover chord-diagram rendering; no chord series type exists
natively in echarts or any dependency already in this project, and no new
charting dependency such as `d3-chord` is being added — see research.md §2),
DuckDB-Wasm (already in use), React (already in use)

**Storage**: DuckDB-Wasm, client-side, single OPFS-backed file per loaded save
— two new tables added to the existing `src/storage/schema.sql`
(`diplomatic_relations`, `nation_relation_trust`); Hugbox clusters are
computed client-side from already-fetched alliance rows, never persisted

**Testing**: `vitest`, fixture-based per Constitution Principle II — extends
`tests/fixtures/rus-1628-minimal.eu5` with a representative `diplomacy_manager`
block (alliance, royal marriage, guarantee, rivalry, and a `relations.trust`
ledger entry) referencing that fixture's existing nations (RUS `2025`, PLC
`33556892`, KIE `1961`, FRA `1141`), plus unit tests for the Hugbox clique/
expansion/tie-break algorithm run against synthetic adjacency data (no save
parsing needed for that part — it's pure graph computation over rows)

**Target Platform**: Evergreen browsers (client-only web app, no backend)

**Project Type**: Single-project web app — no frontend/backend split

**Performance Goals**: Diagram interaction (hover isolate, filter toggle)
stays under the spec's SC-003 1-second budget; parsing the new
`diplomacy_manager` section adds negligible time to the existing single-pass
worker parse (constitution Principle V) since it's read from the same
already-materialized `raw_sections` tree, not a second file pass

**Constraints**: Must render legibly with 100+ arcs when "show all" is active
(SC-002); relationship-type legend must remain colorblind-distinguishable per
constitution Principle VI (no bare red/green pairing) — resolved with a
secondary per-type line-dash encoding, not color alone (research.md §3)

**Scale/Scope**: Up to ~3,000 country slots (the save's established
`nations.idx` range — confirmed the same sparse/large-index space
`diplomacy_manager`'s own country keys use, research.md §1), a few hundred
active relationships in a late-game save, Hugbox clustering over the alliance
subgraph only (typically a few dozen edges) — all trivially fast client-side,
no virtualization/pagination needed beyond the existing default-selection/
`AddCountryInput` scoping (FR-009, course-corrected mid-implementation to
reuse that established pattern instead of a bespoke "major powers by
development" ranking — see data-model.md/research.md's amendment notes)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Read-Only, Non-Destructive Save Handling**: PASS. Pure read/parse of
  `diplomacy_manager`, no new write path, no new retention.
- **II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE)**: PASS,
  pending execution — `diplomacy_manager` is genuinely new parsing (not
  currently in `STRUCTURED_KEYS`, confirmed by inspection of
  `src/parser/version-adapters/1.3.11.ts`). Plan requires the fixture
  extension and regression test (research.md §1, data-model.md, tasks.md)
  to exist before the adapter change merges, per the war_manager/wars
  precedent (specs/004-full-schema-mapping §8).
- **III. Explicit Format-Version Compatibility**: PASS. Parsed only through
  the existing `1.3.11.ts` version adapter, no new version-detection path.
- **IV. Accurate, Unembellished Representation**: PASS. Every rendered
  relationship traces to a real `diplomacy_manager` entry; Hugbox Detection
  is presented as a derived clustering overlay (an interpretation, not a raw
  save fact) — its toggle and visual boundary must read as computed, not as
  a save-native concept, satisfying the derived-vs-raw distinction.
- **V. Performance & Scalability for Large Saves**: PASS. New parsing reads
  from the worker's single already-materialized pass (no added I/O); no data
  volume here approaches the scale that needs virtualization (a few hundred
  relationship rows at most).
- **VI. Visualization Clarity & Accessibility**: ATTENTION REQUIRED, resolved
  in research.md §3 — the spec's own example legend (blue/red/gold/green)
  risks a red/green pairing that isn't colorblind-safe on its own; plan adds
  a secondary per-relationship-type line-dash pattern so type is never
  color-only, and hover/tooltip (FR-006) already gives a non-color
  identification path. No constitution violation once this is applied.
- **VII. Simplicity & Incremental Scope**: PASS. No new abstraction layer;
  Hugbox clustering is a plain computation module colocated with other
  layout-helper modules (`militaryDoctrineLayout.ts`, `compassPosition.ts`
  precedent), not a new "service" or framework.
- **VIII. Grounded AI Query Agent**: Not applicable to this feature — no new
  agent tool surface proposed here.

No deviations requiring Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/013-diplomatic-relations-chord/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
│   ├── schema.md
│   ├── queries.md
│   └── ui.md
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── storage/
│   ├── schema.sql        # + diplomatic_relations, nation_relation_trust tables
│   └── queries.ts        # + listDiplomaticRelationsArrow, listRelationTrustArrow
├── parser/
│   └── version-adapters/
│       └── 1.3.11.ts      # + "diplomacy_manager" in STRUCTURED_KEYS, extraction
│                          #   for scripted_mutual/scripted_oneway (alliance,
│                          #   guarantee), royal_marriage, per-country rivals_2.list,
│                          #   per-country relations.<target>.trust
└── components/
    └── Overview/
        ├── diplomacyData.ts        # decode Arrow rows into typed relationship/
        │                          #   country-meta shapes (leaderboardData.ts
        │                          #   precedent)
        ├── hugboxClustering.ts     # pure computation: alliance-clique cores,
        │                          #   1-tie-affiliate/2-tie-full-member expansion,
        │                          #   multi-cluster tie-break (spec Assumptions)
        ├── DiplomacyChordChart.tsx # echarts graph+custom dual-series chord
        │                          #   diagram, useEChartsInstance precedent
        ├── DiplomacyChordChart.css
        ├── DiplomacyFilters.tsx    # relationship-type checkboxes, AddCountryInput
        │                          #   (default selection = human-played, course-
        │                          #   corrected mid-implementation to reuse the
        │                          #   Leaderboard/World Goods/Societal Compass
        │                          #   pattern), Hugbox Detection toggle
        ├── DiplomacyFilters.css
        └── DiplomacyTab.tsx        # Factbook sibling tab wiring (Wars/Leaderboard/
                                    #   Markets/Firepower precedent)

tests/
├── fixtures/
│   └── rus-1628-minimal.eu5  # + diplomacy_manager block (research.md §1)
└── parser/                   # new regression test asserting diplomatic_relations/
    └── ...                   #   nation_relation_trust rows from that fixture
```

**Structure Decision**: Follows the existing layered structure exactly
(`src/storage` → `src/parser/version-adapters` → `src/components/Overview`,
per `architecture_constitution.md`'s Layer Boundaries table) with no new
module or layer. "Diplomacy" becomes a new sibling Factbook tab alongside
Wars/Leaderboard/Markets/Firepower, matching `tabs.ts`'s existing tab-registry
pattern. Hugbox clustering is a plain `.ts` computation module under
`src/components/Overview/`, not a new service layer — it consumes rows
`queries.ts` already returned and produces layout/grouping data for the chart
component, exactly like `militaryDoctrineLayout.ts` does for Military
Doctrine.

## Complexity Tracking

*No entries — Constitution Check found no unjustified violations.*
