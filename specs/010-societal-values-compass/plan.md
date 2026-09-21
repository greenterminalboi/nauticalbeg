# Implementation Plan: Societal Values Compass

**Branch**: `010-societal-values-compass` | **Spec**: [societal-values-compass.spec.md](./societal-values-compass.spec.md)

## Summary

Plot every real, currently-existing country in a loaded save as one dot on a
new ECharts scatter chart, positioned by a vector-sum of its applicable
Societal Value axis readings against a fixed-angle config. This requires new
ingestion (two small tables: raw per-axis readings and great-power status —
neither currently parsed anywhere in the codebase), a new query pair
returning Arrow buffers in the existing no-API-layer style, and a new
Encyclopedia tab holding the chart plus size/color-mode/quadrant-overlay
controls, all following patterns already established by the Leaderboard and
World Goods features.

## Project Structure

```
src/parser/version-adapters/1.3.11.ts   # extend per-country loop: read
                                          # government.societal_values (skip
                                          # -999) and great_power_manager.
                                          # members
src/storage/schema.sql                  # + nation_societal_values,
                                          # + great_powers (contracts/schema.md)
src/storage/queries.ts                  # + listSocietalValuesArrow,
                                          # + listGreatPowersArrow (contracts/queries.md)
src/components/Overview/axisConfig.json # 14-axis angle config (contracts/axis-config.md;
                                          # co-located like rulerNames.json, not a new
                                          # src/config/ dir — matches existing convention)
src/components/Overview/
  tabs.ts                               # + "societal-compass" tab id
  EncyclopediaNav.tsx                   # + nav entry
  FileLoader.tsx                        # + wide-layout flag + render branch
  SocietalCompassPage.tsx               # new: fetch + compute + wire controls
  SocietalCompassChart.tsx              # new: ECharts scatter (contracts/ui.md)
  SocietalCompassPage.css
  compassPosition.ts                    # new: pure position-computation fn
tests/parser/adapter.test.ts            # extend: societal_values + great_power_manager
tests/storage/queries.test.ts           # extend: new query functions
tests/fixtures/rus-1628-minimal.eu5     # extend: add societal_values +
                                          # great_power_manager.members data
                                          # (Constitution Principle II)
tests/components/compassPosition.test.ts  # new: pure-function unit tests
```

**Structure Decision**: Backend additions follow the existing
`nation_history`/`province_good_production` long-format side-table
convention exactly (research.md) rather than introducing a new storage
shape. Frontend additions mirror the Leaderboard/World Goods tab structure:
one page component, one chart component built on the shared
`useEChartsInstance` hook, wired into the same three files
(`tabs.ts`/`EncyclopediaNav.tsx`/`FileLoader.tsx`) every prior Encyclopedia
tab was added through.

## Constitution Check

| Principle | Assessment |
|---|---|
| I. Read-Only, Non-Destructive Save Handling | PASS — feature only reads parsed save data; no mutation or persistence beyond the existing session-scoped DB. |
| II. Parser Correctness & Test-First Fixtures (NON-NEGOTIABLE) | PASS, with an explicit early task: the fixture (`tests/fixtures/rus-1628-minimal.eu5`) must gain representative `societal_values` (including a `-999` case) and `great_power_manager.members` data, with a regression test, before the new adapter logic merges (research.md). |
| III. Explicit Format-Version Compatibility | PASS — extraction is added inside the existing `1.3.11.ts` version adapter; no new version-detection logic needed. |
| IV. Accurate, Unembellished Representation | PASS — raw values stored as-given (not pre-normalized), the `-999` sentinel is never conflated with a real reading, and "no data" is kept visually distinct from "genuinely centrist" (spec FR-015, Edge Cases). |
| V. Performance & Scalability | PASS — country counts here (hundreds, not millions of rows) are far below what needed virtualization elsewhere in this app; a single ECharts SVG scatter series renders this comfortably off any hot path. |
| VI. Visualization Clarity & Accessibility | PASS, with a design note: the great-power/axis color modes must use a colorblind-safe palette and the chart must remain readable via hover text alone, not color alone (spec FR-009's hover breakdown already provides this non-color identification path). |
| VII. Simplicity & Incremental Scope | PASS — no new dependency (reuses the existing ECharts hook), no speculative abstraction beyond what FR-003's own config-file deliverable already calls for. |
| VIII. Grounded AI Query Agent | N/A — this feature adds a visualization, not an agent-facing capability; no new tool surface for the copilot is required or precluded. |

No violations. No Complexity Tracking needed.
