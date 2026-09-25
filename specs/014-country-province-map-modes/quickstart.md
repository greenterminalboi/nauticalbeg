# Quickstart: validating 014

## Prerequisites

- `npm install`
- Real save: `/Users/halda/Downloads/Russia (Melted).eu5`. Verification uses a fresh load of this file, **not** a kept-save resume, because a resume has an empty `works_of_art` table (research.md §6).

## 1. Automated

```bash
npm test          # vitest run — adapter, map-locations, mapLayers, MapSidebar suites
npm run build     # tsc -b + vite build: MapLayer.grain is required, so a missed layer fails typecheck
```

Expected: all green. The new cases are listed in contracts/schema.md, contracts/queries.md and contracts/ui.md.

## 2. Sidebar grouping (US1)

`npm run dev`, load the real save, open the Map tab.

- Three sections appear: Location (12), Province (4), Country (8).
- Collapse Province while a Country layer is active: only the Province items hide, and the map doesn't change.
- Pan or zoom, then switch between a Location, a Province and a Country layer: the view is kept and no loading indicator appears.

## 3. Spot-check values against the save (SC-002/SC-003)

Hover a Russian location on each layer and compare with the save:

These values were read directly from the real save for RUS (countries idx 2025):

| Layer | Expected (Russia (Melted), RUS) |
|---|---|
| Country Stability | +27.3 |
| Country Treasury | 5,493.1 |
| Government Type | monarchy |
| Country Population | 20,330.1 (latest `historical_population` entry, not the max) |
| Economical Base | 9,890.5 |
| Number of Tech Advances | 291 |
| Number of Works of Art | 36 (37 owned, 1 destroyed and excluded) |

For a negative-stability cross-check, use GBR (idx 289): stability −1.4, treasury 966.6.

Per-country figures are identical across every RUS location (SC-006).

On one province layer, pick a province and confirm that its tooltip total equals the sum of its locations' values on the matching Location layer. Use Development for this; Tax Base can be checked the same way.

Check edge states:

- Sea and wasteland → "No data" (light gray) on every country layer.
- At least one country with a negative treasury shows the "In debt" color. There are 108 in this save.
- On Tech Advances and Works of Art, a live country with none shows charcoal "Zero", not gray.

## 4. Performance (SC-005, research.md §3)

- In DevTools, time map load (the `listMapLocationsArrow` call) before and after the change. The query's added time should be ≤ ~1s on the real save. If it exceeds that, use the `nation_latest` parse-time fallback in research.md §3.
- Panning and zooming on a Country layer should feel the same as on Political.

## 5. Kept-save regression

- Resume a save kept before this feature. The Works of Art layer shows gray with the legend entry "Not in this save's data — reload the save file". Every other new layer renders normally.

## 6. Accessibility note (constitution Development Workflow)

Record in the PR / wrap-up commit that you checked:

- Stability's diverging palette and the Government Type colors are distinguishable under a deuteranopia simulation (Chrome DevTools → Rendering → Emulate vision deficiencies).
- Every layer's tooltip states the value as text.
