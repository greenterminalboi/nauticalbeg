# Implementation Plan: Country Factbook Tabs

**Branch**: `018-country-factbook-tabs` | **Date**: 2026-09-26 | **Spec**: [country-factbook-tabs.spec.md](./country-factbook-tabs.spec.md)

> **Scale note**: about 35 files across all four layers (parser adapter, schema and queries, a dozen components, tests and fixtures) plus one generator script. Watch two things. Every new save section needs the test fixture and its binary and zip copies regenerated. Old kept saves and old share links must show "not available" for new data, never zero.

## Summary

Turn Factbook → Countries into a per-nation dossier with nine working tabs: Overview, History, Provinces, Locations, Military, Government, Estates, Values and Subjects. Economy, Building Registry and Characters show the Coming Soon page, and Trade and Diplomacy go away. Most data is already in the per-save database. The parser gains three new sections (loans, estates, subject relations) and three nation columns (government power, prestige, monthly income). The UI reuses the Leaderboard charts, Firepower's military views and the map's location data wherever they exist. No new dependency: pies use ECharts, which the app already ships.

Tabs are built and verified in nav order, one at a time, with the owner checking each against the real save before the next starts.

## Project Structure

```text
src/
├── parser/version-adapters/1.3.11.ts      # + loan_manager, estate_manager, dependency blocks, 3 nation columns
├── storage/
│   ├── schema.sql                         # + loans, nation_estates, subject_relations, nations columns
│   └── queries.ts                         # + getCountryCard, getPopulationMakeup, listNationProvincesArrow,
│                                          #   listNationLocations, listNationLaws/Privileges, listNationEstates,
│                                          #   listSubjectRelations
└── components/Overview/
    ├── tabs.ts, SideNav.tsx, FileLoader.tsx   # new TabIds, nav order, routing, onOpenNation
    ├── OverviewTab.tsx (+ PopulationPie.tsx)  # replaces OverviewCard.tsx
    ├── HistoryTab.tsx                     # reuses LeaderboardChart, AddCountryInput
    ├── RulerHistoryChart.tsx              # + optional controlled selection props
    ├── ProvincesTab.tsx                   # new columns
    ├── LocationsTab.tsx
    ├── MilitaryTab.tsx, NavyCompositionView.tsx
    ├── firepowerData.ts, FirepowerTab.tsx # loadMilitaryProfiles extracted and shared
    ├── GovernmentTab.tsx, policyNames.json
    ├── EstatesTab.tsx
    ├── ValuesTab.tsx
    ├── SubjectsTab.tsx
    └── countryNames.ts                    # key → readable name lookups (research R8)
tools/policy-names/                        # generates policyNames.json from game localization
tests/
├── fixtures/rus-1628-minimal*.eu5         # + loan, estate and dependency excerpts, all 4 variants regenerated
├── parser/adapter.test.ts                 # new sections
├── storage/country-card.test.ts, subjects.test.ts, estates.test.ts
└── components/*Tab.test.tsx
```

**Structure Decision**: Everything stays in the existing layers. Components in `src/components/Overview/`, SQL in `queries.ts`, save interpretation in the 1.3.11 adapter. No new module.

## Build order

Each step ends with owner verification against the real save.

1. **Foundation**: nav changes (FR-001 to FR-003) and Coming Soon for the three out-of-scope tabs.
2. **Overview** (US1): nation columns, `loans`, card, four pies.
3. **History** (US2).
4. **Provinces** and **Locations** (US3, US4).
5. **Military** (US5): extract `loadMilitaryProfiles` first, confirm Firepower is unchanged, then the tab.
6. **Government** (US6): policy-name generator, then the tab.
7. **Estates** (US7): `nation_estates`, then the tab.
8. **Values** (US8).
9. **Subjects** (US9): `subject_relations`, the tree, click-through to Overview.

Parser work for a step lands in that step, with its fixture excerpt and test first (constitution II).

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Read-only save handling | PASS. Reads only. No new network calls. Share links carry the new tables through the existing snapshot path. |
| II. Parser correctness, test-first fixtures | PASS, if each new section (loans, estates, dependencies, 3 nation fields) gets a fixture excerpt and adapter test before the parsing code. Skipped malformed entries are counted in the load warning, not dropped silently. |
| III. Format-version compatibility | PASS. All parsing stays in the 1.3.11 adapter. |
| IV. Accurate representation | PASS. Computed stats (economic base, literacy, debt, works of art, location count, pie shares) are marked computed. Missing data shows as not available, not zero (R13). "Other" pie slices are labeled as grouped. |
| V. Performance for large saves | PASS. Per-nation queries on indexed columns. Location and province tables use Perspective, which virtualizes. The subject tree is built from under 200 rows. |
| VI. Visualization clarity and accessibility | PASS. Pies carry text labels and legends. The tree and tables are keyboard-operable. Hover detail uses `HoverTooltip`, never `title=`. |
| VII. Simplicity and incremental scope | PASS. Reuses Leaderboard, Firepower and map definitions. The only extraction (`loadMilitaryProfiles`) removes a duplicate rather than adding one. |
| VIII. Grounded AI agent | Not touched. |

Re-checked after design: no violations, no Complexity Tracking needed.

## Risks

- **Fixture regeneration**: the binary and zip fixture copies come from `tools/eu5-melter`'s `make-fixtures`. Forgetting them breaks the save-format tests.
- **Firepower regression**: extracting `loadMilitaryProfiles` touches a shipped tab. Its existing tests must pass unchanged before the Military tab builds on it.
- **Unknown government types or estate types** in other saves: fall back to generic labels (R1, R8).
